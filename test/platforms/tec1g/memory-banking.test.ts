import { describe, expect, it } from 'vitest';
import { createTec1gMemoryHooks } from '@jhlagado/debug80-runtime/platforms/tec1g/tec1g-memory';

describe('TEC-1G memory banking', () => {
  it('reads shadow ROM when enabled', () => {
    const baseMemory = new Uint8Array(0x10000);
    baseMemory[0xc000] = 0xaa;
    baseMemory[0x0000] = 0x11;
    const state = {
      shadowEnabled: true,
      protectEnabled: false,
      expandEnabled: false,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [{ start: 0xc000, end: 0xffff }], state);
    expect(hooks.memRead(0x0000)).toBe(0xaa);
    state.shadowEnabled = false;
    expect(hooks.memRead(0x0000)).toBe(0x11);
  });

  it('prevents writes to protected range', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: true,
      expandEnabled: false,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);
    hooks.memWrite(0x4000, 0x5a);
    expect(baseMemory[0x4000]).toBe(0x00);
  });

  it('reads expansion window from selected bank', () => {
    const baseMemory = new Uint8Array(0x10000);
    const state = {
      shadowEnabled: false,
      protectEnabled: false,
      expandEnabled: true,
      bankA14: false,
    };
    const hooks = createTec1gMemoryHooks(baseMemory, [], state);
    hooks.expandBanks[0][0] = 0x12;
    hooks.expandBanks[1][0] = 0x34;
    expect(hooks.memRead(0x8000)).toBe(0x12);
    state.bankA14 = true;
    expect(hooks.memRead(0x8000)).toBe(0x34);
  });
});
