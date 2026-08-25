/**
 * @file Headless 80x24 terminal model for the ideal Debug80 CP/M 2.2 platform.
 */

export const CPM22_TERMINAL_COLUMNS = 80;
export const CPM22_TERMINAL_ROWS = 24;
export const CPM22_TERMINAL_CELL_COUNT = CPM22_TERMINAL_COLUMNS * CPM22_TERMINAL_ROWS;

export const CPM22_TERMINAL_ATTR_BOLD = 1 << 0;
export const CPM22_TERMINAL_ATTR_UNDERLINE = 1 << 1;
export const CPM22_TERMINAL_ATTR_REVERSE = 1 << 2;

const ASCII_BEL = 0x07;
const ASCII_BS = 0x08;
const ASCII_HT = 0x09;
const ASCII_LF = 0x0a;
const ASCII_CR = 0x0d;
const ASCII_ESC = 0x1b;
const ASCII_SPACE = 0x20;
const ASCII_TILDE = 0x7e;
const CSI_MAX_BYTES = 32;

type ParserState = 'ground' | 'escape' | 'csi';

export interface Cpm22TerminalSnapshot {
  columns: number;
  rows: number;
  cells: Uint8Array;
  attributes: Uint8Array;
  cursorRow: number;
  cursorColumn: number;
  currentAttributes: number;
  wrapPending: boolean;
  bellCount: number;
  input: number[];
}

export interface Cpm22TerminalDevice {
  writeOutput(value: number): void;
  enqueueInput(bytes: Iterable<number>): void;
  readInput(): number;
  readStatus(): number;
  reset(): void;
  snapshot(): Cpm22TerminalSnapshot;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseCsiParameters(source: string): number[] {
  if (source.length === 0) {
    return [];
  }
  return source.split(';').map((part) => {
    if (part.length === 0) {
      return 0;
    }
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : 0;
  });
}

function countParameter(parameters: number[], index: number): number {
  const value = parameters[index] ?? 0;
  return value <= 0 ? 1 : value;
}

/** Creates a deterministic character-cell terminal and raw input FIFO. */
export function createCpm22Terminal(): Cpm22TerminalDevice {
  const cells = new Uint8Array(CPM22_TERMINAL_CELL_COUNT);
  const attributes = new Uint8Array(CPM22_TERMINAL_CELL_COUNT);
  const input: number[] = [];
  let cursorRow = 0;
  let cursorColumn = 0;
  let currentAttributes = 0;
  let wrapPending = false;
  let bellCount = 0;
  let parserState: ParserState = 'ground';
  let csiParameters = '';
  let csiBytes = 0;

  const cellIndex = (row: number, column: number): number => row * CPM22_TERMINAL_COLUMNS + column;

  const clearCells = (from: number, toInclusive: number): void => {
    if (toInclusive < from) {
      return;
    }
    cells.fill(ASCII_SPACE, from, toInclusive + 1);
    attributes.fill(0, from, toInclusive + 1);
  };

  const scrollUp = (): void => {
    cells.copyWithin(0, CPM22_TERMINAL_COLUMNS);
    attributes.copyWithin(0, CPM22_TERMINAL_COLUMNS);
    clearCells(CPM22_TERMINAL_CELL_COUNT - CPM22_TERMINAL_COLUMNS, CPM22_TERMINAL_CELL_COUNT - 1);
  };

  const lineFeed = (): void => {
    if (cursorRow === CPM22_TERMINAL_ROWS - 1) {
      scrollUp();
      return;
    }
    cursorRow += 1;
  };

  const cancelWrap = (): void => {
    wrapPending = false;
  };

  const writePrintable = (value: number): void => {
    if (wrapPending) {
      cursorColumn = 0;
      lineFeed();
      wrapPending = false;
    }
    const index = cellIndex(cursorRow, cursorColumn);
    cells[index] = value;
    attributes[index] = currentAttributes;
    if (cursorColumn === CPM22_TERMINAL_COLUMNS - 1) {
      wrapPending = true;
    } else {
      cursorColumn += 1;
    }
  };

  const eraseDisplay = (mode: number): void => {
    const cursor = cellIndex(cursorRow, cursorColumn);
    if (mode === 0) {
      clearCells(cursor, CPM22_TERMINAL_CELL_COUNT - 1);
    } else if (mode === 1) {
      clearCells(0, cursor);
    } else if (mode === 2) {
      clearCells(0, CPM22_TERMINAL_CELL_COUNT - 1);
    }
  };

  const eraseLine = (mode: number): void => {
    const lineStart = cellIndex(cursorRow, 0);
    const cursor = lineStart + cursorColumn;
    const lineEnd = lineStart + CPM22_TERMINAL_COLUMNS - 1;
    if (mode === 0) {
      clearCells(cursor, lineEnd);
    } else if (mode === 1) {
      clearCells(lineStart, cursor);
    } else if (mode === 2) {
      clearCells(lineStart, lineEnd);
    }
  };

  const selectGraphicRendition = (parameters: number[]): void => {
    const values = parameters.length === 0 ? [0] : parameters;
    for (const value of values) {
      if (value === 0) {
        currentAttributes = 0;
      } else if (value === 1) {
        currentAttributes |= CPM22_TERMINAL_ATTR_BOLD;
      } else if (value === 4) {
        currentAttributes |= CPM22_TERMINAL_ATTR_UNDERLINE;
      } else if (value === 7) {
        currentAttributes |= CPM22_TERMINAL_ATTR_REVERSE;
      }
    }
  };

  const executeCsi = (finalByte: number): void => {
    const parameters = parseCsiParameters(csiParameters);
    cancelWrap();
    switch (finalByte) {
      case 0x41: // A: cursor up
        cursorRow = clamp(cursorRow - countParameter(parameters, 0), 0, CPM22_TERMINAL_ROWS - 1);
        return;
      case 0x42: // B: cursor down
        cursorRow = clamp(cursorRow + countParameter(parameters, 0), 0, CPM22_TERMINAL_ROWS - 1);
        return;
      case 0x43: // C: cursor forward
        cursorColumn = clamp(
          cursorColumn + countParameter(parameters, 0),
          0,
          CPM22_TERMINAL_COLUMNS - 1
        );
        return;
      case 0x44: // D: cursor back
        cursorColumn = clamp(
          cursorColumn - countParameter(parameters, 0),
          0,
          CPM22_TERMINAL_COLUMNS - 1
        );
        return;
      case 0x48: // H: cursor position
      case 0x66: {
        // f: horizontal and vertical position
        const row = countParameter(parameters, 0) - 1;
        const column = countParameter(parameters, 1) - 1;
        cursorRow = clamp(row, 0, CPM22_TERMINAL_ROWS - 1);
        cursorColumn = clamp(column, 0, CPM22_TERMINAL_COLUMNS - 1);
        return;
      }
      case 0x4a: // J: erase in display
        eraseDisplay(parameters[0] ?? 0);
        return;
      case 0x4b: // K: erase in line
        eraseLine(parameters[0] ?? 0);
        return;
      case 0x6d: // m: select graphic rendition
        selectGraphicRendition(parameters);
        return;
      default:
        return;
    }
  };

  const writeGroundByte = (value: number): void => {
    if (value >= ASCII_SPACE && value <= ASCII_TILDE) {
      writePrintable(value);
      return;
    }
    if (value === ASCII_ESC) {
      parserState = 'escape';
      return;
    }
    if (value === ASCII_BEL) {
      bellCount += 1;
      return;
    }
    if (value === ASCII_BS) {
      cancelWrap();
      cursorColumn = Math.max(0, cursorColumn - 1);
      return;
    }
    if (value === ASCII_HT) {
      cancelWrap();
      cursorColumn = Math.min(CPM22_TERMINAL_COLUMNS - 1, (Math.floor(cursorColumn / 8) + 1) * 8);
      return;
    }
    if (value === ASCII_LF) {
      cancelWrap();
      lineFeed();
      return;
    }
    if (value === ASCII_CR) {
      cancelWrap();
      cursorColumn = 0;
    }
  };

  const writeOutput = (value: number): void => {
    const byte = value & 0xff;
    if (parserState === 'ground') {
      writeGroundByte(byte);
      return;
    }
    if (parserState === 'escape') {
      if (byte === 0x5b) {
        parserState = 'csi';
        csiParameters = '';
        csiBytes = 0;
      } else {
        parserState = 'ground';
      }
      return;
    }

    csiBytes += 1;
    if (csiBytes > CSI_MAX_BYTES) {
      parserState = 'ground';
      csiParameters = '';
      return;
    }
    if ((byte >= 0x30 && byte <= 0x39) || byte === 0x3b) {
      csiParameters += String.fromCharCode(byte);
      return;
    }
    if (byte >= 0x40 && byte <= 0x7e) {
      executeCsi(byte);
    }
    parserState = 'ground';
    csiParameters = '';
  };

  const enqueueInput = (bytes: Iterable<number>): void => {
    for (const value of bytes) {
      input.push(value & 0xff);
    }
  };

  const readInput = (): number => input.shift() ?? 0;

  const readStatus = (): number => (input.length > 0 ? 0b11 : 0b10);

  const reset = (): void => {
    cells.fill(ASCII_SPACE);
    attributes.fill(0);
    input.length = 0;
    cursorRow = 0;
    cursorColumn = 0;
    currentAttributes = 0;
    wrapPending = false;
    bellCount = 0;
    parserState = 'ground';
    csiParameters = '';
    csiBytes = 0;
  };

  const snapshot = (): Cpm22TerminalSnapshot => ({
    columns: CPM22_TERMINAL_COLUMNS,
    rows: CPM22_TERMINAL_ROWS,
    cells: cells.slice(),
    attributes: attributes.slice(),
    cursorRow,
    cursorColumn,
    currentAttributes,
    wrapPending,
    bellCount,
    input: [...input],
  });

  reset();
  return { writeOutput, enqueueInput, readInput, readStatus, reset, snapshot };
}
