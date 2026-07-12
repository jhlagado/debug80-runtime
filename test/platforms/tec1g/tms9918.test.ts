/**
 * @file Direct tests for the TEC-1G TMS9918/TMS9929 video device model.
 */

import { describe, expect, it } from 'vitest';
import {
  TMS9918_CONTROL_PORT,
  TMS9918_DATA_PORT,
  createTms9918,
} from '@jhlagado/debug80-runtime/platforms/tec1g/tms9918';

function writeRegister(
  vdp: ReturnType<typeof createTms9918>,
  register: number,
  value: number
): void {
  vdp.writeControl(value);
  vdp.writeControl(0x80 | register);
}

function setWriteAddress(vdp: ReturnType<typeof createTms9918>, address: number): void {
  vdp.writeControl(address & 0xff);
  vdp.writeControl(0x40 | ((address >> 8) & 0x3f));
}

describe('TEC-1G TMS9918 video device', () => {
  it('writes registers through the two-byte control port protocol', () => {
    const vdp = createTms9918();

    vdp.writeControl(0xc2);
    vdp.writeControl(0x81);

    expect(vdp.snapshot().registers[1]).toBe(0xc2);
  });

  it('writes and reads VRAM through the data port with auto-increment', () => {
    const vdp = createTms9918();

    vdp.writeControl(0x34);
    vdp.writeControl(0x40 | 0x12);
    vdp.writeData(0xab);
    vdp.writeData(0xcd);

    expect(vdp.snapshot().vram[0x1234]).toBe(0xab);
    expect(vdp.snapshot().vram[0x1235]).toBe(0xcd);

    vdp.writeControl(0x34);
    vdp.writeControl(0x12);

    expect(vdp.readData()).toBe(0xab);
    expect(vdp.readData()).toBe(0xcd);
  });

  it('reports frame interrupts at PAL cadence and clears them on status read', () => {
    const vdp = createTms9918({ videoStandard: 'pal' });
    vdp.writeControl(0x20);
    vdp.writeControl(0x81);

    vdp.advanceCycles(79_999);
    expect(vdp.consumeNmi()).toBe(false);

    vdp.advanceCycles(1);
    expect(vdp.peekStatus() & 0x80).toBe(0x80);
    expect(vdp.consumeNmi()).toBe(true);
    expect(vdp.consumeNmi()).toBe(false);

    expect(vdp.readStatus() & 0x80).toBe(0x80);
    expect(vdp.peekStatus() & 0x80).toBe(0);
  });

  it('disconnects from the bus without clearing VRAM state', () => {
    const vdp = createTms9918();

    vdp.writeControl(0x00);
    vdp.writeControl(0x40);
    vdp.writeData(0x5a);

    vdp.setActive(false);
    vdp.writeData(0xa5);
    expect(vdp.readData()).toBe(0xff);
    expect(vdp.readStatus()).toBe(0xff);

    vdp.setActive(true);
    vdp.writeControl(0x00);
    vdp.writeControl(0x00);
    expect(vdp.readData()).toBe(0x5a);
  });

  it('renders a minimal Graphics I tile pattern into the framebuffer', () => {
    const vdp = createTms9918();

    writeRegister(vdp, 0, 0x00);
    writeRegister(vdp, 1, 0xc0);
    writeRegister(vdp, 2, 0x02);
    writeRegister(vdp, 3, 0x80);
    writeRegister(vdp, 4, 0x00);
    writeRegister(vdp, 5, 0x36);
    writeRegister(vdp, 6, 0x07);
    writeRegister(vdp, 7, 0x04);

    setWriteAddress(vdp, 0x0008);
    for (const byte of [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55]) {
      vdp.writeData(byte);
    }

    setWriteAddress(vdp, 0x2000);
    for (let i = 0; i < 32; i += 1) {
      vdp.writeData(0xf4);
    }

    setWriteAddress(vdp, 0x0800);
    for (let i = 0; i < 32 * 24; i += 1) {
      vdp.writeData(1);
    }

    const framebuffer = vdp.snapshot().framebuffer;
    expect(new Set(framebuffer).size).toBeGreaterThan(1);
    expect(framebuffer).toContain(0xffffff);
    expect(framebuffer).toContain(0x5455ed);
  });

  it('documents the TEC-1G fixed video ports', () => {
    expect(TMS9918_DATA_PORT).toBe(0xbe);
    expect(TMS9918_CONTROL_PORT).toBe(0xbf);
  });
});
