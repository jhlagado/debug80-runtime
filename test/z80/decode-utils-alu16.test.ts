/**
 * @file Tests for 16-bit ALU helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';

describe('decode-utils ALU 16-bit', () => {
  it('doHlAdd adds to HL', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.h = 0x10;
    cpu.l = 0x00;
    helpers.do_hl_add(0x0100);
    expect(cpu.h).toBe(0x11);
    expect(cpu.l).toBe(0x00);
  });

  it('doHlAdc adds with carry to HL', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.h = 0x10;
    cpu.l = 0x00;
    cpu.flags.C = 1;
    helpers.do_hl_adc(0x0100);
    expect(cpu.h).toBe(0x11);
    expect(cpu.l).toBe(0x01);
  });

  it('doHlSbc subtracts with carry from HL', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.h = 0x10;
    cpu.l = 0x00;
    cpu.flags.C = 1;
    helpers.do_hl_sbc(0x0100);
    expect(cpu.h).toBe(0x0e);
    expect(cpu.l).toBe(0xff);
  });

  it('doIxAdd adds to IX', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.ix = 0x1000;
    helpers.do_ix_add(0x0100);
    expect(cpu.ix).toBe(0x1100);
  });
});
