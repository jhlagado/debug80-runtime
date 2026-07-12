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

  it('returns copied semantic display and LCD snapshots', () => {
    const session = createTec1gHeadlessSession({ program: program([0x76]) });
    session.tec1g.state.display.ledMatrixRedRows[2] = 0x81;
    session.tec1g.state.display.ledMatrixGreenRows[2] = 0x42;
    session.tec1g.state.display.digits[0] = 0x3f;
    session.tec1g.state.display.segmentDuty.segmentIntensities[0] = 0.75;
    session.tec1g.state.lcdCtrl.lcd.splice(
      0,
      5,
      ...Array.from('HELLO', (character) => character.charCodeAt(0))
    );

    const matrix = session.matrixSnapshot();
    const hud = session.hudSnapshot();
    const lcd = session.lcdSnapshot();
    matrix.redRows[2] = 0;
    hud.digits[0] = 0;
    lcd.bytes[0] = 0;

    expect(session.matrixSnapshot().redRows[2]).toBe(0x81);
    expect(session.matrixSnapshot().greenRows[2]).toBe(0x42);
    expect(session.hudSnapshot().digits[0]).toBe(0x3f);
    expect(session.hudSnapshot().segmentIntensities[0]).toBe(0.75);
    expect(session.lcdSnapshot().rows[0]?.startsWith('HELLO')).toBe(true);
  });

  it('captures speaker edges produced by CPU port writes', () => {
    const session = createTec1gHeadlessSession({
      program: program([0x3e, 0x80, 0xd3, 0x01, 0x00, 0x3e, 0x00, 0xd3, 0x01, 0x76]),
    });

    session.runUntil((game) => game.speakerSnapshot().edges.length === 2, {
      maxInstructions: 8,
    });

    expect(session.speakerSnapshot().edges.map((edge) => edge.level)).toEqual([true, false]);
    expect(session.speakerSnapshot().frequencyHz).toBeGreaterThan(0);
    session.clearSpeakerEdges();
    expect(session.speakerSnapshot().edges).toEqual([]);
  });

  it('advances active TMS9918 video by deterministic frame counts', () => {
    const session = createTec1gHeadlessSession({
      program: program([0xc3, 0x00, 0x40]),
      config: { uiVisibility: { tms9918: true } },
      videoStandard: 'pal',
    });

    session.runVideoFrames(2, { maxInstructions: 20_000, maxCycles: 170_000 });

    const video = session.videoStateSnapshot();
    expect(video.frameCount).toBe(2);
    expect(video.videoStandard).toBe('pal');
    expect(video).not.toHaveProperty('framebuffer');
  });

  it('reads memory blocks and resets program, platform, and counters deterministically', () => {
    const session = createTec1gHeadlessSession({
      program: program([0x3e, 0x2a, 0x32, 0x00, 0x50, 0x76]),
      stackPointer: 0x7fff,
    });
    session.memory.writeBytes(0x5100, [1, 2, 3]);
    expect(Array.from(session.memory.readBytes(0x5100, 3))).toEqual([1, 2, 3]);
    session.runUntil((game) => game.memory.readByte(0x5000) === 0x2a, {
      maxInstructions: 4,
    });
    const firstRunCycles = session.cycles;

    session.reset();

    expect(session.memory.readByte(0x5000)).toBe(0);
    expect(session.instructions).toBe(0);
    expect(session.cycles).toBe(0);
    expect(session.tec1g.state.timing.cycleClock.now()).toBe(0);
    expect(session.cpu.getRegisters().sp).toBe(0x7fff);
    session.runUntil((game) => game.memory.readByte(0x5000) === 0x2a, {
      maxInstructions: 4,
    });
    expect(session.cycles).toBe(firstRunCycles);
    expect(session.tec1g.state.timing.cycleClock.now()).toBe(firstRunCycles);
  });

  it('decodes active TMS9918 sprite attributes', () => {
    const session = createTec1gHeadlessSession({
      program: program([0x76]),
      config: { uiVisibility: { tms9918: true } },
    });
    const video = session.tec1g.state.display.tms9918;
    video.writeControl(0x36);
    video.writeControl(0x85);
    video.writeControl(0x00);
    video.writeControl(0x5b);
    for (const value of [87, 120, 2, 0x8f, 0xd0]) {
      video.writeData(value);
    }

    expect(session.videoSpritesSnapshot()).toEqual([
      {
        slot: 0,
        x: 120,
        y: 88,
        rawY: 87,
        pattern: 2,
        color: 15,
        earlyClock: true,
      },
    ]);
  });
});
