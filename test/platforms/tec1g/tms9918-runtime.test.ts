/**
 * @file Runtime-level tests for the TEC-1G TMS9918/TMS9929 card.
 */

import { describe, expect, it } from 'vitest';
import {
  createTec1gRuntime,
  normalizeTec1gConfig,
} from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';
import {
  TMS9918_CONTROL_PORT,
  TMS9918_DATA_PORT,
} from '@jhlagado/debug80-runtime/platforms/tec1g/tms9918';
import { createZ80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';
import type { HexProgram } from '@jhlagado/debug80-runtime/z80/loaders';

function makeRuntime() {
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
    sdEnabled: false,
    sdHighCapacity: true,
  };
  return createTec1gRuntime(config, () => {});
}

function makeProgram(bytes: number[], startAddress = 0x4000): HexProgram {
  const memory = new Uint8Array(0x10000);
  memory.set(bytes, startAddress);
  return { memory, startAddress };
}

describe('TEC-1G TMS9918 runtime integration', () => {
  it('keeps the video card detached until the panel activates it', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x44);
    expect(rt.ioHandlers.read(TMS9918_DATA_PORT)).toBe(0xff);

    rt.setTms9918Active(true);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x44);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    expect(rt.ioHandlers.read(TMS9918_DATA_PORT)).toBe(0x44);
  });

  it('honors target TMS9918 attachment before CPU video writes execute', () => {
    const updates: unknown[] = [];
    const config = normalizeTec1gConfig({
      regions: [
        { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
        { start: 0xc000, end: 0xffff, kind: 'rom' as const },
      ],
      appStart: 0x4000,
      entry: 0x4000,
      updateMs: 100,
      yieldMs: 0,
      uiVisibility: { tms9918: true },
    });
    const rt = createTec1gRuntime(config, (payload) => updates.push(payload));
    const program = makeProgram([
      0x31,
      0xff,
      0x7f, // LD SP,0x7fff
      0x3e,
      0x00, // LD A,0x00
      0xd3,
      TMS9918_CONTROL_PORT, // OUT ($BF),A
      0x3e,
      0x40, // LD A,0x40
      0xd3,
      TMS9918_CONTROL_PORT, // OUT ($BF),A: write address 0
      0x3e,
      0x5a, // LD A,0x5a
      0xd3,
      TMS9918_DATA_PORT, // OUT ($BE),A
      0x76, // HALT
    ]);
    const cpu = createZ80Runtime(program, 0x4000, rt.ioHandlers, {
      romRanges: config.romRanges,
    });

    for (let i = 0; i < 8; i += 1) {
      const result = cpu.step();
      rt.recordCycles(result.cycles ?? 0);
    }

    expect(rt.state.display.tms9918.snapshot().active).toBe(true);
    expect(rt.state.display.tms9918.snapshot().vram[0]).toBe(0x5a);
    expect(updates).toHaveLength(1);
    expect(rt.state.timing.pendingUpdate).toBe(false);
  });

  it('publishes dirty TMS9918 video state on the emulated frame cadence', () => {
    const updates: unknown[] = [];
    const config = normalizeTec1gConfig({
      regions: [
        { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
        { start: 0xc000, end: 0xffff, kind: 'rom' as const },
      ],
      appStart: 0x4000,
      entry: 0x4000,
      updateMs: 1_000_000,
      yieldMs: 0,
      uiVisibility: { tms9918: true },
    });
    const rt = createTec1gRuntime(config, (payload) => updates.push(payload));
    updates.length = 0;

    rt.ioHandlers.write?.(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write?.(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write?.(TMS9918_DATA_PORT, 0x44);
    expect(rt.state.display.tms9918.snapshot().vram[0]).toBe(0x44);
    expect(updates).toHaveLength(0);

    rt.recordCycles(79_999);
    expect(updates).toHaveLength(0);

    rt.recordCycles(1);
    expect(updates).toHaveLength(0);
    expect(rt.state.timing.pendingUpdate).toBe(true);
  });

  it('raises NMI from the PAL frame cadence when TMS interrupts are enabled', () => {
    const rt = makeRuntime();
    rt.setTms9918Active(true);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x20);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x81);

    rt.recordCycles(79_999);
    expect(rt.ioHandlers.tick?.()).toBeUndefined();

    rt.recordCycles(1);
    expect(rt.ioHandlers.tick?.()).toEqual({
      interrupt: { nonMaskable: true, data: 0x66 },
    });
    expect(rt.ioHandlers.tick?.()).toBeUndefined();
  });

  it('resets the video device while preserving panel attachment', () => {
    const rt = makeRuntime();
    rt.setTms9918Active(true);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x44);
    expect(rt.state.display.tms9918.snapshot().vram[0]).toBe(0x44);

    rt.resetState();

    const resetSnapshot = rt.state.display.tms9918.snapshot();
    expect(resetSnapshot.active).toBe(true);
    expect(resetSnapshot.vram[0]).toBe(0x00);
    expect(resetSnapshot.registers).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x00);
    rt.ioHandlers.write(TMS9918_CONTROL_PORT, 0x40);
    rt.ioHandlers.write(TMS9918_DATA_PORT, 0x55);
    expect(rt.state.display.tms9918.snapshot().vram[0]).toBe(0x55);
  });
});
