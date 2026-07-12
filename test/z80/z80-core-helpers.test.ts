import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  flagsToByte,
  pushWord,
  setFlagsFromByte,
  setFlagsRegister,
  setSZXYFlags,
  updateXYFlags,
} from '../../src/z80/core-helpers.js';
import { Callbacks, Cpu } from '../../src/z80/types.js';

const makeCpu = (): Cpu => ({
  a: 0,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  h: 0,
  l: 0,
  a_prime: 0,
  b_prime: 0,
  c_prime: 0,
  d_prime: 0,
  e_prime: 0,
  h_prime: 0,
  l_prime: 0,
  ix: 0,
  iy: 0,
  i: 0,
  r: 0,
  sp: 0x2000,
  pc: 0,
  flags: { S: 0, Z: 0, Y: 0, H: 0, X: 0, P: 0, N: 0, C: 0 },
  flags_prime: { S: 0, Z: 0, Y: 0, H: 0, X: 0, P: 0, N: 0, C: 0 },
  imode: 0,
  iff1: 0,
  iff2: 0,
  halted: false,
  do_delayed_di: false,
  do_delayed_ei: false,
  cycle_counter: 0,
});

const createCallbacks = (mem: Uint8Array): Callbacks => ({
  mem_read: (addr: number): number => mem[addr & 0xffff] ?? 0,
  mem_write: (addr: number, value: number): void => {
    mem[addr & 0xffff] = value & 0xff;
  },
  io_read: (): number => 0,
  io_write: (): void => {
    /* noop */
  },
});

describe('z80-core-helpers', () => {
  it('round-trips flags between byte and struct', () => {
    const cpu = makeCpu();
    setFlagsFromByte(cpu.flags, 0b1011_0110);
    assert.deepEqual(cpu.flags, { S: 1, Z: 0, Y: 1, H: 1, X: 0, P: 1, N: 1, C: 0 });
    assert.equal(flagsToByte(cpu.flags), 0b1011_0110);
  });

  it('sets SZXY from value', () => {
    const cpu = makeCpu();
    setSZXYFlags(cpu, 0b1001_1000);
    assert.deepEqual(cpu.flags, {
      S: 1,
      Z: 0,
      Y: 0,
      H: 0,
      X: 1,
      P: 0,
      N: 0,
      C: 0,
    });

    setSZXYFlags(cpu, 0);
    assert.equal(cpu.flags.Z, 1);
    assert.equal(cpu.flags.S, 0);
  });

  it('updates undocumented XY bits from result', () => {
    const cpu = makeCpu();
    updateXYFlags(cpu.flags, 0b0010_1000);
    assert.equal(cpu.flags.Y, 1);
    assert.equal(cpu.flags.X, 1);

    updateXYFlags(cpu.flags, 0);
    assert.equal(cpu.flags.Y, 0);
    assert.equal(cpu.flags.X, 0);
  });

  it('sets whole flags register on cpu', () => {
    const cpu = makeCpu();
    setFlagsRegister(cpu, 0xff);
    assert.deepEqual(cpu.flags, { S: 1, Z: 1, Y: 1, H: 1, X: 1, P: 1, N: 1, C: 1 });
  });

  it('pushes a word onto the stack and updates SP', () => {
    const mem = new Uint8Array(0x10000);
    const cpu = makeCpu();
    cpu.sp = 0x1000;
    const cb = createCallbacks(mem);

    pushWord(cpu, cb, 0xabcd);

    assert.equal(cpu.sp, 0x0ffe);
    assert.equal(mem[0x0fff], 0xab);
    assert.equal(mem[0x0ffe], 0xcd);
  });
});
