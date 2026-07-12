/**
 * @fileoverview Z80 Instruction Decoder
 *
 * This module implements the complete Z80 instruction set decoder. The architecture
 * uses a single function with nested handlers to share closure state (cpu, callbacks).
 *
 * ## Structure
 * The file is organized into these logical sections:
 * - **Utility Functions** (lines ~45-550): Signed bytes, flags, stack, ALU operations
 * - **DD Prefix Table**: Extracted to `decode-dd.ts`
 * - **DDCB Prefix Handler**: Extracted to `decode-ddcb.ts`
 * - **ED Prefix Table**: Extracted to `decode-ed.ts`
 * - **Primary Instruction Table**: Extracted to `decode-primary.ts`
 * - **CB Prefix Handler**: Extracted to `decode-cb.ts`
 * - **FD Prefix Handler**: Extracted to `decode-fd.ts`
 * - **Register/ALU Decoder**: Extracted to `decode-primary.ts`
 *
 * ## Instruction Prefixes
 * - **CB**: Bit manipulation, rotate, shift instructions
 * - **DD**: IX index register variants
 * - **ED**: Extended instructions (I/O, block transfers, etc.)
 * - **FD**: IY index register variants (uses DD table with IX/IY swap)
 * - **DDCB/FDCB**: Indexed bit operations
 *
 * @module z80/decode
 */

import { pushWord, setFlagsRegister } from './core-helpers.js';
import { Callbacks, Cpu } from './types.js';
import { buildCbHandler } from './decode-cb.js';
import { buildDdHandler, buildDdInstructions } from './decode-dd.js';
import { buildEdHandler, buildEdInstructions } from './decode-ed.js';
import { buildFdHandler } from './decode-fd.js';
import { buildDecoderHelpers } from './decode-helpers.js';
import { buildPrimaryInstructions, executePrimaryOpcode } from './decode-primary.js';

type Decoder = {
  decode: (opcode: number) => void;
};

const decoderCache = new WeakMap<Cpu, { cb: Callbacks; decoder: Decoder }>();

// ============================================================================
// INSTRUCTION DECODER ENTRY POINT
// ============================================================================

/**
 * Decodes and executes a single Z80 instruction.
 *
 * This function handles the complete Z80 instruction set including:
 * - All standard opcodes (0x00-0xFF)
 * - CB prefix (bit operations)
 * - DD prefix (IX index register)
 * - ED prefix (extended instructions)
 * - FD prefix (IY index register)
 * - DDCB/FDCB prefixes (indexed bit operations)
 *
 * @param cpu - CPU state object to modify
 * @param cb - Callbacks for memory and I/O access
 * @param opcode - The opcode byte to decode and execute
 *
 * @example
 * ```typescript
 * const opcode = callbacks.mem_read(cpu.pc);
 * decodeInstruction(cpu, callbacks, opcode);
 * ```
 */
const createDecoder = (cpu: Cpu, cb: Callbacks): Decoder => {
  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  const {
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
  } = buildDecoderHelpers(cpu, cb);

  // DD/ED PREFIX TABLES (EXTRACTED)
  // ==========================================================================
  const ddInstructions = buildDdInstructions({
    cpu,
    cb,
    getSignedOffsetByte: get_signed_offset_byte,
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
  });
  const edInstructions = buildEdInstructions({
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
  });

  const cb_handler = buildCbHandler({
    cpu,
    cb,
    do_rlc,
    do_rrc,
    do_rl,
    do_rr,
    do_sla,
    do_sra,
    do_sll,
    do_srl,
  });
  const dd_handler = buildDdHandler({
    cpu,
    cb,
    ddInstructions,
  });
  const ed_handler = buildEdHandler({
    cpu,
    cb,
    edInstructions,
  });
  const fd_handler = buildFdHandler({
    cpu,
    cb,
    ddInstructions,
  });

  const primaryContext = {
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
    cbHandler: cb_handler,
    ddHandler: dd_handler,
    edHandler: ed_handler,
    fdHandler: fd_handler,
  };

  const instructions = buildPrimaryInstructions(primaryContext);

  return {
    decode: (opcode: number): void => {
      executePrimaryOpcode(primaryContext, opcode, instructions);
    },
  };
};

export const decodeInstruction = (cpu: Cpu, cb: Callbacks, opcode: number): void => {
  const cached = decoderCache.get(cpu);
  if (!cached || cached.cb !== cb) {
    decoderCache.set(cpu, { cb, decoder: createDecoder(cpu, cb) });
  }
  const decoder = decoderCache.get(cpu);
  decoder?.decoder.decode(opcode);
};
