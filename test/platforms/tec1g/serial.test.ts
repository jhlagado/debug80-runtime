import { describe, expect, it } from 'vitest';
import { CycleClock } from '@jhlagado/debug80-runtime/platforms/cycle-clock';
import { TEC_FAST_HZ } from '@jhlagado/debug80-runtime/platforms/tec-common';
import { createTec1gSerialController } from '@jhlagado/debug80-runtime/platforms/tec1g/serial';

describe('TEC-1G serial bitbang', () => {
  it('decodes a transmitted byte on TX line', () => {
    const bytes: number[] = [];
    const clock = new CycleClock();
    const serial = createTec1gSerialController(clock, TEC_FAST_HZ, (byte) => bytes.push(byte));
    const cyclesPerBit = TEC_FAST_HZ / 4800;
    const writeSerial = (level: 0 | 1): void => {
      serial.recordTxLevel(level);
    };
    const advance = (): void => {
      clock.advance(Math.ceil(cyclesPerBit));
    };

    const value = 0x55;
    writeSerial(1); // idle
    writeSerial(0); // start bit
    advance();
    for (let i = 0; i < 8; i += 1) {
      const bit = ((value >> i) & 1) as 0 | 1;
      writeSerial(bit);
      advance();
    }
    writeSerial(1); // stop bits
    advance();
    advance();
    clock.advance(Math.ceil(cyclesPerBit * 4));

    expect(bytes).toEqual([value]);
  });
});
