import { readSevenSegmentIntensities } from '../tec-common/index.js';
import type { Tec1State } from './runtime.js';
import type { Tec1UpdatePayload } from './types.js';

/** Creates the observable TEC-1 device payload from runtime state. */
export function serializeTec1UpdateFromRuntimeState(state: Tec1State): Tec1UpdatePayload {
  const payload: Tec1UpdatePayload = {
    digits: [...state.digits],
    segmentIntensities: readSevenSegmentIntensities(state.segmentDuty),
    segmentClockHz: state.clockHz,
    matrix: [...state.matrix],
    speaker: state.speaker ? 1 : 0,
    speedMode: state.speedMode,
    lcd: [...state.lcd],
    speakerHz: state.speakerHz,
  };
  if (state.segmentDuty.scanCycles.length > 0) {
    payload.segmentScanCycles = state.segmentDuty.scanCycles.map((cycle) => ({
      ...cycle,
      phases: cycle.phases.map((phase) => ({ ...phase })),
    }));
  }
  if (state.segmentDuty.scanDroppedCycles > 0) {
    payload.segmentDroppedScanCycles = state.segmentDuty.scanDroppedCycles;
  }
  if (state.segmentDuty.scanStopped) {
    payload.segmentScanStopped = true;
  }
  return payload;
}
