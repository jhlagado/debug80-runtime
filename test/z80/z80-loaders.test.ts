import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseIntelHex } from '../../src/z80/loaders.js';

describe('z80-loaders', () => {
  it('throws on malformed hex line', () => {
    assert.throws(() => parseIntelHex('not-a-hex'), /Invalid HEX line/);
  });

  it('defaults start address to zero when no data records', () => {
    const program = parseIntelHex(':00000001FF'); // EOF only
    assert.equal(program.startAddress, 0);
    assert.equal(program.memory[0], 0);
  });

  it('ignores non-data records', () => {
    const hex = [
      ':020000020000FC', // extended segment address (type 02) - ignored
      ':0100000001FE', // data at 0x0000
      ':00000001FF',
    ].join('\n');
    const program = parseIntelHex(hex);
    assert.equal(program.startAddress, 0);
    assert.equal(program.memory[0], 0x01);
    assert.deepEqual(program.writeRanges, [{ start: 0x0000, end: 0x0001 }]);
  });

  it('tracks written ranges from HEX data records', () => {
    const hex = [':020100000102FA', ':01020000AA53', ':00000001FF'].join('\n');
    const program = parseIntelHex(hex);

    assert.deepEqual(program.writeRanges, [
      { start: 0x0100, end: 0x0102 },
      { start: 0x0200, end: 0x0201 },
    ]);
  });
});
