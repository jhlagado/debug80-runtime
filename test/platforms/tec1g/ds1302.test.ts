import { describe, expect, it } from 'vitest';
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

describe('Ds1302', () => {
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
});
