/**
 * @file Tests for flag and signed-offset helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';

describe('decode-utils flags/signed offset', () => {
  it('getSignedOffsetByte returns positive values unchanged', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    expect(helpers.get_signed_offset_byte(0)).toBe(0);
    expect(helpers.get_signed_offset_byte(1)).toBe(1);
    expect(helpers.get_signed_offset_byte(127)).toBe(127);
  });

  it('getSignedOffsetByte converts negative values', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    expect(helpers.get_signed_offset_byte(255)).toBe(-1);
    expect(helpers.get_signed_offset_byte(254)).toBe(-2);
    expect(helpers.get_signed_offset_byte(128)).toBe(-128);
  });

  it('getSignedOffsetByte masks to a byte', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    expect(helpers.get_signed_offset_byte(256)).toBe(0);
    expect(helpers.get_signed_offset_byte(257)).toBe(1);
  });

  it('getFlagsRegister returns flags as a byte', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.flags.S = 1;
    cpu.flags.Z = 1;
    cpu.flags.C = 1;
    const result = helpers.get_flags_register();
    expect(result & 0x80).toBe(0x80);
    expect(result & 0x40).toBe(0x40);
    expect(result & 0x01).toBe(0x01);
  });

  it('getFlagsPrime and setFlagsPrime handle alternate flags', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.flags_prime.S = 1;
    cpu.flags_prime.Z = 1;
    const result = helpers.get_flags_prime();
    expect(result & 0xc0).toBe(0xc0);

    helpers.set_flags_prime(0x00);
    expect(cpu.flags_prime.S).toBe(0);
    expect(cpu.flags_prime.Z).toBe(0);
  });

  it('updateXYFlags sets X and Y from result bits', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    helpers.update_xy_flags(0x28);
    expect(cpu.flags.X).toBe(1);
    expect(cpu.flags.Y).toBe(1);
  });
});
