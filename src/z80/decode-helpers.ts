/**
 * @fileoverview Shared Z80 decode helpers extracted from decode.ts.
 */

import { parity_bits } from './constants.js';
import { flagsToByte, pushWord, setFlagsFromByte, updateXYFlags } from './core-helpers.js';
import {
  do_rl as do_rl_base,
  do_rlc as do_rlc_base,
  do_rr as do_rr_base,
  do_rrc as do_rrc_base,
  do_sla as do_sla_base,
  do_sll as do_sll_base,
  do_sra as do_sra_base,
  do_srl as do_srl_base,
} from './rotate.js';
import { Callbacks, Cpu } from './types.js';

export type DecoderHelpers = {
  get_signed_offset_byte: (value: number) => number;
  get_flags_register: () => number;
  get_flags_prime: () => number;
  set_flags_prime: (operand: number) => void;
  update_xy_flags: (result: number) => void;
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
  do_cp: (operand: number) => void;
  do_and: (operand: number) => void;
  do_or: (operand: number) => void;
  do_xor: (operand: number) => void;
  do_inc: (operand: number) => number;
  do_dec: (operand: number) => number;
  do_hl_add: (operand: number) => void;
  do_hl_adc: (operand: number) => void;
  do_hl_sbc: (operand: number) => void;
  do_in: (port: number) => number;
  do_neg: () => void;
  do_ldi: () => void;
  do_cpi: () => void;
  do_ini: () => void;
  do_outi: () => void;
  do_ldd: () => void;
  do_cpd: () => void;
  do_ind: () => void;
  do_outd: () => void;
  do_rlc: (operand: number) => number;
  do_rrc: (operand: number) => number;
  do_rl: (operand: number) => number;
  do_rr: (operand: number) => number;
  do_sla: (operand: number) => number;
  do_sra: (operand: number) => number;
  do_sll: (operand: number) => number;
  do_srl: (operand: number) => number;
  do_ix_add: (operand: number) => void;
};

export const buildDecoderHelpers = (cpu: Cpu, cb: Callbacks): DecoderHelpers => {
  /**
   * Converts an unsigned byte to a signed offset (-128 to 127).
   * Used for relative jumps and indexed addressing.
   */
  const get_signed_offset_byte = (value: number): number => {
    value &= 0xff;
    if (value & 0x80) {
      value = -((0xff & ~value) + 1);
    }
    return value;
  };

  const get_flags_register = (): number => flagsToByte(cpu.flags);

  const get_flags_prime = (): number => flagsToByte(cpu.flags_prime);

  const set_flags_prime = (operand: number): void => {
    setFlagsFromByte(cpu.flags_prime, operand);
  };

  const update_xy_flags = (result: number): void => {
    updateXYFlags(cpu.flags, result);
  };

  const pop_word = (): number => {
    let retval = cb.mem_read(cpu.sp) & 0xff;
    cpu.sp = (cpu.sp + 1) & 0xffff;
    retval |= cb.mem_read(cpu.sp) << 8;
    cpu.sp = (cpu.sp + 1) & 0xffff;
    return retval;
  };

  const do_conditional_absolute_jump = (condition: boolean): void => {
    if (condition) {
      cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
      cpu.pc = (cpu.pc - 1) & 0xffff;
    } else {
      cpu.pc = (cpu.pc + 2) & 0xffff;
    }
  };

  const do_conditional_relative_jump = (condition: boolean): void => {
    if (condition) {
      cpu.cycle_counter += 5;
      const offset = get_signed_offset_byte(cb.mem_read((cpu.pc + 1) & 0xffff));
      cpu.pc = (cpu.pc + offset + 1) & 0xffff;
    } else {
      cpu.pc = (cpu.pc + 1) & 0xffff;
    }
  };

  const do_conditional_call = (condition: boolean): void => {
    if (condition) {
      cpu.cycle_counter += 7;
      pushWord(cpu, cb, (cpu.pc + 3) & 0xffff);
      cpu.pc = cb.mem_read((cpu.pc + 1) & 0xffff) | (cb.mem_read((cpu.pc + 2) & 0xffff) << 8);
      cpu.pc = (cpu.pc - 1) & 0xffff;
    } else {
      cpu.pc = (cpu.pc + 2) & 0xffff;
    }
  };

  const do_conditional_return = (condition: boolean): void => {
    if (condition) {
      cpu.cycle_counter += 6;
      cpu.pc = (pop_word() - 1) & 0xffff;
    }
  };

  const do_reset = (address: number): void => {
    pushWord(cpu, cb, (cpu.pc + 1) & 0xffff);
    cpu.pc = (address - 1) & 0xffff;
  };

  const do_add = (operand: number): void => {
    const result = cpu.a + operand;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((operand & 0x0f) + (cpu.a & 0x0f)) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) === (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_adc = (operand: number): void => {
    const result = cpu.a + operand + cpu.flags.C;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((operand & 0x0f) + (cpu.a & 0x0f) + cpu.flags.C) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) === (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_sub = (operand: number): void => {
    const result = cpu.a - operand;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((cpu.a & 0x0f) - (operand & 0x0f)) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) !== (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_sbc = (operand: number): void => {
    const result = cpu.a - operand - cpu.flags.C;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = ((cpu.a & 0x0f) - (operand & 0x0f) - cpu.flags.C) & 0x10 ? 1 : 0;
    cpu.flags.P = (cpu.a & 0x80) !== (operand & 0x80) && (cpu.a & 0x80) !== (result & 0x80) ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = result & 0x100 ? 1 : 0;

    cpu.a = result & 0xff;
    update_xy_flags(cpu.a);
  };

  const do_cp = (operand: number): void => {
    const temp = cpu.a;
    do_sub(operand);
    cpu.a = temp;
  };

  const do_and = (operand: number): void => {
    cpu.a &= operand & 0xff;

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = 1;
    cpu.flags.P = parity_bits[cpu.a] ?? 0;
    cpu.flags.N = 0;
    cpu.flags.C = 0;
    update_xy_flags(cpu.a);
  };

  const do_or = (operand: number): void => {
    cpu.a = (operand | cpu.a) & 0xff;

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = parity_bits[cpu.a] ?? 0;
    cpu.flags.N = 0;
    cpu.flags.C = 0;
    update_xy_flags(cpu.a);
  };

  const do_xor = (operand: number): void => {
    cpu.a = (operand ^ cpu.a) & 0xff;

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = parity_bits[cpu.a] ?? 0;
    cpu.flags.N = 0;
    cpu.flags.C = 0;
    update_xy_flags(cpu.a);
  };

  const do_inc = (operand: number): number => {
    let result = operand + 1;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = (operand & 0x0f) === 0x0f ? 1 : 0;
    cpu.flags.P = operand === 0x7f ? 1 : 0;
    cpu.flags.N = 0;

    result &= 0xff;
    update_xy_flags(result);

    return result;
  };

  const do_dec = (operand: number): number => {
    let result = operand - 1;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = !(result & 0xff) ? 1 : 0;
    cpu.flags.H = (operand & 0x0f) === 0x00 ? 1 : 0;
    cpu.flags.P = operand === 0x80 ? 1 : 0;
    cpu.flags.N = 1;

    result &= 0xff;
    update_xy_flags(result);

    return result;
  };

  const do_hl_add = (operand: number): void => {
    // The HL arithmetic instructions are the same as the A ones,
    //  just with twice as many bits happening.
    const hl = cpu.l | (cpu.h << 8);
    const result = hl + operand;

    cpu.flags.N = 0;
    cpu.flags.C = result & 0x10000 ? 1 : 0;
    cpu.flags.H = ((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;

    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    update_xy_flags(cpu.h);
  };

  const do_hl_adc = (operand: number): void => {
    operand += cpu.flags.C;
    const hl = cpu.l | (cpu.h << 8);
    const result = hl + operand;

    cpu.flags.S = result & 0x8000 ? 1 : 0;
    cpu.flags.Z = !(result & 0xffff) ? 1 : 0;
    cpu.flags.H = ((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000 ? 1 : 0;
    cpu.flags.P =
      (hl & 0x8000) === (operand & 0x8000) && (result & 0x8000) !== (hl & 0x8000) ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.C = result & 0x10000 ? 1 : 0;

    cpu.l = result & 0xff;
    cpu.h = (result >>> 8) & 0xff;

    update_xy_flags(cpu.h);
  };

  const do_hl_sbc = (operand: number): void => {
    operand += cpu.flags.C;
    const hl = cpu.l | (cpu.h << 8);
    const result = hl - operand;

    cpu.flags.S = result & 0x8000 ? 1 : 0;
    cpu.flags.Z = !(result & 0xffff) ? 1 : 0;
    cpu.flags.H = ((hl & 0x0fff) - (operand & 0x0fff)) & 0x1000 ? 1 : 0;
    cpu.flags.P =
      (hl & 0x8000) !== (operand & 0x8000) && (result & 0x8000) !== (hl & 0x8000) ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = result & 0x10000 ? 1 : 0;

    cpu.l = result & 0xff;
    cpu.h = (result >>> 8) & 0xff;

    update_xy_flags(cpu.h);
  };

  const do_in = (port: number): number => {
    const result = cb.io_read(port) & 0xff;

    cpu.flags.S = result & 0x80 ? 1 : 0;
    cpu.flags.Z = result === 0 ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = (parity_bits[result] ?? 0) === 1 ? 1 : 0;
    cpu.flags.N = 0;
    update_xy_flags(result);

    return result;
  };

  const do_neg = (): void => {
    if (cpu.a !== 0x80) {
      cpu.a = get_signed_offset_byte(cpu.a);
      cpu.a = -cpu.a & 0xff;
    }

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = !cpu.a ? 1 : 0;
    cpu.flags.H = (-cpu.a & 0x0f) > 0 ? 1 : 0;
    cpu.flags.P = cpu.a === 0x80 ? 1 : 0;
    cpu.flags.N = 1;
    cpu.flags.C = cpu.a ? 1 : 0;
    update_xy_flags(cpu.a);
  };

  const do_ldi = (): void => {
    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    cb.mem_write(cpu.e | (cpu.d << 8), read_value);

    let result = (cpu.e | (cpu.d << 8)) + 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
    result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.H = 0;
    cpu.flags.P = cpu.c || cpu.b ? 1 : 0;
    cpu.flags.N = 0;
    cpu.flags.Y = ((cpu.a + read_value) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a + read_value) & 0x08) >>> 3;
  };

  const do_cpi = (): void => {
    const temp_carry = cpu.flags.C;
    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    do_cp(read_value);
    cpu.flags.C = temp_carry;
    cpu.flags.Y = ((cpu.a - read_value - cpu.flags.H) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a - read_value - cpu.flags.H) & 0x08) >>> 3;

    let result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.P = result ? 1 : 0;
  };

  const do_ini = (): void => {
    cpu.b = do_dec(cpu.b);

    cb.mem_write(cpu.l | (cpu.h << 8), cb.io_read((cpu.b << 8) | cpu.c));

    const result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.flags.N = 1;
  };

  const do_outi = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cb.mem_read(cpu.l | (cpu.h << 8)));

    const result = (cpu.l | (cpu.h << 8)) + 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.b = do_dec(cpu.b);
    cpu.flags.N = 1;
  };

  const do_ldd = (): void => {
    cpu.flags.N = 0;
    cpu.flags.H = 0;

    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    cb.mem_write(cpu.e | (cpu.d << 8), read_value);

    let result = (cpu.e | (cpu.d << 8)) - 1;
    cpu.e = result & 0xff;
    cpu.d = (result & 0xff00) >>> 8;
    result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.P = cpu.c || cpu.b ? 1 : 0;
    cpu.flags.Y = ((cpu.a + read_value) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a + read_value) & 0x08) >>> 3;
  };

  const do_cpd = (): void => {
    const temp_carry = cpu.flags.C;
    const read_value = cb.mem_read(cpu.l | (cpu.h << 8));
    do_cp(read_value);
    cpu.flags.C = temp_carry;
    cpu.flags.Y = ((cpu.a - read_value - cpu.flags.H) & 0x02) >>> 1;
    cpu.flags.X = ((cpu.a - read_value - cpu.flags.H) & 0x08) >>> 3;

    let result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;
    result = (cpu.c | (cpu.b << 8)) - 1;
    cpu.c = result & 0xff;
    cpu.b = (result & 0xff00) >>> 8;

    cpu.flags.P = result ? 1 : 0;
  };

  const do_ind = (): void => {
    cpu.b = do_dec(cpu.b);

    cb.mem_write(cpu.l | (cpu.h << 8), cb.io_read((cpu.b << 8) | cpu.c));

    const result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.flags.N = 1;
  };

  const do_outd = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cb.mem_read(cpu.l | (cpu.h << 8)));

    const result = (cpu.l | (cpu.h << 8)) - 1;
    cpu.l = result & 0xff;
    cpu.h = (result & 0xff00) >>> 8;

    cpu.b = do_dec(cpu.b);
    cpu.flags.N = 1;
  };

  const do_rlc = (operand: number): number => do_rlc_base(cpu, operand);

  const do_rrc = (operand: number): number => do_rrc_base(cpu, operand);

  const do_rl = (operand: number): number => do_rl_base(cpu, operand);

  const do_rr = (operand: number): number => do_rr_base(cpu, operand);

  const do_sla = (operand: number): number => do_sla_base(cpu, operand);

  const do_sra = (operand: number): number => do_sra_base(cpu, operand);

  const do_sll = (operand: number): number => do_sll_base(cpu, operand);

  const do_srl = (operand: number): number => do_srl_base(cpu, operand);

  const do_ix_add = (operand: number): void => {
    cpu.flags.N = 0;

    const result = cpu.ix + operand;

    cpu.flags.C = result & 0x10000 ? 1 : 0;
    cpu.flags.H = ((cpu.ix & 0xfff) + (operand & 0xfff)) & 0x1000 ? 1 : 0;
    update_xy_flags((result & 0xff00) >>> 8);

    cpu.ix = result & 0xffff;
  };

  return {
    get_signed_offset_byte,
    get_flags_register,
    get_flags_prime,
    set_flags_prime,
    update_xy_flags,
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
    do_cp,
    do_and,
    do_or,
    do_xor,
    do_inc,
    do_dec,
    do_hl_add,
    do_hl_adc,
    do_hl_sbc,
    do_in,
    do_neg,
    do_ldi,
    do_cpi,
    do_ini,
    do_outi,
    do_ldd,
    do_cpd,
    do_ind,
    do_outd,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
    do_ix_add,
  };
};
