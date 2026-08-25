/**
 * @file Port-routing and reset proofs for the ideal CP/M platform devices.
 */

import { describe, expect, it } from 'vitest';
import { CPM22_DISK_IMAGE_BYTES } from '@jhlagado/debug80-runtime/platforms/cpm22/disk';
import {
  CPM22_TERMINAL_RX_PORT,
  CPM22_TERMINAL_STATUS_PORT,
  CPM22_TERMINAL_TX_PORT,
  createCpm22PlatformRuntime,
} from '@jhlagado/debug80-runtime/platforms/cpm22/runtime';

describe('CP/M 2.2 platform device routing', () => {
  it('decodes only the low eight I/O-address bits', () => {
    const platform = createCpm22PlatformRuntime({
      diskImage: new Uint8Array(CPM22_DISK_IMAGE_BYTES),
    });
    platform.terminal.enqueueInput([0x41]);

    expect(platform.ioHandlers.read?.(0xab00 | CPM22_TERMINAL_STATUS_PORT)).toBe(0b11);
    expect(platform.ioHandlers.read?.(0xcd00 | CPM22_TERMINAL_RX_PORT)).toBe(0x41);
    platform.ioHandlers.write?.(0xef00 | CPM22_TERMINAL_TX_PORT, 0x42);

    expect(platform.terminal.snapshot().cells[0]).toBe(0x42);
  });

  it('returns zero and ignores writes on unassigned ports', () => {
    const platform = createCpm22PlatformRuntime({
      diskImage: new Uint8Array(CPM22_DISK_IMAGE_BYTES),
    });

    expect(platform.ioHandlers.read?.(0xffff)).toBe(0);
    platform.ioHandlers.write?.(0xffff, 0x41);

    expect(platform.terminal.snapshot().cells[0]).toBe(0x20);
  });

  it('resets controller and terminal state but preserves mounted disk bytes', () => {
    const image = new Uint8Array(CPM22_DISK_IMAGE_BYTES);
    image[0] = 0x5a;
    const platform = createCpm22PlatformRuntime({ diskImage: image });
    platform.terminal.enqueueInput([0x41]);
    platform.terminal.writeOutput(0x42);

    platform.resetDevices();

    expect(platform.terminal.snapshot().input).toEqual([]);
    expect(platform.terminal.snapshot().cells[0]).toBe(0x20);
    expect(platform.disk.exportImage()[0]).toBe(0x5a);
  });
});
