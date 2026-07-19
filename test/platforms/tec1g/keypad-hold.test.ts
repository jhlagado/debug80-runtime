/**
 * @file TEC-1G hex keypad press/release (level) model tests.
 *
 * The keypad register must reflect a held key for as long as the UI
 * reports it pressed, with a 30 ms minimum pulse so brief taps still
 * register, and the legacy single-argument applyKey keeps the original
 * fixed-pulse behaviour.
 */

import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';

const NO_KEY = 0x7f;
const KEY_PLUS = 0x10;
const KEY_GO = 0x12;

/** Cycles comfortably beyond the 30 ms minimum pulse at the default clock. */
const WELL_PAST_MIN_PULSE = 4_000_000;

function readKey(runtime: ReturnType<typeof createTec1gRuntime>): number {
  return runtime.ioHandlers.read(0x00) & 0x7f;
}

describe('TEC-1G keypad press/release model', () => {
  it('keeps a pressed key latched across time until released', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.applyKey(KEY_GO, true);
    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    expect(readKey(runtime)).toBe(KEY_GO);

    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    expect(readKey(runtime)).toBe(KEY_GO);

    runtime.applyKey(KEY_GO, false);
    expect(readKey(runtime)).toBe(NO_KEY);
  });

  it('honours the minimum pulse when a tap releases immediately', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.applyKey(KEY_GO, true);
    runtime.applyKey(KEY_GO, false);
    expect(readKey(runtime)).toBe(KEY_GO);

    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    expect(readKey(runtime)).toBe(NO_KEY);
  });

  it('keeps the legacy single-argument call as a fixed pulse', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.applyKey(KEY_GO);
    expect(readKey(runtime)).toBe(KEY_GO);

    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    expect(readKey(runtime)).toBe(NO_KEY);
  });

  it('lets a new press take over from a held key', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.applyKey(KEY_GO, true);
    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    runtime.applyKey(KEY_PLUS, true);
    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    expect(readKey(runtime)).toBe(KEY_PLUS);

    // The stale release for the first key must not clear the new press.
    runtime.applyKey(KEY_GO, false);
    expect(readKey(runtime)).toBe(KEY_PLUS);

    runtime.applyKey(KEY_PLUS, false);
    expect(readKey(runtime)).toBe(NO_KEY);
  });

  it('raises one NMI per press, held or tapped', () => {
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, () => undefined);

    runtime.applyKey(KEY_GO, true);
    expect(runtime.ioHandlers.tick?.()).toEqual({
      interrupt: { nonMaskable: true, data: 0x66 },
    });
    expect(runtime.ioHandlers.tick?.()).toBeUndefined();

    runtime.recordCycles(WELL_PAST_MIN_PULSE);
    expect(runtime.ioHandlers.tick?.()).toBeUndefined();

    runtime.applyKey(KEY_GO, false);
    expect(runtime.ioHandlers.tick?.()).toBeUndefined();
  });
});
