import { HexProgram } from './loaders.js';
import { Cpu, execute, initCpu, resetCpu, interrupt as triggerInterrupt } from './cpu.js';
import { Callbacks, HardwareContext, StepInfo } from './types.js';
import {
  OP_CALL_C,
  OP_CALL_M,
  OP_CALL_NC,
  OP_CALL_NN,
  OP_CALL_NZ,
  OP_CALL_P,
  OP_CALL_PE,
  OP_CALL_PO,
  OP_CALL_Z,
  OP_PREFIX_ED,
  OP_RET,
  OP_RET_C,
  OP_RET_M,
  OP_RET_NC,
  OP_RET_NZ,
  OP_RET_P,
  OP_RET_PE,
  OP_RET_PO,
  OP_RET_Z,
  ED_RET_OPCODES,
  RST_OPCODES,
} from './opcodes.js';

export interface Z80Runtime {
  readonly cpu: Cpu;
  readonly hardware: HardwareContext;
  step: (options?: { trace?: StepInfo }) => RunResult;
  runUntilStop: (breakpoints: Set<number>) => RunResult;
  getRegisters: () => Cpu;
  isHalted: () => boolean;
  getPC: () => number;
  captureCpuState: () => CpuStateSnapshot;
  restoreCpuState: (snapshot: CpuStateSnapshot) => void;
  reset: (program?: HexProgram, entry?: number) => void;
}

export interface CpuStateSnapshot {
  b: number;
  a: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  a_prime: number;
  b_prime: number;
  c_prime: number;
  d_prime: number;
  e_prime: number;
  h_prime: number;
  l_prime: number;
  ix: number;
  iy: number;
  i: number;
  r: number;
  sp: number;
  pc: number;
  flags: Cpu['flags'];
  flags_prime: Cpu['flags_prime'];
  imode: number;
  iff1: number;
  iff2: number;
  halted: boolean;
  do_delayed_di: boolean;
  do_delayed_ei: boolean;
  cycle_counter: number;
}

export interface RuntimeOptions {
  romRanges?: Array<{ start: number; end: number }>;
}

export interface RunResult {
  halted: boolean;
  pc: number;
  reason: 'halt' | 'breakpoint';
  cycles?: number;
}

export interface IoHandlers {
  read?: (port: number) => number;
  write?: (port: number, value: number) => void;
  tick?: () => TickResult | void;
}

type Z80RuntimeImpl = Z80Runtime & {
  cpu: Cpu;
  hardware: HardwareContext;
  execCallbacks: Callbacks;
};

interface TickResult {
  interrupt?: {
    nonMaskable?: boolean;
    data?: number;
  };
  stop?: boolean;
}

export function createZ80Runtime(
  program: HexProgram,
  entry?: number,
  ioHandlers?: IoHandlers,
  options?: RuntimeOptions
): Z80Runtime {
  const cpu = initCpu();
  const memory = new Uint8Array(0x10000);
  const romRanges = options?.romRanges ?? [];
  const isRomAddress = (addr: number): boolean => {
    for (const range of romRanges) {
      if (addr >= range.start && addr <= range.end) {
        return true;
      }
    }
    return false;
  };
  const io: Required<IoHandlers> = {
    read: ioHandlers?.read ?? ((_port: number): number => 0),
    write:
      ioHandlers?.write ??
      ((_port: number, _value: number): void => {
        /* noop */
      }),
    tick: ioHandlers?.tick ?? ((): TickResult | void => undefined),
  };

  const hardware: HardwareContext = {
    memory,
    ioRead: (port: number): number => io.read(port & 0xffff) & 0xff,
    ioWrite: (port: number, value: number): void => {
      io.write(port & 0xffff, value & 0xff);
    },
    ioTick: (): TickResult | void => io.tick(),
  };
  hardware.memRead = (addr: number): number => memory[addr & 0xffff] ?? 0;
  hardware.memWrite = (addr: number, value: number): void => {
    const masked = addr & 0xffff;
    if (isRomAddress(masked)) {
      return;
    }
    memory[masked] = value & 0xff;
  };
  hardware.forceMemWrite = (addr: number, value: number): void => {
    memory[addr & 0xffff] = value & 0xff;
  };
  hardware.isMemoryWritable = (addr: number): boolean => !isRomAddress(addr & 0xffff);
  cpu.hardware = hardware;
  hardware.cpu = cpu;

  const execCallbacks: Callbacks = {
    mem_read: (addr: number): number => readMemory(hardware, addr),
    mem_write: (addr: number, value: number): void => {
      writeMemory(hardware, addr, value);
    },
    io_read: (port: number): number => hardware.ioRead(port & 0xffff),
    io_write: (port: number, value: number): void => {
      hardware.ioWrite(port & 0xffff, value & 0xff);
    },
  };

  loadProgram(hardware, cpu, program, entry);

  const runtime: Z80RuntimeImpl = {
    cpu,
    hardware,
    execCallbacks,
    step: stepRuntime,
    runUntilStop: runUntilStopRuntime,
    getRegisters,
    isHalted,
    getPC,
    captureCpuState,
    restoreCpuState,
    reset: resetRuntime,
  };

  return runtime;
}

function readMemory(hardware: HardwareContext, addr: number): number {
  return (
    hardware.memRead ?? ((address: number): number => hardware.memory[address & 0xffff] ?? 0)
  )(addr & 0xffff);
}

function writeMemory(hardware: HardwareContext, addr: number, value: number): void {
  const write =
    hardware.memWrite ??
    ((address: number, byte: number): void => {
      hardware.memory[address & 0xffff] = byte & 0xff;
    });
  write(addr & 0xffff, value & 0xff);
}

function loadProgram(hardware: HardwareContext, cpu: Cpu, prog: HexProgram, ent?: number): void {
  hardware.memory.fill(0);
  hardware.memory.set(prog.memory);
  cpu.pc = ent !== undefined && ent >= 0 && ent < 0x10000 ? ent : prog.startAddress;
  cpu.halted = false;
}

function classifyStepOver(cpu: Cpu, memRead: (addr: number) => number): StepInfo | null {
  const pc = cpu.pc & 0xffff;
  const opcode = memRead(pc) ?? 0;
  const returnAddressCall = (pc + 3) & 0xffff;
  const returnAddressRst = (pc + 1) & 0xffff;

  switch (opcode) {
    case OP_CALL_NN:
      return { kind: 'call', taken: true, returnAddress: returnAddressCall };
    case OP_CALL_NZ:
      return { kind: 'call', taken: !cpu.flags.Z, returnAddress: returnAddressCall };
    case OP_CALL_Z:
      return { kind: 'call', taken: !!cpu.flags.Z, returnAddress: returnAddressCall };
    case OP_CALL_NC:
      return { kind: 'call', taken: !cpu.flags.C, returnAddress: returnAddressCall };
    case OP_CALL_C:
      return { kind: 'call', taken: !!cpu.flags.C, returnAddress: returnAddressCall };
    case OP_CALL_PO:
      return { kind: 'call', taken: !cpu.flags.P, returnAddress: returnAddressCall };
    case OP_CALL_PE:
      return { kind: 'call', taken: !!cpu.flags.P, returnAddress: returnAddressCall };
    case OP_CALL_P:
      return { kind: 'call', taken: !cpu.flags.S, returnAddress: returnAddressCall };
    case OP_CALL_M:
      return { kind: 'call', taken: !!cpu.flags.S, returnAddress: returnAddressCall };
    default:
      break;
  }

  if (RST_OPCODES.has(opcode)) {
    return { kind: 'rst', taken: true, returnAddress: returnAddressRst };
  }

  switch (opcode) {
    case OP_RET:
      return { kind: 'ret', taken: true };
    case OP_RET_NZ:
      return { kind: 'ret', taken: !cpu.flags.Z };
    case OP_RET_Z:
      return { kind: 'ret', taken: !!cpu.flags.Z };
    case OP_RET_NC:
      return { kind: 'ret', taken: !cpu.flags.C };
    case OP_RET_C:
      return { kind: 'ret', taken: !!cpu.flags.C };
    case OP_RET_PO:
      return { kind: 'ret', taken: !cpu.flags.P };
    case OP_RET_PE:
      return { kind: 'ret', taken: !!cpu.flags.P };
    case OP_RET_P:
      return { kind: 'ret', taken: !cpu.flags.S };
    case OP_RET_M:
      return { kind: 'ret', taken: !!cpu.flags.S };
    default:
      break;
  }

  if (opcode === OP_PREFIX_ED) {
    const opcode2 = memRead((pc + 1) & 0xffff) ?? 0;
    if (ED_RET_OPCODES.has(opcode2)) {
      return { kind: 'ret', taken: true };
    }
  }

  return null;
}

/**
 * ED-prefixed block-repeat opcodes: LDIR, CPIR, INIR, OTIR, LDDR, CPDR, INDR, OTDR.
 * These rewind PC to themselves on every iteration, so one call to step() would appear
 * stuck on the same source line until the counter exhausts. Completing them in one
 * logical step matches user expectations for bulk operations.
 */
const ED_BLOCK_REPEAT_SECOND = new Set<number>([0xb0, 0xb1, 0xb2, 0xb3, 0xb8, 0xb9, 0xba, 0xbb]);

/** Max inner iterations when finishing a block instruction (guards pathological loops). */
const MAX_BLOCK_REPEAT_ITERATIONS = 0x110000;

function isBlockRepeatInstruction(pc: number, memRead: (addr: number) => number): boolean {
  const start = pc & 0xffff;
  if ((memRead(start) & 0xff) !== OP_PREFIX_ED) {
    return false;
  }
  const op1 = memRead((start + 1) & 0xffff) & 0xff;
  return ED_BLOCK_REPEAT_SECOND.has(op1);
}

function stepRuntime(this: Z80RuntimeImpl, options?: { trace?: StepInfo }): RunResult {
  const cpu = this.cpu;
  const hardware = this.hardware;
  const memRead = (addr: number): number => readMemory(hardware, addr);
  if (cpu.halted) {
    return { halted: true, pc: cpu.pc, reason: 'halt', cycles: 0 };
  }
  if (options?.trace) {
    delete options.trace.kind;
    options.trace.taken = false;
    delete options.trace.returnAddress;
    const stepInfo = classifyStepOver(cpu, memRead);
    if (stepInfo) {
      Object.assign(options.trace, stepInfo);
    }
  }

  const instructionStartPc = cpu.pc & 0xffff;
  let totalCycles = 0;
  let iterations = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cycles = execute(cpu, this.execCallbacks);
    totalCycles += cycles;
    iterations += 1;

    const tickResult = (hardware.ioTick ? (hardware.ioTick() as TickResult | void) : undefined) as
      TickResult | undefined;
    if (tickResult?.interrupt !== undefined) {
      const irq = tickResult.interrupt;
      triggerInterrupt(cpu, this.execCallbacks, irq.nonMaskable === true, irq.data ?? 0);
    }
    if (tickResult !== undefined && tickResult.stop === true) {
      return { halted: false, pc: cpu.pc, reason: 'breakpoint', cycles: totalCycles };
    }

    if (cpu.pc >= hardware.memory.length || cpu.halted) {
      cpu.halted = true;
      return { halted: true, pc: cpu.pc, reason: 'halt', cycles: totalCycles };
    }

    const pcStayed = (cpu.pc & 0xffff) === instructionStartPc;
    const repeat = pcStayed && isBlockRepeatInstruction(instructionStartPc, memRead);
    if (!repeat || iterations >= MAX_BLOCK_REPEAT_ITERATIONS) {
      break;
    }
  }

  return { halted: false, pc: cpu.pc, reason: 'breakpoint', cycles: totalCycles };
}

function runUntilStopRuntime(this: Z80RuntimeImpl, breakpoints: Set<number>): RunResult {
  const cpu = this.cpu;
  while (!cpu.halted) {
    if (breakpoints.has(cpu.pc)) {
      return { halted: false, pc: cpu.pc, reason: 'breakpoint' };
    }

    const result = stepRuntime.call(this);
    if (result.halted) {
      return { halted: true, pc: cpu.pc, reason: 'halt' };
    }
  }

  return { halted: true, pc: cpu.pc, reason: 'halt' };
}

function getRegisters(this: Z80RuntimeImpl): Cpu {
  return this.cpu;
}

function isHalted(this: Z80RuntimeImpl): boolean {
  return this.cpu.halted;
}

function getPC(this: Z80RuntimeImpl): number {
  return this.cpu.pc;
}

function cloneFlags(flags: Cpu['flags']): Cpu['flags'] {
  return {
    S: flags.S,
    Z: flags.Z,
    Y: flags.Y,
    H: flags.H,
    X: flags.X,
    P: flags.P,
    N: flags.N,
    C: flags.C,
  };
}

function captureCpuState(this: Z80RuntimeImpl): CpuStateSnapshot {
  const cpu = this.cpu;
  return {
    b: cpu.b,
    a: cpu.a,
    c: cpu.c,
    d: cpu.d,
    e: cpu.e,
    h: cpu.h,
    l: cpu.l,
    a_prime: cpu.a_prime,
    b_prime: cpu.b_prime,
    c_prime: cpu.c_prime,
    d_prime: cpu.d_prime,
    e_prime: cpu.e_prime,
    h_prime: cpu.h_prime,
    l_prime: cpu.l_prime,
    ix: cpu.ix,
    iy: cpu.iy,
    i: cpu.i,
    r: cpu.r,
    sp: cpu.sp,
    pc: cpu.pc,
    flags: cloneFlags(cpu.flags),
    flags_prime: cloneFlags(cpu.flags_prime),
    imode: cpu.imode,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    halted: cpu.halted,
    do_delayed_di: cpu.do_delayed_di,
    do_delayed_ei: cpu.do_delayed_ei,
    cycle_counter: cpu.cycle_counter,
  };
}

function restoreCpuState(this: Z80RuntimeImpl, snapshot: CpuStateSnapshot): void {
  const cpu = this.cpu;
  cpu.b = snapshot.b;
  cpu.a = snapshot.a;
  cpu.c = snapshot.c;
  cpu.d = snapshot.d;
  cpu.e = snapshot.e;
  cpu.h = snapshot.h;
  cpu.l = snapshot.l;
  cpu.a_prime = snapshot.a_prime;
  cpu.b_prime = snapshot.b_prime;
  cpu.c_prime = snapshot.c_prime;
  cpu.d_prime = snapshot.d_prime;
  cpu.e_prime = snapshot.e_prime;
  cpu.h_prime = snapshot.h_prime;
  cpu.l_prime = snapshot.l_prime;
  cpu.ix = snapshot.ix;
  cpu.iy = snapshot.iy;
  cpu.i = snapshot.i;
  cpu.r = snapshot.r;
  cpu.sp = snapshot.sp;
  cpu.pc = snapshot.pc;
  cpu.flags = cloneFlags(snapshot.flags);
  cpu.flags_prime = cloneFlags(snapshot.flags_prime);
  cpu.imode = snapshot.imode;
  cpu.iff1 = snapshot.iff1;
  cpu.iff2 = snapshot.iff2;
  cpu.halted = snapshot.halted;
  cpu.do_delayed_di = snapshot.do_delayed_di;
  cpu.do_delayed_ei = snapshot.do_delayed_ei;
  cpu.cycle_counter = snapshot.cycle_counter;
}

function resetRuntime(this: Z80RuntimeImpl, prog?: HexProgram, ent?: number): void {
  resetCpu(this.cpu);
  if (prog) {
    loadProgram(this.hardware, this.cpu, prog, ent);
  }
}
