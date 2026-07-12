/**
 * @file TEC-1G memory hook helpers for shadow/protect/expand behavior.
 */

import type { Tec1gState } from './runtime.js';
import { decodeMemoryExpansionBank } from './sysctrl.js';
import {
  ADDR_MASK,
  BYTE_MASK,
  TEC1G_EXPAND_BANK_COUNT,
  TEC1G_EXPAND_END,
  TEC1G_EXPAND_SIZE,
  TEC1G_EXPAND_START,
  TEC1G_PROTECT_END,
  TEC1G_PROTECT_START,
  TEC1G_SHADOW_END,
  TEC1G_SHADOW_SIZE,
  TEC1G_SHADOW_START,
} from '../tec-common/index.js';
import { ensureTec1gShadowRom } from './tec1g-shadow.js';

export type Tec1gMemoryHooks = {
  expandBanks: Uint8Array[];
  memRead: (addr: number) => number;
  memWrite: (addr: number, value: number) => void;
  forceMemWrite: (addr: number, value: number) => void;
  isMemoryWritable: (addr: number) => boolean;
};

type Tec1gExpansionBankState = Pick<
  Tec1gState['system'],
  'shadowEnabled' | 'protectEnabled' | 'expandEnabled' | 'bankA14'
> & {
  memoryExpansionBankValue?: number;
  memoryExpansionPhysicalBank?: number;
};

export type Tec1gExpansionRomMemoryImage = {
  banks: Uint8Array[];
  memory: Uint8Array;
};

/**
 * Copies expansion ROM data into the active TEC-1G expand banks.
 */
export function applyExpansionRomMemory(
  expandBanks: Uint8Array[],
  image: Uint8Array | Tec1gExpansionRomMemoryImage
): void {
  expandBanks.forEach((bank) => bank.fill(0x00));
  if (image instanceof Uint8Array) {
    for (let bankIndex = 0; bankIndex < expandBanks.length; bankIndex += 1) {
      const target = expandBanks[bankIndex];
      if (target === undefined) {
        continue;
      }
      const start = TEC1G_EXPAND_START + bankIndex * TEC1G_EXPAND_SIZE;
      target.set(image.slice(start, start + TEC1G_EXPAND_SIZE));
    }
    return;
  }
  for (let bankIndex = 0; bankIndex < expandBanks.length; bankIndex += 1) {
    copyExpansionBank(expandBanks[bankIndex], image.banks[bankIndex]);
  }
}

/**
 * Copies a source bank into an emulator expansion bank.
 */
function copyExpansionBank(target: Uint8Array | undefined, source: Uint8Array | undefined): void {
  if (target === undefined || source === undefined) {
    return;
  }
  target.set(source.slice(0, TEC1G_EXPAND_SIZE));
}

/**
 *
 */
function selectedExpansionBankIndex(state: Tec1gExpansionBankState): number | undefined {
  const physicalBank = state.memoryExpansionPhysicalBank;
  if (typeof physicalBank === 'number' && Number.isInteger(physicalBank)) {
    return physicalBank >= 0 && physicalBank < TEC1G_EXPAND_BANK_COUNT ? physicalBank : undefined;
  }
  const bankValue = state.memoryExpansionBankValue;
  if (typeof bankValue === 'number' && Number.isInteger(bankValue)) {
    const decoded = decodeMemoryExpansionBank(bankValue);
    return decoded.physicalBank >= 0 && decoded.physicalBank < TEC1G_EXPAND_BANK_COUNT
      ? decoded.physicalBank
      : undefined;
  }
  return state.bankA14 ? 1 : 0;
}

/**
 * Builds memory read/write hooks that apply TEC-1G shadow, protect, and banked expansion logic.
 */
export function createTec1gMemoryHooks(
  baseMemory: Uint8Array,
  romRanges: Array<{ start: number; end: number }>,
  state: Tec1gExpansionBankState
): Tec1gMemoryHooks {
  const expandBanks = Array.from(
    { length: TEC1G_EXPAND_BANK_COUNT },
    () => new Uint8Array(TEC1G_EXPAND_SIZE)
  );
  const shadowInfo = ensureTec1gShadowRom(baseMemory, romRanges);
  const isRomAddress = (addr: number): boolean =>
    romRanges.some((range) => addr >= range.start && addr <= range.end) ||
    (shadowInfo.shadowCopied && addr >= TEC1G_SHADOW_START && addr <= TEC1G_SHADOW_END);
  const getExpandBank = (): Uint8Array | undefined => {
    const index = selectedExpansionBankIndex(state);
    return index === undefined ? undefined : expandBanks[index];
  };

  const memRead = (addr: number): number => {
    const masked = addr & ADDR_MASK;
    if (state.shadowEnabled && masked < TEC1G_SHADOW_SIZE) {
      const shadowAddr = TEC1G_SHADOW_START + masked;
      return baseMemory[shadowAddr] ?? 0;
    }
    if (masked >= TEC1G_EXPAND_START && masked <= TEC1G_EXPAND_END) {
      if (state.expandEnabled) {
        return getExpandBank()?.[masked - TEC1G_EXPAND_START] ?? 0;
      }
    }
    return baseMemory[masked] ?? 0;
  };

  const isMemoryWritable = (addr: number): boolean => {
    const masked = addr & ADDR_MASK;
    if (masked >= TEC1G_SHADOW_SIZE && isRomAddress(masked)) {
      return false;
    }
    if (state.protectEnabled && masked >= TEC1G_PROTECT_START && masked <= TEC1G_PROTECT_END) {
      return false;
    }
    return true;
  };

  const writeVisibleMemory = (masked: number, value: number): void => {
    if (masked >= TEC1G_EXPAND_START && masked <= TEC1G_EXPAND_END) {
      if (state.expandEnabled) {
        const bank = getExpandBank();
        if (bank !== undefined) {
          bank[masked - TEC1G_EXPAND_START] = value & BYTE_MASK;
        }
        return;
      }
    }
    baseMemory[masked] = value & BYTE_MASK;
  };

  const memWrite = (addr: number, value: number): void => {
    const masked = addr & ADDR_MASK;
    if (!isMemoryWritable(masked)) {
      return;
    }
    writeVisibleMemory(masked, value);
  };

  const forceMemWrite = (addr: number, value: number): void => {
    writeVisibleMemory(addr & ADDR_MASK, value);
  };

  return { expandBanks, memRead, memWrite, forceMemWrite, isMemoryWritable };
}
