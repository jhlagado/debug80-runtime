/**
 * @fileoverview Z80 ED prefix decoder.
 */

import { cycle_counts, cycle_counts_ed, parity_bits } from './constants.js';
import { noop, OpcodeHandler, OpcodeTable } from './opcode-types.js';
import { Callbacks, Cpu } from './types.js';

export type EdContext = {
  cpu: Cpu;
  cb: Callbacks;
  do_in: (value: number) => number;
  do_hl_sbc: (value: number) => void;
  do_hl_adc: (value: number) => void;
  do_neg: () => void;
  pop_word: () => number;
  update_xy_flags: (value: number) => void;
  do_ldi: () => void;
  do_cpi: () => void;
  do_ini: () => void;
  do_outi: () => void;
  do_ldd: () => void;
  do_cpd: () => void;
  do_ind: () => void;
  do_outd: () => void;
};

export type EdHandlerContext = {
  cpu: Cpu;
  cb: Callbacks;
  edInstructions: OpcodeTable;
};

/**
 * Builds the ED prefix instruction table (extended operations).
 */
export function buildEdInstructions(ctx: EdContext): OpcodeTable {
  const {
    cpu,
    cb,
    do_in,
    do_hl_sbc,
    do_hl_adc,
    do_neg,
    pop_word,
    update_xy_flags,
    do_ldi,
    do_cpi,
    do_ini,
    do_outi,
    do_ldd,
    do_cpd,
    do_ind,
    do_outd,
  } = ctx;

  const ed_instructions: OpcodeTable = new Array<OpcodeHandler>(256).fill(noop);
  ed_instructions[0x40] = (): void => {
    cpu.b = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x41] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.b);
  };
  ed_instructions[0x42] = (): void => {
    do_hl_sbc(cpu.c | (cpu.b << 8));
  };
  ed_instructions[0x43] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.c);
    cb.mem_write((address + 1) & 0xffff, cpu.b);
  };
  ed_instructions[0x44] = (): void => {
    do_neg();
  };
  ed_instructions[0x45] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x46] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x47] = (): void => {
    cpu.i = cpu.a;
  };
  ed_instructions[0x48] = (): void => {
    cpu.c = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x49] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.c);
  };
  ed_instructions[0x4a] = (): void => {
    do_hl_adc(cpu.c | (cpu.b << 8));
  };
  ed_instructions[0x4b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.c = cb.mem_read(address);
    cpu.b = cb.mem_read((address + 1) & 0xffff);
  };
  ed_instructions[0x4c] = (): void => {
    do_neg();
  };
  ed_instructions[0x4d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
  };
  ed_instructions[0x4e] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x4f] = (): void => {
    cpu.r = cpu.a;
  };
  ed_instructions[0x50] = (): void => {
    cpu.d = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x51] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.d);
  };
  ed_instructions[0x52] = (): void => {
    do_hl_sbc(cpu.e | (cpu.d << 8));
  };
  ed_instructions[0x53] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.e);
    cb.mem_write((address + 1) & 0xffff, cpu.d);
  };
  ed_instructions[0x54] = (): void => {
    do_neg();
  };
  ed_instructions[0x55] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x56] = (): void => {
    cpu.imode = 1;
  };
  ed_instructions[0x57] = (): void => {
    cpu.a = cpu.i;
    cpu.flags.S = cpu.i & 0x80 ? 1 : 0;
    cpu.flags.Z = cpu.i ? 0 : 1;
    cpu.flags.H = 0;
    cpu.flags.P = cpu.iff2;
    cpu.flags.N = 0;
  };
  ed_instructions[0x58] = (): void => {
    cpu.e = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x59] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.e);
  };
  ed_instructions[0x5a] = (): void => {
    do_hl_adc(cpu.e | (cpu.d << 8));
  };
  ed_instructions[0x5b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.e = cb.mem_read(address);
    cpu.d = cb.mem_read((address + 1) & 0xffff);
  };
  ed_instructions[0x5c] = (): void => {
    do_neg();
  };
  ed_instructions[0x5d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x5e] = (): void => {
    cpu.imode = 2;
  };
  ed_instructions[0x5f] = (): void => {
    cpu.a = cpu.r;
    cpu.flags.P = cpu.iff2;
  };
  ed_instructions[0x60] = (): void => {
    cpu.h = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x61] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.h);
  };
  ed_instructions[0x62] = (): void => {
    do_hl_sbc(cpu.l | (cpu.h << 8));
  };
  ed_instructions[0x63] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.l);
    cb.mem_write((address + 1) & 0xffff, cpu.h);
  };
  ed_instructions[0x64] = (): void => {
    do_neg();
  };
  ed_instructions[0x65] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x66] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x67] = (): void => {
    let hl_value = cb.mem_read(cpu.l | (cpu.h << 8));
    const temp1 = hl_value & 0x0f;
    const temp2 = cpu.a & 0x0f;
    hl_value = ((hl_value & 0xf0) >>> 4) | (temp2 << 4);
    cpu.a = (cpu.a & 0xf0) | temp1;
    cb.mem_write(cpu.l | (cpu.h << 8), hl_value);

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = cpu.a === 0 ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = (parity_bits[cpu.a] ?? 0) === 1 ? 1 : 0;
    cpu.flags.N = 0;
    update_xy_flags(cpu.a);
  };
  ed_instructions[0x68] = (): void => {
    cpu.l = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x69] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.l);
  };
  ed_instructions[0x6a] = (): void => {
    do_hl_adc(cpu.l | (cpu.h << 8));
  };
  ed_instructions[0x6b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.l = cb.mem_read(address);
    cpu.h = cb.mem_read((address + 1) & 0xffff);
  };
  ed_instructions[0x6c] = (): void => {
    do_neg();
  };
  ed_instructions[0x6d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x6e] = (): void => {
    cpu.imode = 0;
  };
  ed_instructions[0x6f] = (): void => {
    let hl_value = cb.mem_read(cpu.l | (cpu.h << 8));
    const temp1 = hl_value & 0xf0;
    const temp2 = cpu.a & 0x0f;
    hl_value = ((hl_value & 0x0f) << 4) | temp2;
    cpu.a = (cpu.a & 0xf0) | (temp1 >>> 4);
    cb.mem_write(cpu.l | (cpu.h << 8), hl_value);

    cpu.flags.S = cpu.a & 0x80 ? 1 : 0;
    cpu.flags.Z = cpu.a === 0 ? 1 : 0;
    cpu.flags.H = 0;
    cpu.flags.P = (parity_bits[cpu.a] ?? 0) === 1 ? 1 : 0;
    cpu.flags.N = 0;
    update_xy_flags(cpu.a);
  };
  ed_instructions[0x70] = (): void => {
    do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x71] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, 0);
  };
  ed_instructions[0x72] = (): void => {
    do_hl_sbc(cpu.sp);
  };
  ed_instructions[0x73] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cb.mem_write(address, cpu.sp & 0xff);
    cb.mem_write((address + 1) & 0xffff, (cpu.sp >>> 8) & 0xff);
  };
  ed_instructions[0x74] = (): void => {
    do_neg();
  };
  ed_instructions[0x75] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x76] = (): void => {
    cpu.imode = 1;
  };
  ed_instructions[0x78] = (): void => {
    cpu.a = do_in((cpu.b << 8) | cpu.c);
  };
  ed_instructions[0x79] = (): void => {
    cb.io_write((cpu.b << 8) | cpu.c, cpu.a);
  };
  ed_instructions[0x7a] = (): void => {
    do_hl_adc(cpu.sp);
  };
  ed_instructions[0x7b] = (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    let address = cb.mem_read(cpu.pc);
    cpu.pc = (cpu.pc + 1) & 0xffff;
    address |= cb.mem_read(cpu.pc) << 8;

    cpu.sp = cb.mem_read(address);
    cpu.sp |= cb.mem_read((address + 1) & 0xffff) << 8;
  };
  ed_instructions[0x7c] = (): void => {
    do_neg();
  };
  ed_instructions[0x7d] = (): void => {
    cpu.pc = (pop_word() - 1) & 0xffff;
    cpu.iff1 = cpu.iff2;
  };
  ed_instructions[0x7e] = (): void => {
    cpu.imode = 2;
  };
  ed_instructions[0xa0] = (): void => {
    do_ldi();
  };
  ed_instructions[0xa1] = (): void => {
    do_cpi();
  };
  ed_instructions[0xa2] = (): void => {
    do_ini();
  };
  ed_instructions[0xa3] = (): void => {
    do_outi();
  };
  ed_instructions[0xa8] = (): void => {
    do_ldd();
  };
  ed_instructions[0xa9] = (): void => {
    do_cpd();
  };
  ed_instructions[0xaa] = (): void => {
    do_ind();
  };
  ed_instructions[0xab] = (): void => {
    do_outd();
  };
  ed_instructions[0xb0] = (): void => {
    do_ldi();
    if (cpu.b || cpu.c) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb1] = (): void => {
    do_cpi();
    if (!cpu.flags.Z && (cpu.b || cpu.c)) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb2] = (): void => {
    do_ini();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb3] = (): void => {
    do_outi();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb8] = (): void => {
    do_ldd();
    if (cpu.b || cpu.c) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xb9] = (): void => {
    do_cpd();
    if (!cpu.flags.Z && (cpu.b || cpu.c)) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xba] = (): void => {
    do_ind();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };
  ed_instructions[0xbb] = (): void => {
    do_outd();
    if (cpu.b) {
      cpu.cycle_counter += 5;
      cpu.pc = (cpu.pc - 2) & 0xffff;
    }
  };

  return ed_instructions;
}

export const buildEdHandler = (ctx: EdHandlerContext): OpcodeHandler => {
  const { cpu, cb, edInstructions } = ctx;

  return (): void => {
    // R is incremented at the start of the second instruction cycle,
    //  before the instruction actually runs.
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const func = edInstructions[opcode1] ?? noop;

    func();
    const edCycles = cycle_counts_ed[opcode1] ?? cycle_counts[0] ?? 0;
    cpu.cycle_counter += edCycles;
  };
};
