/**
 * @file Tests for flow control helpers in decode-utils.
 */

import { describe, it, expect } from 'vitest';
import { initDecodeTestContext } from './decode-test-helpers.js';
import { buildDecoderHelpers } from '../../src/z80/decode-helpers.js';

describe('decode-utils flow control', () => {
  it('doConditionalAbsoluteJump jumps when condition true', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x0000;
    memory[0x0001] = 0x34;
    memory[0x0002] = 0x12;
    helpers.do_conditional_absolute_jump(true);
    expect(cpu.pc).toBe(0x1233);
  });

  it('doConditionalAbsoluteJump skips when condition false', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x0000;
    helpers.do_conditional_absolute_jump(false);
    expect(cpu.pc).toBe(0x0002);
  });

  it('doConditionalRelativeJump jumps forward when condition true', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x0000;
    memory[0x0001] = 0x10;
    helpers.do_conditional_relative_jump(true);
    expect(cpu.pc).toBe(0x0011);
  });

  it('doConditionalRelativeJump handles negative offset', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x0020;
    memory[0x0021] = 0xfe;
    helpers.do_conditional_relative_jump(true);
    expect(cpu.pc).toBe(0x001f);
  });

  it('doConditionalCall pushes return address and jumps', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x0000;
    cpu.sp = 0x1000;
    memory[0x0001] = 0x34;
    memory[0x0002] = 0x12;
    helpers.do_conditional_call(true);
    expect(cpu.pc).toBe(0x1233);
    expect(cpu.sp).toBe(0x0ffe);
  });

  it('doConditionalReturn pops PC when condition true', () => {
    const { cpu, memory, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x0000;
    cpu.sp = 0x0ffe;
    memory[0x0ffe] = 0x34;
    memory[0x0fff] = 0x12;
    helpers.do_conditional_return(true);
    expect(cpu.pc).toBe(0x1233);
  });

  it('doReset pushes PC and jumps to vector', () => {
    const { cpu, cb } = initDecodeTestContext();
    const helpers = buildDecoderHelpers(cpu, cb);
    cpu.pc = 0x1234;
    cpu.sp = 0x1000;
    helpers.do_reset(0x38);
    expect(cpu.pc).toBe(0x0037);
    expect(cpu.sp).toBe(0x0ffe);
  });
});
