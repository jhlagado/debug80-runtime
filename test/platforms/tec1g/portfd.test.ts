import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;

function makeRuntime(sdEnabled: boolean) {
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
    rtcEnabled: false,
    sdEnabled,
    sdHighCapacity: true,
  };
  return createTec1gRuntime(config, () => {});
}

function writePort(rt: ReturnType<typeof makeRuntime>, value: number): void {
  rt.ioHandlers.write(0xfd, value & 0xff);
}

function readPort(rt: ReturnType<typeof makeRuntime>): number {
  return rt.ioHandlers.read(0xfd) & 0xff;
}

function pulse(rt: ReturnType<typeof makeRuntime>, bit: number): void {
  const io = bit ? MOSI_BIT : 0;
  writePort(rt, io);
  writePort(rt, io | CLK_BIT);
  writePort(rt, io);
}

function writeByte(rt: ReturnType<typeof makeRuntime>, value: number): void {
  for (let i = 7; i >= 0; i -= 1) {
    pulse(rt, (value >> i) & 1);
  }
}

function readByte(rt: ReturnType<typeof makeRuntime>): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    writePort(rt, MOSI_BIT);
    writePort(rt, MOSI_BIT | CLK_BIT);
    const bit = (readPort(rt) >> 7) & 1;
    writePort(rt, MOSI_BIT);
    value = ((value << 1) | bit) & 0xff;
  }
  return value & 0xff;
}

function readResponse(rt: ReturnType<typeof makeRuntime>): number {
  for (let i = 0; i < 8; i += 1) {
    const value = readByte(rt);
    if (value !== 0xff) {
      return value;
    }
  }
  return 0xff;
}

describe('port 0xFD (SD SPI)', () => {
  it('returns 0xff when disabled', () => {
    const rt = makeRuntime(false);
    expect(readPort(rt)).toBe(0xff);
  });

  it('responds to CMD0 when enabled', () => {
    const rt = makeRuntime(true);
    writePort(rt, 0x00);
    writeByte(rt, 0x40);
    writeByte(rt, 0x00);
    writeByte(rt, 0x00);
    writeByte(rt, 0x00);
    writeByte(rt, 0x00);
    writeByte(rt, 0x95);
    expect(readResponse(rt)).toBe(0x01);
  });
});
