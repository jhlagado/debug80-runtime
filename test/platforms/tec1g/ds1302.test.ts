import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ds1302 } from '@jhlagado/debug80-runtime/platforms/tec1g/ds1302';

const CE_BIT = 0x10;
const CLK_BIT = 0x40;
const IO_BIT = 0x80;

function pulse(ds: Ds1302, bit: number): void {
  const io = bit ? IO_BIT : 0;
  ds.write(CE_BIT | io);
  ds.write(CE_BIT | CLK_BIT | io);
  ds.write(CE_BIT | io);
}

function writeByte(ds: Ds1302, value: number): void {
  for (let i = 0; i < 8; i += 1) {
    pulse(ds, (value >> i) & 1);
  }
}

function readByte(ds: Ds1302): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    ds.write(CE_BIT);
    ds.write(CE_BIT | CLK_BIT);
    const bit = ds.read() & 1;
    ds.write(CE_BIT);
    value |= bit << i;
  }
  return value & 0xff;
}

// MON3's byte routines on port FCh: each command bit is set up with the clock
// low and clocked by the rise, which leaves the clock high; each data bit is
// read after a rise and a fall (OUT 70h, OUT 30h, IN).
function mon3WriteByte(ds: Ds1302, value: number): void {
  for (let i = 0; i < 8; i += 1) {
    const io = (value >> i) & 1 ? IO_BIT : 0;
    ds.write(CE_BIT | io);
    ds.write(CE_BIT | CLK_BIT | io);
  }
}

function mon3ReadByte(ds: Ds1302): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    ds.write(0x70);
    ds.write(0x30);
    value |= (ds.read() & 1) << i;
  }
  return value;
}

describe('Ds1302', () => {
  it('puts data out on falling edges, as MON3 reads it', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    mon3WriteByte(ds, 0x8e); // clear write protect
    mon3WriteByte(ds, 0x00);
    ds.write(0x00);

    ds.write(CE_BIT);
    mon3WriteByte(ds, 0xc0); // PRAM byte 0
    mon3WriteByte(ds, 0xa5);
    ds.write(0x00);

    ds.write(CE_BIT);
    mon3WriteByte(ds, 0xc1);
    expect(mon3ReadByte(ds)).toBe(0xa5);
    ds.write(0x00);

    ds.write(CE_BIT);
    mon3WriteByte(ds, 0xc2); // PRAM byte 1
    mon3WriteByte(ds, 0x3c);
    ds.write(0x00);

    ds.write(CE_BIT);
    mon3WriteByte(ds, 0xff); // PRAM burst read
    expect([mon3ReadByte(ds), mon3ReadByte(ds)]).toEqual([0xa5, 0x3c]);
    ds.write(0x00);
  });

  it('holds the data line on a rising edge during a read', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    mon3WriteByte(ds, 0xc0);
    mon3WriteByte(ds, 0x01);
    ds.write(0x00);

    ds.write(CE_BIT);
    mon3WriteByte(ds, 0xc1); // clock left high after the last command bit
    expect(ds.read()).toBe(1); // nothing driven yet: the line floats high
    ds.write(CE_BIT); // the fall puts out bit 0
    expect(ds.read()).toBe(1);
    ds.write(CE_BIT | CLK_BIT); // a rise changes nothing
    expect(ds.read()).toBe(1);
    ds.write(CE_BIT); // bit 1
    expect(ds.read()).toBe(0);
    ds.write(0x00);
  });

  it('uses TEC-1G port bit 7 for writes and bit 0 for reads', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    writeByte(ds, 0x8e); // DS1302 write-protect register write.
    writeByte(ds, 0x00);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0x81); // seconds register read.
    const seconds = readByte(ds);
    ds.write(0x00);
    expect(seconds).toBeLessThan(0x60);
  });

  it('writes then reads a register value', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const addr = 0x02;
    const cmdWrite = 0x80 | (addr << 1);
    writeByte(ds, cmdWrite);
    writeByte(ds, 0xa5);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdRead = 0x81 | (addr << 1);
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    expect(value).toBe(0xa5);
  });

  it('returns BCD time values', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const cmdRead = 0x81;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    const tens = (value >> 4) & 0x0f;
    const ones = value & 0x0f;
    expect(tens).toBeGreaterThanOrEqual(0);
    expect(tens).toBeLessThan(6);
    expect(ones).toBeGreaterThanOrEqual(0);
    expect(ones).toBeLessThan(10);
  });

  it('writes and reads PRAM when not write protected', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const cmdWrite = 0xc0;
    writeByte(ds, cmdWrite);
    writeByte(ds, 0x5a);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdRead = 0xc1;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    expect(value).toBe(0x5a);
  });

  it('honors write protect', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    const cmdWp = 0x8e;
    writeByte(ds, cmdWp);
    writeByte(ds, 0x80);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdWrite = 0xc0;
    writeByte(ds, cmdWrite);
    writeByte(ds, 0x12);
    ds.write(0x00);

    ds.write(CE_BIT);
    const cmdRead = 0xc1;
    writeByte(ds, cmdRead);
    const value = readByte(ds);
    ds.write(0x00);
    expect(value).toBe(0x00);
  });

  it('supports burst read for sequential registers', () => {
    const ds = new Ds1302();
    ds.write(CE_BIT);
    writeByte(ds, 0x80);
    writeByte(ds, 0x10);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0x82);
    writeByte(ds, 0x11);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0x84);
    writeByte(ds, 0x22);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0xbf);
    const first = readByte(ds);
    const second = readByte(ds);
    const third = readByte(ds);
    ds.write(0x00);
    expect(first).toBe(0x10);
    expect(second).toBe(0x11);
    expect(third).toBe(0x22);
  });

  it('supports the DIAG RTC setup and 12-hour toggle register pattern', () => {
    const ds = new Ds1302();

    ds.write(CE_BIT);
    writeByte(ds, 0x8e); // clear write protect
    writeByte(ds, 0x00);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0x90); // clear trickle-charge register
    writeByte(ds, 0x00);
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0x84); // write hours
    writeByte(ds, 0x92); // 12 AM with 12-hour mode bit
    ds.write(0x00);

    ds.write(CE_BIT);
    writeByte(ds, 0x85); // read hours
    expect(readByte(ds)).toBe(0x92);
    ds.write(0x00);
  });

  describe('after a time is written', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function writeClock(ds: Ds1302, bytes: number[]): void {
      ds.write(CE_BIT);
      writeByte(ds, 0xbe); // clock burst write
      for (const b of bytes) writeByte(ds, b);
      ds.write(0x00);
    }

    function readClock(ds: Ds1302): number[] {
      ds.write(CE_BIT);
      writeByte(ds, 0xbf); // clock burst read
      const bytes = Array.from({ length: 7 }, () => readByte(ds));
      ds.write(0x00);
      return bytes;
    }

    function writeRegister(ds: Ds1302, command: number, value: number): void {
      ds.write(CE_BIT);
      writeByte(ds, command);
      writeByte(ds, value);
      ds.write(0x00);
    }

    it('counts on from the time written', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0, 500));
      const ds = new Ds1302();
      // 23:59:58, Wednesday 28 February 2024, a leap year.
      writeClock(ds, [0x58, 0x59, 0x23, 0x28, 0x02, 0x03, 0x24, 0x00]);
      expect(readClock(ds)).toEqual([0x58, 0x59, 0x23, 0x28, 0x02, 0x03, 0x24]);
      vi.advanceTimersByTime(999);
      expect(readClock(ds)[0]).toBe(0x58);
      vi.advanceTimersByTime(2001);
      expect(readClock(ds)).toEqual([0x01, 0x00, 0x00, 0x29, 0x02, 0x04, 0x24]);
    });

    it('carries the date into the next month and year', () => {
      vi.useFakeTimers();
      const ds = new Ds1302();
      writeClock(ds, [0x59, 0x59, 0x23, 0x28, 0x02, 0x07, 0x25, 0x00]);
      vi.advanceTimersByTime(1000);
      expect(readClock(ds)).toEqual([0x00, 0x00, 0x00, 0x01, 0x03, 0x01, 0x25]);
      writeClock(ds, [0x59, 0x59, 0x23, 0x31, 0x12, 0x03, 0x99, 0x00]);
      vi.advanceTimersByTime(1000);
      expect(readClock(ds)).toEqual([0x00, 0x00, 0x00, 0x01, 0x01, 0x04, 0x00]);
    });

    it('counts 12-hour time through noon and midnight', () => {
      vi.useFakeTimers();
      const ds = new Ds1302();
      writeClock(ds, [0x59, 0x59, 0x91, 0x10, 0x05, 0x02, 0x26, 0x00]); // 11 AM
      vi.advanceTimersByTime(1000);
      expect(readClock(ds)[2]).toBe(0xb2); // 12 PM
      vi.advanceTimersByTime(3600 * 1000);
      expect(readClock(ds)[2]).toBe(0xa1); // 1 PM
      writeClock(ds, [0x59, 0x59, 0xb1, 0x10, 0x05, 0x02, 0x26, 0x00]); // 11 PM
      vi.advanceTimersByTime(1000);
      expect(readClock(ds).slice(2, 4)).toEqual([0x92, 0x11]); // 12 AM, the 11th
    });

    it('holds while the clock-halt bit is set and counts on once it is cleared', () => {
      vi.useFakeTimers();
      const ds = new Ds1302();
      writeClock(ds, [0x80 | 0x30, 0x15, 0x10, 0x01, 0x06, 0x01, 0x26, 0x00]);
      vi.advanceTimersByTime(5000);
      expect(readClock(ds)[0]).toBe(0xb0);
      writeRegister(ds, 0x80, 0x30);
      vi.advanceTimersByTime(5000);
      expect(readClock(ds)[0]).toBe(0x35);
    });

    it('keeps counting when one register is written', () => {
      vi.useFakeTimers();
      const ds = new Ds1302();
      writeClock(ds, [0x00, 0x00, 0x08, 0x01, 0x06, 0x01, 0x26, 0x00]);
      vi.advanceTimersByTime(10_000);
      writeRegister(ds, 0x82, 0x30); // minutes
      vi.advanceTimersByTime(2000);
      expect(readClock(ds).slice(0, 3)).toEqual([0x12, 0x30, 0x08]);
    });
  });
});
