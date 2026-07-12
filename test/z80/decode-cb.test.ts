/**
 * @file Tests for CB prefix handler.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildCbHandler } from '../../src/z80/decode-cb.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { Callbacks, Cpu } from '../../src/z80/types.js';

describe('decode-cb', () => {
  let cpu: Cpu;
  let memory: Uint8Array;
  let cb: Callbacks;
  let handler: () => void;

  beforeEach(() => {
    const init = initDecodeTestContext();
    cpu = init.cpu;
    memory = init.memory;
    cb = init.cb;
    const helpers = buildDecoderHelpers(cpu, cb);
    handler = buildCbHandler({
      cpu,
      cb,
      do_rlc: helpers.do_rlc,
      do_rrc: helpers.do_rrc,
      do_rl: helpers.do_rl,
      do_rr: helpers.do_rr,
      do_sla: helpers.do_sla,
      do_sra: helpers.do_sra,
      do_sll: helpers.do_sll,
      do_srl: helpers.do_srl,
    });
  });

  it('handles RLC B (CB 00)', () => {
    cpu.b = 0x80;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x00;
    handler();
    expect(cpu.b).toBe(0x01);
    expect(cpu.flags.C).toBe(1);
  });

  it('handles RRC C (CB 09)', () => {
    cpu.c = 0x01;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x09;
    handler();
    expect(cpu.c).toBe(0x80);
    expect(cpu.flags.C).toBe(1);
  });

  it('handles BIT 0,A (CB 47)', () => {
    cpu.a = 0x01;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x47;
    handler();
    expect(cpu.flags.Z).toBe(0);
  });

  it('handles BIT 7,A (CB 7F) when bit not set', () => {
    cpu.a = 0x00;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x7f;
    handler();
    expect(cpu.flags.Z).toBe(1);
  });

  it('handles BIT 7,A (CB 7F) when bit set', () => {
    cpu.a = 0x80;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x7f;
    handler();
    expect(cpu.flags.Z).toBe(0);
    expect(cpu.flags.S).toBe(1);
  });

  it('handles BIT 5,A (CB 6F) setting Y flag', () => {
    cpu.a = 0x20;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x6f;
    handler();
    expect(cpu.flags.Z).toBe(0);
    expect(cpu.flags.Y).toBe(1);
  });

  it('handles BIT 3,A (CB 5F) setting X flag', () => {
    cpu.a = 0x08;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x5f;
    handler();
    expect(cpu.flags.Z).toBe(0);
    expect(cpu.flags.X).toBe(1);
  });

  it('handles RES 0,B (CB 80)', () => {
    cpu.b = 0xff;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x80;
    handler();
    expect(cpu.b).toBe(0xfe);
  });

  it('handles SET 7,A (CB FF)', () => {
    cpu.a = 0x00;
    cpu.pc = 0x0000;
    memory[0x0001] = 0xff;
    handler();
    expect(cpu.a).toBe(0x80);
  });

  it('handles (HL) operand for rotate', () => {
    cpu.h = 0x10;
    cpu.l = 0x00;
    memory[0x1000] = 0x80;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x06; // RLC (HL)
    handler();
    expect(memory[0x1000]).toBe(0x01);
  });

  it('increments R register', () => {
    cpu.r = 0x00;
    cpu.pc = 0x0000;
    memory[0x0001] = 0x00;
    handler();
    expect(cpu.r & 0x7f).toBe(0x01);
  });
});
