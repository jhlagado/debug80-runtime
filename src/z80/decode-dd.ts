/**
 * @fileoverview Z80 DD prefix decoder.
 */

import { cycle_counts, cycle_counts_dd } from './constants.js';
import { pushWord } from './core-helpers.js';
import { noop, OpcodeHandler, OpcodeTable } from './opcode-types.js';
import { buildDdcbHandler } from './decode-ddcb.js';
import { Callbacks, Cpu } from './types.js';

export type DdContext = {
  cpu: Cpu;
  cb: Callbacks;
  getSignedOffsetByte: (value: number) => number;
  do_ix_add: (operand: number) => void;
  do_inc: (value: number) => number;
  do_dec: (value: number) => number;
  do_add: (value: number) => void;
  do_adc: (value: number) => void;
  do_sub: (value: number) => void;
  do_sbc: (value: number) => void;
  do_and: (value: number) => void;
  do_xor: (value: number) => void;
  do_or: (value: number) => void;
  do_cp: (value: number) => void;
  do_rlc: (value: number) => number;
  do_rrc: (value: number) => number;
  do_rl: (value: number) => number;
  do_rr: (value: number) => number;
  do_sla: (value: number) => number;
  do_sra: (value: number) => number;
  do_sll: (value: number) => number;
  do_srl: (value: number) => number;
  pop_word: () => number;
};

export type DdHandlerContext = {
  cpu: Cpu;
  cb: Callbacks;
  ddInstructions: OpcodeTable;
};

/**
 * Builds the DD prefix instruction table (IX operations).
 */
export function buildDdInstructions(ctx: DdContext): OpcodeTable {
  const {
    cpu,
    cb,
    getSignedOffsetByte,
    do_ix_add,
    do_inc,
    do_dec,
    do_add,
    do_adc,
    do_sub,
    do_sbc,
    do_and,
    do_xor,
    do_or,
    do_cp,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
    pop_word,
  } = ctx;

  const dd_instructions: OpcodeTable = new Array<OpcodeHandler>(256).fill(noop);
  // 0x09 : ADD IX, BC
  dd_instructions[0x09] = (): void => {
    do_ix_add(cpu.c | (cpu.b << 8));
  };
  // 0x19 : ADD IX, DE
  dd_instructions[0x19] = (): void => {
    do_ix_add(cpu.e | (cpu.d << 8));
  };
  // 0x21 : LD IX, nn
  dd_instructions[0x21] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix |= cb.mem_read(cpu.pc) << 8;
  };
  // 0x22 : LD (nn), IX
  dd_instructions[0x22] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.ix & 0xff);
    cb.mem_write((address + 1) & 0xffff, (cpu.ix >>> 8) & 0xff);
  };
  // 0x23 : INC IX
  dd_instructions[0x23] = (): void => {
    cpu.ix = (cpu.ix + 1) & 0xffff;
  };
  // 0x24 : INC IXH (Undocumented)
  dd_instructions[0x24] = (): void => {
    cpu.ix = (do_inc(cpu.ix >>> 8) << 8) | (cpu.ix & 0xff);
  };
  // 0x25 : DEC IXH (Undocumented)
  dd_instructions[0x25] = (): void => {
    cpu.ix = (do_dec(cpu.ix >>> 8) << 8) | (cpu.ix & 0xff);
  };
  // 0x26 : LD IXH, n (Undocumented)
  dd_instructions[0x26] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix = (cb.mem_read(cpu.pc) << 8) | (cpu.ix & 0xff);
  };
  // 0x29 : ADD IX, IX
  dd_instructions[0x29] = (): void => {
    do_ix_add(cpu.ix);
  };
  // 0x2a : LD IX, (nn)
  dd_instructions[0x2a] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.ix = cb.mem_read(address);
    cpu.ix |= cb.mem_read((address + 1) & 0xffff) << 8;
  };
  // 0x2b : DEC IX
  dd_instructions[0x2b] = (): void => {
    cpu.ix = (cpu.ix - 1) & 0xffff;
  };
  // 0x2c : INC IXL (Undocumented)
  dd_instructions[0x2c] = (): void => {
    cpu.ix = do_inc(cpu.ix & 0xff) | (cpu.ix & 0xff00);
  };
  // 0x2d : DEC IXL (Undocumented)
  dd_instructions[0x2d] = (): void => {
    cpu.ix = do_dec(cpu.ix & 0xff) | (cpu.ix & 0xff00);
  };
  // 0x2e : LD IXL, n (Undocumented)
  dd_instructions[0x2e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.ix = (cb.mem_read(cpu.pc) & 0xff) | (cpu.ix & 0xff00);
  };
  // 0x34 : INC (IX+n)
  dd_instructions[0x34] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    const value = cb.mem_read((offset + cpu.ix) & 0xffff);
    cb.mem_write((offset + cpu.ix) & 0xffff, do_inc(value));
  };
  // 0x35 : DEC (IX+n)
  dd_instructions[0x35] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    const value = cb.mem_read((offset + cpu.ix) & 0xffff);
    cb.mem_write((offset + cpu.ix) & 0xffff, do_dec(value));
  };
  // 0x36 : LD (IX+n), n
  dd_instructions[0x36] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cb.mem_write((cpu.ix + offset) & 0xffff, cb.mem_read(cpu.pc));
  };
  // 0x39 : ADD IX, SP
  dd_instructions[0x39] = (): void => {
    do_ix_add(cpu.sp);
  };
  // 0x44 : LD B, IXH (Undocumented)
  dd_instructions[0x44] = (): void => {
    cpu.b = (cpu.ix >>> 8) & 0xff;
  };
  // 0x45 : LD B, IXL (Undocumented)
  dd_instructions[0x45] = (): void => {
    cpu.b = cpu.ix & 0xff;
  };
  // 0x46 : LD B, (IX+n)
  dd_instructions[0x46] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.b = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x4c : LD C, IXH (Undocumented)
  dd_instructions[0x4c] = (): void => {
    cpu.c = (cpu.ix >>> 8) & 0xff;
  };
  // 0x4d : LD C, IXL (Undocumented)
  dd_instructions[0x4d] = (): void => {
    cpu.c = cpu.ix & 0xff;
  };
  // 0x4e : LD C, (IX+n)
  dd_instructions[0x4e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.c = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x54 : LD D, IXH (Undocumented)
  dd_instructions[0x54] = (): void => {
    cpu.d = (cpu.ix >>> 8) & 0xff;
  };
  // 0x55 : LD D, IXL (Undocumented)
  dd_instructions[0x55] = (): void => {
    cpu.d = cpu.ix & 0xff;
  };
  // 0x56 : LD D, (IX+n)
  dd_instructions[0x56] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.d = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x5c : LD E, IXH (Undocumented)
  dd_instructions[0x5c] = (): void => {
    cpu.e = (cpu.ix >>> 8) & 0xff;
  };
  // 0x5d : LD E, IXL (Undocumented)
  dd_instructions[0x5d] = (): void => {
    cpu.e = cpu.ix & 0xff;
  };
  // 0x5e : LD E, (IX+n)
  dd_instructions[0x5e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.e = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x60 : LD IXH, B (Undocumented)
  dd_instructions[0x60] = (): void => {
    cpu.ix = (cpu.b << 8) | (cpu.ix & 0xff);
  };
  // 0x61 : LD IXH, C (Undocumented)
  dd_instructions[0x61] = (): void => {
    cpu.ix = (cpu.c << 8) | (cpu.ix & 0xff);
  };
  // 0x62 : LD IXH, D (Undocumented)
  dd_instructions[0x62] = (): void => {
    cpu.ix = (cpu.d << 8) | (cpu.ix & 0xff);
  };
  // 0x63 : LD IXH, E (Undocumented)
  dd_instructions[0x63] = (): void => {
    cpu.ix = (cpu.e << 8) | (cpu.ix & 0xff);
  };
  // 0x64 : LD IXH, IXH (Undocumented)
  dd_instructions[0x64] = (): void => {
    // No-op.
  };
  // 0x65 : LD IXH, IXL (Undocumented)
  dd_instructions[0x65] = (): void => {
    cpu.ix = (cpu.ix & 0xff) | ((cpu.ix & 0xff) << 8);
  };
  // 0x66 : LD H, (IX+n)
  dd_instructions[0x66] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.h = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x67 : LD IXH, A (Undocumented)
  dd_instructions[0x67] = (): void => {
    cpu.ix = (cpu.a << 8) | (cpu.ix & 0xff);
  };
  // 0x68 : LD IXL, B (Undocumented)
  dd_instructions[0x68] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.b;
  };
  // 0x69 : LD IXL, C (Undocumented)
  dd_instructions[0x69] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.c;
  };
  // 0x6a : LD IXL, D (Undocumented)
  dd_instructions[0x6a] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.d;
  };
  // 0x6b : LD IXL, E (Undocumented)
  dd_instructions[0x6b] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.e;
  };
  // 0x6c : LD IXL, IXH (Undocumented)
  dd_instructions[0x6c] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | (cpu.ix >>> 8);
  };
  // 0x6d : LD IXL, IXL (Undocumented)
  dd_instructions[0x6d] = (): void => {
    // No-op.
  };
  // 0x6e : LD L, (IX+n)
  dd_instructions[0x6e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.l = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x6f : LD IXL, A (Undocumented)
  dd_instructions[0x6f] = (): void => {
    cpu.ix = (cpu.ix & 0xff00) | cpu.a;
  };
  // 0x70 : LD (IX+n), B
  dd_instructions[0x70] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.b);
  };
  // 0x71 : LD (IX+n), C
  dd_instructions[0x71] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.c);
  };
  // 0x72 : LD (IX+n), D
  dd_instructions[0x72] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.d);
  };
  // 0x73 : LD (IX+n), E
  dd_instructions[0x73] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.e);
  };
  // 0x74 : LD (IX+n), H
  dd_instructions[0x74] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.h);
  };
  // 0x75 : LD (IX+n), L
  dd_instructions[0x75] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.l);
  };
  // 0x77 : LD (IX+n), A
  dd_instructions[0x77] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cb.mem_write((cpu.ix + offset) & 0xffff, cpu.a);
  };
  // 0x7c : LD A, IXH (Undocumented)
  dd_instructions[0x7c] = (): void => {
    cpu.a = (cpu.ix >>> 8) & 0xff;
  };
  // 0x7d : LD A, IXL (Undocumented)
  dd_instructions[0x7d] = (): void => {
    cpu.a = cpu.ix & 0xff;
  };
  // 0x7e : LD A, (IX+n)
  dd_instructions[0x7e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.a = cb.mem_read((cpu.ix + offset) & 0xffff);
  };
  // 0x84 : ADD IXH (Undocumented)
  dd_instructions[0x84] = (): void => {
    do_add((cpu.ix >>> 8) & 0xff);
  };
  // 0x85 : ADD IXL (Undocumented)
  dd_instructions[0x85] = (): void => {
    do_add(cpu.ix & 0xff);
  };
  // 0x86 : ADD A, (IX+n)
  dd_instructions[0x86] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_add(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0x8c : ADC IXH (Undocumented)
  dd_instructions[0x8c] = (): void => {
    do_adc((cpu.ix >>> 8) & 0xff);
  };
  // 0x8d : ADC IXL (Undocumented)
  dd_instructions[0x8d] = (): void => {
    do_adc(cpu.ix & 0xff);
  };
  // 0x8e : ADC A, (IX+n)
  dd_instructions[0x8e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_adc(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0x94 : SUB IXH (Undocumented)
  dd_instructions[0x94] = (): void => {
    do_sub((cpu.ix >>> 8) & 0xff);
  };
  // 0x95 : SUB IXL (Undocumented)
  dd_instructions[0x95] = (): void => {
    do_sub(cpu.ix & 0xff);
  };
  // 0x96 : SUB A, (IX+n)
  dd_instructions[0x96] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_sub(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0x9c : SBC IXH (Undocumented)
  dd_instructions[0x9c] = (): void => {
    do_sbc((cpu.ix >>> 8) & 0xff);
  };
  // 0x9d : SBC IXL (Undocumented)
  dd_instructions[0x9d] = (): void => {
    do_sbc(cpu.ix & 0xff);
  };
  // 0x9e : SBC A, (IX+n)
  dd_instructions[0x9e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_sbc(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xa4 : AND IXH (Undocumented)
  dd_instructions[0xa4] = (): void => {
    do_and((cpu.ix >>> 8) & 0xff);
  };
  // 0xa5 : AND IXL (Undocumented)
  dd_instructions[0xa5] = (): void => {
    do_and(cpu.ix & 0xff);
  };
  // 0xa6 : AND A, (IX+n)
  dd_instructions[0xa6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_and(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xac : XOR IXH (Undocumented)
  dd_instructions[0xac] = (): void => {
    do_xor((cpu.ix >>> 8) & 0xff);
  };
  // 0xad : XOR IXL (Undocumented)
  dd_instructions[0xad] = (): void => {
    do_xor(cpu.ix & 0xff);
  };
  // 0xae : XOR A, (IX+n)
  dd_instructions[0xae] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_xor(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xb4 : OR IXH (Undocumented)
  dd_instructions[0xb4] = (): void => {
    do_or((cpu.ix >>> 8) & 0xff);
  };
  // 0xb5 : OR IXL (Undocumented)
  dd_instructions[0xb5] = (): void => {
    do_or(cpu.ix & 0xff);
  };
  // 0xb6 : OR A, (IX+n)
  dd_instructions[0xb6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_or(cb.mem_read((cpu.ix + offset) & 0xffff));
  };
  // 0xbc : CP IXH (Undocumented)
  dd_instructions[0xbc] = (): void => {
    do_cp((cpu.ix >>> 8) & 0xff);
  };
  // 0xbd : CP IXL (Undocumented)
  dd_instructions[0xbd] = (): void => {
    do_cp(cpu.ix & 0xff);
  };
  // 0xbe : CP A, (IX+n)
  dd_instructions[0xbe] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    do_cp(cb.mem_read((cpu.ix + offset) & 0xffff));
  };

  // ==========================================================================
  // DDCB PREFIX HANDLER (IX BIT INSTRUCTIONS)
  // ==========================================================================
  dd_instructions[0xcb] = buildDdcbHandler({
    cpu,
    cb,
    getSignedOffsetByte,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
  });
  // 0xe1 : POP IX
  dd_instructions[0xe1] = (): void => {
    cpu.ix = pop_word();
  };
  // 0xe3 : EX (SP), IX
  dd_instructions[0xe3] = (): void => {
    const temp = cpu.ix;
    cpu.ix = cb.mem_read(cpu.sp);
    cpu.ix |= cb.mem_read((cpu.sp + 1) & 0xffff) << 8;
    cb.mem_write(cpu.sp, temp & 0xff);
    cb.mem_write((cpu.sp + 1) & 0xffff, (temp >>> 8) & 0xff);
  };
  // 0xe5 : PUSH IX
  dd_instructions[0xe5] = (): void => {
    pushWord(cpu, cb, cpu.ix);
  };
  // 0xe9 : JP (IX)
  dd_instructions[0xe9] = (): void => {
    cpu.pc = (cpu.ix - 1) & 0xffff;
  };
  // 0xf9 : LD SP, IX
  dd_instructions[0xf9] = (): void => {
    cpu.sp = cpu.ix;
  };

  return dd_instructions;
}

export const buildDdHandler = (ctx: DdHandlerContext): OpcodeHandler => {
  const { cpu, cb, ddInstructions } = ctx;

  return (): void => {
    // R is incremented at the start of the second instruction cycle,
    //  before the instruction actually runs.
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const func = ddInstructions[opcode1] ?? noop;

    func();
    const ddCycles = cycle_counts_dd[opcode1] ?? cycle_counts[0] ?? 0;
    cpu.cycle_counter += ddCycles;
  };
};
