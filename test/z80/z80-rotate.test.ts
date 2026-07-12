import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  do_rl,
  do_rlc,
  do_rr,
  do_rrc,
  do_sla,
  do_sll,
  do_sra,
  do_srl,
} from '../../src/z80/rotate.js';
import { Cpu } from '../../src/z80/types.js';

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
  sp: 0,
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

describe('z80-rotate helpers', () => {
  it('RLC rotates left with carry out and parity/zero/sign', () => {
    const cpu = makeCpu();
    const result = do_rlc(cpu, 0x81); // 1000 0001 -> 0000 0011, carry 1
    assert.equal(result, 0x03);
    assert.equal(cpu.flags.C, 1);
    assert.equal(cpu.flags.Z, 0);
    assert.equal(cpu.flags.S, 0);
    assert.equal(cpu.flags.P, 1); // parity of 0x03 is even
  });

  it('RRC rotates right with carry out', () => {
    const cpu = makeCpu();
    const result = do_rrc(cpu, 0x02); // 0000 0010 -> 0000 0001, carry 0
    assert.equal(result, 0x01);
    assert.equal(cpu.flags.C, 0);
    assert.equal(cpu.flags.Z, 0);
    assert.equal(cpu.flags.S, 0);
  });

  it('RL uses existing carry and updates carry', () => {
    const cpu = makeCpu();
    cpu.flags.C = 1;
    const result = do_rl(cpu, 0x80); // 1000 0000 with carry-in 1 -> 0000 0001 carry-out 1
    assert.equal(result, 0x01);
    assert.equal(cpu.flags.C, 1);
    assert.equal(cpu.flags.Z, 0);
  });

  it('RR uses existing carry and updates carry', () => {
    const cpu = makeCpu();
    cpu.flags.C = 1;
    const result = do_rr(cpu, 0x01); // 0000 0001 with carry-in 1 -> 1000 0000 carry-out 1
    assert.equal(result, 0x80);
    assert.equal(cpu.flags.C, 1);
    assert.equal(cpu.flags.S, 1);
  });

  it('SLA shifts left, sets carry and zero', () => {
    const cpu = makeCpu();
    const result = do_sla(cpu, 0x80);
    assert.equal(result, 0x00);
    assert.equal(cpu.flags.C, 1);
    assert.equal(cpu.flags.Z, 1);
  });

  it('SRA preserves sign bit and sets carry', () => {
    const cpu = makeCpu();
    const result = do_sra(cpu, 0x81); // 1000 0001 -> 1100 0000, carry 1
    assert.equal(result, 0xc0);
    assert.equal(cpu.flags.C, 1);
    assert.equal(cpu.flags.S, 1);
  });

  it('SLL shifts left and sets bit 0', () => {
    const cpu = makeCpu();
    const result = do_sll(cpu, 0x02); // 0000 0010 -> 0000 0101
    assert.equal(result, 0x05);
    assert.equal(cpu.flags.C, 0);
    assert.equal(cpu.flags.Z, 0);
  });

  it('SRL shifts right arithmetic clearing sign', () => {
    const cpu = makeCpu();
    const result = do_srl(cpu, 0x01);
    assert.equal(result, 0x00);
    assert.equal(cpu.flags.C, 1);
    assert.equal(cpu.flags.S, 0);
    assert.equal(cpu.flags.Z, 1);
  });
});
