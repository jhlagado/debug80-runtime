/**
 * @file Atomic 128-byte sector device for the ideal Debug80 CP/M 2.2 platform.
 */

export const CPM22_DISK_TRACKS = 77;
export const CPM22_DISK_SECTORS_PER_TRACK = 26;
export const CPM22_DISK_SECTOR_BYTES = 128;
export const CPM22_DISK_IMAGE_BYTES =
  CPM22_DISK_TRACKS * CPM22_DISK_SECTORS_PER_TRACK * CPM22_DISK_SECTOR_BYTES;

export const CPM22_DISK_PORT_COMMAND_STATUS = 0x10;
export const CPM22_DISK_PORT_DRIVE = 0x11;
export const CPM22_DISK_PORT_TRACK_LOW = 0x12;
export const CPM22_DISK_PORT_TRACK_HIGH = 0x13;
export const CPM22_DISK_PORT_SECTOR = 0x14;
export const CPM22_DISK_PORT_DATA = 0x15;

export const CPM22_DISK_COMMAND_READ = 1;
export const CPM22_DISK_COMMAND_WRITE = 2;

export const CPM22_DISK_STATUS_OK = 0;
export const CPM22_DISK_STATUS_DRIVE = 1;
export const CPM22_DISK_STATUS_TRACK = 2;
export const CPM22_DISK_STATUS_SECTOR = 3;
export const CPM22_DISK_STATUS_PROTOCOL = 4;
export const CPM22_DISK_STATUS_WRITE_PROTECTED = 5;

type Transfer = {
  kind: 'read' | 'write';
  offset: number;
  position: number;
  buffer: Uint8Array;
};

export interface Cpm22DiskSnapshot {
  drive: number;
  track: number;
  sector: number;
  status: number;
  transferKind?: 'read' | 'write';
  transferPosition?: number;
  writable: boolean;
}

export interface Cpm22DiskDevice {
  readPort(port: number): number;
  writePort(port: number, value: number): void;
  reset(): void;
  exportImage(): Uint8Array;
  snapshot(): Cpm22DiskSnapshot;
}

export interface Cpm22DiskOptions {
  image: Uint8Array;
  writable?: boolean;
}

/** Creates a one-drive sector controller with atomic whole-sector writes. */
export function createCpm22Disk(options: Cpm22DiskOptions): Cpm22DiskDevice {
  if (options.image.length !== CPM22_DISK_IMAGE_BYTES) {
    throw new RangeError(`CP/M disk image must contain exactly ${CPM22_DISK_IMAGE_BYTES} bytes`);
  }
  const image = options.image.slice();
  const writable = options.writable ?? true;
  let drive = 0;
  let track = 0;
  let sector = 1;
  let status = CPM22_DISK_STATUS_OK;
  let transfer: Transfer | undefined;

  const selectedOffset = (): number | undefined => {
    if (drive !== 0) {
      status = CPM22_DISK_STATUS_DRIVE;
      return undefined;
    }
    if (track < 0 || track >= CPM22_DISK_TRACKS) {
      status = CPM22_DISK_STATUS_TRACK;
      return undefined;
    }
    if (sector < 1 || sector > CPM22_DISK_SECTORS_PER_TRACK) {
      status = CPM22_DISK_STATUS_SECTOR;
      return undefined;
    }
    return (track * CPM22_DISK_SECTORS_PER_TRACK + (sector - 1)) * CPM22_DISK_SECTOR_BYTES;
  };

  const beginCommand = (command: number): void => {
    transfer = undefined;
    const offset = selectedOffset();
    if (offset === undefined) {
      return;
    }
    if (command === CPM22_DISK_COMMAND_READ) {
      transfer = {
        kind: 'read',
        offset,
        position: 0,
        buffer: image.slice(offset, offset + CPM22_DISK_SECTOR_BYTES),
      };
      status = CPM22_DISK_STATUS_OK;
      return;
    }
    if (command === CPM22_DISK_COMMAND_WRITE) {
      if (!writable) {
        status = CPM22_DISK_STATUS_WRITE_PROTECTED;
        return;
      }
      transfer = {
        kind: 'write',
        offset,
        position: 0,
        buffer: new Uint8Array(CPM22_DISK_SECTOR_BYTES),
      };
      status = CPM22_DISK_STATUS_OK;
      return;
    }
    status = CPM22_DISK_STATUS_PROTOCOL;
  };

  const readData = (): number => {
    if (transfer?.kind !== 'read') {
      transfer = undefined;
      status = CPM22_DISK_STATUS_PROTOCOL;
      return 0;
    }
    const value = transfer.buffer[transfer.position] ?? 0;
    transfer.position += 1;
    if (transfer.position === CPM22_DISK_SECTOR_BYTES) {
      transfer = undefined;
      status = CPM22_DISK_STATUS_OK;
    }
    return value;
  };

  const writeData = (value: number): void => {
    if (transfer?.kind !== 'write') {
      transfer = undefined;
      status = CPM22_DISK_STATUS_PROTOCOL;
      return;
    }
    transfer.buffer[transfer.position] = value & 0xff;
    transfer.position += 1;
    if (transfer.position === CPM22_DISK_SECTOR_BYTES) {
      image.set(transfer.buffer, transfer.offset);
      transfer = undefined;
      status = CPM22_DISK_STATUS_OK;
    }
  };

  const readPort = (port: number): number => {
    switch (port & 0xff) {
      case CPM22_DISK_PORT_COMMAND_STATUS:
        return status;
      case CPM22_DISK_PORT_DRIVE:
        return drive;
      case CPM22_DISK_PORT_TRACK_LOW:
        return track & 0xff;
      case CPM22_DISK_PORT_TRACK_HIGH:
        return (track >> 8) & 0xff;
      case CPM22_DISK_PORT_SECTOR:
        return sector & 0xff;
      case CPM22_DISK_PORT_DATA:
        return readData();
      default:
        return 0;
    }
  };

  const writePort = (port: number, value: number): void => {
    const byte = value & 0xff;
    switch (port & 0xff) {
      case CPM22_DISK_PORT_COMMAND_STATUS:
        beginCommand(byte);
        return;
      case CPM22_DISK_PORT_DRIVE:
        drive = byte;
        return;
      case CPM22_DISK_PORT_TRACK_LOW:
        track = (track & 0xff00) | byte;
        return;
      case CPM22_DISK_PORT_TRACK_HIGH:
        track = (track & 0x00ff) | (byte << 8);
        return;
      case CPM22_DISK_PORT_SECTOR:
        sector = byte;
        return;
      case CPM22_DISK_PORT_DATA:
        writeData(byte);
        return;
      default:
        return;
    }
  };

  const reset = (): void => {
    drive = 0;
    track = 0;
    sector = 1;
    status = CPM22_DISK_STATUS_OK;
    transfer = undefined;
  };

  const exportImage = (): Uint8Array => image.slice();

  const snapshot = (): Cpm22DiskSnapshot => ({
    drive,
    track,
    sector,
    status,
    ...(transfer !== undefined
      ? { transferKind: transfer.kind, transferPosition: transfer.position }
      : {}),
    writable,
  });

  return { readPort, writePort, reset, exportImage, snapshot };
}
