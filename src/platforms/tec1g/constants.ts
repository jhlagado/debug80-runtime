/**
 * @file TEC-1G hardware constants.
 * @fileoverview
 */

// ===== I/O Ports =====
/** Keyboard scan port (active-low, returns key + serial RX). */
export const TEC1G_PORT_KEYBOARD = 0x00;
/** 7-seg digit latch + speaker/serial control. */
export const TEC1G_PORT_DIGIT = 0x01;
/** 7-seg segment latch. */
export const TEC1G_PORT_SEGMENT = 0x02;
/** Status input (matrix config/protect/expand/etc). */
export const TEC1G_PORT_STATUS = 0x03;
/** LCD command register (HD44780). */
export const TEC1G_PORT_LCD_CMD = 0x04;
/** 8x8 LED display row-select latch. */
export const TEC1G_PORT_8X8_ROW = 0x05;
/** 8x8 RGB matrix red column latch (TEC-Expander 8x8 RGB). */
export const TEC1G_PORT_8X8_RED = 0x06;
/** 8x8 RGB matrix green column latch. */
export const TEC1G_PORT_8X8_GREEN = 0xf8;
/** 8x8 RGB matrix blue column latch. */
export const TEC1G_PORT_8X8_BLUE = 0xf9;
/** GLCD command register (ST7920). */
export const TEC1G_PORT_GLCD_CMD = 0x07;
/** LCD data register. */
export const TEC1G_PORT_LCD_DATA = 0x84;
/** GLCD data register. */
export const TEC1G_PORT_GLCD_DATA = 0x87;
/** DS1302 RTC data port. */
export const TEC1G_PORT_RTC = 0xfc;
/** SD SPI data port. */
export const TEC1G_PORT_SD = 0xfd;
/** Matrix keyboard read port (row in high byte). */
export const TEC1G_PORT_MATRIX_KEYBOARD = 0xfe;
/** System control port (shadow/protect/expand/bank/caps). */
export const TEC1G_PORT_SYSCTRL = 0xff;
/** TMS9918/TMS9929 data port on the TEC-Deck video card. */
export const TEC1G_PORT_TMS9918_DATA = 0xbe;
/** TMS9918/TMS9929 control/status port on the TEC-Deck video card. */
export const TEC1G_PORT_TMS9918_CONTROL = 0xbf;

// ===== Status Register Bits =====
export const TEC1G_STATUS_MATRIX = 0x01;
export const TEC1G_STATUS_PROTECT = 0x02;
export const TEC1G_STATUS_EXPAND = 0x04;
export const TEC1G_STATUS_CARTRIDGE = 0x08;
export const TEC1G_STATUS_RAW_KEY = 0x10;
export const TEC1G_STATUS_GIMP = 0x20;
export const TEC1G_STATUS_NO_KEY = 0x40;
export const TEC1G_STATUS_SERIAL_RX = 0x80;

// ===== Digit Latch Bits =====
export const TEC1G_DIGIT_SPEAKER = 0x80;
export const TEC1G_DIGIT_SERIAL_TX = 0x40;

// ===== Memory Map =====
export const TEC1G_ROM0_START = 0x0000;
export const TEC1G_ROM0_END = 0x07ff;
export const TEC1G_RAM_START = 0x0800;
export const TEC1G_RAM_END = 0x7fff;
export const TEC1G_ROM1_START = 0xc000;
export const TEC1G_ROM1_END = 0xffff;
export const TEC1G_APP_START_DEFAULT = 0x4000;
export const TEC1G_ENTRY_DEFAULT = 0x0000;
export const TEC1G_ADDR_MAX = 0xffff;

// ===== System Control Bits =====
/** Write protection enabled (sysctrl bit 1). */
export const TEC1G_SYSCTRL_PROTECT = 0x02;
/** Expansion bank A14 select (sysctrl bit 3). */
export const TEC1G_SYSCTRL_BANK_A14 = 0x08;

// ===== LCD (HD44780) Instructions =====
export const LCD_CMD_CLEAR = 0x01;
export const LCD_CMD_HOME = 0x02;
export const LCD_CMD_ENTRY_MODE = 0x04;
export const LCD_CMD_DISPLAY = 0x08;
export const LCD_CMD_SHIFT = 0x10;
export const LCD_CMD_FUNCTION = 0x20;
export const LCD_CMD_CGRAM = 0x40;
export const LCD_CMD_DDRAM = 0x80;
export const LCD_ENTRY_MODE_MASK = 0xfc;
export const LCD_DISPLAY_MASK = 0xf8;
export const LCD_SHIFT_MASK = 0xf0;
export const LCD_FUNCTION_MASK = 0xe0;
export const LCD_ENTRY_INCREMENT = 0x02;
export const LCD_ENTRY_SHIFT = 0x01;
export const LCD_DISPLAY_ON = 0x04;
export const LCD_CURSOR_ON = 0x02;
export const LCD_BLINK_ON = 0x01;
export const LCD_SHIFT_DISPLAY = 0x08;
export const LCD_SHIFT_RIGHT = 0x04;
export const LCD_FUNC_8BIT = 0x10;
export const LCD_FUNC_2LINE = 0x08;
export const LCD_FUNC_FONT5X8 = 0x04;

// ===== GLCD (ST7920) Instructions =====
export const GLCD_CMD_BASIC = 0x20;
export const GLCD_BASIC_MASK = 0xe0;
export const GLCD_RE_BIT = 0x04;
export const GLCD_GRAPHICS_BIT = 0x02;
export const GLCD_CMD_STANDBY = 0x01;
export const GLCD_CMD_CLEAR = 0x01;
export const GLCD_CMD_HOME = 0x02;
export const GLCD_CMD_SCROLL_MASK = 0xfe;
export const GLCD_CMD_SCROLL_BASE = 0x02;
export const GLCD_CMD_REVERSE_MASK = 0xfc;
export const GLCD_CMD_REVERSE_BASE = 0x04;
export const GLCD_CMD_SCROLL_ADDR_MASK = 0xc0;
export const GLCD_CMD_SCROLL_ADDR_BASE = 0x40;
export const GLCD_CMD_DISPLAY_MASK = 0xf8;
export const GLCD_CMD_DISPLAY_BASE = 0x08;
export const GLCD_CMD_ENTRY_MASK = 0xfc;
export const GLCD_CMD_ENTRY_BASE = 0x04;
export const GLCD_CMD_SHIFT_MASK = 0xf0;
export const GLCD_CMD_SHIFT_BASE = 0x10;
export const GLCD_CMD_SET_ADDR = 0x80;
export const GLCD_DISPLAY_ON = 0x04;
export const GLCD_CURSOR_ON = 0x02;
export const GLCD_BLINK_ON = 0x01;
export const GLCD_ENTRY_INCREMENT = 0x02;
export const GLCD_ENTRY_SHIFT = 0x01;
export const GLCD_SHIFT_DISPLAY = 0x08;
export const GLCD_SHIFT_RIGHT = 0x04;
export const GLCD_STATUS_BUSY = 0x80;
export const LCD_STATUS_BUSY = 0x80;

// ===== Masks =====
export const TEC1G_MASK_BYTE = 0xff;
export const TEC1G_MASK_LOW7 = 0x7f;
export const TEC1G_MASK_LOW6 = 0x3f;
export const TEC1G_MASK_LOW5 = 0x1f;
export const TEC1G_MASK_LOW2 = 0x03;
export const TEC1G_NMI_VECTOR = 0x66;
export const TEC1G_KEY_SHIFT_MASK = 0x20;
export const TEC1G_LCD_ARROW_LEFT = 0x7f;
export const TEC1G_LCD_ARROW_RIGHT = 0x7e;

// ===== LCD Addressing =====
export const TEC1G_LCD_SPACE = 0x20;
export const TEC1G_LCD_ROW0_START = 0x80;
export const TEC1G_LCD_ROW0_END = 0x93;
export const TEC1G_LCD_ROW1_START = 0xc0;
export const TEC1G_LCD_ROW1_END = 0xd3;
export const TEC1G_LCD_ROW2_START = 0x94;
export const TEC1G_LCD_ROW2_END = 0xa7;
export const TEC1G_LCD_ROW3_START = 0xd4;
export const TEC1G_LCD_ROW3_END = 0xe7;
export const TEC1G_LCD_ROW1_OFFSET = 20;
export const TEC1G_LCD_ROW2_OFFSET = 40;
export const TEC1G_LCD_ROW3_OFFSET = 60;

// ===== GLCD Addressing =====
export const TEC1G_GLCD_DDRAM_MASK = 0x1f;
export const TEC1G_GLCD_DDRAM_STEP = 0x20;
export const TEC1G_GLCD_DDRAM_BASE = 0x80;
export const TEC1G_GLCD_ROW_MASK = 0x3f;
export const TEC1G_GLCD_COL_MASK = 0x07;
export const TEC1G_GLCD_COL_BANK_BIT = 0x08;
export const TEC1G_GLCD_DDRAM_ROW1_BIT = 0x10;
export const TEC1G_GLCD_DDRAM_ROW0_BIT = 0x08;
export const TEC1G_GLCD_ROW_BASE = 32;
export const TEC1G_GLCD_ROW_STRIDE = 16;
export const TEC1G_GLCD_COL_STRIDE = 2;
