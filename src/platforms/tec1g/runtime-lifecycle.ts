/**
 * @file TEC-1G runtime lifecycle helpers (speaker silence and reset orchestration).
 */

import { decodeSysCtrl } from './sysctrl.js';
import { TEC1G_MASK_BYTE, TEC1G_MASK_LOW7 } from './constants.js';
import { createSevenSegmentDutyState } from '../tec-common/index.js';
import type { Tec1gState } from './runtime-state.js';

type ResetControllers = {
  lcd: { reset: () => void };
  glcd: { reset: () => void };
  serial: { reset: () => void };
};

/**
 * Clears speaker state and cancels pending silence timer.
 */
export function silenceTec1gSpeaker(state: Tec1gState, queueUpdate: () => void): void {
  const { audio, timing } = state;
  if (audio.speakerHz === 0 && !audio.speaker) {
    return;
  }
  audio.speakerHz = 0;
  audio.speaker = false;
  audio.lastEdgeCycle = null;
  if (audio.silenceEventId !== null) {
    timing.cycleClock.cancel(audio.silenceEventId);
    audio.silenceEventId = null;
  }
  queueUpdate();
}

/**
 * Resets display/input/system state while preserving configured defaults.
 */
export function resetTec1gRuntimeState(
  state: Tec1gState,
  defaults: {
    matrixMode: boolean;
    sysCtrl: number;
    gimpSignal: boolean;
    cartridgePresent: boolean;
  },
  controllers: ResetControllers,
  queueUpdate: () => void
): void {
  const { display, input, audio, timing, system } = state;
  audio.speaker = false;
  audio.speakerHz = 0;
  audio.lastEdgeCycle = null;
  controllers.lcd.reset();
  display.digits.fill(0);
  display.digitLatch = 0;
  display.segmentLatch = 0;
  display.segmentDuty = createSevenSegmentDutyState(6, timing.cycleClock.now());
  display.ledMatrixRedRows.fill(0);
  display.ledMatrixGreenRows.fill(0);
  display.ledMatrixBlueRows.fill(0);
  display.matrixScanCycles.length = 0;
  display.matrixDroppedScanCycles = 0;
  display.matrixNextScanCycleId = 0;
  display.matrixActiveStartCycle = null;
  display.matrixFrameStartCycle = null;
  display.matrixScanRows.fill(null);
  display.matrixScanRowOrder.length = 0;
  display.matrixScanSeenMask = 0;
  display.ledMatrixRowLatch = 0;
  display.ledMatrixRedLatch = 0;
  display.ledMatrixGreenLatch = 0;
  display.ledMatrixBlueLatch = 0;
  const tms9918Active = display.tms9918.snapshot().active;
  display.tms9918.reset();
  display.tms9918.setActive(tms9918Active);
  input.matrixKeyStates.fill(TEC1G_MASK_BYTE);
  input.matrixPendingKeyStates.fill(TEC1G_MASK_BYTE);
  input.matrixPendingDirty = false;
  input.matrixLastReadRow = null;
  input.matrixModeEnabled = defaults.matrixMode;
  input.joystickState = 0;
  if (input.keyReleaseEventId !== null) {
    timing.cycleClock.cancel(input.keyReleaseEventId);
    input.keyReleaseEventId = null;
  }
  input.keyValue = TEC1G_MASK_LOW7;
  input.keyUserHeld = false;
  input.keyHeldCode = TEC1G_MASK_LOW7;
  input.keyMinPulseDone = true;
  input.nmiPending = false;
  input.resetKeyValue = null;
  controllers.glcd.reset();
  system.sysCtrl = defaults.sysCtrl;
  const decoded = decodeSysCtrl(system.sysCtrl);
  system.shadowEnabled = decoded.shadowEnabled;
  system.protectEnabled = decoded.protectEnabled;
  system.expandEnabled = decoded.expandEnabled;
  system.bankA14 = decoded.bankA14;
  system.memoryExpansionBankValue = decoded.memoryExpansionBankValue;
  system.memoryExpansionMode = decoded.memoryExpansionMode;
  system.memoryExpansionLegacyBank = decoded.memoryExpansionLegacyBank;
  system.memoryExpansionExtendedWindow = decoded.memoryExpansionExtendedWindow;
  system.memoryExpansionPhysicalBank = decoded.memoryExpansionPhysicalBank;
  system.capsLock = decoded.capsLock;
  input.shiftKeyActive = false;
  input.rawKeyActive = false;
  system.gimpSignal = defaults.gimpSignal;
  system.cartridgePresent = defaults.cartridgePresent;
  if (audio.silenceEventId !== null) {
    timing.cycleClock.cancel(audio.silenceEventId);
    audio.silenceEventId = null;
  }
  controllers.serial.reset();
  queueUpdate();
}
