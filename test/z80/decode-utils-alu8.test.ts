/**
 * @file Tests for 8-bit ALU helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';

describe('decode-utils ALU 8-bit', () => {
  it('doAdd adds to accumulator and clears N', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x10;
    helpers.do_add(0x05);
    expect(cpu.a).toBe(0x15);
    expect(cpu.flags.N).toBe(0);
  });

  it('doAdd sets zero and carry flags when appropriate', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0xff;
    helpers.do_add(0x01);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.Z).toBe(1);
    expect(cpu.flags.C).toBe(1);
  });

  it('doAdc adds with carry', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x10;
    cpu.flags.C = 1;
    helpers.do_adc(0x05);
    expect(cpu.a).toBe(0x16);
  });

  it('doSub subtracts from accumulator and sets N', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x10;
    helpers.do_sub(0x05);
    expect(cpu.a).toBe(0x0b);
    expect(cpu.flags.N).toBe(1);
  });

  it('doSbc subtracts with carry', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x10;
    cpu.flags.C = 1;
    helpers.do_sbc(0x05);
    expect(cpu.a).toBe(0x0a);
  });

  it('doAnd ANDs accumulator and sets H', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0xf0;
    helpers.do_and(0x0f);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.Z).toBe(1);
    expect(cpu.flags.H).toBe(1);
  });

  it('doAnd masks to 8-bit and sets parity/XY from result', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0xaa;
    helpers.do_and(0x1ff);
    expect(cpu.a).toBe(0xaa);
    expect(cpu.flags.P).toBe(1);
    expect(cpu.flags.X).toBe((cpu.a & 0x08) >>> 3);
    expect(cpu.flags.Y).toBe((cpu.a & 0x02) >>> 1);
  });

  it('doOr ORs accumulator', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0xf0;
    helpers.do_or(0x0f);
    expect(cpu.a).toBe(0xff);
  });

  it('doOr masks to 8-bit and clears carry', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x00;
    cpu.flags.C = 1;
    helpers.do_or(0x1ff);
    expect(cpu.a).toBe(0xff);
    expect(cpu.flags.C).toBe(0);
  });

  it('doXor XORs accumulator', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0xff;
    helpers.do_xor(0xff);
    expect(cpu.a).toBe(0x00);
    expect(cpu.flags.Z).toBe(1);
  });

  it('doXor masks to 8-bit and sets parity', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x0f;
    helpers.do_xor(0x1f0);
    expect(cpu.a).toBe(0xff);
    expect(cpu.flags.P).toBe(1);
  });

  it('doInc increments value and clears N', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_inc(0x10);
    expect(result).toBe(0x11);
    expect(cpu.flags.N).toBe(0);
  });

  it('doInc sets overflow on 0x7f', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_inc(0x7f);
    expect(result).toBe(0x80);
    expect(cpu.flags.P).toBe(1);
  });

  it('doDec decrements value and sets N', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_dec(0x10);
    expect(result).toBe(0x0f);
    expect(cpu.flags.N).toBe(1);
  });

  it('doDec sets overflow on 0x80', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    const result = helpers.do_dec(0x80);
    expect(result).toBe(0x7f);
    expect(cpu.flags.P).toBe(1);
  });

  it('doCp compares without modifying A', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x10;
    helpers.do_cp(0x10);
    expect(cpu.a).toBe(0x10);
    expect(cpu.flags.Z).toBe(1);
  });

  it('doCp updates carry and XY flags from operand', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.a = 0x10;
    helpers.do_cp(0x28);
    expect(cpu.flags.C).toBe(1);
    expect(cpu.flags.X).toBe((0x28 & 0x08) >>> 3);
    expect(cpu.flags.Y).toBe((0x28 & 0x20) >>> 5);
  });
});
