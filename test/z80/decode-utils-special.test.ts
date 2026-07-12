/**
 * @file Tests for misc helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';
import { buildPrimaryInstructions, executePrimaryOpcode } from '../../src/z80/decode-primary.js';
import { pushWord, setFlagsRegister } from '../../src/z80/core-helpers.js';

describe('decode-utils special helpers', () => {
  it('doDaa leaves valid BCD unchanged after addition', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const noop = (): void => {};
    const ctx = {
      cpu,
      cb,
      pushWord,
      setFlagsRegister,
      get_flags_register: helpers.get_flags_register,
      get_flags_prime: helpers.get_flags_prime,
      set_flags_prime: helpers.set_flags_prime,
      update_xy_flags: helpers.update_xy_flags,
      get_signed_offset_byte: helpers.get_signed_offset_byte,
      pop_word: helpers.pop_word,
      do_conditional_absolute_jump: helpers.do_conditional_absolute_jump,
      do_conditional_relative_jump: helpers.do_conditional_relative_jump,
      do_conditional_call: helpers.do_conditional_call,
      do_conditional_return: helpers.do_conditional_return,
      do_reset: helpers.do_reset,
      do_add: helpers.do_add,
      do_adc: helpers.do_adc,
      do_sub: helpers.do_sub,
      do_sbc: helpers.do_sbc,
      do_and: helpers.do_and,
      do_xor: helpers.do_xor,
      do_or: helpers.do_or,
      do_cp: helpers.do_cp,
      do_inc: helpers.do_inc,
      do_dec: helpers.do_dec,
      do_hl_add: helpers.do_hl_add,
      do_rlc: helpers.do_rlc,
      do_rrc: helpers.do_rrc,
      do_rl: helpers.do_rl,
      do_rr: helpers.do_rr,
      cbHandler: noop,
      ddHandler: noop,
      edHandler: noop,
      fdHandler: noop,
    };
    const instructions = buildPrimaryInstructions(ctx);
    cpu.a = 0x15;
    cpu.flags.N = 0;
    executePrimaryOpcode(ctx, 0x27, instructions);
    expect(cpu.a).toBe(0x15);
  });

  it('doDaa adjusts after addition when carry needed', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const noop = (): void => {};
    const ctx = {
      cpu,
      cb,
      pushWord,
      setFlagsRegister,
      get_flags_register: helpers.get_flags_register,
      get_flags_prime: helpers.get_flags_prime,
      set_flags_prime: helpers.set_flags_prime,
      update_xy_flags: helpers.update_xy_flags,
      get_signed_offset_byte: helpers.get_signed_offset_byte,
      pop_word: helpers.pop_word,
      do_conditional_absolute_jump: helpers.do_conditional_absolute_jump,
      do_conditional_relative_jump: helpers.do_conditional_relative_jump,
      do_conditional_call: helpers.do_conditional_call,
      do_conditional_return: helpers.do_conditional_return,
      do_reset: helpers.do_reset,
      do_add: helpers.do_add,
      do_adc: helpers.do_adc,
      do_sub: helpers.do_sub,
      do_sbc: helpers.do_sbc,
      do_and: helpers.do_and,
      do_xor: helpers.do_xor,
      do_or: helpers.do_or,
      do_cp: helpers.do_cp,
      do_inc: helpers.do_inc,
      do_dec: helpers.do_dec,
      do_hl_add: helpers.do_hl_add,
      do_rlc: helpers.do_rlc,
      do_rrc: helpers.do_rrc,
      do_rl: helpers.do_rl,
      do_rr: helpers.do_rr,
      cbHandler: noop,
      ddHandler: noop,
      edHandler: noop,
      fdHandler: noop,
    };
    const instructions = buildPrimaryInstructions(ctx);
    cpu.a = 0x9a;
    cpu.flags.N = 0;
    executePrimaryOpcode(ctx, 0x27, instructions);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.C).toBe(1);
  });

  it('doDaa adjusts after subtraction', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const noop = (): void => {};
    const ctx = {
      cpu,
      cb,
      pushWord,
      setFlagsRegister,
      get_flags_register: helpers.get_flags_register,
      get_flags_prime: helpers.get_flags_prime,
      set_flags_prime: helpers.set_flags_prime,
      update_xy_flags: helpers.update_xy_flags,
      get_signed_offset_byte: helpers.get_signed_offset_byte,
      pop_word: helpers.pop_word,
      do_conditional_absolute_jump: helpers.do_conditional_absolute_jump,
      do_conditional_relative_jump: helpers.do_conditional_relative_jump,
      do_conditional_call: helpers.do_conditional_call,
      do_conditional_return: helpers.do_conditional_return,
      do_reset: helpers.do_reset,
      do_add: helpers.do_add,
      do_adc: helpers.do_adc,
      do_sub: helpers.do_sub,
      do_sbc: helpers.do_sbc,
      do_and: helpers.do_and,
      do_xor: helpers.do_xor,
      do_or: helpers.do_or,
      do_cp: helpers.do_cp,
      do_inc: helpers.do_inc,
      do_dec: helpers.do_dec,
      do_hl_add: helpers.do_hl_add,
      do_rlc: helpers.do_rlc,
      do_rrc: helpers.do_rrc,
      do_rl: helpers.do_rl,
      do_rr: helpers.do_rr,
      cbHandler: noop,
      ddHandler: noop,
      edHandler: noop,
      fdHandler: noop,
    };
    const instructions = buildPrimaryInstructions(ctx);
    cpu.a = 0x15;
    cpu.flags.N = 1;
    cpu.flags.H = 1;
    executePrimaryOpcode(ctx, 0x27, instructions);
    expect(cpu.a).toBe(0x0f);
  });

  it('doNeg negates accumulator', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x01;
    helpers.do_neg();
    expect(cpu.a).toBe(0xff);
  });

  it('doIn reads port and sets flags', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cb.io_read = () => 0x80;
    const result = helpers.do_in(0x00);
    expect(result).toBe(0x80);
    expect(cpu.flags.S).toBe(1);
  });
});
