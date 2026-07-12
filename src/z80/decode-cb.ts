/**
 * @fileoverview Z80 CB prefix decoder.
 */

import { cycle_counts_cb } from './constants.js';
import { OpcodeHandler } from './opcode-types.js';
import { Callbacks, Cpu } from './types.js';

type ByteOpHandler = (value: number) => number;

export type CbContext = {
  cpu: Cpu;
  cb: Callbacks;
  do_rlc: (value: number) => number;
  do_rrc: (value: number) => number;
  do_rl: (value: number) => number;
  do_rr: (value: number) => number;
  do_sla: (value: number) => number;
  do_sra: (value: number) => number;
  do_sll: (value: number) => number;
  do_srl: (value: number) => number;
};

const getByteOp = (ops: ByteOpHandler[], index: number): ByteOpHandler =>
  ops[index] ?? ((value): number => value);

const executeCbCore = (cpu: Cpu, cb: Callbacks, ops: CbContext): void => {
  // R is incremented at the start of the second instruction cycle
  cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

  cpu.pc = (cpu.pc + 1) & 0xffff;
  const opcode1 = cb.mem_read(cpu.pc);
  const bit_number = (opcode1 & 0x38) >>> 3;
  const reg_code = opcode1 & 0x07;

  if (opcode1 < 0x40) {
    const op_array: ByteOpHandler[] = [
      ops.do_rlc,
      ops.do_rrc,
      ops.do_rl,
      ops.do_rr,
      ops.do_sla,
      ops.do_sra,
      ops.do_sll,
      ops.do_srl,
    ];
    const rotate = getByteOp(op_array, bit_number);

    if (reg_code === 0) {
      cpu.b = rotate(cpu.b);
    } else if (reg_code === 1) {
      cpu.c = rotate(cpu.c);
    } else if (reg_code === 2) {
      cpu.d = rotate(cpu.d);
    } else if (reg_code === 3) {
      cpu.e = rotate(cpu.e);
    } else if (reg_code === 4) {
      cpu.h = rotate(cpu.h);
    } else if (reg_code === 5) {
      cpu.l = rotate(cpu.l);
    } else if (reg_code === 6) {
      cb.mem_write(cpu.l | (cpu.h << 8), rotate(cb.mem_read(cpu.l | (cpu.h << 8))));
    } else if (reg_code === 7) {
      cpu.a = rotate(cpu.a);
    }
  } else if (opcode1 < 0x80) {
    if (reg_code === 0) {
      cpu.flags.Z = !(cpu.b & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 1) {
      cpu.flags.Z = !(cpu.c & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 2) {
      cpu.flags.Z = !(cpu.d & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 3) {
      cpu.flags.Z = !(cpu.e & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 4) {
      cpu.flags.Z = !(cpu.h & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 5) {
      cpu.flags.Z = !(cpu.l & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 6) {
      cpu.flags.Z = !(cb.mem_read(cpu.l | (cpu.h << 8)) & (1 << bit_number)) ? 1 : 0;
    } else if (reg_code === 7) {
      cpu.flags.Z = !(cpu.a & (1 << bit_number)) ? 1 : 0;
    }

    cpu.flags.N = 0;
    cpu.flags.H = 1;
    cpu.flags.P = cpu.flags.Z;
    cpu.flags.S = bit_number === 7 && !cpu.flags.Z ? 1 : 0;
    cpu.flags.Y = bit_number === 5 && !cpu.flags.Z ? 1 : 0;
    cpu.flags.X = bit_number === 3 && !cpu.flags.Z ? 1 : 0;
  } else if (opcode1 < 0xc0) {
    if (reg_code === 0) {
      cpu.b &= 0xff & ~(1 << bit_number);
    } else if (reg_code === 1) {
      cpu.c &= 0xff & ~(1 << bit_number);
    } else if (reg_code === 2) {
      cpu.d &= 0xff & ~(1 << bit_number);
    } else if (reg_code === 3) {
      cpu.e &= 0xff & ~(1 << bit_number);
    } else if (reg_code === 4) {
      cpu.h &= 0xff & ~(1 << bit_number);
    } else if (reg_code === 5) {
      cpu.l &= 0xff & ~(1 << bit_number);
    } else if (reg_code === 6) {
      cb.mem_write(cpu.l | (cpu.h << 8), cb.mem_read(cpu.l | (cpu.h << 8)) & ~(1 << bit_number));
    } else if (reg_code === 7) {
      cpu.a &= 0xff & ~(1 << bit_number);
    }
  } else {
    if (reg_code === 0) {
      cpu.b |= 1 << bit_number;
    } else if (reg_code === 1) {
      cpu.c |= 1 << bit_number;
    } else if (reg_code === 2) {
      cpu.d |= 1 << bit_number;
    } else if (reg_code === 3) {
      cpu.e |= 1 << bit_number;
    } else if (reg_code === 4) {
      cpu.h |= 1 << bit_number;
    } else if (reg_code === 5) {
      cpu.l |= 1 << bit_number;
    } else if (reg_code === 6) {
      cb.mem_write(cpu.l | (cpu.h << 8), cb.mem_read(cpu.l | (cpu.h << 8)) | (1 << bit_number));
    } else if (reg_code === 7) {
      cpu.a |= 1 << bit_number;
    }
  }

  cpu.cycle_counter += cycle_counts_cb[opcode1] ?? 0;
};

export const buildCbHandler = (ctx: CbContext): OpcodeHandler => {
  const { cpu, cb } = ctx;
  return (): void => {
    executeCbCore(cpu, cb, ctx);
  };
};
