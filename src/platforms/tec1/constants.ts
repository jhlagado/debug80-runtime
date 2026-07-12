/**
 * @file TEC-1 hardware constants.
 * @fileoverview
 */

// ===== I/O Ports =====
export const TEC1_PORT_KEYBOARD = 0x00;
export const TEC1_PORT_DIGIT = 0x01;
export const TEC1_PORT_SEGMENT = 0x02;
export const TEC1_PORT_STATUS = 0x03;
export const TEC1_PORT_LCD_CMD = 0x04;
export const TEC1_PORT_MATRIX_STROBE = 0x05;
export const TEC1_PORT_MATRIX_LATCH = 0x06;
export const TEC1_PORT_LCD_DATA = 0x84;

// ===== Status Bits =====
export const TEC1_STATUS_SERIAL_RX = 0x80;
export const TEC1_STATUS_KEY_IDLE = 0x40;

// ===== Digit Latch Bits =====
export const TEC1_DIGIT_SPEAKER = 0x80;
export const TEC1_DIGIT_SERIAL_TX = 0x40;

// ===== Memory Map =====
export const TEC1_ROM_START = 0x0000;
export const TEC1_ROM_END = 0x07ff;
export const TEC1_RAM_START = 0x0800;
export const TEC1_RAM_END = 0x0fff;
export const TEC1_APP_START_DEFAULT = 0x0800;
export const TEC1_ENTRY_DEFAULT = 0x0000;
export const TEC1_ADDR_MAX = 0xffff;

// ===== LCD (HD44780) =====
export const TEC1_LCD_CMD_CLEAR = 0x01;
export const TEC1_LCD_CMD_HOME = 0x02;
export const TEC1_LCD_CMD_DDRAM = 0x80;
export const TEC1_LCD_SPACE = 0x20;
export const TEC1_LCD_ROW0_START = 0x80;
export const TEC1_LCD_ROW0_END = 0x8f;
export const TEC1_LCD_ROW1_START = 0xc0;
export const TEC1_LCD_ROW1_END = 0xcf;
export const TEC1_LCD_ROW1_OFFSET = 16;

// ===== Masks =====
export const TEC1_MASK_BYTE = 0xff;
export const TEC1_MASK_LOW7 = 0x7f;
export const TEC1_NMI_VECTOR = 0x66;
