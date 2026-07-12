import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createZ80Runtime } from '../../src/z80/runtime.js';
import { parseIntelHex } from '../../src/z80/loaders.js';

describe('Z80 utilities', () => {
  it('parses Intel HEX and sets start address', () => {
    const hex = ':020000000102F9\n:00000001FF';
    const program = parseIntelHex(hex);
    assert.equal(program.memory[0x0000], 0x01);
    assert.equal(program.memory[0x0001], 0x02);
    assert.equal(program.startAddress, 0x0000);
  });

  it('steps and halts on HALT opcode', () => {
    const hex = ':03000000007600E7\n:00000001FF'; // 0x00 NOP, 0x76 HALT
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);

    let result = runtime.step();
    assert.equal(result.halted, false);
    assert.equal(runtime.getPC(), 0x0001);

    result = runtime.step();
    assert.equal(result.halted, true);
    assert.equal(runtime.isHalted(), true);
  });

  it('executes LD A,nn then ADD nn then HALT', () => {
    const hex = ':050000003E05C6037679\n:00000001FF'; // LD A,5; ADD 3; HALT
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);

    let result = runtime.step();
    assert.equal(result.halted, false);
    assert.equal(runtime.getRegisters().a, 0x05);

    result = runtime.step();
    assert.equal(result.halted, false);
    assert.equal(runtime.getRegisters().a, 0x08);

    result = runtime.step();
    assert.equal(result.halted, true);
    assert.equal(runtime.isHalted(), true);
  });

  it('stops on breakpoint during run', () => {
    const hex = ':04000000000000E8\n:00000001FF'; // zeros
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);
    const breaks = new Set<number>([0x0002]);

    const result = runtime.runUntilStop(breaks);
    assert.equal(result.reason, 'breakpoint');
    assert.equal(runtime.getPC(), 0x0002);
  });

  it('executes call/ret and updates registers correctly', () => {
    const hex = ':090000003E01CD0600763CC976F4\n:00000001FF'; // LD A,1; CALL 0006; HALT; INC A; RET; HALT
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);

    const result = runtime.runUntilStop(new Set<number>());
    assert.equal(result.reason, 'halt');
    assert.equal(runtime.getRegisters().a, 0x02);
  });

  it('completes LDIR in one step (PC does not stick on the block instruction)', () => {
    // LD HL,1000h; LD DE,1001h; LD BC,2; LD A,55h; LD (HL),A; LDIR; HALT
    const hex = ':0F0000002100101101100102003E5577EDB0767E\n:00000001FF';
    const program = parseIntelHex(hex);
    const runtime = createZ80Runtime(program);
    const mem = runtime.hardware.memory;

    for (let i = 0; i < 6; i += 1) {
      const r = runtime.step();
      assert.equal(r.halted, false);
    }
    assert.equal(runtime.getPC() & 0xffff, 0x000e);
    const last = runtime.step();
    assert.equal(last.halted, true);
    const regs = runtime.getRegisters();
    assert.equal(regs.b | regs.c, 0);
    assert.equal(mem[0x1000], 0x55);
    assert.equal(mem[0x1001], 0x55);
    assert.equal(mem[0x1002], 0x55);
  });
});
