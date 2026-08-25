/**
 * @file Composed terminal and disk devices for the ideal Debug80 CP/M platform.
 */

import type { IoHandlers } from '../../z80/runtime.js';
import {
  CPM22_DISK_PORT_COMMAND_STATUS,
  CPM22_DISK_PORT_DATA,
  createCpm22Disk,
  type Cpm22DiskDevice,
} from './disk.js';
import { createCpm22Terminal, type Cpm22TerminalDevice } from './terminal.js';

export const CPM22_TERMINAL_TX_PORT = 0x00;
export const CPM22_TERMINAL_RX_PORT = 0x01;
export const CPM22_TERMINAL_STATUS_PORT = 0x02;

export interface Cpm22PlatformRuntime {
  terminal: Cpm22TerminalDevice;
  disk: Cpm22DiskDevice;
  ioHandlers: IoHandlers;
  resetDevices(): void;
}

export interface Cpm22PlatformRuntimeOptions {
  diskImage: Uint8Array;
  diskWritable?: boolean;
}

/** Creates the TypeScript-owned devices below the guest CP/M BIOS. */
export function createCpm22PlatformRuntime(
  options: Cpm22PlatformRuntimeOptions
): Cpm22PlatformRuntime {
  const terminal = createCpm22Terminal();
  const disk = createCpm22Disk({
    image: options.diskImage,
    ...(options.diskWritable !== undefined ? { writable: options.diskWritable } : {}),
  });

  const ioHandlers: IoHandlers = {
    read: (port: number): number => {
      const lowPort = port & 0xff;
      if (lowPort === CPM22_TERMINAL_RX_PORT) {
        return terminal.readInput();
      }
      if (lowPort === CPM22_TERMINAL_STATUS_PORT) {
        return terminal.readStatus();
      }
      if (lowPort >= CPM22_DISK_PORT_COMMAND_STATUS && lowPort <= CPM22_DISK_PORT_DATA) {
        return disk.readPort(lowPort);
      }
      return 0;
    },
    write: (port: number, value: number): void => {
      const lowPort = port & 0xff;
      if (lowPort === CPM22_TERMINAL_TX_PORT) {
        terminal.writeOutput(value);
        return;
      }
      if (lowPort >= CPM22_DISK_PORT_COMMAND_STATUS && lowPort <= CPM22_DISK_PORT_DATA) {
        disk.writePort(lowPort, value);
      }
    },
  };

  const resetDevices = (): void => {
    terminal.reset();
    disk.reset();
  };

  return { terminal, disk, ioHandlers, resetDevices };
}
