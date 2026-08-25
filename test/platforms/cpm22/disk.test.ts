/**
 * @file Boundary and atomicity proofs for the ideal CP/M sector device.
 */

import { describe, expect, it } from 'vitest';
import {
  CPM22_DISK_COMMAND_READ,
  CPM22_DISK_COMMAND_WRITE,
  CPM22_DISK_IMAGE_BYTES,
  CPM22_DISK_PORT_COMMAND_STATUS,
  CPM22_DISK_PORT_DATA,
  CPM22_DISK_PORT_DRIVE,
  CPM22_DISK_PORT_SECTOR,
  CPM22_DISK_PORT_TRACK_HIGH,
  CPM22_DISK_PORT_TRACK_LOW,
  CPM22_DISK_SECTOR_BYTES,
  CPM22_DISK_STATUS_DRIVE,
  CPM22_DISK_STATUS_OK,
  CPM22_DISK_STATUS_PROTOCOL,
  CPM22_DISK_STATUS_SECTOR,
  CPM22_DISK_STATUS_TRACK,
  CPM22_DISK_STATUS_WRITE_PROTECTED,
  createCpm22Disk,
  type Cpm22DiskDevice,
} from '@jhlagado/debug80-runtime/platforms/cpm22/disk';

function blankImage(): Uint8Array {
  return new Uint8Array(CPM22_DISK_IMAGE_BYTES);
}

function selectSector(disk: Cpm22DiskDevice, drive: number, track: number, sector: number): void {
  disk.writePort(CPM22_DISK_PORT_DRIVE, drive);
  disk.writePort(CPM22_DISK_PORT_TRACK_LOW, track & 0xff);
  disk.writePort(CPM22_DISK_PORT_TRACK_HIGH, (track >> 8) & 0xff);
  disk.writePort(CPM22_DISK_PORT_SECTOR, sector);
}

function readSector(disk: Cpm22DiskDevice): number[] {
  disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_READ);
  return Array.from({ length: CPM22_DISK_SECTOR_BYTES }, () => disk.readPort(CPM22_DISK_PORT_DATA));
}

describe('CP/M 2.2 disk geometry and reads', () => {
  it('requires an exact 77x26x128-byte image', () => {
    expect(() => createCpm22Disk({ image: new Uint8Array(CPM22_DISK_IMAGE_BYTES - 1) })).toThrow(
      RangeError
    );
    expect(() => createCpm22Disk({ image: new Uint8Array(CPM22_DISK_IMAGE_BYTES + 1) })).toThrow(
      RangeError
    );
  });

  it('reads the first sector and completes after exactly 128 bytes', () => {
    const image = blankImage();
    for (let i = 0; i < CPM22_DISK_SECTOR_BYTES; i += 1) {
      image[i] = i;
    }
    const disk = createCpm22Disk({ image });

    expect(readSector(disk)).toEqual(Array.from({ length: 128 }, (_, index) => index));
    expect(disk.snapshot()).toMatchObject({ status: CPM22_DISK_STATUS_OK });
    expect(disk.snapshot().transferKind).toBeUndefined();
  });

  it('reads the final valid sector', () => {
    const image = blankImage();
    image.fill(0xa5, image.length - CPM22_DISK_SECTOR_BYTES);
    const disk = createCpm22Disk({ image });
    selectSector(disk, 0, 76, 26);

    expect(readSector(disk)).toEqual(new Array<number>(128).fill(0xa5));
  });

  it('rejects unavailable drives before exposing data', () => {
    const disk = createCpm22Disk({ image: blankImage() });
    selectSector(disk, 1, 0, 1);

    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_READ);

    expect(disk.readPort(CPM22_DISK_PORT_COMMAND_STATUS)).toBe(CPM22_DISK_STATUS_DRIVE);
    expect(disk.snapshot().transferKind).toBeUndefined();
  });

  it.each([0, 27])('rejects invalid sector %i', (sector) => {
    const disk = createCpm22Disk({ image: blankImage() });
    selectSector(disk, 0, 0, sector);

    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_READ);

    expect(disk.readPort(CPM22_DISK_PORT_COMMAND_STATUS)).toBe(CPM22_DISK_STATUS_SECTOR);
  });

  it('rejects the first invalid track', () => {
    const disk = createCpm22Disk({ image: blankImage() });
    selectSector(disk, 0, 77, 1);

    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_READ);

    expect(disk.readPort(CPM22_DISK_PORT_COMMAND_STATUS)).toBe(CPM22_DISK_STATUS_TRACK);
  });

  it('reports a protocol error for a data read without a read command', () => {
    const disk = createCpm22Disk({ image: blankImage() });

    expect(disk.readPort(CPM22_DISK_PORT_DATA)).toBe(0);
    expect(disk.readPort(CPM22_DISK_PORT_COMMAND_STATUS)).toBe(CPM22_DISK_STATUS_PROTOCOL);
  });
});

describe('CP/M 2.2 atomic disk writes', () => {
  it('publishes a sector only after the final byte', () => {
    const disk = createCpm22Disk({ image: blankImage() });
    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_WRITE);

    for (let i = 0; i < CPM22_DISK_SECTOR_BYTES - 1; i += 1) {
      disk.writePort(CPM22_DISK_PORT_DATA, 0xa5);
    }
    expect([...disk.exportImage().slice(0, CPM22_DISK_SECTOR_BYTES)]).toEqual(
      new Array<number>(128).fill(0)
    );

    disk.writePort(CPM22_DISK_PORT_DATA, 0x5a);

    expect([...disk.exportImage().slice(0, 127)]).toEqual(new Array<number>(127).fill(0xa5));
    expect(disk.exportImage()[127]).toBe(0x5a);
  });

  it('discards an incomplete write on reset while preserving earlier disk bytes', () => {
    const image = blankImage();
    image.fill(0x33, 0, CPM22_DISK_SECTOR_BYTES);
    const disk = createCpm22Disk({ image });
    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_WRITE);
    disk.writePort(CPM22_DISK_PORT_DATA, 0x99);

    disk.reset();

    expect([...disk.exportImage().slice(0, CPM22_DISK_SECTOR_BYTES)]).toEqual(
      new Array<number>(128).fill(0x33)
    );
    expect(disk.snapshot()).toMatchObject({ drive: 0, track: 0, sector: 1, status: 0 });
  });

  it('discards an incomplete write when a replacement command arrives', () => {
    const image = blankImage();
    image.fill(0x44, 0, CPM22_DISK_SECTOR_BYTES);
    const disk = createCpm22Disk({ image });
    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_WRITE);
    disk.writePort(CPM22_DISK_PORT_DATA, 0x99);

    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_READ);

    expect(readSector(disk)).toEqual(new Array<number>(128).fill(0x44));
  });

  it('rejects writes to a protected image without changing it', () => {
    const disk = createCpm22Disk({ image: blankImage(), writable: false });

    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_WRITE);

    expect(disk.readPort(CPM22_DISK_PORT_COMMAND_STATUS)).toBe(CPM22_DISK_STATUS_WRITE_PROTECTED);
    expect(disk.snapshot().transferKind).toBeUndefined();
    expect([...disk.exportImage()].every((value) => value === 0)).toBe(true);
  });

  it('aborts a pending write after a data-direction protocol error', () => {
    const disk = createCpm22Disk({ image: blankImage() });
    disk.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_WRITE);
    disk.writePort(CPM22_DISK_PORT_DATA, 0xaa);

    expect(disk.readPort(CPM22_DISK_PORT_DATA)).toBe(0);

    expect(disk.readPort(CPM22_DISK_PORT_COMMAND_STATUS)).toBe(CPM22_DISK_STATUS_PROTOCOL);
    expect([...disk.exportImage().slice(0, CPM22_DISK_SECTOR_BYTES)]).toEqual(
      new Array<number>(128).fill(0)
    );
  });

  it('returns an image copy that cannot mutate the mounted disk', () => {
    const disk = createCpm22Disk({ image: blankImage() });
    const exported = disk.exportImage();
    exported[0] = 0xff;

    expect(disk.exportImage()[0]).toBe(0);
  });

  it('isolates mounted images between sequential platform sessions', () => {
    const source = blankImage();
    const first = createCpm22Disk({ image: source });
    first.writePort(CPM22_DISK_PORT_COMMAND_STATUS, CPM22_DISK_COMMAND_WRITE);
    for (let index = 0; index < CPM22_DISK_SECTOR_BYTES; index += 1) {
      first.writePort(CPM22_DISK_PORT_DATA, 0x5a);
    }

    const second = createCpm22Disk({ image: source });

    expect(first.exportImage()[0]).toBe(0x5a);
    expect(source[0]).toBe(0);
    expect(second.exportImage()[0]).toBe(0);
  });
});
