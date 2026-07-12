/**
 * @file Z80 Decode Context and Utility Types
 * @description Shared types for the Z80 instruction decoder modules.
 * Provides a context object that bundles CPU state and callbacks,
 * eliminating closure dependencies across module boundaries.
 *
 * @module z80/decode-types
 */

import { Callbacks, Cpu } from './types.js';

/**
 * Decode context bundles CPU state and memory/IO callbacks.
 * This replaces closure-based state sharing, allowing instruction
 * handlers to be defined in separate modules.
 */
export interface DecodeContext {
  /** CPU state (registers, flags, etc.) */
  cpu: Cpu;
  /** Memory and I/O callbacks */
  cb: Callbacks;
}

/**
 * Instruction handler that operates on a decode context.
 * Returns void - modifies context in place.
 */
export type InstructionHandler = (ctx: DecodeContext) => void;

/**
 * Factory function that creates an instruction table.
 * Takes utility functions and returns a sparse array of handlers.
 */
export type InstructionTableFactory = (utils: DecodeUtils) => InstructionHandler[];

/**
 * Byte operation that transforms a value and returns the result.
 * Used for rotate/shift/bit operations.
 */
export type ByteOp = (ctx: DecodeContext, value: number) => number;

/**
 * Byte operation that operates on a value without returning.
 * Used for BIT test operations.
 */
export type ByteOpVoid = (ctx: DecodeContext, value: number) => void;

/**
 * Utility functions passed to instruction table factories.
 * These are the extracted helper functions that instructions need.
 */
export interface DecodeUtils {
  // Signed offset conversion
  getSignedOffsetByte: (value: number) => number;

  // Flag operations
  getFlagsRegister: (ctx: DecodeContext) => number;
  getFlagsPrime: (ctx: DecodeContext) => number;
  setFlagsPrime: (ctx: DecodeContext, value: number) => void;
  updateXYFlags: (ctx: DecodeContext, result: number) => void;

  // Stack operations
  popWord: (ctx: DecodeContext) => number;
  pushWord: (ctx: DecodeContext, value: number) => void;

  // Jump/call operations
  doConditionalAbsoluteJump: (ctx: DecodeContext, condition: boolean) => void;
  doConditionalRelativeJump: (ctx: DecodeContext, condition: boolean) => void;
  doConditionalCall: (ctx: DecodeContext, condition: boolean) => void;
  doConditionalReturn: (ctx: DecodeContext, condition: boolean) => void;
  doReset: (ctx: DecodeContext, address: number) => void;

  // ALU operations
  doAdd: (ctx: DecodeContext, operand: number) => void;
  doAdc: (ctx: DecodeContext, operand: number) => void;
  doSub: (ctx: DecodeContext, operand: number) => void;
  doSbc: (ctx: DecodeContext, operand: number) => void;
  doCp: (ctx: DecodeContext, operand: number) => void;
  doAnd: (ctx: DecodeContext, operand: number) => void;
  doOr: (ctx: DecodeContext, operand: number) => void;
  doXor: (ctx: DecodeContext, operand: number) => void;
  doInc: (ctx: DecodeContext, operand: number) => number;
  doDec: (ctx: DecodeContext, operand: number) => number;

  // 16-bit arithmetic
  doHlAdd: (ctx: DecodeContext, operand: number) => void;
  doHlAdc: (ctx: DecodeContext, operand: number) => void;
  doHlSbc: (ctx: DecodeContext, operand: number) => void;
  doIxAdd: (ctx: DecodeContext, operand: number) => void;

  // Rotate/shift operations (from rotate.ts, wrapped with context)
  doRlc: (ctx: DecodeContext, operand: number) => number;
  doRrc: (ctx: DecodeContext, operand: number) => number;
  doRl: (ctx: DecodeContext, operand: number) => number;
  doRr: (ctx: DecodeContext, operand: number) => number;
  doSla: (ctx: DecodeContext, operand: number) => number;
  doSra: (ctx: DecodeContext, operand: number) => number;
  doSll: (ctx: DecodeContext, operand: number) => number;
  doSrl: (ctx: DecodeContext, operand: number) => number;

  // Indexed addressing helper
  getIxOffset: (ctx: DecodeContext) => number;

  // DAA instruction
  doDaa: (ctx: DecodeContext) => void;

  // Negation
  doNeg: (ctx: DecodeContext) => void;

  // Input with flags
  doIn: (ctx: DecodeContext, port: number) => number;
}
