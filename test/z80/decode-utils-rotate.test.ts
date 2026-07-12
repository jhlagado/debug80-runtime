/**
 * @file Tests for rotate/shift helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';

describe('decode-utils rotate/shift', () => {
  it('doRlc rotates left', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_rlc(0x80);
    expect(result).toBe(0x01);
    expect(cpu.flags.C).toBe(1);
  });

  it('doRrc rotates right', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_rrc(0x01);
    expect(result).toBe(0x80);
    expect(cpu.flags.C).toBe(1);
  });

  it('doRl rotates left through carry', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.flags.C = 1;
    const result = helpers.do_rl(0x00);
    expect(result).toBe(0x01);
  });

  it('doRr rotates right through carry', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.flags.C = 1;
    const result = helpers.do_rr(0x00);
    expect(result).toBe(0x80);
  });

  it('doSla shifts left arithmetic', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_sla(0x80);
    expect(result).toBe(0x00);
    expect(cpu.flags.C).toBe(1);
  });

  it('doSra shifts right arithmetic', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_sra(0x81);
    expect(result).toBe(0xc0);
    expect(cpu.flags.C).toBe(1);
  });

  it('doSll shifts left logical', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_sll(0x80);
    expect(result).toBe(0x01);
    expect(cpu.flags.C).toBe(1);
  });

  it('doSrl shifts right logical', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_srl(0x81);
    expect(result).toBe(0x40);
    expect(cpu.flags.C).toBe(1);
  });
});
