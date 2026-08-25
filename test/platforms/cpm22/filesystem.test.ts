import { describe, expect, it } from 'vitest';

import { CPM22_DISK_IMAGE_BYTES } from '../../../src/platforms/cpm22/disk.js';
import {
  CPM22_COM_MAX_BYTES,
  CPM22_FILESYSTEM_BLOCK_BYTES,
  CPM22_FILESYSTEM_DIRECTORY_ENTRIES,
  CPM22_FILESYSTEM_RECORD_BYTES,
  CPM22_FILESYSTEM_SYSTEM_BYTES,
  installCpm22File,
  listCpm22Files,
  parseCpm22Filename,
  readCpm22File,
} from '../../../src/platforms/cpm22/filesystem.js';

function blankImage(): Uint8Array {
  return new Uint8Array(CPM22_DISK_IMAGE_BYTES).fill(0xe5);
}

function bytes(length: number, seed = 0): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index + seed) & 0xff);
}

describe('CP/M 2.2 filesystem image', () => {
  it('canonicalizes the supported 8.3 filename alphabet', () => {
    expect(parseCpm22Filename('hello-1.$#@')).toEqual({
      canonical: 'HELLO-1.$#@',
      name: 'HELLO-1 ',
      extension: '$#@',
    });
    for (const invalid of ['', 'TOO-LONG9.COM', 'MAIN.TOOLONG', 'A/B.COM', '.COM']) {
      expect(() => parseCpm22Filename(invalid)).toThrow(/invalid filename/);
    }
  });

  it('installs one record without changing its source image or system tracks', () => {
    const source = blankImage();
    source.fill(0x5a, 0, CPM22_FILESYSTEM_SYSTEM_BYTES);
    const before = source.slice();
    const contents = bytes(17, 0x20);
    const result = installCpm22File(source, 'main.com', contents);

    expect(source).toEqual(before);
    expect(result.slice(0, CPM22_FILESYSTEM_SYSTEM_BYTES)).toEqual(
      new Uint8Array(CPM22_FILESYSTEM_SYSTEM_BYTES).fill(0x5a)
    );
    expect(listCpm22Files(result)).toEqual(['MAIN.COM']);
    const file = readCpm22File(result, 'MAIN.COM');
    expect(file?.records).toBe(1);
    expect(file?.bytes.slice(0, contents.length)).toEqual(contents);
    expect(file?.bytes.slice(contents.length)).toEqual(
      new Uint8Array(CPM22_FILESYSTEM_RECORD_BYTES - contents.length).fill(0x1a)
    );
  });

  it('writes multiple blocks and extents through the complete COM capacity', () => {
    const contents = bytes(CPM22_COM_MAX_BYTES, 0x31);
    const result = installCpm22File(blankImage(), 'LARGE.COM', contents);
    const file = readCpm22File(result, 'large.com');

    expect(file?.records).toBe(CPM22_COM_MAX_BYTES / CPM22_FILESYSTEM_RECORD_BYTES);
    expect(file?.bytes).toEqual(contents);
    expect(listCpm22Files(result)).toEqual(['LARGE.COM']);
  });

  it('replaces every old extent atomically and retains other files', () => {
    const first = installCpm22File(blankImage(), 'OTHER.TXT', bytes(33, 0x70));
    const oldProgram = installCpm22File(first, 'MAIN.COM', bytes(20_000, 0x11));
    const before = oldProgram.slice();
    const replacement = bytes(253, 0x91);
    const result = installCpm22File(oldProgram, 'main.com', replacement);

    expect(oldProgram).toEqual(before);
    expect(listCpm22Files(result)).toEqual(['OTHER.TXT', 'MAIN.COM']);
    expect(readCpm22File(result, 'OTHER.TXT')?.bytes.slice(0, 33)).toEqual(bytes(33, 0x70));
    expect(readCpm22File(result, 'MAIN.COM')?.bytes.slice(0, replacement.length)).toEqual(
      replacement
    );
  });

  it('rejects empty files and wrong-sized images without publication', () => {
    const source = blankImage();
    const before = source.slice();
    expect(() => installCpm22File(source, 'EMPTY.COM', new Uint8Array())).toThrow(
      /at least one byte/
    );
    expect(() => installCpm22File(source.slice(1), 'MAIN.COM', bytes(1))).toThrow(
      /exactly 256256 bytes/
    );
    expect(source).toEqual(before);
  });

  it('reports disk-full and leaves the input image unchanged', () => {
    const almostFull = installCpm22File(
      blankImage(),
      'FILL.BIN',
      bytes(239 * CPM22_FILESYSTEM_BLOCK_BYTES)
    );
    const before = almostFull.slice();

    expect(() =>
      installCpm22File(almostFull, 'MAIN.COM', bytes(3 * CPM22_FILESYSTEM_BLOCK_BYTES))
    ).toThrow(/disk has no room/);
    expect(almostFull).toEqual(before);
  });

  it('reports directory-full and leaves the input image unchanged', () => {
    let image = blankImage();
    for (let index = 0; index < CPM22_FILESYSTEM_DIRECTORY_ENTRIES; index += 1) {
      image = installCpm22File(image, `F${index}.BIN`, bytes(1, index));
    }
    const before = image.slice();

    expect(() => installCpm22File(image, 'MAIN.COM', bytes(1))).toThrow(/directory has no room/);
    expect(image).toEqual(before);
  });

  it('rejects duplicate allocation references before changing malformed custom media', () => {
    const image = installCpm22File(blankImage(), 'ONE.BIN', bytes(1));
    const directory = CPM22_FILESYSTEM_SYSTEM_BYTES;
    image.set(image.slice(directory, directory + 32), directory + 32);
    image[directory + 33] = 'T'.charCodeAt(0);
    const before = image.slice();

    expect(() => installCpm22File(image, 'MAIN.COM', bytes(1))).toThrow(
      /allocation block 2 is referenced more than once/
    );
    expect(image).toEqual(before);
  });
});
