import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  cycle_counts,
  cycle_counts_cb,
  cycle_counts_dd,
  cycle_counts_ed,
  parity_bits,
} from '../../src/z80/constants.js';

describe('z80-constants', () => {
  it('provides cycle tables of length 256', () => {
    assert.equal(cycle_counts.length, 256);
    assert.equal(cycle_counts_cb.length, 256);
    assert.equal(cycle_counts_dd.length, 256);
    assert.equal(cycle_counts_ed.length, 256);
  });

  it('computes even parity correctly', () => {
    // 0x00 has even parity (0 bits set)
    assert.equal(parity_bits[0x00], 1);
    // 0xff has even parity (8 bits set)
    assert.equal(parity_bits[0xff], 1);
    // 0x01 has odd parity (1 bit set)
    assert.equal(parity_bits[0x01], 0);
    // 0x03 has even parity (2 bits set)
    assert.equal(parity_bits[0x03], 1);
  });
});
