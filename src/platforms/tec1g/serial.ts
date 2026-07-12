/**
 * @file TEC-1G serial bitbang controller.
 */

import { CycleClock } from '../cycle-clock.js';
import { BitbangUartDecoder } from '../serial/bitbang-uart.js';

const TEC1G_SERIAL_BAUD = 4800;
const TEC1G_MASK_BYTE = 0xff;

export type Tec1gSerialLevel = 0 | 1;

export interface Tec1gSerialController {
  getRxLevel(): Tec1gSerialLevel;
  recordTxLevel(level: Tec1gSerialLevel): void;
  queueSerial(bytes: number[]): void;
  maybeStartQueuedRx(): void;
  setClockHz(hz: number): void;
  reset(): void;
}

/**
 * Builds the TEC-1G serial controller that handles TX decoding and queued RX bytes.
 */
export function createTec1gSerialController(
  cycleClock: CycleClock,
  clockHz: number,
  onByte?: (byte: number) => void
): Tec1gSerialController {
  let serialLevel: Tec1gSerialLevel = 1;
  let serialRxLevel: Tec1gSerialLevel = 1;
  let serialRxBusy = false;
  let serialRxToken = 0;
  let serialRxLeadCycles = 0;
  let serialRxPending = false;
  let serialCyclesPerBit = clockHz / TEC1G_SERIAL_BAUD;
  const serialRxQueue: number[] = [];
  let serialRxPrimed = false;

  const serialDecoder = new BitbangUartDecoder(cycleClock, {
    baud: TEC1G_SERIAL_BAUD,
    cyclesPerSecond: clockHz,
    dataBits: 8,
    stopBits: 2,
    parity: 'none',
    inverted: false,
  });
  serialDecoder.setByteHandler((event) => {
    onByte?.(event.byte);
  });

  const setSerialRxLevel = (level: Tec1gSerialLevel): void => {
    serialRxLevel = level;
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

    const token = serialRxToken;
    const start = cycleClock.now() + serialRxLeadCycles;
    const leadCycles = serialRxLeadCycles;
    serialRxLeadCycles = 0;

    if (leadCycles <= 0) {
      setSerialRxLevel(0);
    } else {
      setSerialRxLevel(1);
      cycleClock.scheduleAt(start, () => {
        if (serialRxToken !== token) {
          return;
        }
        setSerialRxLevel(0);
      });
    }

    for (let i = 0; i < 8; i += 1) {
      const bit = ((next >> i) & 1) as Tec1gSerialLevel;
      const at = start + serialCyclesPerBit * (i + 1);
      cycleClock.scheduleAt(at, () => {
        if (serialRxToken !== token) {
          return;
        }
        setSerialRxLevel(bit);
      });
    }

    const stopAt = start + serialCyclesPerBit * (1 + 8);
    cycleClock.scheduleAt(stopAt, () => {
      if (serialRxToken !== token) {
        return;
      }
      setSerialRxLevel(1);
    });

    const doneAt = start + serialCyclesPerBit * (1 + 8 + 2);
    cycleClock.scheduleAt(doneAt, () => {
      if (serialRxToken !== token) {
        return;
      }
      startNextSerialRx();
    });
  };

  const maybeStartQueuedRx = (): void => {
    if (serialRxPending && !serialRxBusy && serialRxQueue.length > 0) {
      serialRxPending = false;
      serialRxLeadCycles = Math.max(1, Math.round(serialCyclesPerBit * 2));
      startNextSerialRx();
    }
  };

  return {
    getRxLevel: () => serialRxLevel,
    recordTxLevel: (level: Tec1gSerialLevel): void => {
      if (serialLevel === level) {
        return;
      }
      serialLevel = level;
      serialDecoder.recordLevel(serialLevel);
    },
    queueSerial: (bytes: number[]): void => {
      if (bytes.length === 0) {
        return;
      }
      if (!serialRxPrimed) {
        // Prime RX once so the first real byte is aligned to the ROM's bitbang receiver.
        serialRxQueue.push(0);
        serialRxPrimed = true;
      }
      for (const value of bytes) {
        serialRxQueue.push(value & TEC1G_MASK_BYTE);
      }
      if (!serialRxBusy) {
        serialRxPending = true;
      }
    },
    maybeStartQueuedRx,
    setClockHz: (hz: number): void => {
      if (hz <= 0) {
        return;
      }
      serialDecoder.setCyclesPerSecond(hz);
      serialCyclesPerBit = hz / TEC1G_SERIAL_BAUD;
    },
    reset: (): void => {
      serialRxQueue.length = 0;
      serialRxBusy = false;
      serialRxPrimed = false;
      serialRxLeadCycles = 0;
      serialRxPending = false;
      serialRxToken += 1;
      setSerialRxLevel(1);
    },
  };
}
