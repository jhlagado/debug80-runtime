import { describe, expect, it } from 'vitest';
import {
  createTec1Runtime,
  normalizeTec1Config,
} from '@jhlagado/debug80-runtime/platforms/tec1/runtime';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { SevenSegmentScanCycle } from '@jhlagado/debug80-runtime/platforms/tec-common';

type ScanRuntime = {
  ioHandlers: { write?: (port: number, value: number) => void };
  recordCycles(cycles: number): void;
  queueUpdate(): void;
  resetState(): void;
};

function scanFrame(runtime: ScanRuntime): void {
  for (let digit = 0; digit < 6; digit += 1) {
    runtime.ioHandlers.write?.(0x02, 1 << digit);
    runtime.ioHandlers.write?.(0x01, 1 << digit);
    runtime.recordCycles(10);
    runtime.ioHandlers.write?.(0x01, 0);
    runtime.recordCycles(5);
  }
}

function scansFrom(payload: unknown): SevenSegmentScanCycle[] | undefined {
  return (payload as { segmentScanCycles?: SevenSegmentScanCycle[] }).segmentScanCycles;
}

function scanStoppedFrom(payload: unknown): boolean | undefined {
  return (payload as { segmentScanStopped?: boolean }).segmentScanStopped;
}

describe('seven-segment scan update transport', () => {
  it('emits each TEC-1G scan batch once', () => {
    const updates: unknown[] = [];
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, (payload) =>
      updates.push(payload)
    );

    scanFrame(runtime);
    runtime.queueUpdate();
    const first = scansFrom(updates.at(-1));
    expect(first).toHaveLength(1);
    expect(first?.[0]?.phases).toHaveLength(6);

    runtime.queueUpdate();
    expect(scansFrom(updates.at(-1))).toBeUndefined();
  });

  it('emits each TEC-1 scan batch once', () => {
    const updates: unknown[] = [];
    const runtime = createTec1Runtime(normalizeTec1Config({ updateMs: 0, yieldMs: 0 }), (payload) =>
      updates.push(payload)
    );

    scanFrame(runtime);
    runtime.queueUpdate();
    const first = scansFrom(updates.at(-1));
    expect(first).toHaveLength(1);
    expect(first?.[0]?.phases).toHaveLength(6);

    runtime.queueUpdate();
    expect(scansFrom(updates.at(-1))).toBeUndefined();
  });

  it('emits a TEC-1G scan-stopped event once after an idle blank', () => {
    const updates: unknown[] = [];
    const runtime = createTec1gRuntime({ updateMs: 0, yieldMs: 0 }, (payload) =>
      updates.push(payload)
    );

    scanFrame(runtime);
    runtime.recordCycles(160_000);
    expect(scanStoppedFrom(updates.at(-1))).toBe(true);

    runtime.queueUpdate();
    expect(scanStoppedFrom(updates.at(-1))).toBeUndefined();
  });

  it('clears partial and completed scan capture on reset', () => {
    const runtime = createTec1gRuntime(
      { updateMs: Number.MAX_SAFE_INTEGER, yieldMs: 0 },
      () => undefined
    );

    scanFrame(runtime);
    runtime.ioHandlers.write?.(0x02, 0xff);
    runtime.ioHandlers.write?.(0x01, 0x01);
    runtime.recordCycles(10);
    runtime.ioHandlers.write?.(0x01, 0);
    expect(runtime.state.display.segmentDuty.scanCycles).toHaveLength(1);
    expect(runtime.state.display.segmentDuty.scanPhases).toHaveLength(1);

    runtime.resetState();
    expect(runtime.state.display.segmentDuty.scanCycles).toHaveLength(0);
    expect(runtime.state.display.segmentDuty.scanPhases).toHaveLength(0);
    expect(runtime.state.display.segmentDuty.scanNextCycleId).toBe(0);
  });
});
