import { describe, expect, it } from 'vitest';

import {
  TEC1G_FAST_HZ,
  TEC1G_SLOW_HZ,
  createTec1gRuntime,
} from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

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

describe('TEC-1G speaker timing', () => {
  it('uses the current clock rate when the speaker edge frequency is recalculated', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(0x01, 0x80);
    rt.setSpeed('slow');
    rt.recordCycles(2000);
    rt.ioHandlers.write(0x01, 0x00);

    const expectedSlow = Math.round(TEC1G_SLOW_HZ / 2 / 2000);
    const expectedFast = Math.round(TEC1G_FAST_HZ / 2 / 2000);

    expect(rt.state.audio.speakerHz).toBe(expectedSlow);
    expect(rt.state.audio.speakerHz).not.toBe(expectedFast);
  });
});
