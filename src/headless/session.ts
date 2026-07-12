import type { HexProgram } from '../z80/loaders.js';
import { createZ80Runtime, type RunResult, type Z80Runtime } from '../z80/runtime.js';
import type { Tec1gPlatformConfig } from '../platforms/types.js';
import {
  createTec1gRuntime,
  normalizeTec1gConfig,
  type Tec1gRuntime,
} from '../platforms/tec1g/runtime.js';
import { createTec1gMemoryHooks } from '../platforms/tec1g/tec1g-memory.js';
import type { Tms9918Snapshot, Tms9918VideoStandard } from '../platforms/tec1g/tms9918.js';
import { D8Symbols } from './symbols.js';

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

  videoSnapshot(): Tms9918Snapshot {
    return this.tec1g.state.display.tms9918.snapshot();
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
