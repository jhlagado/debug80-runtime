/**
 * @fileoverview Intel HEX loader utilities for Z80 programs.
 */

import { HexParseError } from '../errors.js';

/**
 * Parsed Intel HEX program data.
 */
export interface HexProgram {
  /** 64K memory image with loaded program data */
  memory: Uint8Array;
  /** Lowest address with data (entry point hint) */
  startAddress: number;
  /** Address ranges written by the HEX payload (end exclusive) */
  writeRanges?: Array<{ start: number; end: number }>;
}

/**
 * Parses Intel HEX format content into a 64K memory image.
 *
 * Supports standard Intel HEX records:
 * - Type 00: Data records (loaded into memory)
 * - Type 01: End of file (terminates parsing)
 * - Other types: Silently ignored
 *
 * @param content - Intel HEX file content
 * @returns Program data with memory image and start address
 * @throws Error if HEX format is invalid
 *
 * @example
 * ```typescript
 * const hex = fs.readFileSync('program.hex', 'utf-8');
 * const program = parseIntelHex(hex);
 * console.log(`Entry: 0x${program.startAddress.toString(16)}`);
 * ```
 */
export function parseIntelHex(content: string): HexProgram {
  const memory = new Uint8Array(0x10000);
  memory.fill(0);
  const writeRanges: Array<{ start: number; end: number }> = [];

  let startAddress = Number.MAX_SAFE_INTEGER;
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    if (!line.startsWith(':') || line.length < 11) {
      throw new HexParseError(line);
    }

    const byteCount = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const recordType = parseInt(line.slice(7, 9), 16);
    const dataString = line.slice(9, 9 + byteCount * 2);

    if (recordType === 1) {
      // EOF
      break;
    }

    if (recordType !== 0) {
      // Only data records supported for now.
      continue;
    }

    startAddress = Math.min(startAddress, address);
    if (byteCount > 0) {
      writeRanges.push({ start: address, end: address + byteCount });
    }

    for (let i = 0; i < byteCount; i++) {
      const byteHex = dataString.slice(i * 2, i * 2 + 2);
      const value = parseInt(byteHex, 16);
      const loc = address + i;
      if (loc >= 0 && loc < 0x10000) {
        memory[loc] = value;
      }
    }
  }

  if (startAddress === Number.MAX_SAFE_INTEGER) {
    startAddress = 0;
  }

  return { memory, startAddress, writeRanges };
}
