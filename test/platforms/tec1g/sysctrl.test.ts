import { describe, expect, it } from 'vitest';
import { decodeSysCtrl } from '@jhlagado/debug80-runtime/platforms/tec1g/sysctrl';

describe('decodeSysCtrl', () => {
  it('enables shadow when bit 0 is clear', () => {
    expect(decodeSysCtrl(0x00).shadowEnabled).toBe(true);
    expect(decodeSysCtrl(0x01).shadowEnabled).toBe(false);
  });

  it('decodes protect and expand bits', () => {
    const state = decodeSysCtrl(0x06);
    expect(state.protectEnabled).toBe(true);
    expect(state.expandEnabled).toBe(true);
  });

  it('decodes bank A14 (bit 3)', () => {
    expect(decodeSysCtrl(0x00).bankA14).toBe(false);
    expect(decodeSysCtrl(0x08).bankA14).toBe(true);
  });

  it('decodes caps lock (bit 7)', () => {
    expect(decodeSysCtrl(0x00).capsLock).toBe(false);
    expect(decodeSysCtrl(0x20).capsLock).toBe(false);
    expect(decodeSysCtrl(0x80).capsLock).toBe(true);
  });

  it('decodes memory expansion bank bits (bits 3-6)', () => {
    const state = decodeSysCtrl(0x78);
    expect(state.memoryExpansionBankBits).toEqual([true, true, true, true]);
    expect(state.memoryExpansionBankValue).toBe(0x0f);
  });

  it('decodes legacy expansion mode when the upper bank selector is zero', () => {
    const bank0 = decodeSysCtrl(0x04);
    expect(bank0.memoryExpansionMode).toBe('legacy');
    expect(bank0.memoryExpansionLegacyBank).toBe(0);
    expect(bank0.memoryExpansionExtendedWindow).toBeNull();
    expect(bank0.memoryExpansionPhysicalBank).toBe(0);

    const bank1 = decodeSysCtrl(0x0c);
    expect(bank1.memoryExpansionMode).toBe('legacy');
    expect(bank1.memoryExpansionLegacyBank).toBe(1);
    expect(bank1.memoryExpansionExtendedWindow).toBeNull();
    expect(bank1.memoryExpansionPhysicalBank).toBe(1);
  });

  it('decodes extended expansion windows from the upper three bank bits', () => {
    const firstExtended = decodeSysCtrl(0x14);
    expect(firstExtended.memoryExpansionMode).toBe('extended');
    expect(firstExtended.memoryExpansionLegacyBank).toBe(0);
    expect(firstExtended.memoryExpansionExtendedWindow).toBe(0);
    expect(firstExtended.memoryExpansionPhysicalBank).toBe(2);

    const firstExtendedWithLegacyBitSet = decodeSysCtrl(0x1c);
    expect(firstExtendedWithLegacyBitSet.memoryExpansionMode).toBe('extended');
    expect(firstExtendedWithLegacyBitSet.memoryExpansionExtendedWindow).toBe(0);
    expect(firstExtendedWithLegacyBitSet.memoryExpansionPhysicalBank).toBe(2);

    const lastExtended = decodeSysCtrl(0x7c);
    expect(lastExtended.memoryExpansionMode).toBe('extended');
    expect(lastExtended.memoryExpansionExtendedWindow).toBe(6);
    expect(lastExtended.memoryExpansionPhysicalBank).toBe(8);
  });

  it('decodes all bits from 0xFF', () => {
    const state = decodeSysCtrl(0xff);
    expect(state.shadowEnabled).toBe(false);
    expect(state.protectEnabled).toBe(true);
    expect(state.expandEnabled).toBe(true);
    expect(state.bankA14).toBe(true);
    expect(state.memoryExpansionBankBits).toEqual([true, true, true, true]);
    expect(state.memoryExpansionBankValue).toBe(0x0f);
    expect(state.memoryExpansionMode).toBe('extended');
    expect(state.memoryExpansionExtendedWindow).toBe(6);
    expect(state.memoryExpansionPhysicalBank).toBe(8);
    expect(state.capsLock).toBe(true);
  });

  it('decodes all bits from 0x00', () => {
    const state = decodeSysCtrl(0x00);
    expect(state.shadowEnabled).toBe(true);
    expect(state.protectEnabled).toBe(false);
    expect(state.expandEnabled).toBe(false);
    expect(state.bankA14).toBe(false);
    expect(state.memoryExpansionBankBits).toEqual([false, false, false, false]);
    expect(state.memoryExpansionBankValue).toBe(0);
    expect(state.memoryExpansionMode).toBe('legacy');
    expect(state.memoryExpansionLegacyBank).toBe(0);
    expect(state.memoryExpansionExtendedWindow).toBeNull();
    expect(state.memoryExpansionPhysicalBank).toBe(0);
    expect(state.capsLock).toBe(false);
  });
});
