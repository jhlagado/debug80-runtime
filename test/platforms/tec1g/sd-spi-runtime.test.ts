import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;

type Tec1gRuntimeHandle = {
  rt: ReturnType<typeof createTec1gRuntime>;
  sdImagePath?: string;
};

function makeRuntime(image?: Uint8Array): Tec1gRuntimeHandle {
  let sdImagePath: string | undefined;
  if (image) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-sd-'));
    sdImagePath = path.join(dir, 'sd.img');
    fs.writeFileSync(sdImagePath, image);
  }
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
    sdEnabled: true,
    sdHighCapacity: true,
    ...(sdImagePath !== undefined ? { sdImagePath } : {}),
  };
  return { rt: createTec1gRuntime(config, () => {}), sdImagePath };
}

function writePort(rt: ReturnType<typeof createTec1gRuntime>, value: number): void {
  rt.ioHandlers.write(0xfd, value & 0xff);
}

function readPort(rt: ReturnType<typeof createTec1gRuntime>): number {
  return rt.ioHandlers.read(0xfd) & 0xff;
}

function pulse(rt: ReturnType<typeof createTec1gRuntime>, bit: number): void {
  const io = bit ? MOSI_BIT : 0;
  writePort(rt, io);
  writePort(rt, io | CLK_BIT);
  writePort(rt, io);
}

function writeByte(rt: ReturnType<typeof createTec1gRuntime>, value: number): void {
  for (let i = 7; i >= 0; i -= 1) {
    pulse(rt, (value >> i) & 1);
  }
}

function readByte(rt: ReturnType<typeof createTec1gRuntime>): number {
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

function readResponse(rt: ReturnType<typeof createTec1gRuntime>): number {
  for (let i = 0; i < 8; i += 1) {
    const value = readByte(rt);
    if (value !== 0xff) {
      return value;
    }
  }
  return 0xff;
}

function sendCommand(rt: ReturnType<typeof createTec1gRuntime>, bytes: number[]): void {
  bytes.forEach((byte) => writeByte(rt, byte));
}

function initHighCapacity(rt: ReturnType<typeof createTec1gRuntime>): void {
  writePort(rt, 0x00);
  sendCommand(rt, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]);
  expect(readResponse(rt)).toBe(0x01);
  sendCommand(rt, [0x48, 0x00, 0x00, 0x01, 0xaa, 0x87]);
  expect(readResponse(rt)).toBe(0x01);
  expect(readByte(rt)).toBe(0x00);
  expect(readByte(rt)).toBe(0x00);
  expect(readByte(rt)).toBe(0x01);
  expect(readByte(rt)).toBe(0xaa);
  sendCommand(rt, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
  expect(readResponse(rt)).toBe(0x01);
  sendCommand(rt, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
  expect(readResponse(rt)).toBe(0x01);
  sendCommand(rt, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
  expect(readResponse(rt)).toBe(0x01);
  sendCommand(rt, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
  expect(readResponse(rt)).toBe(0x00);
  sendCommand(rt, [0x7a, 0x00, 0x00, 0x00, 0x00, 0xfd]);
  expect(readResponse(rt)).toBe(0x00);
  expect(readByte(rt)).toBe(0xc0);
  expect(readByte(rt)).toBe(0x00);
  expect(readByte(rt)).toBe(0x00);
  expect(readByte(rt)).toBe(0x00);
}

function writeDataBlock(rt: ReturnType<typeof createTec1gRuntime>, payload: Uint8Array): void {
  writeByte(rt, 0xfe);
  for (let i = 0; i < payload.length; i += 1) {
    writeByte(rt, payload[i] ?? 0x00);
  }
  writeByte(rt, 0xff);
  writeByte(rt, 0xff);
}

describe('TEC-1G SD SPI runtime', () => {
  it('initializes and reads a block through port 0xFD', () => {
    const image = new Uint8Array(1024);
    image[0x0201] = 0xab;
    const { rt } = makeRuntime(image);
    initHighCapacity(rt);
    sendCommand(rt, [0x51, 0x00, 0x00, 0x00, 0x01, 0xff]);
    expect(readResponse(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0xfe);
    expect(readByte(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0xab);
  });

  it('writes a block through port 0xFD', () => {
    const image = new Uint8Array(1024);
    const payload = new Uint8Array(512);
    payload[0] = 0xde;
    payload[1] = 0xad;
    payload[2] = 0xbe;
    const { rt } = makeRuntime(image);
    initHighCapacity(rt);
    sendCommand(rt, [0x58, 0x00, 0x00, 0x00, 0x01, 0xff]);
    expect(readResponse(rt)).toBe(0x00);
    writeDataBlock(rt, payload);
    expect(readResponse(rt)).toBe(0x05);
    sendCommand(rt, [0x51, 0x00, 0x00, 0x00, 0x01, 0xff]);
    expect(readResponse(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0xfe);
    expect(readByte(rt)).toBe(0xde);
    expect(readByte(rt)).toBe(0xad);
    expect(readByte(rt)).toBe(0xbe);
    sendCommand(rt, [0x4d, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponse(rt)).toBe(0x00);
    expect(readByte(rt)).toBe(0x00);
  });
});
