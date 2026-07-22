/**
 * @file
 * @fileoverview TEC-1G runtime update and speed coordination.
 */

import {
  TEC_FAST_HZ,
  TEC_SLOW_HZ,
  readSevenSegmentIntensities,
  shouldUpdate,
} from '../tec-common/index.js';
import type { Tec1gState } from './runtime.js';
import type { Tec1gSpeedMode, Tec1gUpdatePayload } from './types.js';

type ClockedController = {
  setClockHz(clockHz: number): void;
};

export interface Tec1gUpdateController {
  queueUpdate(): void;
  flushUpdate(): void;
  flushUpdateNow(): void;
  setSpeed(mode: Tec1gSpeedMode): void;
}

interface Tec1gUpdateControllerDeps {
  state: Tec1gState;
  lcd: ClockedController;
  glcd: ClockedController;
  serial: ClockedController;
  onUpdate: (payload: Tec1gUpdatePayload) => void;
}

/**
 * Builds the payload sent to the TEC-1G webview after a runtime refresh.
 * @param state - Current TEC-1G runtime state.
 * @returns Snapshot payload for the UI.
 */
export function serializeTec1gUpdateFromRuntimeState(state: Tec1gState): Tec1gUpdatePayload {
  const { display, input, audio, lcdCtrl, timing, system } = state;
  const tms9918 = display.tms9918.snapshot();
  const payload: Tec1gUpdatePayload = {
    digits: [...display.digits],
    segmentIntensities: readSevenSegmentIntensities(display.segmentDuty),
    segmentClockHz: timing.clockHz,
    matrix: [...display.ledMatrixRedRows],
    matrixGreen: [...display.ledMatrixGreenRows],
    matrixBlue: [...display.ledMatrixBlueRows],
    matrixClockHz: timing.clockHz,
    matrixMode: input.matrixModeEnabled,
    glcd: Array.from(display.glcdCtrl.glcd),
    tms9918: {
      active: tms9918.active,
      videoStandard: tms9918.videoStandard,
      status: tms9918.status,
      registers: tms9918.registers,
      framebuffer: tms9918.framebuffer,
    },
    glcdDdram: Array.from(display.glcdCtrl.glcdDdram),
    glcdState: {
      displayOn: display.glcdCtrl.glcdDisplayOn,
      graphicsOn: display.glcdCtrl.glcdGraphics,
      cursorOn: display.glcdCtrl.glcdCursorOn,
      cursorBlink: display.glcdCtrl.glcdCursorBlink,
      blinkVisible: display.glcdCtrl.glcdBlinkVisible,
      ddramAddr: display.glcdCtrl.glcdDdramAddr,
      ddramPhase: display.glcdCtrl.glcdDdramPhase,
      textShift: display.glcdCtrl.glcdTextShift,
      scroll: display.glcdCtrl.glcdScroll,
      reverseMask: display.glcdCtrl.glcdReverseMask,
    },
    sysCtrl: system.sysCtrl,
    bankA14: system.bankA14,
    capsLock: system.capsLock,
    lcdState: {
      displayOn: lcdCtrl.lcdDisplayOn,
      cursorOn: lcdCtrl.lcdCursorOn,
      cursorBlink: lcdCtrl.lcdCursorBlink,
      cursorAddr: lcdCtrl.lcdAddr,
      displayShift: lcdCtrl.lcdDisplayShift,
    },
    lcdCgram: Array.from(lcdCtrl.lcdCgram),
    speaker: audio.speaker ? 1 : 0,
    speedMode: timing.speedMode,
    lcd: [...lcdCtrl.lcd],
    speakerHz: audio.speakerHz,
  };
  if (display.matrixScanCycles.length > 0) {
    payload.matrixScanCycles = display.matrixScanCycles.map((cycle) => ({
      ...cycle,
      rows: cycle.rows.map((row) => ({ ...row })),
    }));
  }
  if (display.segmentDuty.scanCycles.length > 0) {
    payload.segmentScanCycles = display.segmentDuty.scanCycles.map((cycle) => ({
      ...cycle,
      phases: cycle.phases.map((phase) => ({ ...phase })),
    }));
  }
  if (display.segmentDuty.scanDroppedCycles > 0) {
    payload.segmentDroppedScanCycles = display.segmentDuty.scanDroppedCycles;
  }
  if (display.matrixDroppedScanCycles > 0) {
    payload.matrixDroppedScanCycles = display.matrixDroppedScanCycles;
  }
  return payload;
}

/**
 * Creates the TEC-1G update coordinator for throttled UI refreshes and speed changes.
 * @param deps - Runtime, device, and UI update dependencies.
 * @returns Update controller for queueing, flushing, and speed changes.
 */
export function createTec1gUpdateController(
  deps: Tec1gUpdateControllerDeps
): Tec1gUpdateController {
  const { state, lcd, glcd, serial, onUpdate } = deps;
  const { timing } = state;

  const sendUpdate = (): void => {
    onUpdate(serializeTec1gUpdateFromRuntimeState(state));
    state.display.matrixScanCycles.length = 0;
    state.display.matrixDroppedScanCycles = 0;
    state.display.segmentDuty.scanCycles.length = 0;
    state.display.segmentDuty.scanDroppedCycles = 0;
  };

  const queueUpdate = (): void => {
    if (shouldUpdate(timing.lastUpdateMs, timing.updateMs)) {
      timing.lastUpdateMs = Date.now();
      timing.pendingUpdate = false;
      sendUpdate();
      return;
    }
    timing.pendingUpdate = true;
  };

  const flushUpdate = (): void => {
    if (!timing.pendingUpdate) {
      return;
    }
    if (!shouldUpdate(timing.lastUpdateMs, timing.updateMs)) {
      return;
    }
    timing.lastUpdateMs = Date.now();
    timing.pendingUpdate = false;
    sendUpdate();
  };

  const flushUpdateNow = (): void => {
    timing.lastUpdateMs = Date.now();
    timing.pendingUpdate = false;
    sendUpdate();
  };

  const setSpeed = (mode: Tec1gSpeedMode): void => {
    timing.speedMode = mode;
    timing.clockHz = mode === 'slow' ? TEC_SLOW_HZ : TEC_FAST_HZ;
    serial.setClockHz(timing.clockHz);
    lcd.setClockHz(timing.clockHz);
    glcd.setClockHz(timing.clockHz);
    sendUpdate();
  };

  return {
    queueUpdate,
    flushUpdate,
    flushUpdateNow,
    setSpeed,
  };
}
