/**
 * @file Direct contract tests for the TEC-1G IO port dispatcher.
 */

import { describe, expect, it, vi } from 'vitest';
import { createTec1gIoHandlers } from '@jhlagado/debug80-runtime/platforms/tec1g/io-handlers';
import { normalizeTec1gConfig } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import { createTec1gInitialState } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime-state';
import { decodeSysCtrl } from '@jhlagado/debug80-runtime/platforms/tec1g/sysctrl';
import {
  TMS9918_CONTROL_PORT,
  TMS9918_DATA_PORT,
} from '@jhlagado/debug80-runtime/platforms/tec1g/tms9918';
import {
  TEC1G_PORT_8X8_GREEN,
  TEC1G_PORT_8X8_RED,
  TEC1G_PORT_8X8_ROW,
  TEC1G_PORT_DIGIT,
  TEC1G_PORT_GLCD_CMD,
  TEC1G_PORT_GLCD_DATA,
  TEC1G_PORT_KEYBOARD,
  TEC1G_PORT_LCD_CMD,
  TEC1G_PORT_LCD_DATA,
  TEC1G_PORT_MATRIX_KEYBOARD,
  TEC1G_PORT_SEGMENT,
  TEC1G_PORT_RTC,
  TEC1G_PORT_SD,
  TEC1G_PORT_STATUS,
  TEC1G_PORT_SYSCTRL,
  TEC1G_STATUS_CARTRIDGE,
  TEC1G_STATUS_MATRIX,
  TEC1G_STATUS_NO_KEY,
  TEC1G_STATUS_PROTECT,
  TEC1G_STATUS_RAW_KEY,
  TEC1G_STATUS_SERIAL_RX,
  TEC1G_MASK_BYTE,
} from '@jhlagado/debug80-runtime/platforms/tec1g/constants';

function createState() {
  const config = normalizeTec1gConfig({ matrixMode: false });
  return createTec1gInitialState({
    config,
    matrixMode: false,
    initialSysCtrl: 0,
    initialSysCtrlDecoded: decodeSysCtrl(0),
    cartridgePresentDefault: false,
  });
}

function createHarness(
  options: { rtcEnabled?: boolean; sdEnabled?: boolean; tms9918Active?: boolean } = {}
) {
  const state = createState();
  state.display.tms9918.setActive(options.tms9918Active === true);
  const lcd = {
    readStatus: vi.fn(() => 0x81),
    readData: vi.fn(() => 0x41),
    writeCommand: vi.fn(),
    writeData: vi.fn(),
  };
  const glcd = {
    readStatus: vi.fn(() => 0x82),
    readData: vi.fn(() => 0x42),
    writeCommand: vi.fn(),
    writeData: vi.fn(),
  };
  const serial = {
    maybeStartQueuedRx: vi.fn(),
    getRxLevel: vi.fn(() => 0),
    recordTxLevel: vi.fn(),
    queueSerial: vi.fn(),
  };
  const rtc = {
    read: vi.fn(() => 0x5a),
    write: vi.fn(),
  };
  const sdSpi = {
    read: vi.fn(() => 0xa5),
    write: vi.fn(),
  };
  const queueUpdate = vi.fn();
  const flushUpdateNow = vi.fn();
  const onPortWrite = vi.fn();
  const io = createTec1gIoHandlers({
    state,
    timing: state.timing,
    lcd,
    glcd,
    serial,
    rtcEnabled: options.rtcEnabled === true,
    rtc,
    sdEnabled: options.sdEnabled === true,
    sdSpi,
    queueUpdate,
    flushUpdateNow,
    onPortWrite,
  });
  return {
    state,
    lcd,
    glcd,
    serial,
    rtc,
    sdSpi,
    queueUpdate,
    flushUpdateNow,
    onPortWrite,
    io,
  };
}

describe('TEC-1G IO handlers', () => {
  it('reads keyboard, matrix, and status ports from runtime state', () => {
    const { state, serial, io } = createHarness();
    state.input.keyValue = 0x12;
    state.input.rawKeyActive = true;
    state.input.matrixModeEnabled = true;
    state.input.matrixKeyStates[2] = 0b1110_1101;
    state.system.protectEnabled = true;
    state.system.cartridgePresent = true;
    serial.getRxLevel.mockReturnValue(1);

    expect(io.read?.(TEC1G_PORT_KEYBOARD)).toBe(0x12 | TEC1G_STATUS_SERIAL_RX);
    expect(serial.maybeStartQueuedRx).toHaveBeenCalledTimes(1);
    expect(io.read?.(0xfd00 | TEC1G_PORT_MATRIX_KEYBOARD)).toBe(TEC1G_MASK_BYTE);
    expect(io.read?.(0xfb00 | TEC1G_PORT_MATRIX_KEYBOARD)).toBe(0b1110_1101);
    expect(io.read?.(TEC1G_PORT_STATUS)).toBe(
      TEC1G_STATUS_MATRIX |
        TEC1G_STATUS_PROTECT |
        TEC1G_STATUS_CARTRIDGE |
        TEC1G_STATUS_RAW_KEY |
        TEC1G_STATUS_SERIAL_RX
    );
  });

  it('dispatches LCD, GLCD, RTC, and SD ports only to enabled devices', () => {
    const disabled = createHarness();
    expect(disabled.io.read?.(TEC1G_PORT_RTC)).toBe(TEC1G_MASK_BYTE);
    expect(disabled.io.read?.(TEC1G_PORT_SD)).toBe(TEC1G_MASK_BYTE);
    disabled.io.write?.(TEC1G_PORT_RTC, 0x11);
    disabled.io.write?.(TEC1G_PORT_SD, 0x22);
    expect(disabled.rtc.write).not.toHaveBeenCalled();
    expect(disabled.sdSpi.write).not.toHaveBeenCalled();

    const enabled = createHarness({ rtcEnabled: true, sdEnabled: true });
    expect(enabled.io.read?.(TEC1G_PORT_LCD_CMD)).toBe(0x81);
    expect(enabled.io.read?.(TEC1G_PORT_LCD_DATA)).toBe(0x41);
    expect(enabled.io.read?.(TEC1G_PORT_GLCD_CMD)).toBe(0x82);
    expect(enabled.io.read?.(TEC1G_PORT_GLCD_DATA)).toBe(0x42);
    expect(enabled.io.read?.(TEC1G_PORT_RTC)).toBe(0x5a);
    expect(enabled.io.read?.(TEC1G_PORT_SD)).toBe(0xa5);

    enabled.io.write?.(TEC1G_PORT_LCD_CMD, 0x101);
    enabled.io.write?.(TEC1G_PORT_LCD_DATA, 0x102);
    enabled.io.write?.(TEC1G_PORT_GLCD_CMD, 0x103);
    enabled.io.write?.(TEC1G_PORT_GLCD_DATA, 0x104);
    enabled.io.write?.(TEC1G_PORT_RTC, 0x105);
    enabled.io.write?.(TEC1G_PORT_SD, 0x106);

    expect(enabled.lcd.writeCommand).toHaveBeenCalledWith(0x01);
    expect(enabled.lcd.writeData).toHaveBeenCalledWith(0x02);
    expect(enabled.glcd.writeCommand).toHaveBeenCalledWith(0x03);
    expect(enabled.glcd.writeData).toHaveBeenCalledWith(0x04);
    expect(enabled.rtc.write).toHaveBeenCalledWith(0x05);
    expect(enabled.sdSpi.write).toHaveBeenCalledWith(0x06);
  });

  it('updates SYS_CTRL and LED matrix latches through write ports', () => {
    const { state, io, queueUpdate } = createHarness();

    io.write?.(TEC1G_PORT_SYSCTRL, 0x8e);
    expect(state.system.sysCtrl).toBe(0x8e);
    expect(state.system.shadowEnabled).toBe(true);
    expect(state.system.protectEnabled).toBe(true);
    expect(state.system.expandEnabled).toBe(true);
    expect(state.system.bankA14).toBe(true);
    expect(state.system.memoryExpansionBankValue).toBe(0x01);
    expect(state.system.memoryExpansionMode).toBe('legacy');
    expect(state.system.memoryExpansionPhysicalBank).toBe(1);
    expect(state.system.capsLock).toBe(true);

    io.write?.(TEC1G_PORT_8X8_RED, 0xaa);
    io.write?.(TEC1G_PORT_8X8_GREEN, 0x55);
    io.write?.(TEC1G_PORT_8X8_ROW, 0b0000_0101);

    expect(state.display.ledMatrixRedLatch).toBe(0xaa);
    expect(state.display.ledMatrixGreenLatch).toBe(0x55);
    expect(state.display.ledMatrixRowLatch).toBe(0b0000_0101);
    expect(state.display.ledMatrixRedRows[0]).toBe(0xaa);
    expect(state.display.ledMatrixRedRows[1]).toBe(0x00);
    expect(state.display.ledMatrixRedRows[2]).toBe(0xaa);
    expect(queueUpdate).toHaveBeenCalled();
  });

  it('publishes a blank seven-segment frame when both output latches are cleared', () => {
    const { state, io, queueUpdate } = createHarness();

    io.write?.(TEC1G_PORT_SEGMENT, 0xef);
    io.write?.(TEC1G_PORT_DIGIT, 0x3f);
    state.timing.cycleClock.advance(100);
    io.write?.(TEC1G_PORT_DIGIT, 0x3f);
    expect(state.display.segmentDuty.segmentIntensities.some((value) => value > 0)).toBe(true);

    queueUpdate.mockClear();
    io.write?.(TEC1G_PORT_DIGIT, 0);
    io.write?.(TEC1G_PORT_SEGMENT, 0);

    expect(state.display.segmentDuty.segmentIntensities.every((value) => value === 0)).toBe(true);
    expect(queueUpdate).toHaveBeenCalledTimes(1);
  });

  it('reports no-key status only when the keypad value is idle', () => {
    const { state, io } = createHarness();

    state.input.keyValue = 0x7f;
    expect(io.read?.(TEC1G_PORT_STATUS)).toBe(TEC1G_STATUS_NO_KEY);

    state.input.keyValue = 0x01;
    expect(io.read?.(TEC1G_PORT_STATUS)).toBe(0);
  });

  it('dispatches only fixed TEC-1G TMS9918 video ports when the video panel is active', () => {
    const disabled = createHarness({ tms9918Active: false });
    disabled.io.write?.(TMS9918_CONTROL_PORT, 0x00);
    disabled.io.write?.(TMS9918_CONTROL_PORT, 0x40);
    disabled.io.write?.(TMS9918_DATA_PORT, 0x5a);
    expect(disabled.io.read?.(TMS9918_DATA_PORT)).toBe(0xff);
    expect(disabled.state.display.tms9918.snapshot().vram[0]).toBe(0);

    const enabled = createHarness({ tms9918Active: true });
    enabled.io.write?.(TMS9918_CONTROL_PORT, 0x00);
    enabled.io.write?.(TMS9918_CONTROL_PORT, 0x40);
    enabled.io.write?.(TMS9918_DATA_PORT, 0x5a);
    enabled.io.write?.(TMS9918_CONTROL_PORT, 0x00);
    enabled.io.write?.(TMS9918_CONTROL_PORT, 0x00);
    expect(enabled.io.read?.(TMS9918_DATA_PORT)).toBe(0x5a);
    expect(enabled.io.read?.(0xb0)).toBe(0xff);
    expect(enabled.io.read?.(0xbd)).toBe(0xff);
  });

  it('does not publish TMS9918 UI updates directly from video port writes', () => {
    const enabled = createHarness({ tms9918Active: true });

    enabled.io.write?.(TMS9918_CONTROL_PORT, 0x00);
    enabled.io.write?.(TMS9918_CONTROL_PORT, 0x40);
    enabled.io.write?.(TMS9918_DATA_PORT, 0x5a);

    expect(enabled.queueUpdate).not.toHaveBeenCalled();
    expect(enabled.flushUpdateNow).not.toHaveBeenCalled();
  });
});
