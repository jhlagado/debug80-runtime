/**
 * @file Exact screen and input proofs for the ideal CP/M terminal.
 */

import { describe, expect, it } from 'vitest';
import {
  CPM22_TERMINAL_ATTR_BOLD,
  CPM22_TERMINAL_ATTR_REVERSE,
  CPM22_TERMINAL_ATTR_UNDERLINE,
  CPM22_TERMINAL_CELL_COUNT,
  CPM22_TERMINAL_COLUMNS,
  CPM22_TERMINAL_ROWS,
  createCpm22Terminal,
  type Cpm22TerminalDevice,
  type Cpm22TerminalSnapshot,
} from '@jhlagado/debug80-runtime/platforms/cpm22/terminal';

function writeText(terminal: Cpm22TerminalDevice, text: string): void {
  for (const character of text) {
    terminal.writeOutput(character.charCodeAt(0));
  }
}

function rowText(snapshot: Cpm22TerminalSnapshot, row: number): string {
  const from = row * snapshot.columns;
  return String.fromCharCode(...snapshot.cells.slice(from, from + snapshot.columns));
}

function cellIndex(row: number, column: number): number {
  return row * CPM22_TERMINAL_COLUMNS + column;
}

describe('CP/M 2.2 terminal screen', () => {
  it('starts as an exact blank 80x24 screen', () => {
    const snapshot = createCpm22Terminal().snapshot();

    expect(snapshot.columns).toBe(80);
    expect(snapshot.rows).toBe(24);
    expect(snapshot.cells).toHaveLength(CPM22_TERMINAL_CELL_COUNT);
    expect(snapshot.attributes).toHaveLength(CPM22_TERMINAL_CELL_COUNT);
    expect([...snapshot.cells].every((value) => value === 0x20)).toBe(true);
    expect([...snapshot.attributes].every((value) => value === 0)).toBe(true);
    expect(snapshot.cursorRow).toBe(0);
    expect(snapshot.cursorColumn).toBe(0);
    expect(snapshot.wrapPending).toBe(false);
  });

  it('keeps carriage return and line feed as separate operations', () => {
    const terminal = createCpm22Terminal();

    writeText(terminal, 'AB\nC\rD');

    const snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0).slice(0, 2)).toBe('AB');
    expect(rowText(snapshot, 1).slice(0, 3)).toBe('D C');
    expect(snapshot.cursorRow).toBe(1);
    expect(snapshot.cursorColumn).toBe(1);
  });

  it('defers wrapping until the next printable character', () => {
    const terminal = createCpm22Terminal();

    writeText(terminal, 'X'.repeat(CPM22_TERMINAL_COLUMNS));
    const atMargin = terminal.snapshot();
    expect(atMargin.cursorRow).toBe(0);
    expect(atMargin.cursorColumn).toBe(79);
    expect(atMargin.wrapPending).toBe(true);

    terminal.writeOutput('Y'.charCodeAt(0));
    const wrapped = terminal.snapshot();
    expect(wrapped.cursorRow).toBe(1);
    expect(wrapped.cursorColumn).toBe(1);
    expect(rowText(wrapped, 1).startsWith('Y')).toBe(true);
    expect(wrapped.wrapPending).toBe(false);
  });

  it('cancels a pending wrap on carriage return', () => {
    const terminal = createCpm22Terminal();
    writeText(terminal, 'X'.repeat(80));

    writeText(terminal, '\rY');

    const snapshot = terminal.snapshot();
    expect(snapshot.cursorRow).toBe(0);
    expect(rowText(snapshot, 0).startsWith('Y')).toBe(true);
  });

  it('scrolls exactly one row at the bottom margin', () => {
    const terminal = createCpm22Terminal();
    for (let row = 0; row < CPM22_TERMINAL_ROWS; row += 1) {
      writeText(terminal, String.fromCharCode(0x41 + row));
      if (row !== CPM22_TERMINAL_ROWS - 1) {
        writeText(terminal, '\r\n');
      }
    }

    writeText(terminal, '\r\n');

    const snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0).startsWith('B')).toBe(true);
    expect(rowText(snapshot, 22).startsWith('X')).toBe(true);
    expect(rowText(snapshot, 23)).toBe(' '.repeat(80));
    expect(snapshot.cursorRow).toBe(23);
    expect(snapshot.cursorColumn).toBe(0);
  });

  it('implements bell, backspace, and fixed eight-column tabs', () => {
    const terminal = createCpm22Terminal();

    writeText(terminal, 'A\tB\bC\u0007');

    const snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0).slice(0, 10)).toBe('A       C ');
    expect(snapshot.cursorColumn).toBe(9);
    expect(snapshot.bellCount).toBe(1);
  });

  it('positions and moves the cursor with fragmented CSI sequences', () => {
    const terminal = createCpm22Terminal();

    for (const byte of [0x1b, 0x5b, 0x32, 0x34, 0x3b, 0x38, 0x30, 0x48]) {
      terminal.writeOutput(byte);
    }
    writeText(terminal, 'Z\u001b[2A\u001b[3D!');

    const snapshot = terminal.snapshot();
    expect(snapshot.cells[cellIndex(23, 79)]).toBe('Z'.charCodeAt(0));
    expect(snapshot.cells[cellIndex(21, 76)]).toBe('!'.charCodeAt(0));
    expect(snapshot.cursorRow).toBe(21);
    expect(snapshot.cursorColumn).toBe(77);
  });

  it('uses one for omitted and zero cursor-count parameters and clamps positions', () => {
    const terminal = createCpm22Terminal();

    writeText(terminal, '\u001b[999;999H\u001b[0A\u001b[0D');

    const snapshot = terminal.snapshot();
    expect(snapshot.cursorRow).toBe(22);
    expect(snapshot.cursorColumn).toBe(78);
  });

  it('erases display modes 0, 1, and 2 without moving the cursor', () => {
    const terminal = createCpm22Terminal();
    writeText(terminal, 'A'.repeat(80));
    writeText(terminal, '\u001b[2;1HB'.repeat(1));
    writeText(terminal, '\u001b[1;2H\u001b[0J');

    let snapshot = terminal.snapshot();
    expect(snapshot.cells[cellIndex(0, 0)]).toBe('A'.charCodeAt(0));
    expect(snapshot.cells[cellIndex(0, 1)]).toBe(0x20);
    expect(snapshot.cells[cellIndex(1, 0)]).toBe(0x20);
    expect([snapshot.cursorRow, snapshot.cursorColumn]).toEqual([0, 1]);

    terminal.reset();
    writeText(terminal, '\u001b[2;2HZ\u001b[2;2H\u001b[1J');
    snapshot = terminal.snapshot();
    expect(snapshot.cells[cellIndex(0, 79)]).toBe(0x20);
    expect(snapshot.cells[cellIndex(1, 1)]).toBe(0x20);
    expect([snapshot.cursorRow, snapshot.cursorColumn]).toEqual([1, 1]);

    writeText(terminal, 'Q\u001b[2J');
    snapshot = terminal.snapshot();
    expect([...snapshot.cells].every((value) => value === 0x20)).toBe(true);
    expect([snapshot.cursorRow, snapshot.cursorColumn]).toEqual([1, 2]);
  });

  it('erases line modes 0, 1, and 2 and clears erased attributes', () => {
    const terminal = createCpm22Terminal();
    writeText(terminal, '\u001b[7mABCDE\u001b[3D\u001b[0K');

    let snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0).slice(0, 5)).toBe('AB   ');
    expect(snapshot.attributes[cellIndex(0, 2)]).toBe(0);

    writeText(terminal, '\u001b[1K');
    snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0).slice(0, 5)).toBe('     ');

    writeText(terminal, 'XYZ\u001b[2K');
    snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0)).toBe(' '.repeat(80));
  });

  it('records bold, underline, and reverse attributes per cell', () => {
    const terminal = createCpm22Terminal();

    writeText(terminal, '\u001b[1;4;7mX\u001b[0mY');

    const snapshot = terminal.snapshot();
    expect(snapshot.attributes[0]).toBe(
      CPM22_TERMINAL_ATTR_BOLD | CPM22_TERMINAL_ATTR_UNDERLINE | CPM22_TERMINAL_ATTR_REVERSE
    );
    expect(snapshot.attributes[1]).toBe(0);
    expect(snapshot.currentAttributes).toBe(0);
  });

  it('ignores unsupported and overlong escape sequences without rendering them', () => {
    const terminal = createCpm22Terminal();

    writeText(terminal, 'A\u001b7B\u001b[');
    writeText(terminal, '1'.repeat(33));
    writeText(terminal, 'C');

    const snapshot = terminal.snapshot();
    expect(rowText(snapshot, 0).slice(0, 3)).toBe('ABC');
  });

  it('returns independent snapshot arrays', () => {
    const terminal = createCpm22Terminal();
    terminal.snapshot().cells[0] = 0;

    expect(terminal.snapshot().cells[0]).toBe(0x20);
  });
});

describe('CP/M 2.2 terminal input', () => {
  it('queues canonical bytes in order and reports exact status bits', () => {
    const terminal = createCpm22Terminal();
    expect(terminal.readStatus()).toBe(0b10);
    expect(terminal.readInput()).toBe(0);

    terminal.enqueueInput([0x0d, 0x08, 0x7f, 0x1b, 0x5b, 0x41]);

    expect(terminal.readStatus()).toBe(0b11);
    expect(Array.from({ length: 6 }, () => terminal.readInput())).toEqual([
      0x0d, 0x08, 0x7f, 0x1b, 0x5b, 0x41,
    ]);
    expect(terminal.readStatus()).toBe(0b10);
  });

  it('does not modify the output screen when input is queued or consumed', () => {
    const terminal = createCpm22Terminal();
    terminal.enqueueInput([0x41]);
    terminal.readInput();

    expect(rowText(terminal.snapshot(), 0)).toBe(' '.repeat(80));
  });

  it('masks input values and clears pending input on reset', () => {
    const terminal = createCpm22Terminal();
    terminal.enqueueInput([-1, 0x141]);
    expect(terminal.readInput()).toBe(0xff);

    terminal.reset();

    expect(terminal.readInput()).toBe(0);
    expect(terminal.snapshot().input).toEqual([]);
  });
});
