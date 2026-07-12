/**
 * @file TEC-1G HD44780 LCD controller.
 */

import { CycleClock } from '../cycle-clock.js';
import { microsecondsToClocks } from '../tec-common/index.js';
import {
  LCD_BLINK_ON,
  LCD_CMD_CGRAM,
  LCD_CMD_CLEAR,
  LCD_CMD_DDRAM,
  LCD_CMD_DISPLAY,
  LCD_CMD_ENTRY_MODE,
  LCD_CMD_FUNCTION,
  LCD_CMD_HOME,
  LCD_CMD_SHIFT,
  LCD_CURSOR_ON,
  LCD_DISPLAY_MASK,
  LCD_DISPLAY_ON,
  LCD_ENTRY_INCREMENT,
  LCD_ENTRY_MODE_MASK,
  LCD_ENTRY_SHIFT,
  LCD_FUNC_2LINE,
  LCD_FUNC_8BIT,
  LCD_FUNC_FONT5X8,
  LCD_FUNCTION_MASK,
  LCD_SHIFT_DISPLAY,
  LCD_SHIFT_MASK,
  LCD_SHIFT_RIGHT,
  LCD_STATUS_BUSY,
  TEC1G_LCD_ROW0_END,
  TEC1G_LCD_ROW0_START,
  TEC1G_LCD_ROW1_END,
  TEC1G_LCD_ROW1_OFFSET,
  TEC1G_LCD_ROW1_START,
  TEC1G_LCD_ROW2_END,
  TEC1G_LCD_ROW2_OFFSET,
  TEC1G_LCD_ROW2_START,
  TEC1G_LCD_ROW3_END,
  TEC1G_LCD_ROW3_OFFSET,
  TEC1G_LCD_ROW3_START,
  TEC1G_LCD_SPACE,
  TEC1G_MASK_BYTE,
  TEC1G_MASK_LOW6,
  TEC1G_MASK_LOW7,
} from './constants.js';

export interface Tec1gLcdFunctionState {
  dataLength8: boolean;
  lines2: boolean;
  font5x8: boolean;
}

export interface Tec1gLcdState {
  lcd: number[];
  lcdAddr: number;
  lcdAddrMode: 'ddram' | 'cgram';
  lcdEntryIncrement: boolean;
  lcdEntryShift: boolean;
  lcdDisplayOn: boolean;
  lcdCursorOn: boolean;
  lcdCursorBlink: boolean;
  lcdDisplayShift: number;
  lcdCgram: Uint8Array;
  lcdCgramAddr: number;
  lcdFunction: Tec1gLcdFunctionState;
}

export interface Tec1gLcdController {
  readStatus(): number;
  readData(): number;
  writeCommand(instruction: number): void;
  writeData(value: number): void;
  setClockHz(hz: number): void;
  reset(): void;
}

/**
 * Creates the TEC-1G HD44780 LCD controller.
 */
export function createTec1gLcdController(
  state: Tec1gLcdState,
  cycleClock: CycleClock,
  clockHz: number,
  onUpdate: () => void
): Tec1gLcdController {
  let lcdBusyUntil = 0;
  let currentClockHz = clockHz;

  const LCD_BUSY_US = 37;
  const LCD_BUSY_CLEAR_US = 1600;

  const lcdIndexForAddr = (addr: number): number | null => {
    if (addr >= TEC1G_LCD_ROW0_START && addr <= TEC1G_LCD_ROW0_END) {
      return addr - TEC1G_LCD_ROW0_START;
    }
    if (addr >= TEC1G_LCD_ROW1_START && addr <= TEC1G_LCD_ROW1_END) {
      return TEC1G_LCD_ROW1_OFFSET + (addr - TEC1G_LCD_ROW1_START);
    }
    if (addr >= TEC1G_LCD_ROW2_START && addr <= TEC1G_LCD_ROW2_END) {
      return TEC1G_LCD_ROW2_OFFSET + (addr - TEC1G_LCD_ROW2_START);
    }
    if (addr >= TEC1G_LCD_ROW3_START && addr <= TEC1G_LCD_ROW3_END) {
      return TEC1G_LCD_ROW3_OFFSET + (addr - TEC1G_LCD_ROW3_START);
    }
    return null;
  };

  const lcdAddrForIndex = (index: number): number => {
    if (index < TEC1G_LCD_ROW1_OFFSET) {
      return TEC1G_LCD_ROW0_START + index;
    }
    if (index < TEC1G_LCD_ROW2_OFFSET) {
      return TEC1G_LCD_ROW1_START + (index - TEC1G_LCD_ROW1_OFFSET);
    }
    if (index < TEC1G_LCD_ROW3_OFFSET) {
      return TEC1G_LCD_ROW2_START + (index - TEC1G_LCD_ROW2_OFFSET);
    }
    return TEC1G_LCD_ROW3_START + (index - TEC1G_LCD_ROW3_OFFSET);
  };

  const lcdAdvanceAddr = (addr: number, increment: boolean): number => {
    const masked = addr & TEC1G_MASK_BYTE;
    const index = lcdIndexForAddr(masked);
    if (index !== null) {
      const next = (index + (increment ? 1 : -1) + state.lcd.length) % state.lcd.length;
      return lcdAddrForIndex(next);
    }
    return (masked + (increment ? 1 : -1)) & TEC1G_MASK_BYTE;
  };

  const lcdAdvanceCgramAddr = (addr: number, increment: boolean): number => {
    const delta = increment ? 1 : -1;
    return (addr + delta + state.lcdCgram.length) & TEC1G_MASK_LOW6;
  };

  const shiftLcdDisplay = (delta: number): void => {
    const next = (state.lcdDisplayShift + delta + 20) % 20;
    if (next !== state.lcdDisplayShift) {
      state.lcdDisplayShift = next;
      onUpdate();
    }
  };

  const lcdSetBusy = (microseconds: number): void => {
    const cycles = microsecondsToClocks(currentClockHz, microseconds);
    const until = cycleClock.now() + cycles;
    if (until > lcdBusyUntil) {
      lcdBusyUntil = until;
    }
  };

  const lcdIsBusy = (): boolean => cycleClock.now() < lcdBusyUntil;

  const lcdSetAddr = (addr: number): void => {
    state.lcdAddr = addr & TEC1G_MASK_BYTE;
    state.lcdAddrMode = 'ddram';
  };

  const lcdClear = (): void => {
    state.lcd.fill(TEC1G_LCD_SPACE);
    lcdSetAddr(TEC1G_LCD_ROW0_START);
    state.lcdDisplayShift = 0;
    onUpdate();
    lcdSetBusy(LCD_BUSY_CLEAR_US);
  };

  const lcdWriteData = (value: number): void => {
    if (state.lcdAddrMode === 'cgram') {
      const addr = state.lcdCgramAddr & TEC1G_MASK_LOW6;
      state.lcdCgram[addr] = value & TEC1G_MASK_BYTE;
      state.lcdCgramAddr = lcdAdvanceCgramAddr(state.lcdCgramAddr, state.lcdEntryIncrement);
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    const index = lcdIndexForAddr(state.lcdAddr);
    if (index !== null) {
      state.lcd[index] = value & TEC1G_MASK_BYTE;
      onUpdate();
    }
    state.lcdAddr = lcdAdvanceAddr(state.lcdAddr, state.lcdEntryIncrement);
    if (state.lcdEntryShift) {
      shiftLcdDisplay(state.lcdEntryIncrement ? 1 : -1);
    }
    lcdSetBusy(LCD_BUSY_US);
  };

  const lcdReadData = (): number => {
    if (state.lcdAddrMode === 'cgram') {
      const addr = state.lcdCgramAddr & TEC1G_MASK_LOW6;
      const value = state.lcdCgram[addr] ?? 0;
      state.lcdCgramAddr = lcdAdvanceCgramAddr(state.lcdCgramAddr, state.lcdEntryIncrement);
      lcdSetBusy(LCD_BUSY_US);
      return value & TEC1G_MASK_BYTE;
    }
    const index = lcdIndexForAddr(state.lcdAddr);
    const value = index !== null ? (state.lcd[index] ?? TEC1G_LCD_SPACE) : TEC1G_LCD_SPACE;
    state.lcdAddr = lcdAdvanceAddr(state.lcdAddr, state.lcdEntryIncrement);
    if (state.lcdEntryShift) {
      shiftLcdDisplay(state.lcdEntryIncrement ? 1 : -1);
    }
    lcdSetBusy(LCD_BUSY_US);
    return value & TEC1G_MASK_BYTE;
  };

  const lcdReadStatus = (): number => {
    const busy = lcdIsBusy() ? LCD_STATUS_BUSY : 0;
    const addr =
      state.lcdAddrMode === 'cgram'
        ? state.lcdCgramAddr & TEC1G_MASK_LOW6
        : state.lcdAddr & TEC1G_MASK_LOW7;
    return busy | addr;
  };

  const lcdWriteCommand = (instruction: number): void => {
    if (instruction === LCD_CMD_CLEAR) {
      lcdClear();
      return;
    }
    if (instruction === LCD_CMD_HOME) {
      lcdSetAddr(LCD_CMD_DDRAM);
      state.lcdDisplayShift = 0;
      lcdSetBusy(LCD_BUSY_CLEAR_US);
      return;
    }
    if ((instruction & LCD_CMD_DDRAM) !== 0) {
      lcdSetAddr(instruction);
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    if ((instruction & LCD_CMD_CGRAM) !== 0) {
      state.lcdCgramAddr = instruction & TEC1G_MASK_LOW6;
      state.lcdAddrMode = 'cgram';
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    if ((instruction & LCD_ENTRY_MODE_MASK) === LCD_CMD_ENTRY_MODE) {
      state.lcdEntryIncrement = (instruction & LCD_ENTRY_INCREMENT) !== 0;
      state.lcdEntryShift = (instruction & LCD_ENTRY_SHIFT) !== 0;
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    if ((instruction & LCD_DISPLAY_MASK) === LCD_CMD_DISPLAY) {
      state.lcdDisplayOn = (instruction & LCD_DISPLAY_ON) !== 0;
      state.lcdCursorOn = (instruction & LCD_CURSOR_ON) !== 0;
      state.lcdCursorBlink = (instruction & LCD_BLINK_ON) !== 0;
      onUpdate();
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    if ((instruction & LCD_SHIFT_MASK) === LCD_CMD_SHIFT) {
      const displayShift = (instruction & LCD_SHIFT_DISPLAY) !== 0;
      const shiftRight = (instruction & LCD_SHIFT_RIGHT) !== 0;
      if (displayShift) {
        shiftLcdDisplay(shiftRight ? 1 : -1);
      } else {
        state.lcdAddrMode = 'ddram';
        state.lcdAddr = lcdAdvanceAddr(state.lcdAddr, shiftRight);
      }
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    if ((instruction & LCD_FUNCTION_MASK) === LCD_CMD_FUNCTION) {
      state.lcdFunction = {
        dataLength8: (instruction & LCD_FUNC_8BIT) !== 0,
        lines2: (instruction & LCD_FUNC_2LINE) !== 0,
        font5x8: (instruction & LCD_FUNC_FONT5X8) === 0,
      };
      lcdSetBusy(LCD_BUSY_US);
      return;
    }
    lcdSetBusy(LCD_BUSY_US);
  };

  const reset = (): void => {
    state.lcd.fill(TEC1G_LCD_SPACE);
    state.lcdAddr = TEC1G_LCD_ROW0_START;
    state.lcdAddrMode = 'ddram';
    state.lcdEntryIncrement = true;
    state.lcdEntryShift = false;
    state.lcdDisplayOn = true;
    state.lcdCursorOn = false;
    state.lcdCursorBlink = false;
    state.lcdDisplayShift = 0;
    state.lcdCgram.fill(0);
    state.lcdCgramAddr = 0;
    state.lcdFunction = {
      dataLength8: true,
      lines2: true,
      font5x8: true,
    };
    lcdBusyUntil = 0;
  };

  return {
    readStatus: lcdReadStatus,
    readData: lcdReadData,
    writeCommand: lcdWriteCommand,
    writeData: lcdWriteData,
    setClockHz: (hz: number): void => {
      if (hz > 0) {
        currentClockHz = hz;
      }
    },
    reset,
  };
}
