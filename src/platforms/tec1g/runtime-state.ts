/**
 * @file TEC-1G runtime state definitions and initialization helpers.
 */

import { CycleClock } from '../cycle-clock.js';
import {
  TEC_FAST_HZ,
  createSevenSegmentDutyState,
  type SevenSegmentDutyState,
} from '../tec-common/index.js';
import type { Tec1gPlatformConfigNormalized } from '../types.js';
import {
  TEC1G_LCD_ARROW_LEFT,
  TEC1G_LCD_ARROW_RIGHT,
  TEC1G_LCD_ROW0_START,
  TEC1G_LCD_SPACE,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW7,
} from './constants.js';
import { createGlcdState, type GlcdState } from './glcd.js';
import type { Tec1gLcdState } from './lcd.js';
import { createTms9918, type Tms9918Device } from './tms9918.js';
import type { Tec1gMatrixScanCycle, Tec1gMatrixScanRow, Tec1gSpeedMode } from './types.js';

/**
 * Mutable runtime state for TEC-1G hardware emulation.
 */
export interface Tec1gState {
  display: {
    digits: number[];
    segmentDuty: SevenSegmentDutyState;
    ledMatrixRedRows: number[];
    ledMatrixGreenRows: number[];
    ledMatrixBlueRows: number[];
    matrixScanCycles: Tec1gMatrixScanCycle[];
    matrixDroppedScanCycles: number;
    matrixNextScanCycleId: number;
    matrixActiveStartCycle: number | null;
    matrixFrameStartCycle: number | null;
    matrixScanRows: Array<Tec1gMatrixScanRow | null>;
    matrixScanRowOrder: Tec1gMatrixScanRow[];
    matrixScanSeenMask: number;
    digitLatch: number;
    segmentLatch: number;
    ledMatrixRowLatch: number;
    ledMatrixRedLatch: number;
    ledMatrixGreenLatch: number;
    ledMatrixBlueLatch: number;
    glcdCtrl: GlcdState;
    tms9918: Tms9918Device;
  };
  input: {
    matrixKeyStates: Uint8Array;
    matrixPendingKeyStates: Uint8Array;
    matrixPendingDirty: boolean;
    matrixLastReadRow: number | null;
    matrixModeEnabled: boolean;
    joystickState: number;
    keyValue: number;
    resetKeyValue: number | null;
    keyReleaseEventId: number | null;
    /** True while the UI reports the current keypad key physically held down. */
    keyUserHeld: boolean;
    /** Latched code the current press belongs to, for matching its release. */
    keyHeldCode: number;
    /** True once the minimum key pulse has elapsed for the current press. */
    keyMinPulseDone: boolean;
    nmiPending: boolean;
    shiftKeyActive: boolean;
    rawKeyActive: boolean;
  };
  audio: {
    speaker: boolean;
    speakerHz: number;
    lastEdgeCycle: number | null;
    silenceEventId: number | null;
  };
  lcdCtrl: Tec1gLcdState;
  timing: {
    cycleClock: CycleClock;
    lastUpdateMs: number;
    pendingUpdate: boolean;
    clockHz: number;
    speedMode: Tec1gSpeedMode;
    updateMs: number;
    yieldMs: number;
  };
  system: {
    sysCtrl: number;
    shadowEnabled: boolean;
    protectEnabled: boolean;
    expandEnabled: boolean;
    bankA14: boolean;
    memoryExpansionBankValue: number;
    memoryExpansionMode: 'legacy' | 'extended';
    memoryExpansionLegacyBank: 0 | 1;
    memoryExpansionExtendedWindow: number | null;
    memoryExpansionPhysicalBank: number;
    capsLock: boolean;
    cartridgePresent: boolean;
    gimpSignal: boolean;
  };
}

/**
 * Creates the initial mutable TEC-1G runtime state object.
 */
export function createTec1gInitialState(params: {
  config: Tec1gPlatformConfigNormalized;
  matrixMode: boolean;
  initialSysCtrl: number;
  initialSysCtrlDecoded: {
    shadowEnabled: boolean;
    protectEnabled: boolean;
    expandEnabled: boolean;
    bankA14: boolean;
    memoryExpansionBankValue: number;
    memoryExpansionMode: 'legacy' | 'extended';
    memoryExpansionLegacyBank: 0 | 1;
    memoryExpansionExtendedWindow: number | null;
    memoryExpansionPhysicalBank: number;
    capsLock: boolean;
  };
  cartridgePresentDefault: boolean;
}): Tec1gState {
  const { config, matrixMode, initialSysCtrl, initialSysCtrlDecoded, cartridgePresentDefault } =
    params;
  const state: Tec1gState = {
    display: {
      digits: Array.from({ length: 6 }, () => 0),
      segmentDuty: createSevenSegmentDutyState(6),
      ledMatrixRedRows: Array.from({ length: 8 }, () => 0),
      ledMatrixGreenRows: Array.from({ length: 8 }, () => 0),
      ledMatrixBlueRows: Array.from({ length: 8 }, () => 0),
      matrixScanCycles: [],
      matrixDroppedScanCycles: 0,
      matrixNextScanCycleId: 0,
      matrixActiveStartCycle: null,
      matrixFrameStartCycle: null,
      matrixScanRows: Array.from({ length: 8 }, () => null),
      matrixScanRowOrder: [],
      matrixScanSeenMask: 0,
      digitLatch: 0,
      segmentLatch: 0,
      ledMatrixRowLatch: 0,
      ledMatrixRedLatch: 0,
      ledMatrixGreenLatch: 0,
      ledMatrixBlueLatch: 0,
      glcdCtrl: createGlcdState(),
      tms9918: createTms9918({ videoStandard: 'pal' }),
    },
    input: {
      matrixKeyStates: new Uint8Array(16).fill(TEC1G_MASK_BYTE),
      matrixPendingKeyStates: new Uint8Array(16).fill(TEC1G_MASK_BYTE),
      matrixPendingDirty: false,
      matrixLastReadRow: null,
      matrixModeEnabled: matrixMode,
      joystickState: 0,
      keyValue: TEC1G_MASK_LOW7,
      resetKeyValue: null,
      keyReleaseEventId: null,
      keyUserHeld: false,
      keyHeldCode: TEC1G_MASK_LOW7,
      keyMinPulseDone: true,
      nmiPending: false,
      shiftKeyActive: false,
      rawKeyActive: false,
    },
    audio: {
      speaker: false,
      speakerHz: 0,
      lastEdgeCycle: null,
      silenceEventId: null,
    },
    lcdCtrl: {
      lcd: Array.from({ length: 80 }, () => TEC1G_LCD_SPACE),
      lcdAddr: TEC1G_LCD_ROW0_START,
      lcdAddrMode: 'ddram',
      lcdEntryIncrement: true,
      lcdEntryShift: false,
      lcdDisplayOn: true,
      lcdCursorOn: false,
      lcdCursorBlink: false,
      lcdDisplayShift: 0,
      lcdCgram: new Uint8Array(64),
      lcdCgramAddr: 0,
      lcdFunction: {
        dataLength8: true,
        lines2: true,
        font5x8: true,
      },
    },
    timing: {
      cycleClock: new CycleClock(),
      lastUpdateMs: 0,
      pendingUpdate: false,
      clockHz: TEC_FAST_HZ,
      speedMode: 'fast',
      updateMs: config.updateMs,
      yieldMs: config.yieldMs,
    },
    system: {
      sysCtrl: initialSysCtrl,
      shadowEnabled: initialSysCtrlDecoded.shadowEnabled,
      protectEnabled: initialSysCtrlDecoded.protectEnabled,
      expandEnabled: initialSysCtrlDecoded.expandEnabled,
      bankA14: initialSysCtrlDecoded.bankA14,
      memoryExpansionBankValue: initialSysCtrlDecoded.memoryExpansionBankValue,
      memoryExpansionMode: initialSysCtrlDecoded.memoryExpansionMode,
      memoryExpansionLegacyBank: initialSysCtrlDecoded.memoryExpansionLegacyBank,
      memoryExpansionExtendedWindow: initialSysCtrlDecoded.memoryExpansionExtendedWindow,
      memoryExpansionPhysicalBank: initialSysCtrlDecoded.memoryExpansionPhysicalBank,
      capsLock: initialSysCtrlDecoded.capsLock,
      cartridgePresent: cartridgePresentDefault,
      gimpSignal: config.gimpSignal,
    },
  };
  state.display.tms9918.setActive(config.tms9918Active === true);
  writeLcdArrowHint(state.lcdCtrl);
  return state;
}

/**
 * Writes a default arrow-character hint line into the LCD buffer so
 * the user can see that the custom arrow characters are working before
 * any program runs.  Content: "ARROWS: ← → " using the TEC-1G custom
 * character codes.
 */
function writeLcdArrowHint(lcdState: Tec1gLcdState): void {
  const lcdTest = 'ARROWS: ';
  for (let i = 0; i < lcdTest.length && i < lcdState.lcd.length; i += 1) {
    lcdState.lcd[i] = lcdTest.charCodeAt(i);
  }
  if (lcdState.lcd.length > lcdTest.length) {
    lcdState.lcd[lcdTest.length] = TEC1G_LCD_ARROW_LEFT;
  }
  if (lcdState.lcd.length > lcdTest.length + 1) {
    lcdState.lcd[lcdTest.length + 1] = TEC1G_LCD_SPACE;
  }
  if (lcdState.lcd.length > lcdTest.length + 2) {
    lcdState.lcd[lcdTest.length + 2] = TEC1G_LCD_ARROW_RIGHT;
  }
}
