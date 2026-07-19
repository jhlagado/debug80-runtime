import type { HexProgram } from '../z80/loaders.js';
import { createZ80Runtime, type RunResult, type Z80Runtime } from '../z80/runtime.js';
import type { Tec1gPlatformConfig } from '../platforms/types.js';
import {
  createTec1gRuntime,
  normalizeTec1gConfig,
  type Tec1gRuntime,
} from '../platforms/tec1g/runtime.js';
import { createTec1gMemoryHooks } from '../platforms/tec1g/tec1g-memory.js';
import { TEC1G_KEYPAD_FN_BIT, TEC1G_MASK_LOW7 } from '../platforms/tec1g/constants.js';
import type {
  Tms9918Snapshot,
  Tms9918StateSnapshot,
  Tms9918VideoStandard,
} from '../platforms/tec1g/tms9918.js';
import type { Tec1gMatrixScanCycle } from '../platforms/tec1g/types.js';
import { D8Symbols } from './symbols.js';

/** Converts a logical MON-3 key code to the active-low-Fn hardware latch value. */
function toKeypadHardwareCode(code: number): number {
  return (code ^ TEC1G_KEYPAD_FN_BIT) & TEC1G_MASK_LOW7;
}

export interface MemoryOverlay {
  address: number;
  bytes: Uint8Array;
}

export interface HeadlessSessionOptions {
  program: HexProgram;
  entry?: number | string;
  stackPointer?: number;
  config?: Tec1gPlatformConfig;
  overlays?: MemoryOverlay[];
  debugMap?: unknown;
  videoStandard?: Tms9918VideoStandard;
}

export interface ExecutionBudget {
  maxInstructions?: number;
  maxCycles?: number;
}

export interface InstructionTraceEntry {
  pc: number;
  nextPc: number;
  opcode: number;
  cycles: number;
}

export interface HeadlessRunResult {
  instructions: number;
  cycles: number;
  pc: number;
}

export interface HeadlessDiagnostics extends HeadlessRunResult {
  registers: ReturnType<Z80Runtime['getRegisters']>;
  trace: InstructionTraceEntry[];
}

export interface MatrixSnapshot {
  redRows: number[];
  greenRows: number[];
  blueRows: number[];
  completedScans: Tec1gMatrixScanCycle[];
  droppedScans: number;
  nextScanId: number;
}

export interface HudSnapshot {
  digits: number[];
  segmentIntensities: number[];
}

export interface LcdSnapshot {
  bytes: number[];
  rows: string[];
  displayOn: boolean;
  cursorOn: boolean;
  cursorBlink: boolean;
  cursorAddress: number;
}

export interface SpeakerEdge {
  cycle: number;
  level: boolean;
}

export interface SpeakerSnapshot {
  level: boolean;
  frequencyHz: number;
  lastEdgeCycle: number | null;
  edges: SpeakerEdge[];
  droppedEdges: number;
}

export interface VideoSpriteSnapshot {
  slot: number;
  x: number;
  y: number;
  rawY: number;
  pattern: number;
  color: number;
  earlyClock: boolean;
}

export class HeadlessExecutionError extends Error {
  constructor(
    message: string,
    readonly diagnostics: HeadlessDiagnostics
  ) {
    super(message);
    this.name = 'HeadlessExecutionError';
  }
}

class MemoryInspector {
  constructor(
    private readonly runtime: Z80Runtime,
    private readonly symbols: D8Symbols
  ) {}

  readByte(address: number | string): number {
    const resolved = this.resolve(address);
    return this.runtime.hardware.memRead?.(resolved) ?? this.runtime.hardware.memory[resolved] ?? 0;
  }

  readWord(address: number | string): number {
    const resolved = this.resolve(address);
    return this.readByte(resolved) | (this.readByte((resolved + 1) & 0xffff) << 8);
  }

  readBytes(address: number | string, length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error('readBytes requires a non-negative integer length');
    }
    const resolved = this.resolve(address);
    return Uint8Array.from({ length }, (_, offset) => this.readByte(resolved + offset));
  }

  writeByte(address: number | string, value: number, force = false): void {
    const resolved = this.resolve(address);
    const write = force ? this.runtime.hardware.forceMemWrite : this.runtime.hardware.memWrite;
    if (write !== undefined) {
      write(resolved, value & 0xff);
      return;
    }
    this.runtime.hardware.memory[resolved] = value & 0xff;
  }

  writeWord(address: number | string, value: number, force = false): void {
    const resolved = this.resolve(address);
    this.writeByte(resolved, value, force);
    this.writeByte((resolved + 1) & 0xffff, value >> 8, force);
  }

  writeBytes(address: number | string, values: Iterable<number>, force = false): void {
    const resolved = this.resolve(address);
    let offset = 0;
    for (const value of values) {
      this.writeByte(resolved + offset, value, force);
      offset += 1;
    }
  }

  private resolve(address: number | string): number {
    return typeof address === 'string' ? this.symbols.address(address) : address & 0xffff;
  }
}

export class Tec1gHeadlessSession {
  readonly cpu: Z80Runtime;
  readonly tec1g: Tec1gRuntime;
  readonly symbols: D8Symbols;
  readonly memory: MemoryInspector;

  private instructionCount = 0;
  private cycleCount = 0;
  private readonly trace: InstructionTraceEntry[] = [];
  private previousSpeakerLevel = false;
  private readonly speakerEdges: SpeakerEdge[] = [];
  private droppedSpeakerEdges = 0;
  private readonly initialProgram: HexProgram;
  private readonly initialEntry: number;
  private readonly initialStackPointer: number | undefined;

  constructor(options: HeadlessSessionOptions) {
    const program = cloneProgramWithOverlays(options.program, options.overlays ?? []);
    this.symbols = new D8Symbols(options.debugMap);
    const entry =
      typeof options.entry === 'string' ? this.symbols.address(options.entry) : options.entry;
    const config = normalizeTec1gConfig({
      ...options.config,
      appStart: options.config?.appStart ?? program.startAddress,
      entry: entry ?? options.config?.entry ?? program.startAddress,
    });
    this.initialProgram = program;
    this.initialEntry = config.entry;
    this.initialStackPointer = options.stackPointer;
    this.tec1g = createTec1gRuntime(config, () => {});
    if (options.videoStandard !== undefined) {
      this.tec1g.setTms9918VideoStandard(options.videoStandard);
    }
    this.cpu = createZ80Runtime(program, config.entry, this.tec1g.ioHandlers, {
      romRanges: config.romRanges,
    });
    if (options.stackPointer !== undefined) {
      this.cpu.cpu.sp = options.stackPointer & 0xffff;
    }
    const hooks = createTec1gMemoryHooks(
      this.cpu.hardware.memory,
      config.romRanges,
      this.tec1g.state.system
    );
    this.cpu.hardware.memRead = hooks.memRead;
    this.cpu.hardware.memWrite = hooks.memWrite;
    this.cpu.hardware.forceMemWrite = hooks.forceMemWrite;
    this.cpu.hardware.isMemoryWritable = hooks.isMemoryWritable;
    this.memory = new MemoryInspector(this.cpu, this.symbols);
    this.previousSpeakerLevel = this.tec1g.state.audio.speaker;
  }

  get instructions(): number {
    return this.instructionCount;
  }

  get cycles(): number {
    return this.cycleCount;
  }

  stepInstruction(): RunResult {
    const pc = this.cpu.getPC() & 0xffff;
    const opcode = this.memory.readByte(pc);
    const result = this.cpu.step();
    const cycles = result.cycles ?? 0;
    this.tec1g.recordCycles(cycles);
    this.captureSpeakerEdge();
    if (cycles > 0) {
      this.instructionCount += 1;
      this.cycleCount += cycles;
      this.trace.push({ pc, nextPc: result.pc & 0xffff, opcode, cycles });
      if (this.trace.length > 24) {
        this.trace.shift();
      }
    }
    return result;
  }

  runUntil(
    predicate: (session: Tec1gHeadlessSession) => boolean,
    budget: ExecutionBudget,
    description = 'condition'
  ): HeadlessRunResult {
    validateBudget(budget);
    const startInstructions = this.instructionCount;
    const startCycles = this.cycleCount;

    while (!predicate(this)) {
      const result = this.stepInstruction();
      if (predicate(this)) {
        break;
      }
      if (result.halted) {
        throw this.failure(`CPU halted before ${description}`);
      }
      const instructions = this.instructionCount - startInstructions;
      const cycles = this.cycleCount - startCycles;
      if (
        (budget.maxInstructions !== undefined && instructions >= budget.maxInstructions) ||
        (budget.maxCycles !== undefined && cycles >= budget.maxCycles)
      ) {
        throw this.failure(`Execution budget exhausted before ${description}`);
      }
    }

    return this.resultSince(startInstructions, startCycles);
  }

  runCycles(cycles: number): HeadlessRunResult {
    if (!Number.isFinite(cycles) || cycles <= 0) {
      throw new Error('runCycles requires a positive cycle count');
    }
    const startCycles = this.cycleCount;
    return this.runUntil(
      (session) => session.cycleCount - startCycles >= cycles,
      { maxCycles: cycles + 64, maxInstructions: Math.ceil(cycles / 2) + 1 },
      `${cycles} cycles elapsed`
    );
  }

  runMatrixScans(count: number, budget: ExecutionBudget): HeadlessRunResult {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('runMatrixScans requires a positive scan count');
    }
    const target = this.tec1g.state.display.matrixNextScanCycleId + count;
    return this.runUntil(
      (session) => session.tec1g.state.display.matrixNextScanCycleId >= target,
      budget,
      `${count} matrix scan(s) completed`
    );
  }

  runVideoFrames(count: number, budget: ExecutionBudget): HeadlessRunResult {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('runVideoFrames requires a positive frame count');
    }
    const video = this.tec1g.state.display.tms9918;
    if (!video.stateSnapshot().active) {
      throw new Error('runVideoFrames requires an active TMS9918 device');
    }
    const target = video.getFrameCount() + count;
    return this.runUntil(
      () => video.getFrameCount() >= target,
      budget,
      `${count} video frame(s) completed`
    );
  }

  /**
   * Press and hold a hex keypad key (level model; release with
   * releaseKeypadKey). Takes the logical MON-3 key code (0x00-0x0f for
   * hex digits, 0x10-0x13 for +/-/GO/AD, bit 5 set for Fn-shifted keys);
   * the active-low Fn line on the latched hardware value is handled here.
   * No NMI is raised: headless sessions enter the program without booting
   * MON-3, so the RAM NMI hook is uninitialised and programs poll via
   * scanKeys, which reads only the ports.
   */
  pressKeypadKey(code: number): void {
    this.tec1g.applyKeySilent(toKeypadHardwareCode(code), true);
  }

  /** Release a hex keypad key previously pressed with pressKeypadKey. */
  releaseKeypadKey(code: number): void {
    this.tec1g.applyKeySilent(toKeypadHardwareCode(code), false);
  }

  pressMatrixKey(row: number, column: number): void {
    this.tec1g.applyMatrixKey(row, column, true);
  }

  releaseMatrixKey(row: number, column: number): void {
    this.tec1g.applyMatrixKey(row, column, false);
  }

  tapMatrixKey(
    row: number,
    column: number,
    budget: ExecutionBudget,
    holdScans = 1
  ): HeadlessRunResult {
    this.pressMatrixKey(row, column);
    const result = this.runMatrixScans(holdScans, budget);
    this.releaseMatrixKey(row, column);
    return result;
  }

  setJoystick(mask: number): void {
    this.tec1g.setJoystickState(mask);
  }

  reset(): void {
    this.tec1g.state.timing.cycleClock.reset();
    this.tec1g.resetState();
    this.cpu.reset(this.initialProgram, this.initialEntry);
    if (this.initialStackPointer !== undefined) {
      this.cpu.cpu.sp = this.initialStackPointer & 0xffff;
    }
    this.instructionCount = 0;
    this.cycleCount = 0;
    this.trace.length = 0;
    this.speakerEdges.length = 0;
    this.droppedSpeakerEdges = 0;
    this.previousSpeakerLevel = this.tec1g.state.audio.speaker;
  }

  videoSnapshot(): Tms9918Snapshot {
    return this.tec1g.state.display.tms9918.snapshot();
  }

  videoStateSnapshot(): Tms9918StateSnapshot {
    return this.tec1g.state.display.tms9918.stateSnapshot();
  }

  videoSpritesSnapshot(): VideoSpriteSnapshot[] {
    const video = this.videoStateSnapshot();
    const attributeBase = ((video.registers[5] ?? 0) & 0x7f) << 7;
    const sprites: VideoSpriteSnapshot[] = [];
    for (let slot = 0; slot < 32; slot += 1) {
      const base = (attributeBase + slot * 4) & 0x3fff;
      const rawY = video.vram[base] ?? 0xd0;
      if (rawY === 0xd0) {
        break;
      }
      const attributes = video.vram[(base + 3) & 0x3fff] ?? 0;
      sprites.push({
        slot,
        x: video.vram[(base + 1) & 0x3fff] ?? 0,
        y: rawY === 0xff ? -1 : rawY + 1,
        rawY,
        pattern: video.vram[(base + 2) & 0x3fff] ?? 0,
        color: attributes & 0x0f,
        earlyClock: (attributes & 0x80) !== 0,
      });
    }
    return sprites;
  }

  matrixSnapshot(): MatrixSnapshot {
    const display = this.tec1g.state.display;
    const latestScan = display.matrixScanCycles.at(-1);
    const scanPlane = (plane: 'red' | 'green' | 'blue', fallback: number[]): number[] => {
      if (latestScan === undefined) {
        return [...fallback];
      }
      const rows = Array.from({ length: 8 }, () => 0);
      for (const row of latestScan.rows) {
        rows[row.row] = row[plane];
      }
      return rows;
    };
    return {
      redRows: scanPlane('red', display.ledMatrixRedRows),
      greenRows: scanPlane('green', display.ledMatrixGreenRows),
      blueRows: scanPlane('blue', display.ledMatrixBlueRows),
      completedScans: display.matrixScanCycles.map((scan) => ({
        ...scan,
        rows: scan.rows.map((row) => ({ ...row })),
      })),
      droppedScans: display.matrixDroppedScanCycles,
      nextScanId: display.matrixNextScanCycleId,
    };
  }

  hudSnapshot(): HudSnapshot {
    const display = this.tec1g.state.display;
    return {
      digits: [...display.digits],
      segmentIntensities: [...display.segmentDuty.segmentIntensities],
    };
  }

  lcdSnapshot(): LcdSnapshot {
    const lcd = this.tec1g.state.lcdCtrl;
    const bytes = [...lcd.lcd];
    return {
      bytes,
      rows: Array.from({ length: 4 }, (_, row) =>
        bytes
          .slice(row * 20, row * 20 + 20)
          .map((value) => (value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : ' '))
          .join('')
      ),
      displayOn: lcd.lcdDisplayOn,
      cursorOn: lcd.lcdCursorOn,
      cursorBlink: lcd.lcdCursorBlink,
      cursorAddress: lcd.lcdAddr,
    };
  }

  speakerSnapshot(): SpeakerSnapshot {
    const audio = this.tec1g.state.audio;
    return {
      level: audio.speaker,
      frequencyHz: audio.speakerHz,
      lastEdgeCycle: audio.lastEdgeCycle,
      edges: this.speakerEdges.map((edge) => ({ ...edge })),
      droppedEdges: this.droppedSpeakerEdges,
    };
  }

  clearSpeakerEdges(): void {
    this.speakerEdges.length = 0;
    this.droppedSpeakerEdges = 0;
  }

  diagnostics(): HeadlessDiagnostics {
    return {
      instructions: this.instructionCount,
      cycles: this.cycleCount,
      pc: this.cpu.getPC() & 0xffff,
      registers: { ...this.cpu.getRegisters() },
      trace: this.trace.map((entry) => ({ ...entry })),
    };
  }

  private failure(message: string): HeadlessExecutionError {
    const diagnostics = this.diagnostics();
    const pc = diagnostics.pc.toString(16).padStart(4, '0');
    return new HeadlessExecutionError(
      `${message} (PC=0x${pc}, instructions=${diagnostics.instructions}, cycles=${diagnostics.cycles})`,
      diagnostics
    );
  }

  private captureSpeakerEdge(): void {
    const audio = this.tec1g.state.audio;
    if (audio.speaker === this.previousSpeakerLevel) {
      return;
    }
    this.previousSpeakerLevel = audio.speaker;
    if (this.speakerEdges.length >= 4096) {
      this.speakerEdges.shift();
      this.droppedSpeakerEdges += 1;
    }
    this.speakerEdges.push({
      cycle: audio.lastEdgeCycle ?? this.tec1g.state.timing.cycleClock.now(),
      level: audio.speaker,
    });
  }

  private resultSince(startInstructions: number, startCycles: number): HeadlessRunResult {
    return {
      instructions: this.instructionCount - startInstructions,
      cycles: this.cycleCount - startCycles,
      pc: this.cpu.getPC() & 0xffff,
    };
  }
}

export function createTec1gHeadlessSession(options: HeadlessSessionOptions): Tec1gHeadlessSession {
  return new Tec1gHeadlessSession(options);
}

function cloneProgramWithOverlays(program: HexProgram, overlays: MemoryOverlay[]): HexProgram {
  const memory = program.memory.slice();
  for (const overlay of overlays) {
    const start = overlay.address & 0xffff;
    const length = Math.min(overlay.bytes.length, memory.length - start);
    memory.set(overlay.bytes.subarray(0, length), start);
  }
  return {
    memory,
    startAddress: program.startAddress,
    ...(program.writeRanges !== undefined
      ? { writeRanges: program.writeRanges.map((range) => ({ ...range })) }
      : {}),
  };
}

function validateBudget(budget: ExecutionBudget): void {
  const instructions = budget.maxInstructions;
  const cycles = budget.maxCycles;
  const validInstructions =
    instructions !== undefined && Number.isInteger(instructions) && instructions > 0;
  const validCycles = cycles !== undefined && Number.isFinite(cycles) && cycles > 0;
  if (!validInstructions && !validCycles) {
    throw new Error('Execution requires a positive instruction or cycle budget');
  }
}
