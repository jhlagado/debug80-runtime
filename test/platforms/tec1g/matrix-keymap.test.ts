import { describe, expect, it } from 'vitest';
import { MATRIX_ASCII_MAP } from '@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap';

describe('TEC-1G matrix keymap', () => {
  it('covers all printable ASCII characters', () => {
    for (let code = 0x20; code <= 0x7e; code += 1) {
      const ch = String.fromCharCode(code);
      const combos = MATRIX_ASCII_MAP[ch];
      expect(combos?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('covers MON-3 matrix control keys used by arrows and editing keys', () => {
    for (const code of [0x03, 0x04, 0x05, 0x06, 0x08, 0x09, 0x0d, 0x1b]) {
      const ch = String.fromCharCode(code);
      const combos = MATRIX_ASCII_MAP[ch];
      expect(combos?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('covers the full Ctrl+A through Ctrl+Z ASCII control-code range', () => {
    for (let code = 0x01; code <= 0x1a; code += 1) {
      const ch = String.fromCharCode(code);
      const combos = MATRIX_ASCII_MAP[ch] ?? [];
      const ctrlCombo = combos.find((combo) => combo.modifier === 'ctrl');

      expect(ctrlCombo, `Ctrl+${String.fromCharCode(code + 0x40)}`).toBeDefined();
    }
  });

  it('keeps ambiguous low codes available as native unmodified matrix keys', () => {
    for (const code of [0x03, 0x04, 0x05, 0x06, 0x08, 0x09]) {
      const ch = String.fromCharCode(code);
      const combos = MATRIX_ASCII_MAP[ch] ?? [];

      expect(combos.some((combo) => combo.modifier === undefined)).toBe(true);
      expect(combos.some((combo) => combo.modifier === 'ctrl')).toBe(true);
    }
  });

  it('returns combos within matrix bounds', () => {
    for (const combos of Object.values(MATRIX_ASCII_MAP)) {
      for (const combo of combos) {
        expect(combo.row).toBeGreaterThanOrEqual(0);
        expect(combo.row).toBeLessThan(16);
        expect(combo.col).toBeGreaterThanOrEqual(0);
        expect(combo.col).toBeLessThan(8);
      }
    }
  });
});
