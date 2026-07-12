import { describe, expect, it } from 'vitest';
import { createTec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

function makeRuntime() {
  const config: Tec1gPlatformConfigNormalized = {
    regions: [
      { start: 0x0000, end: 0x7fff, kind: 'ram' as const },
      { start: 0xc000, end: 0xffff, kind: 'rom' as const },
    ],
    romRanges: [{ start: 0xc000, end: 0xffff }],
    appStart: 0x0000,
    entry: 0x0000,
    updateMs: 100,
    yieldMs: 0,
    gimpSignal: false,
    expansionBankHi: false,
    matrixMode: false,
    protectOnReset: false,
    rtcEnabled: false,
    sdEnabled: false,
    sdHighCapacity: true,
  };
  return createTec1gRuntime(config, () => {});
}

describe('TEC-1G GLCD instruction handling', () => {
  it('writes and reads DDRAM in text mode', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x80); // DDRAM addr
    rt.ioHandlers.write(0x87, 0x41);
    rt.ioHandlers.write(0x07, 0x80);
    const value = rt.ioHandlers.read(0x87);
    expect(value).toBe(0x41);
  });

  it('writes and reads GDRAM in graphics mode', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x26); // function set: RE=1, G=1
    rt.ioHandlers.write(0x07, 0x80); // row 0
    rt.ioHandlers.write(0x07, 0x80); // column 0
    rt.ioHandlers.write(0x87, 0xaa);
    expect(rt.state.display.glcdCtrl.glcdGraphics).toBe(true);
    expect(rt.state.display.glcdCtrl.glcd[0]).toBe(0xaa);
    rt.state.display.glcdCtrl.glcdRowAddr = 0;
    rt.state.display.glcdCtrl.glcdRowBase = 0;
    rt.state.display.glcdCtrl.glcdCol = 0;
    rt.state.display.glcdCtrl.glcdGdramPhase = 0;
    const dummy = rt.ioHandlers.read(0x87);
    const value = rt.ioHandlers.read(0x87);
    expect(dummy).toBe(0x00);
    expect(value).toBe(0xaa);
  });

  it('toggles reverse line mask in extended mode', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x24); // function set: RE=1, G=0
    rt.ioHandlers.write(0x07, 0x04); // reverse line 0
    expect(rt.state.display.glcdCtrl.glcdReverseMask & 0x01).toBe(0x01);
    rt.ioHandlers.write(0x07, 0x04); // toggle off
    expect(rt.state.display.glcdCtrl.glcdReverseMask & 0x01).toBe(0x00);
    rt.ioHandlers.write(0x07, 0x20); // back to basic
  });

  it('busy flag clears after cycles', () => {
    const rt = makeRuntime();
    rt.ioHandlers.write(0x07, 0x80);
    rt.ioHandlers.write(0x87, 0x41);
    expect(rt.ioHandlers.read(0x07) & 0x80).toBe(0x80);
    rt.recordCycles(rt.state.timing.clockHz);
    expect(rt.ioHandlers.read(0x07) & 0x80).toBe(0x00);
  });

  it('clear command resets DDRAM and entry state', () => {
    const rt = makeRuntime();
    // Write a byte to DDRAM first
    rt.ioHandlers.write(0x07, 0x80); // set DDRAM addr
    rt.ioHandlers.write(0x87, 0x41); // write 'A'
    rt.recordCycles(rt.state.timing.clockHz); // clear busy
    // Issue clear command (0x01)
    rt.ioHandlers.write(0x07, 0x01);
    rt.recordCycles(rt.state.timing.clockHz); // clear busy
    // DDRAM should be filled with spaces (0x20)
    expect(rt.state.display.glcdCtrl.glcdDdram[0]).toBe(0x20);
    // Entry mode should be reset to increment, no shift
    expect(rt.state.display.glcdCtrl.glcdEntryIncrement).toBe(true);
    expect(rt.state.display.glcdCtrl.glcdEntryShift).toBe(false);
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(0);
  });

  it('display on/off command toggles display and cursor', () => {
    const rt = makeRuntime();
    // Turn off display: 0x08 (display base, all flags off)
    rt.ioHandlers.write(0x07, 0x08);
    expect(rt.state.display.glcdCtrl.glcdDisplayOn).toBe(false);
    expect(rt.state.display.glcdCtrl.glcdCursorOn).toBe(false);
    // Turn on display + cursor: 0x0E (0x08 | 0x04 | 0x02)
    rt.ioHandlers.write(0x07, 0x0e);
    expect(rt.state.display.glcdCtrl.glcdDisplayOn).toBe(true);
    expect(rt.state.display.glcdCtrl.glcdCursorOn).toBe(true);
  });

  it('scroll/shift right moves display shift', () => {
    const rt = makeRuntime();
    // Shift display right: 0x1C (0x10 | 0x08 | 0x04)
    rt.ioHandlers.write(0x07, 0x1c);
    // Shift right = shiftDisplay(-1)
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(-1);
    // Shift display left: 0x18 (0x10 | 0x08)
    rt.ioHandlers.write(0x07, 0x18);
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(0);
  });

  it('scroll mode enable/disable in extended mode', () => {
    const rt = makeRuntime();
    // Enter RE mode
    rt.ioHandlers.write(0x07, 0x24); // function set: RE=1, G=0
    // Enable scroll mode: 0x03 (scroll base 0x02 | shift bit 0x01)
    rt.ioHandlers.write(0x07, 0x03);
    expect(rt.state.display.glcdCtrl.glcdScrollMode).toBe(true);
    // Disable scroll mode: 0x02 (scroll base, no shift bit)
    rt.ioHandlers.write(0x07, 0x02);
    expect(rt.state.display.glcdCtrl.glcdScrollMode).toBe(false);
    // Back to basic
    rt.ioHandlers.write(0x07, 0x20);
  });

  it('applies scroll address only while scroll mode is enabled', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(0x07, 0x24); // function set: RE=1, G=0
    rt.ioHandlers.write(0x07, 0x4a); // scroll address 10 without scroll mode
    expect(rt.state.display.glcdCtrl.glcdScroll).toBe(0);

    rt.ioHandlers.write(0x07, 0x03); // enable scroll mode
    rt.ioHandlers.write(0x07, 0x4a); // scroll address 10
    expect(rt.state.display.glcdCtrl.glcdScroll).toBe(10);
  });

  it('GDRAM X auto-increment crosses into the lower bank (clearGrLCD pattern)', () => {
    // This tests the ST7920 behaviour that clearGrLCD relies on:
    //   clearGrLCD sets X=0 (0x80) and writes B=0x10 iterations × 2 bytes = 16 words per row.
    //   Words 1-8 land at X=0-7 (upper bank, rows 0-31).
    //   Words 9-16 land at X=8-15 (lower bank, rows 32-63).
    // Without the fix the column counter wraps at 7 and the lower bank is never written.
    const rt = makeRuntime();

    // Fill the whole GDRAM with a sentinel so we can detect which bytes were written.
    rt.state.display.glcdCtrl.glcd.fill(0xff);

    // Enter extended graphics mode.
    rt.ioHandlers.write(0x07, 0x36); // RE=1, G=1

    // Set row 0 (Y=0), column 0 (X=0, no bank bit).
    rt.ioHandlers.write(0x07, 0x80); // vertical Y=0
    rt.ioHandlers.write(0x07, 0x80); // horizontal X=0, bank=0

    // Write 32 bytes (16 words) of zeros — the clearGrLCD CLR_Y inner loop.
    for (let i = 0; i < 32; i++) {
      rt.ioHandlers.write(0x87, 0x00);
    }

    const glcd = rt.state.display.glcdCtrl.glcd;

    // Upper bank (bank=0, glcdRowBase=0): row 0, cols 0-7 → bytes 0-15
    for (let b = 0; b < 16; b++) {
      expect(glcd[b]).toBe(0x00);
    }

    // Lower bank (bank=1, glcdRowBase=32): row 32+0=32, cols 0-7 → bytes 32*16 to 32*16+15 = 512-527
    for (let b = 0; b < 16; b++) {
      expect(glcd[512 + b]).toBe(0x00);
    }

    // The rest of the GDRAM should still be 0xff (not touched).
    expect(glcd[16]).toBe(0xff);
    expect(glcd[528]).toBe(0xff);
  });

  it('shifts text after a complete DDRAM write when entry shift is enabled', () => {
    const rt = makeRuntime();

    rt.ioHandlers.write(0x07, 0x07); // entry mode: increment with shift
    rt.ioHandlers.write(0x07, 0x80); // DDRAM addr
    rt.ioHandlers.write(0x87, 0x41); // first byte, phase only
    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(0);

    rt.recordCycles(rt.state.timing.clockHz);
    rt.ioHandlers.write(0x87, 0x42); // second byte completes the character cell

    expect(rt.state.display.glcdCtrl.glcdTextShift).toBe(1);
    expect(rt.state.display.glcdCtrl.glcdDdramAddr).toBe(0x81);
    expect(rt.state.display.glcdCtrl.glcdDdramPhase).toBe(0);
  });
});
