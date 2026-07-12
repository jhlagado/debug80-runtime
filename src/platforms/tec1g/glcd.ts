/**
 * @file TEC-1G ST7920 GLCD controller.
 */

import { CycleClock } from '../cycle-clock.js';
import { microsecondsToClocks, millisecondsToClocks } from '../tec-common/index.js';
import {
  GLCD_BASIC_MASK,
  GLCD_BLINK_ON,
  GLCD_CMD_BASIC,
  GLCD_CMD_CLEAR,
  GLCD_CMD_DISPLAY_BASE,
  GLCD_CMD_DISPLAY_MASK,
  GLCD_CMD_ENTRY_BASE,
  GLCD_CMD_ENTRY_MASK,
  GLCD_CMD_HOME,
  GLCD_CMD_REVERSE_BASE,
  GLCD_CMD_REVERSE_MASK,
  GLCD_CMD_SCROLL_ADDR_BASE,
  GLCD_CMD_SCROLL_ADDR_MASK,
  GLCD_CMD_SCROLL_BASE,
  GLCD_CMD_SCROLL_MASK,
  GLCD_CMD_SET_ADDR,
  GLCD_CMD_SHIFT_BASE,
  GLCD_CMD_SHIFT_MASK,
  GLCD_CMD_STANDBY,
  GLCD_CURSOR_ON,
  GLCD_DISPLAY_ON,
  GLCD_ENTRY_INCREMENT,
  GLCD_ENTRY_SHIFT,
  GLCD_GRAPHICS_BIT,
  GLCD_RE_BIT,
  GLCD_SHIFT_DISPLAY,
  GLCD_SHIFT_RIGHT,
  GLCD_STATUS_BUSY,
  TEC1G_GLCD_COL_BANK_BIT,
  TEC1G_GLCD_COL_MASK,
  TEC1G_GLCD_COL_STRIDE,
  TEC1G_GLCD_DDRAM_BASE,
  TEC1G_GLCD_DDRAM_MASK,
  TEC1G_GLCD_DDRAM_ROW0_BIT,
  TEC1G_GLCD_DDRAM_ROW1_BIT,
  TEC1G_GLCD_DDRAM_STEP,
  TEC1G_GLCD_ROW_BASE,
  TEC1G_GLCD_ROW_MASK,
  TEC1G_GLCD_ROW_STRIDE,
  TEC1G_LCD_SPACE,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW2,
  TEC1G_MASK_LOW5,
  TEC1G_MASK_LOW6,
  TEC1G_MASK_LOW7,
} from './constants.js';

const GLCD_BUSY_US = 72;
const GLCD_BUSY_CLEAR_US = 1600;
const GLCD_BLINK_MS = 400;

export interface GlcdState {
  glcd: Uint8Array;
  glcdRowAddr: number;
  glcdRowBase: number;
  glcdCol: number;
  glcdExpectColumn: boolean;
  glcdRe: boolean;
  glcdGraphics: boolean;
  glcdReadPrimed: boolean;
  glcdReadLatch: number;
  glcdDisplayOn: boolean;
  glcdCursorOn: boolean;
  glcdCursorBlink: boolean;
  glcdBlinkVisible: boolean;
  glcdBlinkEventId: number | null;
  glcdEntryIncrement: boolean;
  glcdEntryShift: boolean;
  glcdTextShift: number;
  glcdScrollMode: boolean;
  glcdScroll: number;
  glcdReverseMask: number;
  glcdGdramPhase: 0 | 1;
  glcdDdram: Uint8Array;
  glcdDdramAddr: number;
  glcdDdramPhase: 0 | 1;
}

export interface GlcdController {
  readStatus(): number;
  readData(): number;
  writeCommand(value: number): void;
  writeData(value: number): void;
  setClockHz(hz: number): void;
  reset(): void;
}

/**
 *
 */
export function createGlcdState(): GlcdState {
  return {
    glcd: new Uint8Array(1024),
    glcdRowAddr: 0,
    glcdRowBase: 0,
    glcdCol: 0,
    glcdExpectColumn: false,
    glcdRe: false,
    glcdGraphics: false,
    glcdReadPrimed: false,
    glcdReadLatch: 0,
    glcdDisplayOn: true,
    glcdCursorOn: false,
    glcdCursorBlink: false,
    glcdBlinkVisible: true,
    glcdBlinkEventId: null,
    glcdEntryIncrement: true,
    glcdEntryShift: false,
    glcdTextShift: 0,
    glcdScrollMode: false,
    glcdScroll: 0,
    glcdReverseMask: 0,
    glcdGdramPhase: 0,
    glcdDdram: new Uint8Array(64),
    glcdDdramAddr: TEC1G_GLCD_DDRAM_BASE,
    glcdDdramPhase: 0,
  };
}

/**
 *
 */
function resetGlcdState(state: GlcdState, cycleClock: CycleClock): void {
  state.glcd.fill(0);
  state.glcdRowAddr = 0;
  state.glcdRowBase = 0;
  state.glcdCol = 0;
  state.glcdExpectColumn = false;
  state.glcdRe = false;
  state.glcdGraphics = false;
  state.glcdReadPrimed = false;
  state.glcdReadLatch = 0;
  state.glcdDisplayOn = true;
  state.glcdCursorOn = false;
  state.glcdCursorBlink = false;
  state.glcdBlinkVisible = true;
  if (state.glcdBlinkEventId !== null) {
    cycleClock.cancel(state.glcdBlinkEventId);
    state.glcdBlinkEventId = null;
  }
  state.glcdEntryIncrement = true;
  state.glcdEntryShift = false;
  state.glcdTextShift = 0;
  state.glcdScrollMode = false;
  state.glcdScroll = 0;
  state.glcdReverseMask = 0;
  state.glcdGdramPhase = 0;
  state.glcdDdram.fill(TEC1G_LCD_SPACE);
  state.glcdDdramAddr = TEC1G_GLCD_DDRAM_BASE;
  state.glcdDdramPhase = 0;
}

/**
 * Creates the TEC-1G ST7920 GLCD controller.
 */
export function createGlcdController(
  state: GlcdState,
  cycleClock: CycleClock,
  clockHz: number,
  onUpdate: () => void
): GlcdController {
  let glcdBusyUntil = 0;
  let currentClockHz = clockHz;

  const setRowAddr = (value: number): void => {
    state.glcdRowAddr = value & TEC1G_MASK_LOW5;
    state.glcdExpectColumn = true;
    state.glcdGdramPhase = 0;
    state.glcdReadPrimed = false;
  };

  const setColumn = (value: number): void => {
    const bankSelected = (value & TEC1G_GLCD_COL_BANK_BIT) !== 0;
    state.glcdRowBase = bankSelected ? TEC1G_GLCD_ROW_BASE : 0;
    // Store the full 4-bit X address (0-15) so auto-increment can cross into the lower bank.
    state.glcdCol = value & (TEC1G_GLCD_COL_BANK_BIT | TEC1G_GLCD_COL_MASK);
    state.glcdExpectColumn = false;
    state.glcdGdramPhase = 0;
    state.glcdReadPrimed = false;
  };

  const ddramIndex = (addr: number): number => {
    const a = addr & TEC1G_MASK_LOW7;
    const row = ((a & TEC1G_GLCD_DDRAM_ROW1_BIT) >> 4) | ((a & TEC1G_GLCD_DDRAM_ROW0_BIT) >> 2);
    const col = a & TEC1G_GLCD_COL_MASK;
    return row * TEC1G_GLCD_ROW_STRIDE + col * TEC1G_GLCD_COL_STRIDE;
  };

  const setDdramAddr = (addr: number): void => {
    state.glcdDdramAddr = addr & TEC1G_MASK_BYTE;
    state.glcdDdramPhase = 0;
    onUpdate();
  };

  const shiftDisplay = (delta: number): void => {
    const next = Math.max(-15, Math.min(15, state.glcdTextShift + delta));
    if (next !== state.glcdTextShift) {
      state.glcdTextShift = next;
      onUpdate();
    }
  };

  const offsetDdramAddr = (delta: number): void => {
    const base = state.glcdDdramAddr & TEC1G_GLCD_DDRAM_MASK;
    const next = (base + delta + TEC1G_GLCD_DDRAM_STEP) & TEC1G_GLCD_DDRAM_MASK;
    state.glcdDdramAddr = TEC1G_GLCD_DDRAM_BASE | next;
    state.glcdDdramPhase = 0;
  };

  const advanceDdramAddr = (): void => {
    const delta = state.glcdEntryIncrement ? 1 : -1;
    offsetDdramAddr(delta);
    if (state.glcdEntryShift) {
      shiftDisplay(delta);
    }
  };

  const setBusy = (microseconds: number): void => {
    const cycles = microsecondsToClocks(currentClockHz, microseconds);
    const until = cycleClock.now() + cycles;
    if (until > glcdBusyUntil) {
      glcdBusyUntil = until;
    }
  };

  const isBusy = (): boolean => cycleClock.now() < glcdBusyUntil;

  const rescheduleBlink = (): void => {
    if (state.glcdBlinkEventId !== null) {
      cycleClock.cancel(state.glcdBlinkEventId);
      state.glcdBlinkEventId = null;
    }
    state.glcdBlinkVisible = true;
    if (!state.glcdCursorBlink) {
      onUpdate();
      return;
    }
    const periodCycles = millisecondsToClocks(currentClockHz, GLCD_BLINK_MS);
    const scheduleToggle = (): void => {
      if (!state.glcdCursorBlink) {
        state.glcdBlinkVisible = true;
        state.glcdBlinkEventId = null;
        onUpdate();
        return;
      }
      state.glcdBlinkVisible = !state.glcdBlinkVisible;
      onUpdate();
      state.glcdBlinkEventId = cycleClock.scheduleIn(periodCycles, scheduleToggle);
    };
    state.glcdBlinkEventId = cycleClock.scheduleIn(periodCycles, scheduleToggle);
    onUpdate();
  };

  const writeDdram = (value: number): void => {
    const idx = ddramIndex(state.glcdDdramAddr);
    const slot = idx + state.glcdDdramPhase;
    if (slot >= 0 && slot < state.glcdDdram.length) {
      state.glcdDdram[slot] = value & TEC1G_MASK_BYTE;
    }
    if (state.glcdDdramPhase === 0) {
      state.glcdDdramPhase = 1;
    } else {
      state.glcdDdramPhase = 0;
      advanceDdramAddr();
    }
    onUpdate();
  };

  const readDdram = (): number => {
    const idx = ddramIndex(state.glcdDdramAddr);
    const slot = idx + state.glcdDdramPhase;
    const value =
      slot >= 0 && slot < state.glcdDdram.length
        ? (state.glcdDdram[slot] ?? TEC1G_LCD_SPACE)
        : TEC1G_LCD_SPACE;
    if (state.glcdDdramPhase === 0) {
      state.glcdDdramPhase = 1;
    } else {
      state.glcdDdramPhase = 0;
      advanceDdramAddr();
    }
    return value & TEC1G_MASK_BYTE;
  };

  const writeData = (value: number): void => {
    if (!state.glcdGraphics) {
      writeDdram(value);
      setBusy(GLCD_BUSY_US);
      return;
    }
    // Derive the active bank from the full X address (bit 3 = lower chip).
    const colBank = (state.glcdCol & TEC1G_GLCD_COL_BANK_BIT) !== 0 ? TEC1G_GLCD_ROW_BASE : 0;
    const row = (colBank + state.glcdRowAddr) & TEC1G_GLCD_ROW_MASK;
    const col = state.glcdCol & TEC1G_GLCD_COL_MASK;
    const index = row * TEC1G_GLCD_ROW_STRIDE + col * TEC1G_GLCD_COL_STRIDE + state.glcdGdramPhase;
    if (index >= 0 && index < state.glcd.length) {
      state.glcd[index] = value & TEC1G_MASK_BYTE;
      onUpdate();
    }
    setBusy(GLCD_BUSY_US);
    if (state.glcdGdramPhase === 0) {
      state.glcdGdramPhase = 1;
    } else {
      state.glcdGdramPhase = 0;
      // X auto-increments after each 16-bit word; per ST7920 datasheet it stays at the
      // boundary if out of range. Max valid X is 0x0F (lower bank, col 7).
      const maxCol = TEC1G_GLCD_COL_BANK_BIT | TEC1G_GLCD_COL_MASK;
      if (state.glcdCol < maxCol) {
        state.glcdCol += 1;
      }
    }
  };

  const readData = (): number => {
    if (!state.glcdGraphics) {
      return readDdram();
    }
    const colBank = (state.glcdCol & TEC1G_GLCD_COL_BANK_BIT) !== 0 ? TEC1G_GLCD_ROW_BASE : 0;
    const row = (colBank + state.glcdRowAddr) & TEC1G_GLCD_ROW_MASK;
    const col = state.glcdCol & TEC1G_GLCD_COL_MASK;
    const index = row * TEC1G_GLCD_ROW_STRIDE + col * TEC1G_GLCD_COL_STRIDE + state.glcdGdramPhase;
    const value = index >= 0 && index < state.glcd.length ? (state.glcd[index] ?? 0) : 0;
    if (!state.glcdReadPrimed) {
      state.glcdReadPrimed = true;
      state.glcdReadLatch = value & TEC1G_MASK_BYTE;
      return 0;
    }
    const out = state.glcdReadLatch & TEC1G_MASK_BYTE;
    if (state.glcdGdramPhase === 0) {
      state.glcdGdramPhase = 1;
    } else {
      state.glcdGdramPhase = 0;
      const maxCol = TEC1G_GLCD_COL_BANK_BIT | TEC1G_GLCD_COL_MASK;
      if (state.glcdCol < maxCol) {
        state.glcdCol += 1;
      }
    }
    const nextColBank = (state.glcdCol & TEC1G_GLCD_COL_BANK_BIT) !== 0 ? TEC1G_GLCD_ROW_BASE : 0;
    const nextIndex =
      ((nextColBank + state.glcdRowAddr) & TEC1G_GLCD_ROW_MASK) * TEC1G_GLCD_ROW_STRIDE +
      (state.glcdCol & TEC1G_GLCD_COL_MASK) * TEC1G_GLCD_COL_STRIDE +
      state.glcdGdramPhase;
    state.glcdReadLatch =
      nextIndex >= 0 && nextIndex < state.glcd.length ? (state.glcd[nextIndex] ?? 0) : 0;
    return out;
  };

  const readStatus = (): number => {
    const busy = isBusy() ? GLCD_STATUS_BUSY : 0;
    const addr = state.glcdGraphics
      ? state.glcdRowAddr & TEC1G_GLCD_ROW_MASK
      : state.glcdDdramAddr & TEC1G_MASK_LOW7;
    return busy | addr;
  };

  const writeCommand = (instruction: number): void => {
    if ((instruction & GLCD_BASIC_MASK) === GLCD_CMD_BASIC) {
      const re = (instruction & GLCD_RE_BIT) !== 0;
      const g = re && (instruction & GLCD_GRAPHICS_BIT) !== 0;
      state.glcdRe = re;
      state.glcdGraphics = g;
      state.glcdExpectColumn = false;
      state.glcdGdramPhase = 0;
      state.glcdReadPrimed = false;
      state.glcdReadLatch = 0;
      setBusy(GLCD_BUSY_US);
      onUpdate();
      return;
    }
    if (state.glcdRe) {
      if (instruction === GLCD_CMD_STANDBY) {
        state.glcdDisplayOn = false;
        setBusy(GLCD_BUSY_US);
        onUpdate();
        return;
      }
      if ((instruction & GLCD_CMD_SCROLL_MASK) === GLCD_CMD_SCROLL_BASE) {
        state.glcdScrollMode = (instruction & GLCD_ENTRY_SHIFT) !== 0;
        setBusy(GLCD_BUSY_US);
        return;
      }
      if ((instruction & GLCD_CMD_REVERSE_MASK) === GLCD_CMD_REVERSE_BASE) {
        const line = instruction & TEC1G_MASK_LOW2;
        state.glcdReverseMask ^= 1 << line;
        setBusy(GLCD_BUSY_US);
        onUpdate();
        return;
      }
      if ((instruction & GLCD_CMD_SCROLL_ADDR_MASK) === GLCD_CMD_SCROLL_ADDR_BASE) {
        if (state.glcdScrollMode) {
          state.glcdScroll = instruction & TEC1G_MASK_LOW6;
          onUpdate();
        }
        setBusy(GLCD_BUSY_US);
        return;
      }
    } else {
      if (instruction === GLCD_CMD_CLEAR) {
        state.glcdDdram.fill(TEC1G_LCD_SPACE);
        setDdramAddr(TEC1G_GLCD_DDRAM_BASE);
        state.glcdEntryIncrement = true;
        state.glcdEntryShift = false;
        state.glcdTextShift = 0;
        state.glcdReverseMask = 0;
        setBusy(GLCD_BUSY_CLEAR_US);
        onUpdate();
        return;
      }
      if (instruction === GLCD_CMD_HOME) {
        setDdramAddr(TEC1G_GLCD_DDRAM_BASE);
        state.glcdTextShift = 0;
        setBusy(GLCD_BUSY_US);
        onUpdate();
        return;
      }
      if ((instruction & GLCD_CMD_DISPLAY_MASK) === GLCD_CMD_DISPLAY_BASE) {
        state.glcdDisplayOn = (instruction & GLCD_DISPLAY_ON) !== 0;
        state.glcdCursorOn = (instruction & GLCD_CURSOR_ON) !== 0;
        state.glcdCursorBlink = (instruction & GLCD_BLINK_ON) !== 0;
        rescheduleBlink();
        setBusy(GLCD_BUSY_US);
        onUpdate();
        return;
      }
      if ((instruction & GLCD_CMD_ENTRY_MASK) === GLCD_CMD_ENTRY_BASE) {
        state.glcdEntryIncrement = (instruction & GLCD_ENTRY_INCREMENT) !== 0;
        state.glcdEntryShift = (instruction & GLCD_ENTRY_SHIFT) !== 0;
        setBusy(GLCD_BUSY_US);
        return;
      }
      if ((instruction & GLCD_CMD_SHIFT_MASK) === GLCD_CMD_SHIFT_BASE) {
        const displayShift = (instruction & GLCD_SHIFT_DISPLAY) !== 0;
        const shiftRight = (instruction & GLCD_SHIFT_RIGHT) !== 0;
        if (displayShift) {
          shiftDisplay(shiftRight ? -1 : 1);
        } else {
          offsetDdramAddr(shiftRight ? 1 : -1);
          onUpdate();
        }
        setBusy(GLCD_BUSY_US);
        return;
      }
    }
    if ((instruction & GLCD_CMD_SET_ADDR) !== 0) {
      if (state.glcdGraphics) {
        if (state.glcdExpectColumn) {
          setColumn(instruction);
        } else {
          setRowAddr(instruction);
        }
      } else {
        setDdramAddr(instruction);
      }
      setBusy(GLCD_BUSY_US);
      return;
    }
  };

  const reset = (): void => {
    resetGlcdState(state, cycleClock);
    glcdBusyUntil = 0;
  };

  return {
    readStatus,
    readData,
    writeCommand,
    writeData,
    setClockHz: (hz: number): void => {
      currentClockHz = hz;
      rescheduleBlink();
    },
    reset,
  };
}
