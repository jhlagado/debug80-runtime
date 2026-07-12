/**
 * @file Tests for stack helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';
import { pushWord } from '../../src/z80/core-helpers.js';

describe('decode-utils stack helpers', () => {
  it('pushWord pushes value to stack', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    cpu.sp = 0x1000;
    pushWord(cpu, cb, 0x1234);
    expect(cpu.sp).toBe(0x0ffe);
    expect(memory[0x0fff]).toBe(0x12);
    expect(memory[0x0ffe]).toBe(0x34);
  });

  it('popWord pops value from stack', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.sp = 0x0ffe;
    memory[0x0ffe] = 0x34;
    memory[0x0fff] = 0x12;
    const result = helpers.pop_word();
    expect(result).toBe(0x1234);
    expect(cpu.sp).toBe(0x1000);
  });
});
