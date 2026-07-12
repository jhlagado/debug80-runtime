/**
 * @file TEC-1 platform type definitions.
 */

export type Tec1SpeedMode = 'slow' | 'fast';

export interface Tec1UpdatePayload {
  digits: number[];
  segmentIntensities?: number[];
  matrix: number[];
  speaker: number;
  speedMode: Tec1SpeedMode;
  lcd: number[];
  speakerHz?: number;
}
