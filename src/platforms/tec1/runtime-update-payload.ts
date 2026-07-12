import { readSevenSegmentIntensities } from '../tec-common/index.js';
import type { Tec1State } from './runtime.js';
import type { Tec1UpdatePayload } from './types.js';

/** Creates the observable TEC-1 device payload from runtime state. */
export function serializeTec1UpdateFromRuntimeState(state: Tec1State): Tec1UpdatePayload {
  return {
    digits: [...state.digits],
    segmentIntensities: readSevenSegmentIntensities(state.segmentDuty),
    matrix: [...state.matrix],
    speaker: state.speaker ? 1 : 0,
    speedMode: state.speedMode,
    lcd: [...state.lcd],
    speakerHz: state.speakerHz,
  };
}
