/**
 * @fileoverview Z80 DDCB/FDCB prefix decoder.
 */

import { cycle_counts_cb } from './constants.js';
import { OpcodeHandler } from './opcode-types.js';
import { Callbacks, Cpu } from './types.js';

type ByteOpHandler = (value: number) => number;

export type DdcbContext = {
  cpu: Cpu;
  cb: Callbacks;
  getSignedOffsetByte: (value: number) => number;
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

export const buildDdcbHandler = (ctx: DdcbContext): OpcodeHandler => {
  const { cpu, cb, getSignedOffsetByte } = ctx;

  return (): void => {
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const offset = getSignedOffsetByte(cb.mem_read(cpu.pc));
    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    let value: number | undefined;

    if (opcode1 < 0x40) {
      const ddcb_functions: ByteOpHandler[] = [
        ctx.do_rlc,
        ctx.do_rrc,
        ctx.do_rl,
        ctx.do_rr,
        ctx.do_sla,
        ctx.do_sra,
        ctx.do_sll,
        ctx.do_srl,
      ];

      const func = getByteOp(ddcb_functions, (opcode1 & 0x38) >>> 3);
      value = func(cb.mem_read((cpu.ix + offset) & 0xffff));

      cb.mem_write((cpu.ix + offset) & 0xffff, value);
    } else {
      const bit_number = (opcode1 & 0x38) >>> 3;

      if (opcode1 < 0x80) {
        cpu.flags.N = 0;
        cpu.flags.H = 1;
        cpu.flags.Z = !(cb.mem_read((cpu.ix + offset) & 0xffff) & (1 << bit_number)) ? 1 : 0;
        cpu.flags.P = cpu.flags.Z;
        cpu.flags.S = bit_number === 7 && !cpu.flags.Z ? 1 : 0;
      } else if (opcode1 < 0xc0) {
        value = cb.mem_read((cpu.ix + offset) & 0xffff) & ~(1 << bit_number) & 0xff;
        cb.mem_write((cpu.ix + offset) & 0xffff, value);
      } else {
        value = cb.mem_read((cpu.ix + offset) & 0xffff) | (1 << bit_number);
        cb.mem_write((cpu.ix + offset) & 0xffff, value);
      }
    }

    if (value !== undefined) {
      if ((opcode1 & 0x07) === 0) {
        cpu.b = value;
      } else if ((opcode1 & 0x07) === 1) {
        cpu.c = value;
      } else if ((opcode1 & 0x07) === 2) {
        cpu.d = value;
      } else if ((opcode1 & 0x07) === 3) {
        cpu.e = value;
      } else if ((opcode1 & 0x07) === 4) {
        cpu.h = value;
      } else if ((opcode1 & 0x07) === 5) {
        cpu.l = value;
      } else if ((opcode1 & 0x07) === 7) {
        cpu.a = value;
      }
    }

    cpu.cycle_counter += (cycle_counts_cb[opcode1] ?? 0) + 8;
  };
};
