import { describe, expect, it } from 'vitest';
import { CycleClock } from '@jhlagado/debug80-runtime/platforms/cycle-clock';
import { TEC_FAST_HZ } from '@jhlagado/debug80-runtime/platforms/tec-common';
import {
  createTec1gLcdController,
  type Tec1gLcdState,
} from '@jhlagado/debug80-runtime/platforms/tec1g/lcd';
import {
  TEC1G_LCD_ROW0_START,
  TEC1G_LCD_SPACE,
} from '@jhlagado/debug80-runtime/platforms/tec1g/constants';

function makeState(): Tec1gLcdState {
  return {
    lcd: Array.from({ length: 80 }, () => TEC1G_LCD_SPACE),
    lcdAddr: TEC1G_LCD_ROW0_START,
    lcdAddrMode: 'ddram',
    lcdEntryIncrement: true,
    lcdEntryShift: false,
    lcdDisplayOn: true,
    lcdCursorOn: false,
    lcdCursorBlink: false,
    lcdDisplayShift: 0,
    lcdCgram: new Uint8Array(64),
    lcdCgramAddr: 0,
    lcdFunction: {
      dataLength8: true,
      lines2: true,
      font5x8: true,
    },
  };
}

function makeController() {
  const clock = new CycleClock();
  const state = makeState();
  const controller = createTec1gLcdController(state, clock, TEC_FAST_HZ, () => {});
  return { clock, state, controller };
}

describe('TEC-1G LCD controller', () => {
  it('moves the cursor backward in decrement mode', () => {
    const { state, controller } = makeController();
    state.lcdAddr = 0x80;
    controller.writeCommand(0x04);
    controller.writeData(0x41);
    expect(state.lcdAddr).toBe(0xe7);
  });

  it('applies display shift on write when entry shift is enabled', () => {
    const { state, controller } = makeController();
    controller.writeCommand(0x07);
    controller.writeData(0x41);
    expect(state.lcdDisplayShift).toBe(1);
  });

  it('updates display, cursor, and blink flags', () => {
    const { state, controller } = makeController();
    controller.writeCommand(0x0f);
    expect(state.lcdDisplayOn).toBe(true);
    expect(state.lcdCursorOn).toBe(true);
    expect(state.lcdCursorBlink).toBe(true);
  });

  it('shifts the cursor address', () => {
    const { state, controller } = makeController();
    state.lcdAddr = 0x80;
    controller.writeCommand(0x10);
    expect(state.lcdAddr).toBe(0xe7);
  });

  it('shifts the display offset', () => {
    const { state, controller } = makeController();
    controller.writeCommand(0x18);
    expect(state.lcdDisplayShift).toBe(19);
  });

  it('stores function-set flags', () => {
    const { state, controller } = makeController();
    controller.writeCommand(0x38);
    expect(state.lcdFunction).toEqual({
      dataLength8: true,
      lines2: true,
      font5x8: true,
    });
  });

  it('reads and writes cgram data', () => {
    const { controller } = makeController();
    controller.writeCommand(0x40);
    controller.writeData(0x1f);
    controller.writeCommand(0x40);
    expect(controller.readData()).toBe(0x1f);
  });

  it('reports busy status until the clear delay elapses', () => {
    const { clock, controller } = makeController();
    controller.writeCommand(0x01);
    expect(controller.readStatus() & 0x80).toBe(0x80);
    clock.advance(7000);
    expect(controller.readStatus() & 0x80).toBe(0x00);
  });

  it('resets address and display shift on clear and home', () => {
    const { state, controller } = makeController();
    state.lcdAddr = 0x94;
    state.lcdDisplayShift = 3;
    controller.writeCommand(0x02);
    expect(state.lcdAddr).toBe(0x80);
    expect(state.lcdDisplayShift).toBe(0);
  });

  it('returns stored ddram data', () => {
    const { state, controller } = makeController();
    controller.writeCommand(0x80);
    controller.writeData(0x5a);
    controller.writeCommand(0x80);
    expect(controller.readData()).toBe(0x5a);
    expect(state.lcd[0]).toBe(0x5a);
  });
});
