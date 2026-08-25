/**
 * @file Deterministic CP/M 2.2 filesystem operations for the ideal IBM 3740 disk.
 */

import { CPM22_DISK_IMAGE_BYTES, CPM22_DISK_SECTOR_BYTES } from './disk.js';

export const CPM22_FILESYSTEM_SYSTEM_BYTES = 2 * 26 * CPM22_DISK_SECTOR_BYTES;
export const CPM22_FILESYSTEM_DIRECTORY_ENTRIES = 64;
export const CPM22_FILESYSTEM_DIRECTORY_ENTRY_BYTES = 32;
export const CPM22_FILESYSTEM_DIRECTORY_BYTES =
  CPM22_FILESYSTEM_DIRECTORY_ENTRIES * CPM22_FILESYSTEM_DIRECTORY_ENTRY_BYTES;
export const CPM22_FILESYSTEM_BLOCK_BYTES = 1024;
export const CPM22_FILESYSTEM_BLOCK_COUNT = 243;
export const CPM22_FILESYSTEM_RESERVED_BLOCKS = 2;
export const CPM22_FILESYSTEM_RECORD_BYTES = 128;
export const CPM22_FILESYSTEM_RECORDS_PER_EXTENT = 128;
export const CPM22_FILESYSTEM_BLOCKS_PER_EXTENT = 16;
export const CPM22_COM_LOAD_ADDRESS = 0x0100;
export const CPM22_COM_LIMIT_ADDRESS = 0xe400;
export const CPM22_COM_MAX_BYTES = CPM22_COM_LIMIT_ADDRESS - CPM22_COM_LOAD_ADDRESS;

const DIRECTORY_FREE = 0xe5;
const CPM_FILE_PATTERN = /^([A-Z0-9_$#@!%&'()\-^{}~]{1,8})(?:\.([A-Z0-9_$#@!%&'()\-^{}~]{1,3}))?$/;

export interface Cpm22Filename {
  canonical: string;
  name: string;
  extension: string;
}

export interface Cpm22DirectoryFile {
  name: string;
  records: number;
  bytes: Uint8Array;
}

type DirectoryExtent = {
  entryIndex: number;
  extent: number;
  records: number;
  blocks: number[];
};

function fail(message: string): never {
  throw new Error(`CP/M disk: ${message}`);
}

function assertImage(image: Uint8Array): void {
  if (image.length !== CPM22_DISK_IMAGE_BYTES) {
    fail(`image must contain exactly ${CPM22_DISK_IMAGE_BYTES} bytes`);
  }
}

/** Parses and canonicalizes a CP/M 2.2 8.3 filename. */
export function parseCpm22Filename(source: string): Cpm22Filename {
  const canonical = source.trim().toUpperCase();
  const match = CPM_FILE_PATTERN.exec(canonical);
  if (match === null) {
    fail(`invalid filename ${JSON.stringify(source)}`);
  }
  const name = match[1] ?? '';
  const extension = match[2] ?? '';
  return {
    canonical: extension === '' ? name : `${name}.${extension}`,
    name: name.padEnd(8, ' '),
    extension: extension.padEnd(3, ' '),
  };
}

function entryOffset(entryIndex: number): number {
  return CPM22_FILESYSTEM_SYSTEM_BYTES + entryIndex * CPM22_FILESYSTEM_DIRECTORY_ENTRY_BYTES;
}

function blockOffset(block: number): number {
  return CPM22_FILESYSTEM_SYSTEM_BYTES + block * CPM22_FILESYSTEM_BLOCK_BYTES;
}

function entryFilename(image: Uint8Array, entry: number): string {
  const decode = (from: number, length: number): string =>
    String.fromCharCode(...image.slice(from, from + length).map((value) => value & 0x7f)).trimEnd();
  const name = decode(entry + 1, 8);
  const extension = decode(entry + 9, 3);
  return extension === '' ? name : `${name}.${extension}`;
}

function readExtent(image: Uint8Array, entryIndex: number): DirectoryExtent | undefined {
  const entry = entryOffset(entryIndex);
  const user = image[entry] ?? DIRECTORY_FREE;
  if (user === DIRECTORY_FREE) {
    return undefined;
  }
  if (user > 15) {
    fail(`directory entry ${entryIndex} has invalid user ${user}`);
  }
  const records = image[entry + 15] ?? 0;
  if (records > CPM22_FILESYSTEM_RECORDS_PER_EXTENT) {
    fail(`directory entry ${entryIndex} has invalid record count ${records}`);
  }
  const extentLow = image[entry + 12] ?? 0;
  const extentHigh = image[entry + 14] ?? 0;
  const extent = (extentLow & 0x1f) | (extentHigh << 5);
  const blockCount = Math.ceil(
    records / (CPM22_FILESYSTEM_BLOCK_BYTES / CPM22_FILESYSTEM_RECORD_BYTES)
  );
  const blocks: number[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const block = image[entry + 16 + index] ?? 0;
    if (block < CPM22_FILESYSTEM_RESERVED_BLOCKS || block >= CPM22_FILESYSTEM_BLOCK_COUNT) {
      fail(`directory entry ${entryIndex} references invalid block ${block}`);
    }
    blocks.push(block);
  }
  return { entryIndex, extent, records, blocks };
}

function scanDirectory(image: Uint8Array): {
  freeEntries: number[];
  usedBlocks: Set<number>;
  files: Map<string, DirectoryExtent[]>;
} {
  assertImage(image);
  const freeEntries: number[] = [];
  const usedBlocks = new Set<number>();
  const files = new Map<string, DirectoryExtent[]>();
  for (let entryIndex = 0; entryIndex < CPM22_FILESYSTEM_DIRECTORY_ENTRIES; entryIndex += 1) {
    const entry = entryOffset(entryIndex);
    if ((image[entry] ?? DIRECTORY_FREE) === DIRECTORY_FREE) {
      freeEntries.push(entryIndex);
      continue;
    }
    const extent = readExtent(image, entryIndex);
    if (extent === undefined) {
      continue;
    }
    for (const block of extent.blocks) {
      if (usedBlocks.has(block)) {
        fail(`allocation block ${block} is referenced more than once`);
      }
      usedBlocks.add(block);
    }
    if ((image[entry] ?? 0) === 0) {
      const filename = entryFilename(image, entry);
      const extents = files.get(filename) ?? [];
      extents.push(extent);
      files.set(filename, extents);
    }
  }
  return { freeEntries, usedBlocks, files };
}

function clearEntry(image: Uint8Array, entryIndex: number): void {
  const entry = entryOffset(entryIndex);
  image.fill(DIRECTORY_FREE, entry, entry + CPM22_FILESYSTEM_DIRECTORY_ENTRY_BYTES);
}

function writeExtent(
  image: Uint8Array,
  entryIndex: number,
  filename: Cpm22Filename,
  extentIndex: number,
  records: number,
  blocks: number[]
): void {
  const entry = entryOffset(entryIndex);
  image.fill(0, entry, entry + CPM22_FILESYSTEM_DIRECTORY_ENTRY_BYTES);
  image[entry] = 0;
  image.set(
    Array.from(filename.name, (value) => value.charCodeAt(0)),
    entry + 1
  );
  image.set(
    Array.from(filename.extension, (value) => value.charCodeAt(0)),
    entry + 9
  );
  image[entry + 12] = extentIndex & 0x1f;
  image[entry + 14] = (extentIndex >> 5) & 0xff;
  image[entry + 15] = records;
  image.set(blocks, entry + 16);
}

/**
 * Returns a new image containing one replaced or newly installed user-0 file.
 * The input image is never modified, including on validation or capacity failure.
 */
export function installCpm22File(
  sourceImage: Uint8Array,
  filenameSource: string,
  contentsSource: Uint8Array
): Uint8Array {
  assertImage(sourceImage);
  if (contentsSource.length === 0) {
    fail('files must contain at least one byte');
  }
  const filename = parseCpm22Filename(filenameSource);
  const records = Math.ceil(contentsSource.length / CPM22_FILESYSTEM_RECORD_BYTES);
  const extentCount = Math.ceil(records / CPM22_FILESYSTEM_RECORDS_PER_EXTENT);
  const blockCount = Math.ceil(contentsSource.length / CPM22_FILESYSTEM_BLOCK_BYTES);
  const image = sourceImage.slice();
  const initial = scanDirectory(image);
  const replaced = initial.files.get(filename.canonical) ?? [];

  for (const extent of replaced) {
    clearEntry(image, extent.entryIndex);
    for (const block of extent.blocks) {
      image.fill(
        DIRECTORY_FREE,
        blockOffset(block),
        blockOffset(block) + CPM22_FILESYSTEM_BLOCK_BYTES
      );
      initial.usedBlocks.delete(block);
    }
  }

  const reusableEntries = replaced.map((extent) => extent.entryIndex);
  const availableEntries = [...reusableEntries, ...initial.freeEntries];
  if (availableEntries.length < extentCount) {
    fail(`directory has no room for ${filename.canonical}`);
  }
  const availableBlocks: number[] = [];
  for (
    let block = CPM22_FILESYSTEM_RESERVED_BLOCKS;
    block < CPM22_FILESYSTEM_BLOCK_COUNT;
    block += 1
  ) {
    if (!initial.usedBlocks.has(block)) {
      availableBlocks.push(block);
    }
  }
  if (availableBlocks.length < blockCount) {
    fail(`disk has no room for ${filename.canonical}`);
  }

  const padded = new Uint8Array(records * CPM22_FILESYSTEM_RECORD_BYTES).fill(0x1a);
  padded.set(contentsSource);
  let recordCursor = 0;
  let blockCursor = 0;
  for (let extentIndex = 0; extentIndex < extentCount; extentIndex += 1) {
    const extentRecords = Math.min(CPM22_FILESYSTEM_RECORDS_PER_EXTENT, records - recordCursor);
    const extentBlocks = Math.ceil(
      extentRecords / (CPM22_FILESYSTEM_BLOCK_BYTES / CPM22_FILESYSTEM_RECORD_BYTES)
    );
    const blocks = availableBlocks.slice(blockCursor, blockCursor + extentBlocks);
    writeExtent(
      image,
      availableEntries[extentIndex] ?? fail('internal directory allocation failure'),
      filename,
      extentIndex,
      extentRecords,
      blocks
    );
    for (const block of blocks) {
      const bytes = padded.slice(
        recordCursor * CPM22_FILESYSTEM_RECORD_BYTES,
        Math.min(
          padded.length,
          recordCursor * CPM22_FILESYSTEM_RECORD_BYTES + CPM22_FILESYSTEM_BLOCK_BYTES
        )
      );
      image.fill(
        DIRECTORY_FREE,
        blockOffset(block),
        blockOffset(block) + CPM22_FILESYSTEM_BLOCK_BYTES
      );
      image.set(bytes, blockOffset(block));
      recordCursor += bytes.length / CPM22_FILESYSTEM_RECORD_BYTES;
    }
    blockCursor += extentBlocks;
  }
  return image;
}

/** Reads the record-padded bytes of a user-0 file, or returns undefined. */
export function readCpm22File(
  image: Uint8Array,
  filenameSource: string
): Cpm22DirectoryFile | undefined {
  const filename = parseCpm22Filename(filenameSource);
  const extents = scanDirectory(image).files.get(filename.canonical);
  if (extents === undefined) {
    return undefined;
  }
  const ordered = [...extents].sort((left, right) => left.extent - right.extent);
  const chunks: Uint8Array[] = [];
  let totalRecords = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const extent = ordered[index] ?? fail('internal extent ordering failure');
    if (extent.extent !== index) {
      fail(`${filename.canonical} has a missing or duplicate extent`);
    }
    let remaining = extent.records * CPM22_FILESYSTEM_RECORD_BYTES;
    for (const block of extent.blocks) {
      const length = Math.min(remaining, CPM22_FILESYSTEM_BLOCK_BYTES);
      chunks.push(image.slice(blockOffset(block), blockOffset(block) + length));
      remaining -= length;
    }
    totalRecords += extent.records;
  }
  const bytes = new Uint8Array(totalRecords * CPM22_FILESYSTEM_RECORD_BYTES);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { name: filename.canonical, records: totalRecords, bytes };
}

/** Lists canonical user-0 filenames in directory order. */
export function listCpm22Files(image: Uint8Array): string[] {
  return [...scanDirectory(image).files.keys()];
}
