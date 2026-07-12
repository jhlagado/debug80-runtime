/**
 * @file TEC-1G system control register decoder.
 * Port 0xFF controls memory mapping and protection features.
 */

/**
 * Decoded state of the TEC-1G system control register (port 0xFF).
 * U13 74HCT273 latch — all 8 bits are latched on every write.
 */
export type Tec1gSysCtrlState = {
  /** Shadow ROM enabled (bit 0 = 0) - mirrors ROM from 0xC000 to 0x0000 */
  shadowEnabled: boolean;
  /** Write protection enabled (bit 1 = 1) - protects 0x4000-0x7FFF */
  protectEnabled: boolean;
  /** Memory expansion enabled (bit 2 = 1) - enables banked window at 0x8000-0xBFFF */
  expandEnabled: boolean;
  /** Expansion bank A14 (bit 3) - bank select for expansion window */
  bankA14: boolean;
  /** Memory expansion bank select bits (bits 3-6, bit 3 is also E_A14). */
  memoryExpansionBankBits: [boolean, boolean, boolean, boolean];
  /** Memory expansion bank value from bits 3-6. */
  memoryExpansionBankValue: number;
  /** Memory expansion decode mode. */
  memoryExpansionMode: Tec1gMemoryExpansionMode;
  /** Legacy two-page expand bank selected by memory expansion bit 0. */
  memoryExpansionLegacyBank: 0 | 1;
  /** Extended expansion window selected by memory expansion bits 1-3. */
  memoryExpansionExtendedWindow: number | null;
  /** Physical expansion backing bank selected by the decoded expansion mode. */
  memoryExpansionPhysicalBank: number;
  /** Caps lock (bit 7) */
  capsLock: boolean;
};

export type Tec1gMemoryExpansionMode = 'legacy' | 'extended';

export type Tec1gMemoryExpansionDecode = {
  mode: Tec1gMemoryExpansionMode;
  legacyBank: 0 | 1;
  extendedWindow: number | null;
  physicalBank: number;
};

/**
 * Decodes the four-bit TEC-1G memory expansion bank field.
 *
 * The low bit preserves legacy two-page expand behavior. The upper three bits
 * select the extension group: zero means legacy mode; values 1-7 select seven
 * additional 16K expansion windows.
 */
export function decodeMemoryExpansionBank(value: number): Tec1gMemoryExpansionDecode {
  const bankValue = value & 0x0f;
  const legacyBank = (bankValue & 0x01) as 0 | 1;
  const upperSelector = bankValue >> 1;
  if (upperSelector === 0) {
    return {
      mode: 'legacy',
      legacyBank,
      extendedWindow: null,
      physicalBank: legacyBank,
    };
  }
  const extendedWindow = upperSelector - 1;
  return {
    mode: 'extended',
    legacyBank,
    extendedWindow,
    physicalBank: 2 + extendedWindow,
  };
}

/**
 * Decodes the TEC-1G system control register value.
 *
 * Bit layout (U13 74HCT273):
 * - Bit 0: ~SHADOW (active low — 0 = shadow on)
 * - Bit 1: PROTECT (1 = write-protect 0x4000-0x7FFF)
 * - Bit 2: EXPAND (1 = expansion window at 0x8000-0xBFFF)
 * - Bit 3: E_A14 / Memory Expansion bit 0
 * - Bit 4: Memory Expansion bit 1
 * - Bit 5: Memory Expansion bit 2
 * - Bit 6: Memory Expansion bit 3
 * - Bit 7: CAPS (caps lock)
 *
 * @param value - Raw port 0xFF value
 * @returns Decoded system control state
 */
export const decodeSysCtrl = (value: number): Tec1gSysCtrlState => {
  const masked = value & 0xff;
  const memoryExpansionBankValue = (masked >> 3) & 0x0f;
  const memoryExpansion = decodeMemoryExpansionBank(memoryExpansionBankValue);
  return {
    shadowEnabled: (masked & 0x01) === 0,
    protectEnabled: (masked & 0x02) !== 0,
    expandEnabled: (masked & 0x04) !== 0,
    bankA14: (masked & 0x08) !== 0,
    memoryExpansionBankBits: [
      (masked & 0x08) !== 0,
      (masked & 0x10) !== 0,
      (masked & 0x20) !== 0,
      (masked & 0x40) !== 0,
    ],
    memoryExpansionBankValue,
    memoryExpansionMode: memoryExpansion.mode,
    memoryExpansionLegacyBank: memoryExpansion.legacyBank,
    memoryExpansionExtendedWindow: memoryExpansion.extendedWindow,
    memoryExpansionPhysicalBank: memoryExpansion.physicalBank,
    capsLock: (masked & 0x80) !== 0,
  };
};
