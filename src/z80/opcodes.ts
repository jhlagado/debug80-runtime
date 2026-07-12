/**
 * @fileoverview Z80 opcode constants.
 * Defines opcode values for control flow instructions used in stepping logic.
 */

// CALL instructions (conditional and unconditional)
export const OP_CALL_NZ = 0xc4;
export const OP_CALL_Z = 0xcc;
export const OP_CALL_NC = 0xd4;
export const OP_CALL_C = 0xdc;
export const OP_CALL_PO = 0xe4;
export const OP_CALL_PE = 0xec;
export const OP_CALL_P = 0xf4;
export const OP_CALL_M = 0xfc;
export const OP_CALL_NN = 0xcd;

// RST (restart) instructions - single-byte calls to fixed addresses
const OP_RST_00 = 0xc7;
const OP_RST_08 = 0xcf;
const OP_RST_10 = 0xd7;
const OP_RST_18 = 0xdf;
const OP_RST_20 = 0xe7;
const OP_RST_28 = 0xef;
const OP_RST_30 = 0xf7;
const OP_RST_38 = 0xff;

export const RST_OPCODES = new Set<number>([
  OP_RST_00,
  OP_RST_08,
  OP_RST_10,
  OP_RST_18,
  OP_RST_20,
  OP_RST_28,
  OP_RST_30,
  OP_RST_38,
]);

// RET instructions (conditional and unconditional)
export const OP_RET_NZ = 0xc0;
export const OP_RET_Z = 0xc8;
export const OP_RET = 0xc9;
export const OP_RET_NC = 0xd0;
export const OP_RET_C = 0xd8;
export const OP_RET_PO = 0xe0;
export const OP_RET_PE = 0xe8;
export const OP_RET_P = 0xf0;
export const OP_RET_M = 0xf8;

// ED prefix and extended return instructions
export const OP_PREFIX_ED = 0xed;
const OP_RETN_1 = 0x45;
const OP_RETI = 0x4d;
const OP_RETN_2 = 0x55;
const OP_RETN_3 = 0x5d;
const OP_RETN_4 = 0x65;
const OP_RETN_5 = 0x6d;
const OP_RETN_6 = 0x75;
const OP_RETN_7 = 0x7d;

export const ED_RET_OPCODES = new Set<number>([
  OP_RETN_1,
  OP_RETN_2,
  OP_RETN_3,
  OP_RETN_4,
  OP_RETN_5,
  OP_RETN_6,
  OP_RETN_7,
  OP_RETI,
]);
