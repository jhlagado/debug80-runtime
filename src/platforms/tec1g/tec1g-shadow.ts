/**
 * @file TEC-1G shadow ROM management.
 */

/**
 * Memory range definition for ROM regions.
 */
export type RomRange = { start: number; end: number };

/**
 * Information about shadow ROM state after initialization.
 */
export type Tec1gShadowInfo = {
  /** Whether ROM is present at low memory (0x0000-0x07FF) */
  hasLowRom: boolean;
  /** Whether shadow ROM region exists (0xC000-0xC7FF) */
  hasShadowRom: boolean;
  /** Whether data was copied from low ROM to shadow location */
  shadowCopied: boolean;
};

/** Checks if any range covers the given address span */
const covers = (ranges: RomRange[], start: number, end: number): boolean =>
  ranges.some((range) => range.start <= start && range.end >= end);

/**
 * Ensures TEC-1G shadow ROM is properly configured.
 *
 * TEC-1G hardware has ROM physically at 0xC000 which is shadowed to 0x0000.
 * If ROM data is present at 0x0000 but not at 0xC000, this function copies
 * it to the physical location and clears the shadow region.
 *
 * @param memory - 64K memory array to modify
 * @param romRanges - Array of ROM range definitions
 * @returns Shadow ROM configuration state
 */
export const ensureTec1gShadowRom = (
  memory: Uint8Array,
  romRanges: RomRange[]
): Tec1gShadowInfo => {
  const hasLowRom = covers(romRanges, 0x0000, 0x07ff);
  const hasShadowRom = covers(romRanges, 0xc000, 0xc7ff);
  let shadowCopied = false;

  if (hasLowRom && !hasShadowRom) {
    memory.set(memory.subarray(0x0000, 0x0800), 0xc000);
    memory.fill(0x00, 0x0000, 0x0800);
    shadowCopied = true;
  }

  return { hasLowRom, hasShadowRom, shadowCopied };
};
