import { describe, expect, it } from 'vitest';
import type { HexProgram } from '../../src/z80/loaders.js';
import { HeadlessExecutionError, createTec1gHeadlessSession } from '../../src/headless/session.js';
import { TMS9918_CONTROL_PORT, TMS9918_DATA_PORT } from '../../src/platforms/tec1g/tms9918.js';

function program(bytes: number[], startAddress = 0x4000): HexProgram {
  const memory = new Uint8Array(0x10000);
  memory.set(bytes, startAddress);
  return { memory, startAddress };
}

describe('TEC-1G headless session', () => {
  it('runs to named state while propagating CPU cycles to the platform', () => {
    const session = createTec1gHeadlessSession({
      program: program([0x3e, 0x2a, 0x32, 0x00, 0x50, 0x76]),
      debugMap: {
        files: {
          'game.glim': {
            symbols: [{ name: 'Score', address: 0x5000 }],
          },
        },
      },
    });

    const result = session.runUntil((game) => game.memory.readByte('Score') === 0x2a, {
      maxInstructions: 4,
    });

    expect(result.instructions).toBe(2);
    expect(result.cycles).toBeGreaterThan(0);
    expect(session.cycles).toBe(session.tec1g.state.timing.cycleClock.now());
    expect(session.memory.readWord('Score')).toBe(0x002a);
  });

  it('loads memory overlays without mutating the caller program', () => {
    const source = program([0x76]);
    const session = createTec1gHeadlessSession({
      program: source,
      overlays: [{ address: 0xc000, bytes: Uint8Array.of(0xaa, 0xbb) }],
    });

    expect(session.memory.readByte(0xc000)).toBe(0xaa);
    expect(source.memory[0xc000]).toBe(0);
    session.memory.writeByte(0xc000, 0x55);
    expect(session.memory.readByte(0xc000)).toBe(0xaa);
    session.memory.writeByte(0xc000, 0x55, true);
    expect(session.memory.readByte(0xc000)).toBe(0x55);
  });

  it('fails bounded infinite loops with registers and a short instruction trace', () => {
    const session = createTec1gHeadlessSession({
      program: program([0xc3, 0x00, 0x40]),
    });

    expect(() =>
      session.runUntil(() => false, { maxInstructions: 4 }, 'test flag changed')
    ).toThrowError(HeadlessExecutionError);

    try {
      session.runUntil(() => false, { maxInstructions: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(HeadlessExecutionError);
      const failure = error as HeadlessExecutionError;
      expect(failure.diagnostics.pc).toBe(0x4000);
      expect(failure.diagnostics.trace.length).toBeGreaterThan(0);
      expect(failure.diagnostics.registers.pc).toBe(0x4000);
    }
  });

  it('exposes TMS9918 state after CPU-driven port writes', () => {
    const session = createTec1gHeadlessSession({
      program: program([
        0x3e,
        0x00,
        0xd3,
        TMS9918_CONTROL_PORT,
        0x3e,
        0x40,
        0xd3,
        TMS9918_CONTROL_PORT,
        0x3e,
        0x5a,
        0xd3,
        TMS9918_DATA_PORT,
        0x76,
      ]),
      config: { uiVisibility: { tms9918: true } },
    });

    session.runUntil((game) => game.videoSnapshot().vram[0] === 0x5a, {
      maxInstructions: 8,
    });

    expect(session.videoSnapshot().active).toBe(true);
    expect(session.videoSnapshot().vram[0]).toBe(0x5a);
  });

  it('injects matrix and joystick input without UI state', () => {
    const session = createTec1gHeadlessSession({ program: program([0x76]) });

    session.pressMatrixKey(2, 3);
    session.setJoystick(0x15);

    expect(session.tec1g.state.input.matrixPendingKeyStates[2]).toBe(0xf7);
    expect(session.tec1g.state.input.matrixPendingDirty).toBe(true);
    expect(session.tec1g.state.input.joystickState).toBe(0x15);

    session.releaseMatrixKey(2, 3);
    expect(session.tec1g.state.input.matrixPendingKeyStates[2]).toBe(0xff);
  });
});
