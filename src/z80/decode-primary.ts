/**
 * @fileoverview Z80 primary opcode decoder.
 *
 * This file is intentionally large. It implements the full primary Z80 opcode
 * surface in one place: a sparse table for the irregular opcodes plus direct
 * decoding for the highly regular register-load and ALU ranges.
 *
 * The size here is structural rather than accidental. Splitting it by numeric
 * opcode range would add cross-file wiring around the same shared helpers and
 * CPU context without reducing the underlying conceptual complexity of the 256
 * primary opcodes.
 *
 * Major sections in this file:
 * - 0x00-0x3F: load, exchange, rotate, and relative-jump instructions
 * - 0x40-0x7F: 8-bit register loads, decoded directly in executePrimaryOpcode
 * - 0x80-0xBF: ALU register operations, decoded directly in executePrimaryOpcode
 * - 0xC0-0xFF: control flow, stack, prefixes, and immediate ALU instructions
 */

import { cycle_counts, parity_bits } from './constants.js';
import { noop, OpcodeHandler, OpcodeTable } from './opcode-types.js';
import { Callbacks, Cpu } from './types.js';

/** Handler that operates on a byte value without returning */
type ByteOpVoid = (value: number) => void;

/** No-op void handler that does nothing */
const noopVoidOp: ByteOpVoid = (_value: number): void => {
  // intentionally empty
};

/**
 * Safely retrieves a void operation handler from an array.
 * @param ops - Array of void operation handlers
 * @param index - Index to retrieve
 * @returns Handler at index or no-op if out of bounds
 */
const getVoidOp = (ops: ByteOpVoid[], index: number): ByteOpVoid => ops[index] ?? noopVoidOp;

export type PrimaryInstructionContext = {
  cpu: Cpu;
  cb: Callbacks;
  pushWord: (cpu: Cpu, cb: Callbacks, value: number) => void;
  setFlagsRegister: (cpu: Cpu, operand: number) => void;
  get_flags_register: () => number;
  get_flags_prime: () => number;
  set_flags_prime: (operand: number) => void;
  update_xy_flags: (value: number) => void;
  get_signed_offset_byte: (value: number) => number;
  pop_word: () => number;
  do_conditional_absolute_jump: (condition: boolean) => void;
  do_conditional_relative_jump: (condition: boolean) => void;
  do_conditional_call: (condition: boolean) => void;
  do_conditional_return: (condition: boolean) => void;
  do_reset: (address: number) => void;
  do_add: (operand: number) => void;
  do_adc: (operand: number) => void;
  do_sub: (operand: number) => void;
  do_sbc: (operand: number) => void;
  do_and: (operand: number) => void;
  do_xor: (operand: number) => void;
  do_or: (operand: number) => void;
  do_cp: (operand: number) => void;
  do_inc: (value: number) => number;
  do_dec: (value: number) => number;
  do_hl_add: (operand: number) => void;
  do_rlc: (value: number) => number;
  do_rrc: (value: number) => number;
  do_rl: (value: number) => number;
  do_rr: (value: number) => number;
  cbHandler: OpcodeHandler;
  ddHandler: OpcodeHandler;
  edHandler: OpcodeHandler;
  fdHandler: OpcodeHandler;
};

export const buildPrimaryInstructions = (ctx: PrimaryInstructionContext): OpcodeTable => {
  const {
    cpu,
    cb,
    pushWord,
    setFlagsRegister,
    get_flags_register,
    get_flags_prime,
    set_flags_prime,
    update_xy_flags,
    get_signed_offset_byte,
    pop_word,
    do_conditional_absolute_jump,
    do_conditional_relative_jump,
    do_conditional_call,
    do_conditional_return,
    do_reset,
    do_add,
    do_adc,
    do_sub,
    do_sbc,
    do_and,
    do_xor,
    do_or,
    do_cp,
    do_inc,
    do_dec,
    do_hl_add,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    cbHandler,
    ddHandler,
    edHandler,
    fdHandler,
  } = ctx;
  // ==========================================================================
  // MAIN INSTRUCTION TABLE (PRIMARY OPCODES 0x00-0xFF)
  // ==========================================================================
  // This table contains implementations for instructions that aren't decoded
  // directly (8-bit register loads 0x40-0x7F and ALU 0x80-0xBF are handled
  // by the register/ALU decoder at the end of this function).
  // ==========================================================================
  const instructions: OpcodeTable = new Array<OpcodeHandler>(256).fill(noop);

  // ==========================================================================
  // 0x00-0x3F: LOAD / EXCHANGE / ROTATE / RELATIVE CONTROL FLOW
  // ==========================================================================

  // 0x00 : NOP
  instructions[0x00] = (): void => {
    // do nothing
  };
  // 0x01 : LD BC, nn
  instructions[0x01] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.c = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.b = cb.mem_read(cpu.pc);
  };
  // 0x02 : LD (BC), A
  instructions[0x02] = (): void => {
    cb.mem_write(cpu.c | (cpu.b << 8), cpu.a);
  };
  // 0x03 : INC BC
  instructions[0x03] = (): void => {
    let result = cpu.c | (cpu.b << 8);
    result += 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;
  };
  // 0x04 : INC B
  instructions[0x04] = (): void => {
    cpu.b = do_inc(cpu.b);
  };
  // 0x05 : DEC B
  instructions[0x05] = (): void => {
    cpu.b = do_dec(cpu.b);
  };
  // 0x06 : LD B, n
  instructions[0x06] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.b = cb.mem_read(cpu.pc);
  };
  // 0x07 : RLCA
  instructions[0x07] = (): void => {
    // This instruction is implemented as a special case of the
    //  more general Z80-specific RLC instruction.
    // Specifially, RLCA is a version of RLC A that affects fewer flags.
    // The same applies to RRCA, RLA, and RRA.
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rlc(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x08 : EX AF, AF'
  instructions[0x08] = (): void => {
    let temp = cpu.a;
    cpu.a = cpu.a_prime;
    cpu.a_prime = temp;

    temp = get_flags_register();
    setFlagsRegister(cpu, get_flags_prime());
    set_flags_prime(temp);
  };
  // 0x09 : ADD HL, BC
  instructions[0x09] = (): void => {
    do_hl_add(cpu.c | (cpu.b << 8));
  };
  // 0x0a : LD A, (BC)
  instructions[0x0a] = (): void => {
    cpu.a = cb.mem_read(cpu.c | (cpu.b << 8));
  };
  // 0x0b : DEC BC
  instructions[0x0b] = (): void => {
    let result = cpu.c | (cpu.b << 8);
    result -= 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;
  };
  // 0x0c : INC C
  instructions[0x0c] = (): void => {
    cpu.c = do_inc(cpu.c);
  };
  // 0x0d : DEC C
  instructions[0x0d] = (): void => {
    cpu.c = do_dec(cpu.c);
  };
  // 0x0e : LD C, n
  instructions[0x0e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.c = cb.mem_read(cpu.pc);
  };
  // 0x0f : RRCA
  instructions[0x0f] = (): void => {
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rrc(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x10 : DJNZ nn
  instructions[0x10] = (): void => {
    cpu.b = (cpu.b - 1) & 0xff;
    do_conditional_relative_jump(cpu.b !== 0);
  };
  // 0x11 : LD DE, nn
  instructions[0x11] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.e = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.d = cb.mem_read(cpu.pc);
  };
  // 0x12 : LD (DE), A
  instructions[0x12] = (): void => {
    cb.mem_write(cpu.e | (cpu.d << 8), cpu.a);
  };
  // 0x13 : INC DE
  instructions[0x13] = (): void => {
    let result = cpu.e | (cpu.d << 8);
    result += 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
  };
  // 0x14 : INC D
  instructions[0x14] = (): void => {
    cpu.d = do_inc(cpu.d);
  };
  // 0x15 : DEC D
  instructions[0x15] = (): void => {
    cpu.d = do_dec(cpu.d);
  };
  // 0x16 : LD D, n
  instructions[0x16] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.d = cb.mem_read(cpu.pc);
  };
  // 0x17 : RLA
  instructions[0x17] = (): void => {
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rl(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x18 : JR n
  instructions[0x18] = (): void => {
    const offset = get_signed_offset_byte(cb.mem_read((cpu.pc + 1) & 0xffff));
    cpu.pc = (cpu.pc + offset + 1) & 0xffff;
  };
  // 0x19 : ADD HL, DE
  instructions[0x19] = (): void => {
    do_hl_add(cpu.e | (cpu.d << 8));
  };
  // 0x1a : LD A, (DE)
  instructions[0x1a] = (): void => {
    cpu.a = cb.mem_read(cpu.e | (cpu.d << 8));
  };
  // 0x1b : DEC DE
  instructions[0x1b] = (): void => {
    let result = cpu.e | (cpu.d << 8);
    result -= 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
  };
  // 0x1c : INC E
  instructions[0x1c] = (): void => {
    cpu.e = do_inc(cpu.e);
  };
  // 0x1d : DEC E
  instructions[0x1d] = (): void => {
    cpu.e = do_dec(cpu.e);
  };
  // 0x1e : LD E, n
  instructions[0x1e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.e = cb.mem_read(cpu.pc);
  };
  // 0x1f : RRA
  instructions[0x1f] = (): void => {
    const temp_s = cpu.flags.S;
    const temp_z = cpu.flags.Z;
    const temp_p = cpu.flags.P;
    cpu.a = do_rr(cpu.a);
    cpu.flags.S = temp_s;
    cpu.flags.Z = temp_z;
    cpu.flags.P = temp_p;
  };
  // 0x20 : JR NZ, n
  instructions[0x20] = (): void => {
    do_conditional_relative_jump(!cpu.flags.Z);
  };
  // 0x21 : LD HL, nn
  instructions[0x21] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.l = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.h = cb.mem_read(cpu.pc);
  };
  // 0x22 : LD (nn), HL
  instructions[0x22] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.l);
    cb.mem_write((address + 1) & 0xffff, cpu.h);
  };
  // 0x23 : INC HL
  instructions[0x23] = (): void => {
    let result = cpu.l | (cpu.h << 8);
    result += 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
  };
  // 0x24 : INC H
  instructions[0x24] = (): void => {
    cpu.h = do_inc(cpu.h);
  };
  // 0x25 : DEC H
  instructions[0x25] = (): void => {
    cpu.h = do_dec(cpu.h);
  };
  // 0x26 : LD H, n
  instructions[0x26] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.h = cb.mem_read(cpu.pc);
  };
  // 0x27 : DAA
  instructions[0x27] = (): void => {
    let temp = cpu.a;
    if (!cpu.flags.N) {
      if (cpu.flags.H || (cpu.a & 0x0f) > 9) {
        temp += 0x06;
      }
      if (cpu.flags.C || cpu.a > 0x99) {
        temp += 0x60;
      }
    } else {
      if (cpu.flags.H || (cpu.a & 0x0f) > 9) {
        temp -= 0x06;
      }
      if (cpu.flags.C || cpu.a > 0x99) {
        temp -= 0x60;
      }
    }

    cpu.flags.S = temp & 0x80 ? 1 : 0;
    cpu.flags.Z = !(temp & 0xff) ? 1 : 0;
    cpu.flags.H = (cpu.a & 0x10) ^ (temp & 0x10) ? 1 : 0;
    cpu.flags.P = parity_bits[temp & 0xff] ?? 0;
    // DAA never clears the carry flag if it was already set,
    //  but it is able to set the carry flag if it was clear.
    // Don't ask me, I don't know.
    // Note also that we check for a BCD carry, instead of the usual.
    cpu.flags.C = cpu.flags.C || cpu.a > 0x99 ? 1 : 0;

    cpu.a = temp & 0xff;

    update_xy_flags(cpu.a);
  };
  // 0x28 : JR Z, n
  instructions[0x28] = (): void => {
    do_conditional_relative_jump(!!cpu.flags.Z);
  };
  // 0x29 : ADD HL, HL
  instructions[0x29] = (): void => {
    do_hl_add(cpu.l | (cpu.h << 8));
  };
  // 0x2a : LD HL, (nn)
  instructions[0x2a] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.l = cb.mem_read(address);
    cpu.h = cb.mem_read((address + 1) & 0xffff);
  };
  // 0x2b : DEC HL
  instructions[0x2b] = (): void => {
    let result = cpu.l | (cpu.h << 8);
    result -= 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
  };
  // 0x2c : INC L
  instructions[0x2c] = (): void => {
    cpu.l = do_inc(cpu.l);
  };
  // 0x2d : DEC L
  instructions[0x2d] = (): void => {
    cpu.l = do_dec(cpu.l);
  };
  // 0x2e : LD L, n
  instructions[0x2e] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.l = cb.mem_read(cpu.pc);
  };
  // 0x2f : CPL
  instructions[0x2f] = (): void => {
    cpu.a = ~cpu.a & 0xff;
    cpu.flags.N = 1;
    cpu.flags.H = 1;
    update_xy_flags(cpu.a);
  };
  // 0x30 : JR NC, n
  instructions[0x30] = (): void => {
    do_conditional_relative_jump(!cpu.flags.C);
  };
  // 0x31 : LD SP, nn
  instructions[0x31] = (): void => {
    cpu.sp = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
    cpu.pc = (cpu.pc + 2) & 0xffff;
  };
  // 0x32 : LD (nn), A
  instructions[0x32] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.a);
  };
  // 0x33 : INC SP
  instructions[0x33] = (): void => {
    cpu.sp = (cpu.sp + 1) & 0xffff;
  };
  // 0x34 : INC (HL)
  instructions[0x34] = (): void => {
    const address = cpu.l | (cpu.h << 8);
    cb.mem_write(address, do_inc(cb.mem_read(address)));
  };
  // 0x35 : DEC (HL)
  instructions[0x35] = (): void => {
    const address = cpu.l | (cpu.h << 8);
    cb.mem_write(address, do_dec(cb.mem_read(address)));
  };
  // 0x36 : LD (HL), n
  instructions[0x36] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cb.mem_write(cpu.l | (cpu.h << 8), cb.mem_read(cpu.pc));
  };
  // 0x37 : SCF
  instructions[0x37] = (): void => {
    cpu.flags.N = 0;
    cpu.flags.H = 0;
    cpu.flags.C = 1;
    update_xy_flags(cpu.a);
  };
  // 0x38 : JR C, n
  instructions[0x38] = (): void => {
    do_conditional_relative_jump(!!cpu.flags.C);
  };
  // 0x39 : ADD HL, SP
  instructions[0x39] = (): void => {
    do_hl_add(cpu.sp);
  };
  // 0x3a : LD A, (nn)
  instructions[0x3a] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.a = cb.mem_read(address);
  };
  // 0x3b : DEC SP
  instructions[0x3b] = (): void => {
    cpu.sp = (cpu.sp - 1) & 0xffff;
  };
  // 0x3c : INC A
  instructions[0x3c] = (): void => {
    cpu.a = do_inc(cpu.a);
  };
  // 0x3d : DEC A
  instructions[0x3d] = (): void => {
    cpu.a = do_dec(cpu.a);
  };
  // 0x3e : LD A, n
  instructions[0x3e] = (): void => {
    cpu.a = cb.mem_read((cpu.pc + 1) & 0xffff);
    cpu.pc = (cpu.pc + 1) & 0xffff;
  };
  // 0x3f : CCF
  instructions[0x3f] = (): void => {
    cpu.flags.N = 0;
    cpu.flags.H = cpu.flags.C;
    cpu.flags.C = cpu.flags.C ? 0 : 1;
    update_xy_flags(cpu.a);
  };

  // ==========================================================================
  // 0xC0-0xFF: CONTROL FLOW / STACK / PREFIX / IMMEDIATE ALU
  // ==========================================================================

  // 0xc0 : RET NZ
  instructions[0xc0] = (): void => {
    do_conditional_return(!cpu.flags.Z);
  };
  // 0xc1 : POP BC
  instructions[0xc1] = (): void => {
    const result = pop_word();
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;
  };
  // 0xc2 : JP NZ, nn
  instructions[0xc2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.Z);
  };
  // 0xc3 : JP nn
  instructions[0xc3] = (): void => {
    cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
    cpu.pc = (cpu.pc - 1) & 0xffff;
  };
  // 0xc4 : CALL NZ, nn
  instructions[0xc4] = (): void => {
    do_conditional_call(!cpu.flags.Z);
  };
  // 0xc5 : PUSH BC
  instructions[0xc5] = (): void => {
    pushWord(cpu, cb, cpu.c | (cpu.b << 8));
  };
  // 0xc6 : ADD A, n
  instructions[0xc6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_add(cb.mem_read(cpu.pc));
  };
  // 0xc7 : RST 00h
  instructions[0xc7] = (): void => {
    do_reset(0x00);
  };
  // 0xc8 : RET Z
  instructions[0xc8] = (): void => {
    do_conditional_return(!!cpu.flags.Z);
  };
  // 0xc9 : RET
  instructions[0xc9] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
  };
  // 0xca : JP Z, nn
  instructions[0xca] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.Z);
  };

  // CB prefix handler (bit operations)
  instructions[0xcb] = cbHandler;
  // 0xcc : CALL Z, nn
  instructions[0xcc] = (): void => {
    do_conditional_call(!!cpu.flags.Z);
  };
  // 0xcd : CALL nn
  instructions[0xcd] = (): void => {
    pushWord(cpu, cb, (cpu.pc + 3) & 0xffff);
    cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
    cpu.pc = (cpu.pc - 1) & 0xffff;
  };
  // 0xce : ADC A, n
  instructions[0xce] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_adc(cb.mem_read(cpu.pc));
  };
  // 0xcf : RST 08h
  instructions[0xcf] = (): void => {
    do_reset(0x08);
  };
  // 0xd0 : RET NC
  instructions[0xd0] = (): void => {
    do_conditional_return(!cpu.flags.C);
  };
  // 0xd1 : POP DE
  instructions[0xd1] = (): void => {
    const result = pop_word();
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
  };
  // 0xd2 : JP NC, nn
  instructions[0xd2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.C);
  };
  // 0xd3 : OUT (n), A
  instructions[0xd3] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cb.io_write((cpu.a << 8) | cb.mem_read(cpu.pc), cpu.a);
  };
  // 0xd4 : CALL NC, nn
  instructions[0xd4] = (): void => {
    do_conditional_call(!cpu.flags.C);
  };
  // 0xd5 : PUSH DE
  instructions[0xd5] = (): void => {
    pushWord(cpu, cb, cpu.e | (cpu.d << 8));
  };
  // 0xd6 : SUB n
  instructions[0xd6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_sub(cb.mem_read(cpu.pc));
  };
  // 0xd7 : RST 10h
  instructions[0xd7] = (): void => {
    do_reset(0x10);
  };
  // 0xd8 : RET C
  instructions[0xd8] = (): void => {
    do_conditional_return(!!cpu.flags.C);
  };
  // 0xd9 : EXX
  instructions[0xd9] = (): void => {
    let temp = cpu.b;
    cpu.b = cpu.b_prime;
    cpu.b_prime = temp;
    temp = cpu.c;
    cpu.c = cpu.c_prime;
    cpu.c_prime = temp;
    temp = cpu.d;
    cpu.d = cpu.d_prime;
    cpu.d_prime = temp;
    temp = cpu.e;
    cpu.e = cpu.e_prime;
    cpu.e_prime = temp;
    temp = cpu.h;
    cpu.h = cpu.h_prime;
    cpu.h_prime = temp;
    temp = cpu.l;
    cpu.l = cpu.l_prime;
    cpu.l_prime = temp;
  };
  // 0xda : JP C, nn
  instructions[0xda] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.C);
  };
  // 0xdb : IN A, (n)
  instructions[0xdb] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    cpu.a = cb.io_read((cpu.a << 8) | cb.mem_read(cpu.pc));
  };
  // 0xdc : CALL C, nn
  instructions[0xdc] = (): void => {
    do_conditional_call(!!cpu.flags.C);
  };
  // 0xdd : DD Prefix (IX instructions)
  instructions[0xdd] = ddHandler;
  // 0xde : SBC n
  instructions[0xde] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_sbc(cb.mem_read(cpu.pc));
  };
  // 0xdf : RST 18h
  instructions[0xdf] = (): void => {
    do_reset(0x18);
  };
  // 0xe0 : RET PO
  instructions[0xe0] = (): void => {
    do_conditional_return(!cpu.flags.P);
  };
  // 0xe1 : POP HL
  instructions[0xe1] = (): void => {
    const result = pop_word();
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
  };
  // 0xe2 : JP PO, (nn)
  instructions[0xe2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.P);
  };
  // 0xe3 : EX (SP), HL
  instructions[0xe3] = (): void => {
    let temp = cb.mem_read(cpu.sp);
    cb.mem_write(cpu.sp, cpu.l);
    cpu.l = temp;
    temp = cb.mem_read((cpu.sp + 1) & 0xffff);
    cb.mem_write((cpu.sp + 1) & 0xffff, cpu.h);
    cpu.h = temp;
  };
  // 0xe4 : CALL PO, nn
  instructions[0xe4] = (): void => {
    do_conditional_call(!cpu.flags.P);
  };
  // 0xe5 : PUSH HL
  instructions[0xe5] = (): void => {
    pushWord(cpu, cb, cpu.l | (cpu.h << 8));
  };
  // 0xe6 : AND n
  instructions[0xe6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_and(cb.mem_read(cpu.pc));
  };
  // 0xe7 : RST 20h
  instructions[0xe7] = (): void => {
    do_reset(0x20);
  };
  // 0xe8 : RET PE
  instructions[0xe8] = (): void => {
    do_conditional_return(!!cpu.flags.P);
  };
  // 0xe9 : JP (HL)
  instructions[0xe9] = (): void => {
    cpu.pc = cpu.l | (cpu.h << 8);
    cpu.pc = (cpu.pc - 1) & 0xffff;
  };
  // 0xea : JP PE, nn
  instructions[0xea] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.P);
  };
  // 0xeb : EX DE, HL
  instructions[0xeb] = (): void => {
    let temp = cpu.d;
    cpu.d = cpu.h;
    cpu.h = temp;
    temp = cpu.e;
    cpu.e = cpu.l;
    cpu.l = temp;
  };
  // 0xec : CALL PE, nn
  instructions[0xec] = (): void => {
    do_conditional_call(!!cpu.flags.P);
  };
  // 0xed : ED Prefix
  instructions[0xed] = edHandler;
  // 0xee : XOR n
  instructions[0xee] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_xor(cb.mem_read(cpu.pc));
  };
  // 0xef : RST 28h
  instructions[0xef] = (): void => {
    do_reset(0x28);
  };
  // 0xf0 : RET P
  instructions[0xf0] = (): void => {
    do_conditional_return(!cpu.flags.S);
  };
  // 0xf1 : POP AF
  instructions[0xf1] = (): void => {
    const result = pop_word();
    setFlagsRegister(cpu, result & 0xff);
    cpu.a = (result & 0xff00) >>> 8;
  };
  // 0xf2 : JP P, nn
  instructions[0xf2] = (): void => {
    do_conditional_absolute_jump(!cpu.flags.S);
  };
  // 0xf3 : DI
  instructions[0xf3] = (): void => {
    // DI doesn't actually take effect until after the next instruction.
    cpu.do_delayed_di = true;
  };
  // 0xf4 : CALL P, nn
  instructions[0xf4] = (): void => {
    do_conditional_call(!cpu.flags.S);
  };
  // 0xf5 : PUSH AF
  instructions[0xf5] = (): void => {
    pushWord(cpu, cb, get_flags_register() | (cpu.a << 8));
  };
  // 0xf6 : OR n
  instructions[0xf6] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_or(cb.mem_read(cpu.pc));
  };
  // 0xf7 : RST 30h
  instructions[0xf7] = (): void => {
    do_reset(0x30);
  };
  // 0xf8 : RET M
  instructions[0xf8] = (): void => {
    do_conditional_return(!!cpu.flags.S);
  };
  // 0xf9 : LD SP, HL
  instructions[0xf9] = (): void => {
    cpu.sp = cpu.l | (cpu.h << 8);
  };
  // 0xfa : JP M, nn
  instructions[0xfa] = (): void => {
    do_conditional_absolute_jump(!!cpu.flags.S);
  };
  // 0xfb : EI
  instructions[0xfb] = (): void => {
    // EI doesn't actually take effect until after the next instruction.
    cpu.do_delayed_ei = true;
  };
  // 0xfc : CALL M, nn
  instructions[0xfc] = (): void => {
    do_conditional_call(!!cpu.flags.S);
  };
  // ==========================================================================
  // FD PREFIX HANDLER (IY INSTRUCTIONS)
  // ==========================================================================
  instructions[0xfd] = fdHandler;
  // 0xfe : CP n
  instructions[0xfe] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    do_cp(cb.mem_read(cpu.pc));
  };
  // 0xff : RST 38h
  instructions[0xff] = (): void => {
    do_reset(0x38);
  };

  return instructions;
};

export const executePrimaryOpcode = (
  ctx: PrimaryInstructionContext,
  opcode: number,
  instructions: OpcodeTable
): void => {
  const { cpu, cb, do_add, do_adc, do_sub, do_sbc, do_and, do_xor, do_or, do_cp } = ctx;
  // ==========================================================================
  // DIRECT DECODER FOR REGULAR OPCODE RANGES
  // ==========================================================================
  // 0x40-0x7F is the 8-bit LD r,r' matrix and 0x80-0xBF is the ALU matrix.
  // These ranges are more readable as formulaic decoders than as 128 nearly
  // identical table entries.
  // ==========================================================================

  /**
   * Gets the operand value for register-based instructions.
   * Bits 0-2 of the opcode select the source register:
   * 0=B, 1=C, 2=D, 3=E, 4=H, 5=L, 6=(HL), 7=A
   */
  // eslint-disable-next-line no-shadow
  const get_operand = (opcode: number): number => {
    return (opcode & 0x07) === 0
      ? cpu.b
      : (opcode & 0x07) === 1
        ? cpu.c
        : (opcode & 0x07) === 2
          ? cpu.d
          : (opcode & 0x07) === 3
            ? cpu.e
            : (opcode & 0x07) === 4
              ? cpu.h
              : (opcode & 0x07) === 5
                ? cpu.l
                : (opcode & 0x07) === 6
                  ? cb.mem_read(cpu.l | (cpu.h << 8))
                  : cpu.a;
  };

  // Handle HALT right up front, because it fouls up our LD decoding
  //  by falling where LD (HL), (HL) ought to be.
  if (opcode === 0x76) {
    cpu.halted = true;
  } else if (opcode >= 0x40 && opcode < 0x80) {
    // This entire range is all 8-bit register loads.
    // Get the operand and assign it to the correct destination.
    const operand = get_operand(opcode);

    if ((opcode & 0x38) >>> 3 === 0) {
      cpu.b = operand;
    } else if ((opcode & 0x38) >>> 3 === 1) {
      cpu.c = operand;
    } else if ((opcode & 0x38) >>> 3 === 2) {
      cpu.d = operand;
    } else if ((opcode & 0x38) >>> 3 === 3) {
      cpu.e = operand;
    } else if ((opcode & 0x38) >>> 3 === 4) {
      cpu.h = operand;
    } else if ((opcode & 0x38) >>> 3 === 5) {
      cpu.l = operand;
    } else if ((opcode & 0x38) >>> 3 === 6) {
      cb.mem_write(cpu.l | (cpu.h << 8), operand);
    } else if ((opcode & 0x38) >>> 3 === 7) {
      cpu.a = operand;
    }
  } else if (opcode >= 0x80 && opcode < 0xc0) {
    // These are the 8-bit register ALU instructions.
    // We'll get the operand and then use this "jump table"
    //  to call the correct utility function for the instruction.
    const operand = get_operand(opcode);
    const op_array: ByteOpVoid[] = [do_add, do_adc, do_sub, do_sbc, do_and, do_xor, do_or, do_cp];

    const alu = getVoidOp(op_array, (opcode & 0x38) >>> 3);
    alu(operand);
  } else {
    // This is one of the less formulaic instructions;
    //  we'll get the specific function for it from our array.
    const func = instructions[opcode] ?? noop;
    func();
  }

  // Update the cycle counter with however many cycles
  //  the base instruction took.
  // If this was a prefixed instruction, then
  //  the prefix handler has added its extra cycles already.
  cpu.cycle_counter += cycle_counts[opcode] ?? 0;
};
