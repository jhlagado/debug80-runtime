import { describe, expect, it, vi } from 'vitest';
import { SdSpi } from '@jhlagado/debug80-runtime/platforms/tec1g/sd-spi';

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;
const CS_BIT = 0x04;

function writeSpi(spi: SdSpi, value: number): void {
  spi.write(value & 0xff);
}

function pulse(spi: SdSpi, bit: number): void {
  const io = bit ? MOSI_BIT : 0;
  writeSpi(spi, io); // CS active low (bit clear)
  writeSpi(spi, io | CLK_BIT);
  writeSpi(spi, io);
}

function writeByte(spi: SdSpi, value: number): void {
  for (let i = 7; i >= 0; i -= 1) {
    pulse(spi, (value >> i) & 1);
  }
}

function writeDiagIdleClocks(spi: SdSpi, clocks: number): void {
  for (let i = 0; i < clocks; i += 1) {
    writeSpi(spi, MOSI_BIT | CS_BIT);
    writeSpi(spi, MOSI_BIT | CLK_BIT | CS_BIT);
    writeSpi(spi, MOSI_BIT | CS_BIT);
  }
}

function writeByteWithMon3Idle(spi: SdSpi, value: number): void {
  writeByte(spi, value);
  writeSpi(spi, MOSI_BIT | CS_BIT);
}

function readByte(spi: SdSpi): number {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    writeSpi(spi, MOSI_BIT);
    writeSpi(spi, MOSI_BIT | CLK_BIT);
    const bit = (spi.read() >> 7) & 1;
    writeSpi(spi, MOSI_BIT);
    value = ((value << 1) | bit) & 0xff;
  }
  return value & 0xff;
}

function readResponseByte(spi: SdSpi): number {
  for (let i = 0; i < 8; i += 1) {
    const value = readByte(spi);
    if (value !== 0xff) {
      return value;
    }
  }
  return 0xff;
}

function sendCommand(spi: SdSpi, bytes: number[]): void {
  bytes.forEach((byte) => writeByte(spi, byte));
}

function sendMon3IdleCommand(spi: SdSpi, bytes: number[]): void {
  bytes.forEach((byte) => writeByteWithMon3Idle(spi, byte));
}

function writeDataBlock(spi: SdSpi, payload: Uint8Array): void {
  writeByte(spi, 0xfe);
  for (let i = 0; i < payload.length; i += 1) {
    writeByte(spi, payload[i] ?? 0x00);
  }
  writeByte(spi, 0xff);
  writeByte(spi, 0xff);
}

describe('SdSpi', () => {
  it('returns 0xff when chip-select is inactive', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, CS_BIT);
    expect(spi.read()).toBe(0xff);
  });

  it('captures CMD0 command frames', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00); // CS active
    writeByte(spi, 0x40);
    writeByte(spi, 0x00);
    writeByte(spi, 0x00);
    writeByte(spi, 0x00);
    writeByte(spi, 0x00);
    writeByte(spi, 0x95);
    const cmd = spi.getLastCommand();
    expect(cmd).toBeDefined();
    expect(cmd?.cmd).toBe(0);
    expect(cmd?.arg).toBe(0);
    expect(cmd?.crc).toBe(0x95);
  });

  it('captures MON3-style command frames with CS idled between bytes', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendMon3IdleCommand(spi, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]);
    const cmd = spi.getLastCommand();
    expect(cmd).toBeDefined();
    expect(cmd?.cmd).toBe(0);
    expect(cmd?.arg).toBe(0);
    expect(cmd?.crc).toBe(0x95);
    expect(readResponseByte(spi)).toBe(0x01);
  });

  it('completes MON3-style SDHC init with CS idled between command bytes', () => {
    const spi = new SdSpi({ csMask: CS_BIT, highCapacity: true });
    writeSpi(spi, 0x00);
    sendMon3IdleCommand(spi, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendMon3IdleCommand(spi, [0x48, 0x00, 0x00, 0x01, 0xaa, 0x87]);
    expect(readResponseByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0xaa);
    sendMon3IdleCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendMon3IdleCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendMon3IdleCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendMon3IdleCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x00);
    sendMon3IdleCommand(spi, [0x7a, 0x00, 0x00, 0x00, 0x00, 0xfd]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xc0);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
  });

  it('responds to CMD0 and CMD8 with R1/R7 bytes', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x48, 0x00, 0x00, 0x01, 0xaa, 0x87]);
    expect(readResponseByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0xaa);
  });

  it('completes ACMD41 init sequence and supports CMD58', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x00);
    sendCommand(spi, [0x7a, 0x00, 0x00, 0x00, 0x00, 0xfd]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xc0);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
  });

  it('responds to CMD17 with data token when ready', () => {
    const image = new Uint8Array(1024);
    image[0x0002] = 0x5a;
    const spi = new SdSpi({ csMask: CS_BIT, image });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x51, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x5a);
  });

  it('reports SDSC OCR and accepts CMD16 block length', () => {
    const spi = new SdSpi({ csMask: CS_BIT, highCapacity: false });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x00);
    sendCommand(spi, [0x7a, 0x00, 0x00, 0x00, 0x00, 0xfd]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x80);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    sendCommand(spi, [0x50, 0x00, 0x00, 0x02, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
  });

  it('returns CID and CSD blocks for TEC-1G diagnostics', () => {
    const spi = new SdSpi({ csMask: CS_BIT, highCapacity: true });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    expect(readResponseByte(spi)).toBe(0x00);

    sendCommand(spi, [0x4a, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    expect(readByte(spi)).toBe(0x03);
    expect(readByte(spi)).toBe(0x44);
    expect(readByte(spi)).toBe(0x38);
    expect(readByte(spi)).toBe(0x44);
    for (let i = 0; i < 14; i += 1) {
      readByte(spi);
    }

    sendCommand(spi, [0x49, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    expect(readByte(spi)).toBe(0x40);
  });

  it('follows the TEC-1G DIAG SD initialization and card-info sequence', () => {
    const spi = new SdSpi({ csMask: CS_BIT, highCapacity: true });

    writeSpi(spi, MOSI_BIT | CS_BIT); // DIAG spi_init idle state.
    writeDiagIdleClocks(spi, 80);
    writeSpi(spi, MOSI_BIT); // DIAG asserts CS to enter SPI mode.

    sendCommand(spi, [0x40, 0x00, 0x00, 0x00, 0x00, 0x95]); // CMD0
    expect(readResponseByte(spi)).toBe(0x01);

    sendCommand(spi, [0x48, 0x00, 0x00, 0x01, 0xaa, 0x87]); // CMD8
    expect(readResponseByte(spi)).toBe(0x01);
    expect([readByte(spi), readByte(spi), readByte(spi), readByte(spi)]).toEqual([
      0x00, 0x00, 0x01, 0xaa,
    ]);

    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x01]); // CMD55
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x01]); // ACMD41
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x01]); // CMD55
    expect(readResponseByte(spi)).toBe(0x01);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x01]); // ACMD41
    expect(readResponseByte(spi)).toBe(0x00);

    sendCommand(spi, [0x4a, 0x00, 0x00, 0x00, 0x00, 0x01]); // CMD10 CID
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    const cid = Array.from({ length: 16 }, () => readByte(spi));
    expect(String.fromCharCode(...cid.slice(3, 8))).toBe('DEB80');
    readByte(spi);
    readByte(spi);

    sendCommand(spi, [0x49, 0x00, 0x00, 0x01, 0xaa, 0x87]); // CMD9 CSD
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    const csd = Array.from({ length: 16 }, () => readByte(spi));
    const typeBits = (csd[0] ?? 0) & 0xc0;
    const typeAfterFirstRlca = ((typeBits << 1) | (typeBits >> 7)) & 0xff;
    const diagTypeByte = ((typeAfterFirstRlca << 1) | (typeAfterFirstRlca >> 7)) & 0xff;
    expect(csd[0]).toBe(0x40);
    expect(diagTypeByte + 1).toBe(2);
    expect(csd[9]).toBe(0x1f);
    expect(csd[10]).toBe(0xff);
  });

  it('treats CMD17 argument as block address for high capacity cards', () => {
    const image = new Uint8Array(2048);
    image[0x0202] = 0xa5;
    const spi = new SdSpi({ csMask: CS_BIT, image, highCapacity: true });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x51, 0x00, 0x00, 0x00, 0x01, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xfe);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0xa5);
  });

  it('accepts CMD24 and writes a single data block', () => {
    const image = new Uint8Array(1024);
    const payload = new Uint8Array(512);
    payload[0] = 0x12;
    payload[1] = 0x34;
    payload[2] = 0x56;
    const spi = new SdSpi({ csMask: CS_BIT, image });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x58, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    writeDataBlock(spi, payload);
    expect(readResponseByte(spi)).toBe(0x05);
    expect(image[0]).toBe(0x12);
    expect(image[1]).toBe(0x34);
    expect(image[2]).toBe(0x56);
  });

  it('invokes onWrite callback after CMD24 completes', () => {
    const image = new Uint8Array(1024);
    const payload = new Uint8Array(512);
    payload[0] = 0xde;
    payload[1] = 0xad;
    payload[2] = 0xbe;
    const onWrite = vi.fn();
    const spi = new SdSpi({ csMask: CS_BIT, image, onWrite });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x58, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    writeDataBlock(spi, payload);
    expect(readResponseByte(spi)).toBe(0x05);
    expect(image[0]).toBe(0xde);
    expect(image[1]).toBe(0xad);
    expect(image[2]).toBe(0xbe);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onWrite).toHaveBeenCalledWith(image);
  });

  it('responds to CMD13 with status', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x77, 0x00, 0x00, 0x00, 0x00, 0x65]);
    readResponseByte(spi);
    sendCommand(spi, [0x69, 0x40, 0x00, 0x00, 0x00, 0x77]);
    readResponseByte(spi);
    sendCommand(spi, [0x4d, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x00);
    expect(readByte(spi)).toBe(0x00);
  });

  it('returns idle status for CMD13 before init', () => {
    const spi = new SdSpi({ csMask: CS_BIT });
    writeSpi(spi, 0x00);
    sendCommand(spi, [0x4d, 0x00, 0x00, 0x00, 0x00, 0xff]);
    expect(readResponseByte(spi)).toBe(0x01);
    expect(readByte(spi)).toBe(0x00);
  });
});
