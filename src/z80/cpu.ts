/**
 * @file Z80 CPU core implementation
 * @description Main CPU state and execution loop for Z80 emulation.
 *
 * NOTE: This module uses snake_case naming conventions for some properties
 * (e.g., cycle_counter, do_delayed_ei, mem_read) as it was ported from the
 * js8080 project. This naming is intentionally preserved to avoid breaking
 * changes to the emulator core.
 *
 * @module z80/cpu
 */

import { decodeInstruction } from './decode.js';
import { pushWord, setFlagsRegister } from './core-helpers.js';
import { Callbacks, Cpu } from './types.js';

export type { Callbacks, Cpu } from './types.js';

export function init(): Cpu {
  return {
    a: 0x00,
    b: 0x00,
    c: 0x00,
    d: 0x00,
    e: 0x00,
    h: 0x00,
    l: 0x00,
    // Now the special Z80 copies of the 8080 registers
    //  (the ones used for the SWAP instruction and such).
    a_prime: 0x00,
    b_prime: 0x00,
    c_prime: 0x00,
    d_prime: 0x00,
    e_prime: 0x00,
    h_prime: 0x00,
    l_prime: 0x00,
    // And now the Z80 index registers.
    ix: 0x0000,
    iy: 0x0000,
    // Then the "utility" registers: the interrupt vector,
    //  the memory refresh, the stack pointer, and the program counter.
    i: 0x00,
    r: 0x00,
    sp: 0xdff0,
    pc: 0x0000,
    // We don't keep an F register for the flags,
    //  because most of the time we're only accessing a single flag,
    //  so we optimize for that case and use utility functions
    //  for the rarer occasions when we need to access the whole register.
    flags: {
      S: 0,
      Z: 0,
      Y: 0,
      H: 0,
      X: 0,
      P: 0,
      N: 0,
      C: 0,
    },
    flags_prime: {
      S: 0,
      Z: 0,
      Y: 0,
      H: 0,
      X: 0,
      P: 0,
      N: 0,
      C: 0,
    },
    // And finally we have the interrupt mode and flip-flop registers.
    imode: 0,
    iff1: 0,
    iff2: 0,

    // These are all specific to this implementation, not Z80 features.
    // Keep track of whether we've had a HALT instruction called.
    halted: false,
    // EI and DI wait one instruction before they take effect,
    //  these flags tell us when we're in that wait state.
    do_delayed_di: false,
    do_delayed_ei: false,
    // This tracks the number of cycles spent in a single instruction run,
    //  including processing any prefixes and handling interrupts.
    cycle_counter: 0,
  };
}

// ////////////////////////////////////////////////////////////////////////////
// @public reset
//
// @brief Re-initialize the processor as if a reset or power on had occured
// ////////////////////////////////////////////////////////////////////////////
export const reset = (cpu: Cpu): void => {
  // These registers are the ones that have predictable states
  //  immediately following a power-on or a reset.
  // The others are left alone, because their states are unpredictable.
  cpu.sp = 0xdff0;
  cpu.pc = 0x0000;
  cpu.a = 0x00;
  cpu.r = 0x00;
  setFlagsRegister(cpu, 0);
  // Start up with interrupts disabled.
  cpu.imode = 0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  // Don't start halted or in a delayed DI or EI.
  cpu.halted = false;
  cpu.do_delayed_di = false;
  cpu.do_delayed_ei = false;
  // Obviously we've not used any cycles yet.
  cpu.cycle_counter = 0;
};

// ////////////////////////////////////////////////////////////////////////////
// @public run_instruction
//
// @brief Runs a single instruction
//
// @return The number of T cycles the instruction took to run,
//          plus any time that went into handling interrupts that fired
//          while this instruction was executing
// ////////////////////////////////////////////////////////////////////////////
export const execute = (cpu: Cpu, cb: Callbacks): number => {
  if (!cpu.halted) {
    // If the previous instruction was a DI or an EI,
    //  we'll need to disable or enable interrupts
    //  after whatever instruction we're about to run is finished.
    let doing_delayed_di = false;
    let doing_delayed_ei = false;
    if (cpu.do_delayed_di) {
      cpu.do_delayed_di = false;
      doing_delayed_di = true;
    } else if (cpu.do_delayed_ei) {
      cpu.do_delayed_ei = false;
      doing_delayed_ei = true;
    }

    // R is incremented at the start of every instruction cycle,
    //  before the instruction actually runs.
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    // Read the byte at the PC and run the instruction it encodes.
    const opcode = cb.mem_read(cpu.pc);
    decodeInstruction(cpu, cb, opcode);
    cpu.pc = (cpu.pc + 1) & 0xffff;

    // Actually do the delayed interrupt disable/enable if we have one.
    if (doing_delayed_di) {
      cpu.iff1 = 0;
      cpu.iff2 = 0;
    } else if (doing_delayed_ei) {
      cpu.iff1 = 1;
      cpu.iff2 = 1;
    }

    // And finally clear out the cycle counter for the next instruction
    //  before returning it to the emulator core.
    const retval = cpu.cycle_counter;
    cpu.cycle_counter = 0;
    return retval;
  }
  // While we're halted, claim that we spent a cycle doing nothing,
  //  so that the rest of the emulator can still proceed.
  return 1;
};

// ////////////////////////////////////////////////////////////////////////////
// @public interrupt
//
// @brief Simulates pulsing the processor's INT (or NMI) pin
//
// @param non_maskable - true if this is a non-maskable interrupt
// @param data - the value to be placed on the data bus, if needed
// ////////////////////////////////////////////////////////////////////////////
export const interrupt = (cpu: Cpu, cb: Callbacks, non_maskable: boolean, data: number): void => {
  if (non_maskable) {
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);
    // Non-maskable interrupts are always handled the same way;
    //  clear IFF1 and then do a CALL 0x0066.
    // Also, all interrupts reset the HALT state.
    cpu.halted = false;
    cpu.iff2 = cpu.iff1;
    cpu.iff1 = 0;
    pushWord(cpu, cb, cpu.pc);
    cpu.pc = 0x66;
    cpu.cycle_counter += 11;
  } else if (cpu.iff1) {
    // The high bit of R is not affected by this increment,
    //  it can only be changed using the LD R, A instruction.
    cpu.r = (cpu.r & 0x80) | (((cpu.r & 0x7f) + 1) & 0x7f);

    // Maskable interrupts only happen if IFF1 is set.
    // IFF1 is cleared during interrupt handling, while IFF2 remembers
    //  whether interrupts are supposed to remain enabled afterwards.
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;

    if (cpu.imode === 0) {
      // In the 8080-compatible interrupt mode,
      //  decode the content of the data bus as an instruction and run it.
      decodeInstruction(cpu, cb, data);
      cpu.cycle_counter += 2;
    } else if (cpu.imode === 1) {
      // Mode 1 is always just RST 0x38.
      pushWord(cpu, cb, cpu.pc);
      cpu.pc = 0x38;
      cpu.cycle_counter += 13;
    } else if (cpu.imode === 2) {
      // Mode 2 uses the value on the data bus as in index
      //  into the vector table pointer to by the I register.
      pushWord(cpu, cb, cpu.pc);
      // The Z80 manual says that this address must be 2-byte aligned,
      //  but it doesn't appear that this is actually the case on the hardware,
      //  so we don't attempt to enforce that here.
      const vector_address = (cpu.i << 8) | data;
      cpu.pc = cb.mem_read(vector_address) | (cb.mem_read((vector_address + 1) & 0xffff) << 8);

      cpu.cycle_counter += 19;
    }
  }
};

export const initCpu = init;
export const resetCpu = reset;
