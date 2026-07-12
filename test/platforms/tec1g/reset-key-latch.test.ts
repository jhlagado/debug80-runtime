/**
 * @file TEC-1G reset key latch tests.
 */

import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';

describe('TEC-1G reset key latch', () => {
  it('holds a reset-time key without raising NMI', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.holdKeyForReset(0x02);

    expect(runtime.ioHandlers.read(0x00) & 0x7f).toBe(0x02);
    expect(runtime.ioHandlers.tick?.()).toBeUndefined();
  });

  it('keeps a reset-time key until the first keyboard read', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.holdKeyForReset(0x02);
    runtime.recordCycles(1_000_000);

    expect(runtime.ioHandlers.read(0x00) & 0x20).toBe(0x00);
    expect(runtime.ioHandlers.read(0x00) & 0x7f).toBe(0x7f);
  });
});
