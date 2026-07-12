/**
 * @fileoverview Z80 rotate and shift instruction implementations.
 * Provides bit rotation and shift operations with proper flag handling.
 */

import { parity_bits } from './constants.js';
import { updateXYFlags } from './core-helpers.js';
import { Cpu } from './types.js';

/**
 * Sets CPU flags after a rotate/shift operation.
 * @param cpu - CPU state
 * @param result - 8-bit result value
 * @param carry - Carry out bit (0 or 1)
 */
const setRotateFlags = (cpu: Cpu, result: number, carry: number): void => {
  cpu.flags.N = 0;
  cpu.flags.H = 0;
  cpu.flags.C = carry;
  cpu.flags.Z = !result ? 1 : 0;
  cpu.flags.P = parity_bits[result] ?? 0;
  cpu.flags.S = result & 0x80 ? 1 : 0;
  updateXYFlags(cpu.flags, result);
};

/**
 * Rotate Left Circular - rotates bits left, bit 7 goes to carry and bit 0.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to rotate
 * @returns Rotated 8-bit result
 */
export const do_rlc = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = ((operand << 1) | carry) & 0xff;
  setRotateFlags(cpu, result, carry);
  return result;
};

/**
 * Rotate Right Circular - rotates bits right, bit 0 goes to carry and bit 7.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to rotate
 * @returns Rotated 8-bit result
 */
export const do_rrc = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = ((operand >>> 1) & 0x7f) | (carry << 7);
  setRotateFlags(cpu, result, carry);
  return result & 0xff;
};

/**
 * Rotate Left through carry - bit 7 goes to carry, old carry goes to bit 0.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to rotate
 * @returns Rotated 8-bit result
 */
export const do_rl = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = ((operand << 1) | cpu.flags.C) & 0xff;
  setRotateFlags(cpu, result, carry);
  return result;
};

/**
 * Rotate Right through carry - bit 0 goes to carry, old carry goes to bit 7.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to rotate
 * @returns Rotated 8-bit result
 */
export const do_rr = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = ((operand >>> 1) & 0x7f) | (cpu.flags.C << 7);
  setRotateFlags(cpu, result, carry);
  return result;
};

/**
 * Shift Left Arithmetic - shifts bits left, bit 7 goes to carry, 0 enters bit 0.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to shift
 * @returns Shifted 8-bit result
 */
export const do_sla = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = (operand << 1) & 0xff;
  setRotateFlags(cpu, result, carry);
  return result;
};

/**
 * Shift Right Arithmetic - shifts bits right, bit 0 goes to carry, bit 7 preserved.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to shift
 * @returns Shifted 8-bit result
 */
export const do_sra = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = ((operand >>> 1) & 0x7f) | (operand & 0x80);
  setRotateFlags(cpu, result, carry);
  return result;
};

/**
 * Shift Left Logical (undocumented) - shifts bits left, 1 enters bit 0.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to shift
 * @returns Shifted 8-bit result
 */
export const do_sll = (cpu: Cpu, operand: number): number => {
  const carry = (operand & 0x80) >>> 7;
  const result = ((operand << 1) & 0xff) | 1;
  setRotateFlags(cpu, result, carry);
  return result;
};

/**
 * Shift Right Logical - shifts bits right, bit 0 goes to carry, 0 enters bit 7.
 * @param cpu - CPU state (flags modified)
 * @param operand - 8-bit value to shift
 * @returns Shifted 8-bit result
 */
export const do_srl = (cpu: Cpu, operand: number): number => {
  const carry = operand & 1;
  const result = (operand >>> 1) & 0x7f;
  // SRL forces S to 0 because bit 7 cleared by shift.
  setRotateFlags(cpu, result, carry);
  cpu.flags.S = 0;
  return result;
};
