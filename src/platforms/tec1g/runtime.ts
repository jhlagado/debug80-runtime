/**
 * @file TEC-1G runtime implementation and configuration.
 * @fileoverview
 *
 * Normalizes TEC-1G configuration and builds IO handlers for LCD/GLCD,
 * keypad, serial, and shadow/protection behavior.
 */

import { IoHandlers } from '../../z80/runtime.js';
import { Tec1gPlatformConfigNormalized } from '../types.js';
import { Tec1gSpeedMode, Tec1gUpdatePayload } from './types.js';
import type { Tms9918VideoStandard } from './tms9918.js';
import { decodeSysCtrl } from './sysctrl.js';
import { Ds1302 } from './ds1302.js';
import { createTec1gLcdController } from './lcd.js';
import { createTec1gSerialController } from './serial.js';
import { createGlcdController } from './glcd.js';
import { createTec1gUpdateController, type Tec1gUpdateController } from './update-controller.js';
import {
  TEC1G_SYSCTRL_PROTECT,
  TEC1G_SYSCTRL_BANK_A14,
  TEC1G_KEY_SHIFT_MASK,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW7,
  TEC1G_NMI_VECTOR,
} from './constants.js';
import {
  TEC_SLOW_HZ,
  TEC_FAST_HZ,
  TEC_KEY_HOLD_MS,
  calculateKeyHoldCycles,
  maybeCommitSevenSegmentIntensitiesOnIdle,
} from '../tec-common/index.js';
import { createTec1gIoHandlers } from './io-handlers.js';
import { createTec1gSdSpi } from './runtime-storage.js';
import { createTec1gInitialState } from './runtime-state.js';
import type { Tec1gState } from './runtime-state.js';
import { resetTec1gRuntimeState, silenceTec1gSpeaker } from './runtime-lifecycle.js';
export { normalizeTec1gConfig } from './runtime-config.js';

/**
 * Runtime facade for TEC-1G IO handlers and lifecycle controls.
 */
export interface Tec1gRuntime {
  state: Tec1gState;
  ioHandlers: IoHandlers;
  applyKey(code: number, pressed?: boolean): void;
  applyKeySilent(code: number, pressed: boolean): void;
  applyMatrixKey(row: number, col: number, pressed: boolean): void;
  setJoystickState(mask: number): void;
  releaseInputs(): void;
  setMatrixMode(enabled: boolean): void;
  setTms9918Active(enabled: boolean): void;
  setTms9918VideoStandard(standard: Tms9918VideoStandard): void;
  setCartridgePresent(enabled: boolean): void;
  holdKeyForReset(code: number): void;
  queueSerial(bytes: number[]): void;
  recordCycles(cycles: number): void;
  silenceSpeaker(): void;
  setSpeed(mode: Tec1gSpeedMode): void;
  resetState(): void;
  queueUpdate(): void;
}

export const TEC1G_SLOW_HZ = TEC_SLOW_HZ;
export const TEC1G_FAST_HZ = TEC_FAST_HZ;
const TEC1G_KEY_HOLD_MS = TEC_KEY_HOLD_MS;
export type { Tec1gState };

/**
 * Builds the TEC-1G runtime IO handlers and state.
 * @param config - Normalized TEC-1G configuration.
 * @param onUpdate - Called with UI payloads when state changes.
 * @param onSerialByte - Optional serial byte callback.
 * @returns Runtime facade with IO handlers and control helpers.
 */
export function createTec1gRuntime(
  config: Tec1gPlatformConfigNormalized,
  onUpdate: (payload: Tec1gUpdatePayload) => void,
  onSerialByte?: (byte: number) => void,
  onPortWrite?: (payload: { port: number; value: number }) => void
): Tec1gRuntime {
  const initialSysCtrl =
    (config.expansionBankHi ? TEC1G_SYSCTRL_BANK_A14 : 0) |
    (config.protectOnReset ? TEC1G_SYSCTRL_PROTECT : 0);
  const initialSysCtrlDecoded = decodeSysCtrl(initialSysCtrl);
  const matrixMode = config.matrixMode;
  const rtcEnabled = config.rtcEnabled;
  const rtc = rtcEnabled ? new Ds1302() : null;
  const { sdEnabled, sdSpi } = createTec1gSdSpi(config);
  let cartridgePresentDefault = config.expansionRomHex !== undefined;
  const state = createTec1gInitialState({
    config,
    matrixMode,
    initialSysCtrl,
    initialSysCtrlDecoded,
    cartridgePresentDefault,
  });
  const defaultGimpSignal = config.gimpSignal;
  const defaultSysCtrl = initialSysCtrl;
  const display = state.display;
  const input = state.input;
  const lcdState = state.lcdCtrl;
  const timing = state.timing;
  const system = state.system;

  const updateControllerRef: { current: Tec1gUpdateController | undefined } = {
    current: undefined,
  };
  /**
   * Queues a throttled runtime UI update through the update controller.
   */
  function queueUpdate(): void {
    updateControllerRef.current?.queueUpdate();
  }
  /**
   * Flushes any pending throttled runtime UI update through the update controller.
   */
  function flushUpdate(): void {
    updateControllerRef.current?.flushUpdate();
  }
  /**
   *
   */
  function flushUpdateNow(): void {
    updateControllerRef.current?.flushUpdateNow();
  }

  const glcd = createGlcdController(
    display.glcdCtrl,
    timing.cycleClock,
    timing.clockHz,
    queueUpdate
  );

  const serial = createTec1gSerialController(timing.cycleClock, timing.clockHz, onSerialByte);

  const lcd = createTec1gLcdController(lcdState, timing.cycleClock, timing.clockHz, queueUpdate);

  updateControllerRef.current = createTec1gUpdateController({
    state,
    lcd,
    glcd,
    serial,
    onUpdate,
  });

  const ioHandlers = createTec1gIoHandlers({
    state,
    timing,
    lcd,
    glcd,
    serial,
    rtcEnabled,
    rtc,
    sdEnabled,
    sdSpi,
    queueUpdate,
    flushUpdateNow,
    ...(onPortWrite ? { onPortWrite } : {}),
  });

  const tick = (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
    flushUpdate();
    if (display.tms9918.consumeNmi()) {
      return { interrupt: { nonMaskable: true, data: TEC1G_NMI_VECTOR } };
    }
    if (input.nmiPending) {
      input.nmiPending = false;
      return { interrupt: { nonMaskable: true, data: TEC1G_NMI_VECTOR } };
    }
    return undefined;
  };

  const clearKeyLatch = (): void => {
    input.keyValue = TEC1G_MASK_LOW7;
    input.rawKeyActive = false;
    input.shiftKeyActive = false;
  };

  const setKeyLatch = (code: number, options: { raiseNmi: boolean; userHeld?: boolean }): void => {
    input.keyValue = code & TEC1G_MASK_LOW7;
    input.rawKeyActive = (input.keyValue & TEC1G_MASK_LOW7) !== TEC1G_MASK_LOW7;
    input.shiftKeyActive = input.rawKeyActive && (input.keyValue & TEC1G_KEY_SHIFT_MASK) === 0;
    input.keyUserHeld = options.userHeld === true;
    input.keyHeldCode = input.keyValue;
    input.keyMinPulseDone = false;
    if (options.raiseNmi) {
      input.nmiPending = true;
    }
    if (input.keyReleaseEventId !== null) {
      timing.cycleClock.cancel(input.keyReleaseEventId);
    }
    const holdCycles = calculateKeyHoldCycles(timing.clockHz, TEC1G_KEY_HOLD_MS);
    input.keyReleaseEventId = timing.cycleClock.scheduleIn(holdCycles, () => {
      input.keyReleaseEventId = null;
      input.keyMinPulseDone = true;
      if (!input.keyUserHeld) {
        clearKeyLatch();
      }
    });
  };

  const releaseKey = (code: number): void => {
    if ((code & TEC1G_MASK_LOW7) !== input.keyHeldCode) {
      return;
    }
    input.keyUserHeld = false;
    if (input.keyMinPulseDone) {
      clearKeyLatch();
    }
  };

  const applyKey = (code: number, pressed?: boolean): void => {
    if (pressed === false) {
      releaseKey(code);
      return;
    }
    setKeyLatch(code, { raiseNmi: true, userHeld: pressed === true });
  };

  /**
   * Latch or release a keypad key without raising the keypress NMI.
   * Headless sessions use this: they enter the program directly, so
   * MON-3's boot-time NMI hook is not initialised, while scanKeys
   * itself polls the keypad ports and needs no interrupt.
   */
  const applyKeySilent = (code: number, pressed: boolean): void => {
    if (!pressed) {
      releaseKey(code);
      return;
    }
    setKeyLatch(code, { raiseNmi: false, userHeld: true });
  };

  const holdKeyForReset = (code: number): void => {
    input.resetKeyValue = code & TEC1G_MASK_LOW7;
    setKeyLatch(code, { raiseNmi: false });
  };

  const applyMatrixKey = (row: number, col: number, pressed: boolean): void => {
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return;
    }
    const rowIndex = Math.max(0, Math.min(15, Math.trunc(row)));
    const colIndex = Math.max(0, Math.min(7, Math.trunc(col)));
    const mask = 1 << colIndex;
    const current = input.matrixPendingKeyStates[rowIndex] ?? TEC1G_MASK_BYTE;
    input.matrixPendingKeyStates[rowIndex] = pressed ? current & ~mask : current | mask;
    input.matrixPendingDirty = true;
  };

  const setMatrixMode = (enabled: boolean): void => {
    input.matrixModeEnabled = enabled;
  };

  const setJoystickState = (mask: number): void => {
    input.joystickState = Number.isFinite(mask) ? mask & TEC1G_MASK_BYTE : 0;
  };

  const releaseInputs = (): void => {
    if (input.keyReleaseEventId !== null) {
      timing.cycleClock.cancel(input.keyReleaseEventId);
      input.keyReleaseEventId = null;
    }
    clearKeyLatch();
    input.keyUserHeld = false;
    input.keyHeldCode = TEC1G_MASK_LOW7;
    input.keyMinPulseDone = true;
    input.matrixKeyStates.fill(TEC1G_MASK_BYTE);
    input.matrixPendingKeyStates.fill(TEC1G_MASK_BYTE);
    input.matrixPendingDirty = true;
    input.joystickState = 0;
  };

  const setTms9918Active = (enabled: boolean): void => {
    display.tms9918.setActive(enabled);
    queueUpdate();
  };

  const setTms9918VideoStandard = (standard: Tms9918VideoStandard): void => {
    display.tms9918.setVideoStandard(standard);
    queueUpdate();
  };

  const queueSerial = (bytes: number[]): void => {
    serial.queueSerial(bytes);
  };

  const recordCycles = (cycles: number): void => {
    if (cycles <= 0) {
      return;
    }
    timing.cycleClock.advance(cycles);
    if (display.tms9918.advanceCycles(cycles)) {
      queueUpdate();
    }
    if (
      maybeCommitSevenSegmentIntensitiesOnIdle(
        display.segmentDuty,
        timing.cycleClock.now(),
        timing.clockHz
      )
    ) {
      queueUpdate();
    }
  };

  const silenceSpeaker = (): void => {
    silenceTec1gSpeaker(state, queueUpdate);
  };

  const setSpeed = (mode: Tec1gSpeedMode): void => {
    updateControllerRef.current?.setSpeed(mode);
  };

  const resetState = (): void => {
    resetTec1gRuntimeState(
      state,
      {
        matrixMode,
        sysCtrl: defaultSysCtrl,
        gimpSignal: defaultGimpSignal,
        cartridgePresent: cartridgePresentDefault,
      },
      { lcd, glcd, serial },
      queueUpdate
    );
  };

  // Publish the initial hardware snapshot so the sidebar reflects the real
  // startup state instead of the cleared placeholder UI.
  queueUpdate();

  return {
    state,
    ioHandlers: { ...ioHandlers, tick },
    applyKey,
    applyKeySilent,
    applyMatrixKey,
    setJoystickState,
    releaseInputs,
    setMatrixMode,
    setTms9918Active,
    setTms9918VideoStandard,
    setCartridgePresent: (enabled: boolean): void => {
      cartridgePresentDefault = enabled;
      system.cartridgePresent = enabled;
    },
    holdKeyForReset,
    queueSerial,
    recordCycles,
    silenceSpeaker,
    setSpeed,
    resetState,
    queueUpdate,
  };
}
