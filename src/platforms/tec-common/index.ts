/**
 * @file TEC Common Platform Utilities
 * @description Shared types, constants, and utilities for TEC-1 and TEC-1G platforms.
 * This module extracts common functionality to reduce code duplication between
 * the tec1 and tec1g platform implementations.
 * @module platforms/tec-common
 */

import { CycleClock } from '../cycle-clock.js';
import { BitbangUartDecoder, BitbangUartOptions } from '../serial/bitbang-uart.js';

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Speed mode for TEC platforms.
 * - 'slow': 400kHz clock for debugging
 * - 'fast': 4MHz clock for normal operation
 */
export type TecSpeedMode = 'slow' | 'fast';

/**
 * Base state properties shared between TEC-1 and TEC-1G.
 */
export interface TecBaseState {
  /** 7-segment display digit values (6 digits) */
  digits: number[];
  /** LED matrix column values (8 columns) */
  matrix: number[];
  /** Current digit select latch value */
  digitLatch: number;
  /** Current segment latch value */
  segmentLatch: number;
  /** Current matrix latch value */
  matrixLatch: number;
  /** Speaker output state */
  speaker: boolean;
  /** Calculated speaker frequency in Hz */
  speakerHz: number;
  /** LCD display buffer */
  lcd: number[];
  /** Current LCD DDRAM address */
  lcdAddr: number;
  /** Cycle-accurate timing clock */
  cycleClock: CycleClock;
  /** Cycle count at last speaker edge transition */
  lastEdgeCycle: number | null;
  /** Event ID for scheduled speaker silence */
  silenceEventId: number | null;
  /** Current key scan value (0x7F = no key) */
  keyValue: number;
  /** Event ID for scheduled key release */
  keyReleaseEventId: number | null;
  /** Whether NMI is pending */
  nmiPending: boolean;
  /** Timestamp of last UI update */
  lastUpdateMs: number;
  /** Whether an update is pending */
  pendingUpdate: boolean;
  /** Current clock frequency in Hz */
  clockHz: number;
  /** Current speed mode */
  speedMode: TecSpeedMode;
  /** Update throttle interval in ms */
  updateMs: number;
  /** Yield interval in ms */
  yieldMs: number;
}

/**
 * Base update payload shared between platforms.
 */
export interface TecBasePayload {
  /** 7-segment display digit values */
  digits: number[];
  /** LED matrix column values */
  matrix: number[];
  /** Speaker state (1 = on, 0 = off) */
  speaker: number;
  /** Current speed mode */
  speedMode: TecSpeedMode;
  /** LCD display buffer */
  lcd: number[];
  /** Speaker frequency in Hz */
  speakerHz?: number;
}

/**
 * Base runtime interface shared between platforms.
 */
export interface TecBaseRuntime<TState extends TecBaseState> {
  /** Platform state */
  state: TState;
  /** Apply a key press */
  applyKey(code: number): void;
  /** Queue serial bytes for transmission */
  queueSerial(bytes: number[]): void;
  /** Record CPU cycles */
  recordCycles(cycles: number): void;
  /** Silence the speaker */
  silenceSpeaker(): void;
  /** Set the clock speed mode */
  setSpeed(mode: TecSpeedMode): void;
  /** Reset platform state */
  resetState(): void;
  /** Queue a UI update */
  queueUpdate(): void;
}

// ============================================================================
// Shared Constants
// ============================================================================

/** Slow clock frequency (400kHz) */
export const TEC_SLOW_HZ = 400000;

/** Fast clock frequency (4MHz) */
export const TEC_FAST_HZ = 4000000;

/** Cycles before speaker is silenced due to inactivity */
export const TEC_SILENCE_CYCLES = 10000;

/** Duration to hold key state in milliseconds */
export const TEC_KEY_HOLD_MS = 30;

// ============================================================================
// Memory Map Constants
// ============================================================================

/** Z80 address space size (64KB) */
export const Z80_ADDRESS_SPACE = 0x10000;

/** Byte mask for 8-bit values */
export const BYTE_MASK = 0xff;

/** Address mask for 16-bit addresses */
export const ADDR_MASK = 0xffff;

/** TEC-1G shadow ROM start address */
export const TEC1G_SHADOW_START = 0xc000;

/** TEC-1G shadow ROM end address */
export const TEC1G_SHADOW_END = 0xc7ff;

/** TEC-1G shadow ROM size */
export const TEC1G_SHADOW_SIZE = 0x0800;

/** TEC-1G expansion memory start */
export const TEC1G_EXPAND_START = 0x8000;

/** TEC-1G expansion memory end */
export const TEC1G_EXPAND_END = 0xbfff;

/** TEC-1G expansion memory size (16KB) */
export const TEC1G_EXPAND_SIZE = 0x4000;

/** TEC-1G supported expansion slots: two legacy banks plus seven additional banks. */
export const TEC1G_EXPAND_BANK_COUNT = 9;

/** TEC-1G RAM protection start */
export const TEC1G_PROTECT_START = 0x4000;

/** TEC-1G RAM protection end */
export const TEC1G_PROTECT_END = 0x7fff;

/** TEC-1 ROM load address */
export const TEC1_ROM_LOAD_ADDR = 0xc000;

// ============================================================================
// Key Codes
// ============================================================================

/** RESET key code (silences speaker) */
export const KEY_RESET = 0x12;

/** No key pressed value */
export const KEY_NONE = 0x7f;

// ============================================================================
// Serial Communication
// ============================================================================

/**
 * Serial communication state for bitbang UART.
 */
export interface TecSerialState {
  /** Current TX level */
  level: 0 | 1;
  /** Current RX level */
  rxLevel: 0 | 1;
  /** Whether serial RX is busy */
  rxBusy: boolean;
  /** Token for cancelling pending serial operations */
  rxToken: number;
  /** Lead cycles before starting next byte */
  rxLeadCycles: number;
  /** Whether RX has pending data */
  rxPending: boolean;
  /** Cycles per bit at current baud rate */
  cyclesPerBit: number;
  /** Queue of bytes to receive */
  rxQueue: number[];
  /** Whether RX has been primed */
  rxPrimed: boolean;
}

/**
 * Creates initial serial state.
 * @param clockHz - Clock frequency in Hz
 * @param baud - Baud rate
 * @returns Initial serial state
 */
export function createSerialState(clockHz: number, baud: number): TecSerialState {
  return {
    level: 1,
    rxLevel: 1,
    rxBusy: false,
    rxToken: 0,
    rxLeadCycles: 0,
    rxPending: false,
    cyclesPerBit: clockHz / baud,
    rxQueue: [],
    rxPrimed: false,
  };
}

/**
 * Configuration for creating a serial decoder.
 */
export interface SerialDecoderConfig {
  /** Cycle clock for timing */
  cycleClock: CycleClock;
  /** Baud rate */
  baud: number;
  /** Clock frequency in Hz */
  clockHz: number;
  /** Callback when a byte is received */
  onByte?: (byte: number) => void;
}

/**
 * Creates a bitbang UART decoder with TEC-standard settings.
 * @param config - Decoder configuration
 * @returns Configured BitbangUartDecoder
 */
export function createTecSerialDecoder(config: SerialDecoderConfig): BitbangUartDecoder {
  const uartConfig: BitbangUartOptions = {
    baud: config.baud,
    cyclesPerSecond: config.clockHz,
    dataBits: 8,
    stopBits: 2,
    parity: 'none',
    inverted: false,
  };
  const decoder = new BitbangUartDecoder(config.cycleClock, uartConfig);
  if (config.onByte) {
    const onByte = config.onByte;
    decoder.setByteHandler((event) => onByte(event.byte));
  }
  return decoder;
}

// ============================================================================
// Display Utilities
// ============================================================================

/**
 * Updates the 7-segment display digits based on latch values.
 * @param digits - Array of digit values to update
 * @param digitLatch - Current digit select latch (bits 0-5)
 * @param segmentLatch - Current segment latch value
 * @returns True if any digit was updated
 */
export function updateDisplayDigits(
  digits: number[],
  digitLatch: number,
  segmentLatch: number
): boolean {
  const mask = digitLatch & 0x3f;
  if (mask === 0) {
    return false;
  }
  for (let i = 0; i < digits.length; i += 1) {
    if (mask & (1 << i)) {
      digits[i] = segmentLatch & 0xff;
    }
  }
  return true;
}

export interface SevenSegmentDutyState {
  activeDigitLatch: number;
  activeSegmentLatch: number;
  digitsVisitedMask: number;
  lastActivityCycle: number;
  lastCycle: number;
  windowStartCycle: number;
  segmentOnCycles: number[];
  segmentIntensities: number[];
  scanCycles: SevenSegmentScanCycle[];
  scanDroppedCycles: number;
  scanNextCycleId: number;
  scanActiveStartCycle: number | null;
  scanFrameStartCycle: number | null;
  scanPhases: SevenSegmentScanPhase[];
  scanSeenDigitMask: number;
  scanStopped: boolean;
}

export interface SevenSegmentScanPhase {
  digitMask: number;
  segments: number;
  dwellCycles: number;
}

export interface SevenSegmentScanCycle {
  id: number;
  startCycle: number;
  endCycle: number;
  phases: SevenSegmentScanPhase[];
}

const SEVEN_SEGMENT_SCAN_QUEUE_LIMIT = 240;

export function createSevenSegmentDutyState(
  digitCount: number,
  cycle: number = 0
): SevenSegmentDutyState {
  return {
    activeDigitLatch: 0,
    activeSegmentLatch: 0,
    digitsVisitedMask: 0,
    lastActivityCycle: -1,
    lastCycle: cycle,
    windowStartCycle: cycle,
    segmentOnCycles: Array.from({ length: digitCount * 8 }, () => 0),
    segmentIntensities: Array.from({ length: digitCount * 8 }, () => 0),
    scanCycles: [],
    scanDroppedCycles: 0,
    scanNextCycleId: 0,
    scanActiveStartCycle: null,
    scanFrameStartCycle: null,
    scanPhases: [],
    scanSeenDigitMask: 0,
    scanStopped: false,
  };
}

export function recordSevenSegmentDutyTransition(
  state: SevenSegmentDutyState,
  cycle: number,
  nextDigitLatch: number,
  nextSegmentLatch: number
): boolean {
  accumulateSevenSegmentDuty(state, cycle);
  recordActiveSevenSegmentScanPhase(state, cycle);
  const nextDigitMask = nextDigitLatch & digitMaskForSevenSegmentState(state);
  let frameComplete = false;
  if (nextDigitMask !== 0) {
    frameComplete =
      (state.digitsVisitedMask & nextDigitMask) !== 0 &&
      state.digitsVisitedMask === digitMaskForSevenSegmentState(state);
    if (frameComplete) {
      state.digitsVisitedMask = 0;
    }
    state.digitsVisitedMask |= nextDigitMask;
  }
  state.lastActivityCycle = cycle;
  state.scanStopped = false;
  state.activeDigitLatch = nextDigitLatch & BYTE_MASK;
  state.activeSegmentLatch = nextSegmentLatch & BYTE_MASK;
  state.scanActiveStartCycle = nextDigitMask === 0 ? null : cycle;
  return frameComplete;
}

/**
 * Clears committed output when both visual latches are explicitly zero.
 * This is separate from transition recording so callers can still use a
 * blank transition to terminate and inspect an accumulated duty interval.
 */
export function clearSevenSegmentIntensitiesIfBlank(
  state: SevenSegmentDutyState,
  cycle: number
): boolean {
  const digitMask = state.activeDigitLatch & digitMaskForSevenSegmentState(state);
  const segmentMask = state.activeSegmentLatch & BYTE_MASK;
  if (digitMask !== 0 || segmentMask !== 0) {
    return false;
  }

  const displayWasActive =
    state.segmentOnCycles.some((value) => value !== 0) ||
    state.segmentIntensities.some((value) => value !== 0);
  state.digitsVisitedMask = 0;
  state.lastCycle = cycle;
  state.windowStartCycle = cycle;
  state.segmentOnCycles.fill(0);
  state.segmentIntensities.fill(0);
  state.scanActiveStartCycle = null;
  state.scanFrameStartCycle = null;
  state.scanPhases.length = 0;
  state.scanSeenDigitMask = 0;
  return displayWasActive;
}

export function collectSevenSegmentIntensities(
  state: SevenSegmentDutyState,
  cycle: number
): number[] {
  accumulateSevenSegmentDuty(state, cycle);
  const elapsedCycles = Math.max(1, cycle - state.windowStartCycle);
  const intensities = state.segmentOnCycles.map((onCycles) =>
    Math.max(0, Math.min(1, onCycles / elapsedCycles))
  );
  state.segmentIntensities = intensities;
  state.segmentOnCycles.fill(0);
  state.windowStartCycle = cycle;
  state.lastCycle = cycle;
  state.digitsVisitedMask = 0;
  state.lastActivityCycle = -1;
  return intensities;
}

export function readSevenSegmentIntensities(state: SevenSegmentDutyState): number[] {
  return [...state.segmentIntensities];
}

export function maybeCommitSevenSegmentIntensitiesOnIdle(
  state: SevenSegmentDutyState,
  cycle: number,
  clockHz: number,
  idleMs = 40
): boolean {
  if (state.lastActivityCycle < 0) {
    return false;
  }
  const idleCycles = millisecondsToClocks(clockHz, idleMs);
  if (idleCycles <= 0 || cycle - state.lastActivityCycle < idleCycles) {
    return false;
  }
  if ((state.activeDigitLatch & digitMaskForSevenSegmentState(state)) === 0) {
    state.digitsVisitedMask = 0;
    state.lastActivityCycle = -1;
    state.lastCycle = cycle;
    state.windowStartCycle = cycle;
    state.segmentOnCycles.fill(0);
    state.segmentIntensities.fill(0);
    state.scanActiveStartCycle = null;
    state.scanFrameStartCycle = null;
    state.scanPhases.length = 0;
    state.scanSeenDigitMask = 0;
    state.scanStopped = true;
    return true;
  }
  collectSevenSegmentIntensities(state, cycle);
  return true;
}

function digitMaskForSevenSegmentState(state: SevenSegmentDutyState): number {
  const digitCount = Math.max(0, Math.floor(state.segmentOnCycles.length / 8));
  return digitCount >= 31 ? 0x7fffffff : (1 << digitCount) - 1;
}

function recordActiveSevenSegmentScanPhase(state: SevenSegmentDutyState, cycle: number): void {
  const digitMask = state.activeDigitLatch & digitMaskForSevenSegmentState(state);
  if (digitMask === 0 || state.scanActiveStartCycle === null) {
    return;
  }

  const fullDigitMask = digitMaskForSevenSegmentState(state);
  if ((state.scanSeenDigitMask & digitMask) !== 0) {
    state.scanPhases.length = 0;
    state.scanSeenDigitMask = 0;
    state.scanFrameStartCycle = state.scanActiveStartCycle;
  } else if (state.scanSeenDigitMask === 0) {
    state.scanFrameStartCycle = state.scanActiveStartCycle;
  }

  state.scanPhases.push({
    digitMask,
    segments: state.activeSegmentLatch & BYTE_MASK,
    dwellCycles: Math.max(0, cycle - state.scanActiveStartCycle),
  });
  state.scanSeenDigitMask |= digitMask;
  if (state.scanSeenDigitMask !== fullDigitMask) {
    return;
  }

  state.scanCycles.push({
    id: state.scanNextCycleId,
    startCycle: state.scanFrameStartCycle ?? cycle,
    endCycle: cycle,
    phases: state.scanPhases.map((phase) => ({ ...phase })),
  });
  state.scanNextCycleId += 1;
  state.scanPhases.length = 0;
  state.scanSeenDigitMask = 0;
  state.scanFrameStartCycle = null;
  if (state.scanCycles.length > SEVEN_SEGMENT_SCAN_QUEUE_LIMIT) {
    const dropCount = state.scanCycles.length - SEVEN_SEGMENT_SCAN_QUEUE_LIMIT;
    state.scanCycles.splice(0, dropCount);
    state.scanDroppedCycles += dropCount;
  }
}

function accumulateSevenSegmentDuty(state: SevenSegmentDutyState, cycle: number): void {
  const duration = Math.max(0, cycle - state.lastCycle);
  if (duration === 0) {
    return;
  }
  const digitMask = state.activeDigitLatch & digitMaskForSevenSegmentState(state);
  const segmentMask = state.activeSegmentLatch & BYTE_MASK;
  if (digitMask !== 0 && segmentMask !== 0) {
    for (let digit = 0; digit < state.segmentOnCycles.length / 8; digit += 1) {
      if ((digitMask & (1 << digit)) === 0) {
        continue;
      }
      for (let segment = 0; segment < 8; segment += 1) {
        if ((segmentMask & (1 << segment)) !== 0) {
          state.segmentOnCycles[digit * 8 + segment] += duration;
        }
      }
    }
  }
  state.lastCycle = cycle;
}

/**
 * Updates an LED matrix row based on row mask and latch value.
 * @param matrix - Array of matrix column values to update
 * @param rowMask - Row select mask (one bit set)
 * @param matrixLatch - Current matrix latch value
 * @returns True if the matrix was updated
 */
export function updateMatrixRow(matrix: number[], rowMask: number, matrixLatch: number): boolean {
  const rowIndex = rowMask ? Math.log2(rowMask & 0xff) : -1;
  if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex > 7) {
    return false;
  }
  matrix[rowIndex] = matrixLatch & 0xff;
  return true;
}

// ============================================================================
// Speaker Utilities
// ============================================================================

/**
 * Calculates speaker frequency based on edge timing.
 * @param clockHz - Clock frequency in Hz
 * @param cycleDelta - Cycles since last edge
 * @returns Calculated frequency in Hz
 */
export function calculateSpeakerFrequency(clockHz: number, cycleDelta: number): number {
  if (cycleDelta <= 0 || clockHz <= 0) {
    return 0;
  }
  return Math.round(clockHz / 2 / cycleDelta);
}

// ============================================================================
// Key Handling
// ============================================================================

/**
 * Calculates the number of cycles to hold a key pressed.
 * @param clockHz - Clock frequency in Hz
 * @param holdMs - Hold time in milliseconds
 * @returns Number of cycles
 */
export function calculateKeyHoldCycles(clockHz: number, holdMs: number = TEC_KEY_HOLD_MS): number {
  return Math.max(1, Math.round((clockHz * holdMs) / 1000));
}

// ============================================================================
// Timing Utilities
// ============================================================================

/**
 * Checks if enough time has elapsed for a UI update.
 * @param lastUpdateMs - Timestamp of last update
 * @param updateMs - Update interval in milliseconds
 * @returns True if an update should occur
 */
export function shouldUpdate(lastUpdateMs: number, updateMs: number): boolean {
  if (updateMs <= 0) {
    return true;
  }
  return Date.now() - lastUpdateMs >= updateMs;
}

/**
 * Converts microseconds to cycles.
 * @param clockHz - Clock frequency in Hz
 * @param microseconds - Time in microseconds
 * @returns Number of cycles
 */
export function microsecondsToClocks(clockHz: number, microseconds: number): number {
  return Math.max(1, Math.round((clockHz * microseconds) / 1_000_000));
}

/**
 * Converts milliseconds to cycles.
 * @param clockHz - Clock frequency in Hz
 * @param milliseconds - Time in milliseconds
 * @returns Number of cycles
 */
export function millisecondsToClocks(clockHz: number, milliseconds: number): number {
  return Math.max(1, Math.round((clockHz * milliseconds) / 1000));
}
