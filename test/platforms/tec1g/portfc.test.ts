import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

const CE_BIT = 0x10;
const CLK_BIT = 0x40;
const IO_BIT = 0x80;

function makeRuntime(rtcEnabled: boolean) {
  const config: Tec1gPlatformConfigNormalized = {
    regions: [
      { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
      { start: 0xc000, end: 0xffff, kind: 'rom' as const },
    ],
    romRanges: [{ start: 0xc000, end: 0xffff }],
    appStart: 0x0000,
    entry: 0x0000,
    updateMs: 100,
    yieldMs: 0,
    gimpSignal: false,
    expansionBankHi: false,
    matrixMode: false,
    protectOnReset: false,
    rtcEnabled,
    sdEnabled: false,
    sdHighCapacity: true,
  };
  return createTec1gRuntime(config, () => {});
}

function writePort(rt: ReturnType<typeof makeRuntime>, value: number): void {
  rt.ioHandlers.write(0xfc, value & 0xff);
}

function readPort(rt: ReturnType<typeof makeRuntime>): number {
  return rt.ioHandlers.read(0xfc) & 0xff;
}

function pulse(rt: ReturnType<typeof makeRuntime>, bit: number): void {
  const io = bit ? IO_BIT : 0;
  writePort(rt, CE_BIT | io);
  writePort(rt, CE_BIT | CLK_BIT | io);
  writePort(rt, CE_BIT | io);
}

function writeByte(rt: ReturnType<typeof makeRuntime>, value: number): void {
  for (let i = 0; i < 8; i += 1) {
    pulse(rt, (value >> i) & 1);
  }
}

function readByte(rt: ReturnType<typeof makeRuntime>): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    writePort(rt, CE_BIT);
    writePort(rt, CE_BIT | CLK_BIT);
    const bit = readPort(rt) & 1;
    writePort(rt, CE_BIT);
    value |= bit << i;
  }
  return value & 0xff;
}

describe('port 0xFC (DS1302)', () => {
  it('writes then reads a register value when enabled', () => {
    const rt = makeRuntime(true);
    writePort(rt, CE_BIT);
    const addr = 0x02;
    writeByte(rt, 0x80 | (addr << 1));
    writeByte(rt, 0xa5);
    writePort(rt, 0x00);

    writePort(rt, CE_BIT);
    writeByte(rt, 0x81 | (addr << 1));
    const value = readByte(rt);
    writePort(rt, 0x00);
    expect(value).toBe(0xa5);
  });

  it('returns 0xff when disabled', () => {
    const rt = makeRuntime(false);
    expect(readPort(rt)).toBe(0xff);
  });
});
