/**
 * @file TEC-1 keypad lifecycle tests.
 */

import { describe, expect, it } from 'vitest';
import {
  createTec1Runtime,
  normalizeTec1Config,
} from '@jhlagado/debug80-runtime/platforms/tec1/runtime';

function createRuntime() {
  return createTec1Runtime(normalizeTec1Config({ updateMs: 0, yieldMs: 0 }), () => undefined);
}

describe('TEC-1 keypad lifecycle', () => {
  it('does not turn a release message into a new fixed-pulse press', () => {
    const runtime = createRuntime();

    runtime.applyKey(0x04, false);

    expect(runtime.state.keyValue).toBe(0x7f);
    expect(runtime.ioHandlers.tick?.()).toBeUndefined();
  });

  it('clears a held key and pending NMI on reset', () => {
    const runtime = createRuntime();

    runtime.applyKey(0x04);
    expect(runtime.state.keyValue).toBe(0x04);
    expect(runtime.state.keyReleaseEventId).not.toBeNull();
    expect(runtime.state.nmiPending).toBe(true);

    runtime.resetState();

    expect(runtime.state.keyValue).toBe(0x7f);
    expect(runtime.state.keyReleaseEventId).toBeNull();
    expect(runtime.state.nmiPending).toBe(false);
    expect(runtime.ioHandlers.tick?.()).toBeUndefined();
  });
});
