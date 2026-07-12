import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

function makeRuntime(
  matrixMode = true,
  onUpdate: Parameters<typeof createTec1gRuntime>[1] = () => {},
  updateMs = 100
) {
  const config: Tec1gPlatformConfigNormalized = {
    regions: [
      { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
      { start: 0xc000, end: 0xffff, kind: 'rom' as const },
    ],
    romRanges: [{ start: 0xc000, end: 0xffff }],
    appStart: 0x0000,
    entry: 0x0000,
    updateMs,
    yieldMs: 0,
    gimpSignal: false,
    expansionBankHi: false,
    matrixMode,
    protectOnReset: false,
    rtcEnabled: false,
    sdEnabled: false,
    sdHighCapacity: true,
  };
  return createTec1gRuntime(config, onUpdate);
}

function scanOneSolidFrame(
  rt: ReturnType<typeof makeRuntime>,
  colors: number[][],
  rowOrder = colors.map((_, row) => row)
): void {
  rowOrder.forEach((row) => {
    const [red, green, blue] = colors[row] ?? [0, 0, 0];
    rt.ioHandlers.write(0x05, 0x00);
    rt.recordCycles(4);
    rt.ioHandlers.write(0x06, red);
    rt.ioHandlers.write(0xf8, green);
    rt.ioHandlers.write(0xf9, blue);
    rt.ioHandlers.write(0x05, 1 << row);
    rt.recordCycles(64);
  });
  rt.ioHandlers.write(0x05, 0x00);
}

describe('TEC-1G matrix keyboard', () => {
  it('returns row data based on high byte when matrix mode is enabled', () => {
    const rt = makeRuntime(true);
    rt.applyMatrixKey(3, 5, true);
    const value = rt.ioHandlers.read(0xf7fe);
    expect(value & (1 << 5)).toBe(0);
  });

  it('combines active-low joystick inputs with the joystick scan row', () => {
    const rt = makeRuntime(true);

    expect(rt.ioHandlers.read(0xf7fe)).toBe(0xff);

    rt.setJoystickState(0x41);

    expect(rt.ioHandlers.read(0xf7fe)).toBe(0xbe);
  });

  it('clears joystick inputs on reset', () => {
    const rt = makeRuntime(true);

    rt.setJoystickState(0xff);
    expect(rt.ioHandlers.read(0xf7fe)).toBe(0x00);

    rt.resetState();

    expect(rt.ioHandlers.read(0xf7fe)).toBe(0xff);
  });

  it('defers matrix key changes until the next scan boundary', () => {
    const rt = makeRuntime(true);

    expect(rt.ioHandlers.read(0xfefe)).toBe(0xff);
    rt.applyMatrixKey(0, 1, true);
    rt.applyMatrixKey(6, 6, true);

    expect(rt.ioHandlers.read(0xbffe) & (1 << 6)).not.toBe(0);
    expect(rt.ioHandlers.read(0xfefe) & (1 << 1)).toBe(0);
    expect(rt.ioHandlers.read(0xbffe) & (1 << 6)).toBe(0);
  });

  it('decodes each active-low matrix keyboard row address', () => {
    const rt = makeRuntime(true);
    const rowPorts = [0xfefe, 0xfdfe, 0xfbfe, 0xf7fe, 0xeffe, 0xdffe, 0xbffe, 0x7ffe];

    for (let row = 0; row < rowPorts.length; row += 1) {
      rt.applyMatrixKey(row, row, true);
    }

    rowPorts.forEach((port, row) => {
      expect(rt.ioHandlers.read(port) & (1 << row)).toBe(0);
    });
  });

  it('drives the 8x8 display from red port 0x06 and row 0x05 independently of keyboard state', () => {
    const rt = makeRuntime(true);

    rt.applyMatrixKey(2, 4, true);
    rt.ioHandlers.write(0x06, 0xaa);
    rt.ioHandlers.write(0x05, 0x04);

    expect(rt.state.display.ledMatrixRedLatch).toBe(0xaa);
    expect(rt.state.display.ledMatrixRowLatch).toBe(0x04);
    expect(rt.state.display.ledMatrixRedRows[2]).toBe(0xaa);
    expect(rt.state.display.ledMatrixRedRows[0]).toBe(0x00);
    expect(rt.ioHandlers.read(0xfbfe) & (1 << 4)).toBe(0);
  });

  it('drives green and blue column latches on 0xF8 and 0xF9', () => {
    const rt = makeRuntime(true);
    rt.ioHandlers.write(0xf8, 0x0f);
    rt.ioHandlers.write(0xf9, 0xf0);
    expect(rt.state.display.ledMatrixGreenLatch).toBe(0x0f);
    expect(rt.state.display.ledMatrixBlueLatch).toBe(0xf0);
    rt.ioHandlers.write(0x05, 0x01);
    expect(rt.state.display.ledMatrixGreenRows[0]).toBe(0x0f);
    expect(rt.state.display.ledMatrixBlueRows[0]).toBe(0xf0);
  });

  it('keeps raw matrix keyboard port readable when MON-3 matrix mode is disabled', () => {
    const rt = makeRuntime(false);
    rt.applyMatrixKey(1, 2, true);
    const value = rt.ioHandlers.read(0x01fe);
    expect(value & (1 << 2)).toBe(0);
  });

  it('clears the 8x8 display state on reset', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0x5a);
    rt.ioHandlers.write(0x05, 0x01);
    rt.resetState();

    expect(rt.state.display.ledMatrixRowLatch).toBe(0);
    expect(rt.state.display.ledMatrixRedLatch).toBe(0);
    expect(rt.state.display.ledMatrixRedRows).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rt.state.display.ledMatrixGreenRows).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rt.state.display.ledMatrixBlueRows).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('treats the visible matrix as the direct result of row and data latches', () => {
    const rt = makeRuntime(true);

    rt.ioHandlers.write(0x06, 0x01);
    rt.ioHandlers.write(0x05, 0x03);

    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    rt.ioHandlers.write(0x06, 0x02);
    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x02, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    rt.ioHandlers.write(0x05, 0x04);
    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    rt.recordCycles(4096 * 300);
    expect(rt.state.display.ledMatrixRedRows).toEqual([
      0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
  });

  it('records complete 8-row scan cycles without dropping row events', () => {
    const rt = makeRuntime(true);
    const colors = [
      [0xff, 0x00, 0x00],
      [0x00, 0xff, 0x00],
      [0x00, 0x00, 0xff],
      [0xff, 0xff, 0x00],
      [0xff, 0x00, 0xff],
      [0x00, 0xff, 0xff],
      [0xff, 0xff, 0xff],
      [0x55, 0x55, 0x55],
    ];

    scanOneSolidFrame(rt, colors);

    expect(rt.state.display.matrixScanCycles).toHaveLength(1);
    expect(rt.state.display.matrixScanCycles[0]?.rows).toEqual(
      colors.map(([red, green, blue], row) => ({
        row,
        red,
        green,
        blue,
        dwellCycles: 64,
      }))
    );
  });

  it('preserves the electrical row write order in completed scan cycles', () => {
    const rt = makeRuntime(true);
    const colors = Array.from({ length: 8 }, (_, row) => [row, row + 0x10, row + 0x20]);
    const rowOrder = [0, 2, 4, 6, 1, 3, 5, 7];

    scanOneSolidFrame(rt, colors, rowOrder);

    expect(rt.state.display.matrixScanCycles).toHaveLength(1);
    expect(rt.state.display.matrixScanCycles[0]?.rows.map((row) => row.row)).toEqual(rowOrder);
  });

  it('trims queued scan playback only by complete scan cycles', () => {
    const rt = makeRuntime(true, () => {}, 1_000_000_000);
    const colors = Array.from({ length: 8 }, () => [0xff, 0x00, 0x00]);

    for (let i = 0; i < 260; i += 1) {
      scanOneSolidFrame(rt, colors);
    }

    expect(rt.state.display.matrixScanCycles.length).toBeLessThanOrEqual(240);
    expect(rt.state.display.matrixDroppedScanCycles).toBe(20);
    expect(rt.state.display.matrixScanCycles.every((cycle) => cycle.rows.length === 8)).toBe(true);
  });

  it('emits queued scan cycles once through runtime updates', () => {
    const updates: unknown[] = [];
    const rt = makeRuntime(true, (payload) => updates.push(payload), 0);
    const colors = Array.from({ length: 8 }, () => [0xff, 0x00, 0x00]);

    scanOneSolidFrame(rt, colors);
    rt.queueUpdate();

    const firstPayload = updates.find((payload): payload is { matrixScanCycles: unknown[] } =>
      Array.isArray((payload as { matrixScanCycles?: unknown[] }).matrixScanCycles)
    );
    expect(firstPayload.matrixScanCycles).toHaveLength(1);
    expect(rt.state.display.matrixScanCycles).toHaveLength(0);

    rt.queueUpdate();

    const secondPayload = updates.at(-1) as { matrixScanCycles?: unknown[] };
    expect(secondPayload.matrixScanCycles).toBeUndefined();
  });

  it('allows explicit keypad input while matrix mode is enabled', () => {
    const rt = makeRuntime(true);
    rt.applyKey(0x12);
    expect(rt.state.input.nmiPending).toBe(true);
    expect(rt.state.input.keyValue).toBe(0x12);
  });
});
