/**
 * @file TEC-1G platform type definitions.
 */

import type { SevenSegmentScanCycle } from '../tec-common/index.js';

export type Tec1gSpeedMode = 'slow' | 'fast';
export type Tec1gTms9918VideoStandard = 'pal' | 'ntsc';

export type Tec1gMatrixScanRow = {
  row: number;
  red: number;
  green: number;
  blue: number;
  dwellCycles: number;
};

export type Tec1gMatrixScanCycle = {
  id: number;
  startCycle: number;
  endCycle: number;
  rows: Tec1gMatrixScanRow[];
};

export interface Tec1gUpdatePayload {
  digits: number[];
  segmentIntensities?: number[];
  segmentScanCycles?: SevenSegmentScanCycle[];
  segmentDroppedScanCycles?: number;
  segmentClockHz?: number;
  segmentScanStopped?: boolean;
  /** Red column plane row masks (port 0x06). */
  matrix: number[];
  /** Green column plane row masks (port 0xF8). */
  matrixGreen?: number[];
  /** Blue column plane row masks (port 0xF9). */
  matrixBlue?: number[];
  matrixScanCycles?: Tec1gMatrixScanCycle[];
  matrixDroppedScanCycles?: number;
  matrixClockHz?: number;
  matrixMode?: boolean;
  glcd: number[];
  tms9918?: {
    active: boolean;
    videoStandard: Tec1gTms9918VideoStandard;
    status: number;
    registers: number[];
    framebuffer: number[];
  };
  speaker: number;
  speedMode: Tec1gSpeedMode;
  lcd: number[];
  sysCtrl?: number;
  bankA14?: boolean;
  capsLock?: boolean;
  lcdState?: {
    displayOn?: boolean;
    cursorOn?: boolean;
    cursorBlink?: boolean;
    cursorAddr?: number;
    displayShift?: number;
  };
  lcdCgram?: number[];
  glcdDdram?: number[];
  glcdState?: {
    displayOn?: boolean;
    graphicsOn?: boolean;
    cursorOn?: boolean;
    cursorBlink?: boolean;
    blinkVisible?: boolean;
    ddramAddr?: number;
    ddramPhase?: number;
    textShift?: number;
    scroll?: number;
    reverseMask?: number;
  };
  speakerHz?: number;
}
