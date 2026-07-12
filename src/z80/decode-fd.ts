/**
 * @fileoverview Z80 FD prefix decoder.
 */

import { cycle_counts, cycle_counts_dd } from './constants.js';
import { noop, OpcodeHandler, OpcodeTable } from './opcode-types.js';
import { Callbacks, Cpu } from './types.js';

export type FdHandlerContext = {
  cpu: Cpu;
  cb: Callbacks;
  ddInstructions: OpcodeTable;
};

export const buildFdHandler = (ctx: FdHandlerContext): OpcodeHandler => {
  const { cpu, cb, ddInstructions } = ctx;

  return (): void => {
    // R is incremented at the start of the second instruction cycle
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    cpu.pc = (cpu.pc + 1) & 0xffff;
    const opcode1 = cb.mem_read(cpu.pc);
    const func = ddInstructions[opcode1] ?? noop;

    // Swap IX and IY, execute the DD instruction, then swap back
    const temp = cpu.ix;
    cpu.ix = cpu.iy;
    func();
    cpu.iy = cpu.ix;
    cpu.ix = temp;

    const fdCycles = cycle_counts_dd[opcode1] ?? cycle_counts[0] ?? 0;
    cpu.cycle_counter += fdCycles;
  };
};
