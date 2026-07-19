/**
 * @file TEC-1 runtime implementation and configuration.
 * @fileoverview
 *
 * This module normalizes TEC-1 configuration, builds IO handlers, and maintains
 * runtime state for display, keypad, and serial behavior.
 */

import { IoHandlers } from '../../z80/runtime.js';
import { CycleClock } from '../cycle-clock.js';
import { BitbangUartDecoder } from '../serial/bitbang-uart.js';
import { Tec1PlatformConfig, Tec1PlatformConfigNormalized } from '../types.js';
import { normalizeSimpleRegions } from '../simple/runtime.js';
import { Tec1SpeedMode, Tec1UpdatePayload } from './types.js';
import { serializeTec1UpdateFromRuntimeState } from './runtime-update-payload.js';
import {
  TEC1_ADDR_MAX,
  TEC1_APP_START_DEFAULT,
  TEC1_DIGIT_SERIAL_TX,
  TEC1_DIGIT_SPEAKER,
  TEC1_ENTRY_DEFAULT,
  TEC1_LCD_CMD_CLEAR,
  TEC1_LCD_CMD_DDRAM,
  TEC1_LCD_CMD_HOME,
  TEC1_LCD_ROW0_END,
  TEC1_LCD_ROW0_START,
  TEC1_LCD_ROW1_END,
  TEC1_LCD_ROW1_OFFSET,
  TEC1_LCD_ROW1_START,
  TEC1_LCD_SPACE,
  TEC1_MASK_BYTE,
  TEC1_MASK_LOW7,
  TEC1_NMI_VECTOR,
  TEC1_PORT_DIGIT,
  TEC1_PORT_KEYBOARD,
  TEC1_PORT_LCD_CMD,
  TEC1_PORT_LCD_DATA,
  TEC1_PORT_MATRIX_LATCH,
  TEC1_PORT_MATRIX_STROBE,
  TEC1_PORT_SEGMENT,
  TEC1_PORT_STATUS,
  TEC1_RAM_END,
  TEC1_RAM_START,
  TEC1_ROM_END,
  TEC1_ROM_START,
  TEC1_STATUS_KEY_IDLE,
  TEC1_STATUS_SERIAL_RX,
} from './constants.js';
import {
  TEC_SLOW_HZ,
  TEC_FAST_HZ,
  TEC_SILENCE_CYCLES,
  TEC_KEY_HOLD_MS,
  collectSevenSegmentIntensities,
  createSevenSegmentDutyState,
  maybeCommitSevenSegmentIntensitiesOnIdle,
  recordSevenSegmentDutyTransition,
  readSevenSegmentIntensities,
  updateDisplayDigits,
  updateMatrixRow,
  calculateSpeakerFrequency,
  calculateKeyHoldCycles,
  shouldUpdate,
} from '../tec-common/index.js';

/**
 * Mutable runtime state for TEC-1 hardware emulation.
 */
export interface Tec1State {
  digits: number[];
  segmentDuty: ReturnType<typeof createSevenSegmentDutyState>;
  matrix: number[];
  digitLatch: number;
  segmentLatch: number;
  matrixLatch: number;
  speaker: boolean;
  speakerHz: number;
  lcd: number[];
  lcdAddr: number;
  cycleClock: CycleClock;
  lastEdgeCycle: number | null;
  silenceEventId: number | null;
  keyValue: number;
  keyReleaseEventId: number | null;
  nmiPending: boolean;
  lastUpdateMs: number;
  pendingUpdate: boolean;
  clockHz: number;
  speedMode: Tec1SpeedMode;
  updateMs: number;
  yieldMs: number;
}

/**
 * Runtime facade for TEC-1 IO handlers and lifecycle controls.
 */
export interface Tec1Runtime {
  state: Tec1State;
  ioHandlers: IoHandlers;
  applyKey(code: number, pressed?: boolean): void;
  queueSerial(bytes: number[]): void;
  recordCycles(cycles: number): void;
  silenceSpeaker(): void;
  setSpeed(mode: Tec1SpeedMode): void;
  resetState(): void;
  queueUpdate(): void;
}

const TEC1_SLOW_HZ = TEC_SLOW_HZ;
const TEC1_FAST_HZ = TEC_FAST_HZ;
const TEC1_SILENCE_CYCLES = TEC_SILENCE_CYCLES;
const TEC1_SERIAL_BAUD = 9600;
const TEC1_KEY_HOLD_MS = TEC_KEY_HOLD_MS;

/**
 * Normalizes TEC-1 configuration with defaults and bounds.
 * @param cfg - Optional TEC-1 config from project settings.
 * @returns Normalized config for runtime construction.
 */
export function normalizeTec1Config(cfg?: Tec1PlatformConfig): Tec1PlatformConfigNormalized {
  const config = cfg ?? {};
  const regions = normalizeSimpleRegions(config.regions, [
    { start: TEC1_ROM_START, end: TEC1_ROM_END, kind: 'rom' },
    { start: TEC1_RAM_START, end: TEC1_RAM_END, kind: 'ram' },
  ]);
  const romRanges = regions
    .filter((region) => region.kind === 'rom' || region.readOnly === true)
    .map((region) => ({ start: region.start, end: region.end }));
  const appStart =
    Number.isFinite(config.appStart) && config.appStart !== undefined
      ? config.appStart
      : TEC1_APP_START_DEFAULT;
  const entry =
    Number.isFinite(config.entry) && config.entry !== undefined
      ? config.entry
      : (romRanges[0]?.start ?? TEC1_ENTRY_DEFAULT);
  const romHex =
    typeof config.romHex === 'string' && config.romHex !== '' ? config.romHex : undefined;
  const ramInitHex =
    typeof config.ramInitHex === 'string' && config.ramInitHex !== ''
      ? config.ramInitHex
      : undefined;
  const updateMs =
    Number.isFinite(config.updateMs) && config.updateMs !== undefined ? config.updateMs : 16;
  const yieldMs =
    Number.isFinite(config.yieldMs) && config.yieldMs !== undefined ? config.yieldMs : 0;
  return {
    regions,
    romRanges,
    appStart: Math.max(0, Math.min(TEC1_ADDR_MAX, appStart)),
    entry: Math.max(0, Math.min(TEC1_ADDR_MAX, entry)),
    ...(romHex !== undefined ? { romHex } : {}),
    ...(ramInitHex !== undefined ? { ramInitHex } : {}),
    updateMs: Math.max(0, updateMs),
    yieldMs: Math.max(0, yieldMs),
  };
}

/**
 * Builds the TEC-1 runtime IO handlers and state.
 * @param config - Normalized TEC-1 configuration.
 * @param onUpdate - Called with UI payloads when state changes.
 * @param onSerialByte - Optional serial byte callback.
 * @returns Runtime facade with IO handlers and control helpers.
 */
export function createTec1Runtime(
  config: Tec1PlatformConfigNormalized,
  onUpdate: (payload: Tec1UpdatePayload) => void,
  onSerialByte?: (byte: number) => void
): Tec1Runtime {
  const state: Tec1State = {
    digits: Array.from({ length: 6 }, () => 0),
    segmentDuty: createSevenSegmentDutyState(6),
    matrix: Array.from({ length: 8 }, () => 0),
    digitLatch: 0,
    segmentLatch: 0,
    matrixLatch: 0,
    speaker: false,
    speakerHz: 0,
    lcd: Array.from({ length: 32 }, () => TEC1_LCD_SPACE),
    lcdAddr: TEC1_LCD_ROW0_START,
    cycleClock: new CycleClock(),
    lastEdgeCycle: null,
    silenceEventId: null,
    keyValue: TEC1_MASK_LOW7,
    keyReleaseEventId: null,
    nmiPending: false,
    lastUpdateMs: 0,
    pendingUpdate: false,
    clockHz: TEC1_FAST_HZ,
    speedMode: 'fast',
    updateMs: config.updateMs,
    yieldMs: config.yieldMs,
  };

  const sendUpdate = (): void => {
    const payload = serializeTec1UpdateFromRuntimeState(state);
    payload.segmentIntensities = readSevenSegmentIntensities(state.segmentDuty);
    onUpdate(payload);
  };

  let serialLevel: 0 | 1 = 1;
  let serialRxLevel: 0 | 1 = 1;
  let serialRxBusy = false;
  let serialRxToken = 0;
  let serialRxLeadCycles = 0;
  let serialRxPending = false;
  let serialCyclesPerBit = state.clockHz / TEC1_SERIAL_BAUD;
  const serialRxQueue: number[] = [];
  let serialRxPrimed = false;
  const serialDecoder = new BitbangUartDecoder(state.cycleClock, {
    baud: TEC1_SERIAL_BAUD,
    cyclesPerSecond: state.clockHz,
    dataBits: 8,
    stopBits: 2,
    parity: 'none',
    inverted: false,
  });
  serialDecoder.setByteHandler((event) => {
    if (onSerialByte) {
      onSerialByte(event.byte);
    }
  });

  const queueUpdate = (): void => {
    if (shouldUpdate(state.lastUpdateMs, state.updateMs)) {
      state.lastUpdateMs = Date.now();
      state.pendingUpdate = false;
      sendUpdate();
      return;
    }
    state.pendingUpdate = true;
  };

  const flushUpdate = (): void => {
    if (!state.pendingUpdate) {
      return;
    }
    if (!shouldUpdate(state.lastUpdateMs, state.updateMs)) {
      return;
    }
    state.lastUpdateMs = Date.now();
    state.pendingUpdate = false;
    sendUpdate();
  };

  const updateDisplay = (): void => {
    updateDisplayDigits(state.digits, state.digitLatch, state.segmentLatch);
  };

  const commitSevenSegmentFrame = (): void => {
    collectSevenSegmentIntensities(state.segmentDuty, state.cycleClock.now());
    updateDisplayDigits(state.digits, state.digitLatch, state.segmentLatch);
    queueUpdate();
  };

  const lcdIndexForAddr = (addr: number): number | null => {
    if (addr >= TEC1_LCD_ROW0_START && addr <= TEC1_LCD_ROW0_END) {
      return addr - TEC1_LCD_ROW0_START;
    }
    if (addr >= TEC1_LCD_ROW1_START && addr <= TEC1_LCD_ROW1_END) {
      return TEC1_LCD_ROW1_OFFSET + (addr - TEC1_LCD_ROW1_START);
    }
    return null;
  };

  const lcdSetAddr = (addr: number): void => {
    state.lcdAddr = addr & TEC1_MASK_BYTE;
  };

  const lcdWriteData = (value: number): void => {
    const index = lcdIndexForAddr(state.lcdAddr);
    if (index !== null) {
      state.lcd[index] = value & TEC1_MASK_BYTE;
      queueUpdate();
    }
    state.lcdAddr = (state.lcdAddr + 1) & TEC1_MASK_BYTE;
  };

  const lcdClear = (): void => {
    state.lcd.fill(TEC1_LCD_SPACE);
    lcdSetAddr(TEC1_LCD_ROW0_START);
    queueUpdate();
  };

  const updateMatrix = (rowMask: number): void => {
    if (updateMatrixRow(state.matrix, rowMask, state.matrixLatch)) {
      queueUpdate();
    }
  };

  const scheduleSilence = (): void => {
    if (state.silenceEventId !== null) {
      state.cycleClock.cancel(state.silenceEventId);
    }
    state.silenceEventId = state.cycleClock.scheduleIn(TEC1_SILENCE_CYCLES, () => {
      if (state.speakerHz !== 0) {
        state.speakerHz = 0;
        queueUpdate();
      }
    });
  };

  const ioHandlers: IoHandlers = {
    read: (port: number): number => {
      const p = port & TEC1_MASK_BYTE;
      if (p === TEC1_PORT_KEYBOARD) {
        if (serialRxPending && !serialRxBusy && serialRxQueue.length > 0) {
          serialRxPending = false;
          serialRxLeadCycles = Math.max(1, Math.round(serialCyclesPerBit * 2));
          startNextSerialRx();
        }
        const base = state.keyValue & TEC1_MASK_LOW7;
        return base | (serialRxLevel ? TEC1_STATUS_SERIAL_RX : 0);
      }
      if (p === TEC1_PORT_LCD_CMD) {
        return 0;
      }
      if (p === TEC1_PORT_LCD_DATA) {
        return TEC1_LCD_SPACE;
      }
      if (p === TEC1_PORT_STATUS) {
        // JMON polls P_DAT bit 6 for key-press detection.
        const keyPressed = (state.keyValue & TEC1_MASK_LOW7) !== TEC1_MASK_LOW7;
        return keyPressed ? 0 : TEC1_STATUS_KEY_IDLE;
      }
      return TEC1_MASK_BYTE;
    },
    write: (port: number, value: number): void => {
      const p = port & TEC1_MASK_BYTE;
      if (p === TEC1_PORT_DIGIT) {
        const frameComplete = recordSevenSegmentDutyTransition(
          state.segmentDuty,
          state.cycleClock.now(),
          value & TEC1_MASK_BYTE,
          state.segmentLatch
        );
        state.digitLatch = value & TEC1_MASK_BYTE;
        const speaker = (value & TEC1_DIGIT_SPEAKER) !== 0;
        const nextSerial: 0 | 1 = (value & TEC1_DIGIT_SERIAL_TX) !== 0 ? 1 : 0;
        if (nextSerial !== serialLevel) {
          serialLevel = nextSerial;
          serialDecoder.recordLevel(serialLevel);
        }
        if (speaker !== state.speaker) {
          const now = state.cycleClock.now();
          if (state.lastEdgeCycle !== null) {
            const delta = now - state.lastEdgeCycle;
            state.speakerHz = calculateSpeakerFrequency(state.clockHz, delta);
            if (state.speakerHz > 0) {
              queueUpdate();
            }
          }
          state.lastEdgeCycle = now;
          scheduleSilence();
        }
        state.speaker = speaker;
        updateDisplay();
        if (frameComplete) {
          commitSevenSegmentFrame();
        }
        return;
      }
      if (p === TEC1_PORT_SEGMENT) {
        const frameComplete = recordSevenSegmentDutyTransition(
          state.segmentDuty,
          state.cycleClock.now(),
          state.digitLatch,
          value & TEC1_MASK_BYTE
        );
        state.segmentLatch = value & TEC1_MASK_BYTE;
        updateDisplay();
        if (frameComplete) {
          commitSevenSegmentFrame();
        }
        return;
      }
      if (p === TEC1_PORT_MATRIX_LATCH) {
        state.matrixLatch = value & TEC1_MASK_BYTE;
        return;
      }
      if (p === TEC1_PORT_MATRIX_STROBE) {
        updateMatrix(value & TEC1_MASK_BYTE);
        return;
      }
      if (p === TEC1_PORT_LCD_CMD) {
        const instruction = value & TEC1_MASK_BYTE;
        if (instruction === TEC1_LCD_CMD_CLEAR) {
          lcdClear();
          return;
        }
        if (instruction === TEC1_LCD_CMD_HOME) {
          lcdSetAddr(TEC1_LCD_ROW0_START);
          return;
        }
        if ((instruction & TEC1_LCD_CMD_DDRAM) !== 0) {
          lcdSetAddr(instruction);
        }
        return;
      }
      if (p === TEC1_PORT_LCD_DATA) {
        lcdWriteData(value);
        return;
      }
    },
    tick: (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
      flushUpdate();
      if (state.nmiPending) {
        state.nmiPending = false;
        return { interrupt: { nonMaskable: true, data: TEC1_NMI_VECTOR } };
      }
      return undefined;
    },
  };

  const applyKey = (code: number, pressed?: boolean): void => {
    if (pressed === false) {
      return; // TEC-1 keeps the fixed-pulse model; releases are a no-op.
    }
    state.keyValue = code & TEC1_MASK_LOW7;
    state.nmiPending = true;
    if (state.keyReleaseEventId !== null) {
      state.cycleClock.cancel(state.keyReleaseEventId);
    }
    const holdCycles = calculateKeyHoldCycles(state.clockHz, TEC1_KEY_HOLD_MS);
    state.keyReleaseEventId = state.cycleClock.scheduleIn(holdCycles, () => {
      state.keyValue = TEC1_MASK_LOW7;
      state.keyReleaseEventId = null;
    });
  };

  const setSerialRxLevel = (level: 0 | 1): void => {
    serialRxLevel = level;
  };

  const scheduleSerialRxByte = (byte: number, leadCycles = 0): void => {
    const token = serialRxToken;
    const start = state.cycleClock.now() + leadCycles;
    if (leadCycles <= 0) {
      setSerialRxLevel(0);
    } else {
      setSerialRxLevel(1);
      state.cycleClock.scheduleAt(start, () => {
        if (serialRxToken !== token) {
          return;
        }
        setSerialRxLevel(0);
      });
    }
    for (let i = 0; i < 8; i += 1) {
      const bit = ((byte >> i) & 1) as 0 | 1;
      const at = start + serialCyclesPerBit * (i + 1);
      state.cycleClock.scheduleAt(at, () => {
        if (serialRxToken !== token) {
          return;
        }
        setSerialRxLevel(bit);
      });
    }

    const stopAt = start + serialCyclesPerBit * (1 + 8);
    state.cycleClock.scheduleAt(stopAt, () => {
      if (serialRxToken !== token) {
        return;
      }
      setSerialRxLevel(1);
    });

    const doneAt = start + serialCyclesPerBit * (1 + 8 + 2);
    state.cycleClock.scheduleAt(doneAt, () => {
      if (serialRxToken !== token) {
        return;
      }
      startNextSerialRx();
    });
  };

  const startNextSerialRx = (): void => {
    if (serialRxQueue.length === 0) {
      serialRxBusy = false;
      setSerialRxLevel(1);
      return;
    }
    serialRxBusy = true;
    const next = serialRxQueue.shift();
    if (next === undefined) {
      serialRxBusy = false;
      setSerialRxLevel(1);
      return;
    }
    const leadCycles = serialRxLeadCycles;
    serialRxLeadCycles = 0;
    scheduleSerialRxByte(next, leadCycles);
  };

  const queueSerial = (bytes: number[]): void => {
    if (!bytes.length) {
      return;
    }
    if (!serialRxPrimed) {
      // Prime RX once so the first real byte is aligned to the ROM's bitbang receiver.
      serialRxQueue.push(0);
      serialRxPrimed = true;
    }
    for (const value of bytes) {
      serialRxQueue.push(value & TEC1_MASK_BYTE);
    }
    if (!serialRxBusy) {
      serialRxPending = true;
    }
  };

  const recordCycles = (cycles: number): void => {
    if (cycles <= 0) {
      return;
    }
    state.cycleClock.advance(cycles);
    if (
      maybeCommitSevenSegmentIntensitiesOnIdle(
        state.segmentDuty,
        state.cycleClock.now(),
        state.clockHz
      )
    ) {
      queueUpdate();
    }
  };

  const silenceSpeaker = (): void => {
    if (state.speakerHz !== 0 || state.speaker) {
      state.speakerHz = 0;
      state.speaker = false;
      state.lastEdgeCycle = null;
      if (state.silenceEventId !== null) {
        state.cycleClock.cancel(state.silenceEventId);
        state.silenceEventId = null;
      }
      queueUpdate();
    }
  };

  const setSpeed = (mode: Tec1SpeedMode): void => {
    state.speedMode = mode;
    state.clockHz = mode === 'slow' ? TEC1_SLOW_HZ : TEC1_FAST_HZ;
    serialDecoder.setCyclesPerSecond(state.clockHz);
    serialCyclesPerBit = state.clockHz / TEC1_SERIAL_BAUD;
    sendUpdate();
  };

  const resetState = (): void => {
    state.speaker = false;
    state.speakerHz = 0;
    state.lastEdgeCycle = null;
    state.digits.fill(0);
    state.digitLatch = 0;
    state.segmentLatch = 0;
    state.segmentDuty = createSevenSegmentDutyState(6, state.cycleClock.now());
    state.lcd.fill(TEC1_LCD_SPACE);
    state.lcdAddr = TEC1_LCD_ROW0_START;
    state.matrix.fill(0);
    if (state.silenceEventId !== null) {
      state.cycleClock.cancel(state.silenceEventId);
      state.silenceEventId = null;
    }
    serialRxQueue.length = 0;
    serialRxBusy = false;
    serialRxPrimed = false;
    serialRxToken += 1;
    setSerialRxLevel(1);
    queueUpdate();
  };

  // Publish the initial hardware snapshot so the sidebar does not stay on
  // its cleared placeholder state until the first user-driven interaction.
  queueUpdate();

  return {
    state,
    ioHandlers,
    applyKey,
    queueSerial,
    recordCycles,
    silenceSpeaker,
    setSpeed,
    resetState,
    queueUpdate,
  };
}
