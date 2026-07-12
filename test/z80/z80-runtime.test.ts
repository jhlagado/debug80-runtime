import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HexProgram } from '../../src/z80/loaders.js';
import { createZ80Runtime } from '../../src/z80/runtime.js';

const makeProgram = (bytes: number[], startAddress = 0x0000): HexProgram => {
  const memory = new Uint8Array(0x10000);
  memory.fill(0);
  memory.set(bytes, startAddress);
  return { memory, startAddress };
};

describe('z80-runtime', () => {
  it('honors entry override on reset', () => {
    const progA = makeProgram([0x76], 0x0000); // HALT
    const runtime = createZ80Runtime(progA);
    const result = runtime.step();
    assert.equal(result.halted, true);

    const progB = makeProgram([0x00, 0x00, 0x76], 0x2000); // NOP, NOP, HALT at 0x2002
    runtime.reset(progB, 0x2001);
    assert.equal(runtime.getPC(), 0x2001);
    // Step twice to reach HALT
    runtime.step();
    const halted = runtime.step();
    assert.equal(halted.halted, true);
    assert.equal(runtime.getPC(), 0x2003);
  });

  it('calls IO write handler on OUT (n),A', () => {
    const writes: Array<{ port: number; value: number }> = [];
    const program = makeProgram(
      [
        0x3e,
        0x12, // LD A,0x12
        0xd3,
        0x34, // OUT (0x34),A
        0x76, // HALT
      ],
      0x0000
    );

    const runtime = createZ80Runtime(program, undefined, {
      write: (port, value) => writes.push({ port, value }),
    });

    runtime.step(); // LD A, nn
    runtime.step(); // OUT (n), A
    const res = runtime.step(); // HALT

    assert.equal(res.halted, true);
    // OUT uses (A << 8) | n for the port number in this implementation.
    assert.deepEqual(writes, [{ port: 0x1234, value: 0x12 }]);
  });

  it('passes full 16-bit port to IO read handler on IN (n),A', () => {
    const reads: number[] = [];
    const program = makeProgram(
      [
        0x3e,
        0x56, // LD A,0x56
        0xdb,
        0x04, // IN A,(0x04)
        0x76, // HALT
      ],
      0x0000
    );

    const runtime = createZ80Runtime(program, undefined, {
      read: (port) => {
        reads.push(port);
        return 0;
      },
    });

    runtime.step(); // LD A, nn
    runtime.step(); // IN A, (n)
    runtime.step(); // HALT

    assert.deepEqual(reads, [0x5604]);
  });

  it('uses updated memory hooks without rebuilding execution callbacks', () => {
    const program = makeProgram(
      [
        0x3a,
        0x00,
        0x20, // LD A,(0x2000)
        0x32,
        0x01,
        0x20, // LD (0x2001),A
        0x76, // HALT
      ],
      0x0000
    );
    const runtime = createZ80Runtime(program);
    const writes: Array<{ address: number; value: number }> = [];

    runtime.hardware.memRead = (address: number): number =>
      (address & 0xffff) === 0x2000 ? 0x5a : (runtime.hardware.memory[address & 0xffff] ?? 0);
    runtime.hardware.memWrite = (address: number, value: number): void => {
      writes.push({ address: address & 0xffff, value: value & 0xff });
      runtime.hardware.memory[address & 0xffff] = value & 0xff;
    };

    runtime.step();
    runtime.step();

    assert.equal(runtime.getRegisters().a, 0x5a);
    assert.deepEqual(writes, [{ address: 0x2001, value: 0x5a }]);
  });

  it('captures and restores CPU state snapshots', () => {
    const program = makeProgram([
      0x31,
      0x34,
      0x12, // LD SP,0x1234
      0x3e,
      0x56, // LD A,0x56
      0x76, // HALT
    ]);
    const runtime = createZ80Runtime(program);

    runtime.step();
    runtime.step();
    const snapshot = runtime.captureCpuState();

    runtime.reset(program, 0x0000);
    assert.notEqual(runtime.getRegisters().sp, snapshot.sp);
    assert.notEqual(runtime.getRegisters().a, snapshot.a);

    runtime.restoreCpuState(snapshot);

    assert.equal(runtime.getRegisters().sp, 0x1234);
    assert.equal(runtime.getRegisters().a, 0x56);
    assert.equal(runtime.getPC(), snapshot.pc);
  });
});
