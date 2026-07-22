/**
 * @file TEC-1 platform type definitions.
 */

import type { SevenSegmentScanCycle } from '../tec-common/index.js';

export type Tec1SpeedMode = 'slow' | 'fast';

export interface Tec1UpdatePayload {
  digits: number[];
  segmentIntensities?: number[];
  segmentScanCycles?: SevenSegmentScanCycle[];
  segmentDroppedScanCycles?: number;
  segmentClockHz?: number;
  segmentScanStopped?: boolean;
  matrix: number[];
  speaker: number;
  speedMode: Tec1SpeedMode;
  lcd: number[];
  speakerHz?: number;
}
