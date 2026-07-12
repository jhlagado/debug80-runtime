import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

function makeRuntime(overrides: Partial<Tec1gPlatformConfigNormalized> = {}) {
  return createTec1gRuntime(
    {
      regions: [
        { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
        { start: 0xc000, end: 0xffff, kind: 'rom' as const },
      ],
      romRanges: [{ start: 0xc000, end: 0xffff }],
      appStart: 0x0000,
      entry: 0x0000,
      updateMs: 100,
      yieldMs: 10,
      gimpSignal: false,
      expansionBankHi: false,
      matrixMode: false,
      protectOnReset: false,
      rtcEnabled: false,
      sdEnabled: false,
      sdHighCapacity: true,
      ...overrides,
    },
    () => {}
  );
}

describe('port 0x03 (SYS_INPUT)', () => {
  it('bit 0 (MATRIX) reflects MON-3 matrix config mode', () => {
    const rt = makeRuntime();
    expect(rt.ioHandlers.read(0x03) & 0x01).toBe(0);
    rt.setMatrixMode(true);
    expect(rt.ioHandlers.read(0x03) & 0x01).toBe(0x01);
  });

  it('bit 1 (PROTECT) reflects protect state', () => {
    const rt = makeRuntime();
    expect(rt.ioHandlers.read(0x03) & 0x02).toBe(0);
    rt.state.system.protectEnabled = true;
    expect(rt.ioHandlers.read(0x03) & 0x02).toBe(0x02);
  });

  it('bit 2 (EXPAND) reflects expand state', () => {
    const rt = makeRuntime();
    expect(rt.ioHandlers.read(0x03) & 0x04).toBe(0);
    rt.state.system.expandEnabled = true;
    expect(rt.ioHandlers.read(0x03) & 0x04).toBe(0x04);
  });

  it('bit 3 (CART) is 0 when no cartridge present', () => {
    const rt = makeRuntime();
    rt.state.system.cartridgePresent = false;
    expect(rt.ioHandlers.read(0x03) & 0x08).toBe(0);
  });

  it('bit 3 (CART) is 1 when cartridge present', () => {
    const rt = makeRuntime();
    rt.setCartridgePresent(true);
    expect(rt.ioHandlers.read(0x03) & 0x08).toBe(0x08);
  });

  it('bit 4 (RKEY) reflects raw key state', () => {
    const rt = makeRuntime();
    expect(rt.ioHandlers.read(0x03) & 0x10).toBe(0);
    rt.state.input.rawKeyActive = true;
    expect(rt.ioHandlers.read(0x03) & 0x10).toBe(0x10);
  });

  it('bit 5 (GIMP) reflects diagnostic signal', () => {
    const rt = makeRuntime({ gimpSignal: true });
    expect(rt.ioHandlers.read(0x03) & 0x20).toBe(0x20);
  });

  it('bit 6 (KDA) is 1 when no key pressed', () => {
    const rt = makeRuntime();
    // default keyValue is 0x7f (no key)
    expect(rt.ioHandlers.read(0x03) & 0x40).toBe(0x40);
  });

  it('bit 6 (KDA) is 0 when key pressed', () => {
    const rt = makeRuntime();
    rt.applyKey(0x05);
    expect(rt.ioHandlers.read(0x03) & 0x40).toBe(0);
  });

  it('bit 3 (CART) is independent of expand state', () => {
    const rt = makeRuntime();
    rt.state.system.expandEnabled = true;
    rt.state.system.cartridgePresent = false;
    expect(rt.ioHandlers.read(0x03) & 0x08).toBe(0);

    rt.state.system.expandEnabled = false;
    rt.state.system.cartridgePresent = true;
    expect(rt.ioHandlers.read(0x03) & 0x08).toBe(0x08);
  });

  it('bit 2 (EXPAND) is independent of cartridge state', () => {
    const rt = makeRuntime();
    rt.state.system.expandEnabled = true;
    rt.state.system.cartridgePresent = false;
    expect(rt.ioHandlers.read(0x03) & 0x04).toBe(0x04);

    rt.state.system.expandEnabled = false;
    rt.state.system.cartridgePresent = true;
    expect(rt.ioHandlers.read(0x03) & 0x04).toBe(0);
  });

  it('bit 7 (RX) tracks serial input level', () => {
    const rt = makeRuntime();
    const cyclesPerBit = rt.state.timing.clockHz / 4800;
    rt.queueSerial([0x55]);
    rt.ioHandlers.read(0x00);
    rt.recordCycles(Math.ceil(cyclesPerBit * 2));
    expect(rt.ioHandlers.read(0x03) & 0x80).toBe(0x00);
    let highSeen = false;
    for (let i = 0; i < 200; i += 1) {
      rt.recordCycles(Math.ceil(cyclesPerBit));
      if (rt.ioHandlers.read(0x03) & 0x80) {
        highSeen = true;
        break;
      }
    }
    expect(highSeen).toBe(true);
  });

  it('sets protect on reset when configured', () => {
    const rt = makeRuntime({ protectOnReset: true });
    expect(rt.state.system.sysCtrl & 0x02).toBe(0x02);
    expect(rt.ioHandlers.read(0x03) & 0x02).toBe(0x02);
  });
});
