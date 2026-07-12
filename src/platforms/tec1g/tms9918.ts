/**
 * @file TMS9918/TMS9929 video device model for the TEC-1G TEC-Deck card.
 */

export const TMS9918_DATA_PORT = 0xbe;
export const TMS9918_CONTROL_PORT = 0xbf;
export const TMS9918_VRAM_SIZE = 0x4000;
export const TMS9918_WIDTH = 256;
export const TMS9918_HEIGHT = 192;

export type Tms9918VideoStandard = 'pal' | 'ntsc';

export interface Tms9918Snapshot {
  active: boolean;
  videoStandard: Tms9918VideoStandard;
  registers: number[];
  status: number;
  vram: Uint8Array;
  framebuffer: number[];
}

export interface Tms9918Device {
  setActive(active: boolean): void;
  setVideoStandard(standard: Tms9918VideoStandard): void;
  writeControl(value: number): void;
  writeData(value: number): void;
  readStatus(): number;
  readData(): number;
  peekStatus(): number;
  advanceCycles(cycles: number): boolean;
  consumeNmi(): boolean;
  reset(): void;
  snapshot(): Tms9918Snapshot;
}

const TMS9918_INTERRUPT_FLAG = 0x80;
const TMS9918_REGISTER_WRITE = 0x80;
const TMS9918_INTERRUPT_ENABLE = 0x20;
const TMS9918_SPRITE_16 = 0x02;
const TMS9918_SPRITE_MAGNIFY = 0x01;
const FRAME_CYCLES = {
  pal: 80_000,
  ntsc: 66_667,
} satisfies Record<Tms9918VideoStandard, number>;

const TMS9918_PALETTE = [
  0x000000, // transparent / black backdrop in this renderer
  0x000000,
  0x21c842,
  0x5edc78,
  0x5455ed,
  0x7d76fc,
  0xd4524d,
  0x42ebf5,
  0xfc5554,
  0xff7978,
  0xd4c154,
  0xe6ce80,
  0x21b03b,
  0xc95bba,
  0xcccccc,
  0xffffff,
];

/** Constrains a numeric write/read value to an unsigned byte. */
function maskByte(value: number): number {
  return value & 0xff;
}

/** Wraps a VDP VRAM address into the 16 KiB address space. */
function maskVramAddress(value: number): number {
  return value & (TMS9918_VRAM_SIZE - 1);
}

/** Reads a VDP register with a zero fallback for strict indexed access. */
function reg(registers: Uint8Array, index: number): number {
  return registers[index] ?? 0;
}

/** Maps a TMS colour index to the renderer RGB approximation. */
function paletteColor(index: number, fallback = 0): number {
  return TMS9918_PALETTE[index & 0x0f] ?? fallback;
}

/** Resolves the Graphics I name table base address. */
function graphicsModeNameBase(registers: Uint8Array): number {
  return (reg(registers, 2) & 0x0f) << 10;
}

/** Resolves the Graphics I colour table base address. */
function graphicsModeColorBase(registers: Uint8Array): number {
  return reg(registers, 3) << 6;
}

/** Resolves the Graphics I pattern table base address. */
function graphicsModePatternBase(registers: Uint8Array): number {
  return (reg(registers, 4) & 0x07) << 11;
}

/** Resolves the sprite attribute table base address. */
function spriteAttributeBase(registers: Uint8Array): number {
  return (reg(registers, 5) & 0x7f) << 7;
}

/** Resolves the sprite pattern table base address. */
function spritePatternBase(registers: Uint8Array): number {
  return (reg(registers, 6) & 0x07) << 11;
}

/** Resolves the current sprite size in pixels before magnification. */
function spriteSize(registers: Uint8Array): number {
  return (reg(registers, 1) & TMS9918_SPRITE_16) !== 0 ? 16 : 8;
}

/** Resolves the current sprite magnification scale. */
function spriteScale(registers: Uint8Array): number {
  return (reg(registers, 1) & TMS9918_SPRITE_MAGNIFY) !== 0 ? 2 : 1;
}

/** Renders Graphics I background tiles plus sprites into a 256x192 RGB buffer. */
function renderGraphicsOne(registers: Uint8Array, vram: Uint8Array): number[] {
  const framebuffer = new Array<number>(TMS9918_WIDTH * TMS9918_HEIGHT).fill(
    paletteColor(reg(registers, 7))
  );
  const nameBase = graphicsModeNameBase(registers);
  const patternBase = graphicsModePatternBase(registers);
  const colorBase = graphicsModeColorBase(registers);

  for (let tileY = 0; tileY < 24; tileY += 1) {
    for (let tileX = 0; tileX < 32; tileX += 1) {
      const pattern = vram[maskVramAddress(nameBase + tileY * 32 + tileX)] ?? 0;
      const color = vram[maskVramAddress(colorBase + (pattern >> 3))] ?? 0xf1;
      const fg = (color >> 4) & 0x0f;
      const bg = color & 0x0f;
      for (let row = 0; row < 8; row += 1) {
        const bits = vram[maskVramAddress(patternBase + pattern * 8 + row)] ?? 0;
        const y = tileY * 8 + row;
        const dest = y * TMS9918_WIDTH + tileX * 8;
        for (let col = 0; col < 8; col += 1) {
          const mask = 0x80 >> col;
          framebuffer[dest + col] = paletteColor((bits & mask) !== 0 ? fg : bg);
        }
      }
    }
  }
  renderSprites(registers, vram, framebuffer);
  return framebuffer;
}

/** Renders TMS sprites with the four-sprites-per-scanline display limit. */
function renderSprites(registers: Uint8Array, vram: Uint8Array, framebuffer: number[]): void {
  const attrBase = spriteAttributeBase(registers);
  const patternBase = spritePatternBase(registers);
  const size = spriteSize(registers);
  const scale = spriteScale(registers);
  const visibleSpritesPerLine = new Array<number>(TMS9918_HEIGHT).fill(0);

  for (let sprite = 0; sprite < 32; sprite += 1) {
    const base = maskVramAddress(attrBase + sprite * 4);
    const rawY = vram[base] ?? 0xd0;
    if (rawY === 0xd0) {
      break;
    }
    const y = rawY === 0xff ? -1 : rawY + 1;
    const x = vram[maskVramAddress(base + 1)] ?? 0;
    const pattern = vram[maskVramAddress(base + 2)] ?? 0;
    const spriteColor = (vram[maskVramAddress(base + 3)] ?? 0) & 0x0f;
    if (spriteColor === 0) {
      continue;
    }
    const rgb = paletteColor(spriteColor, 0xffffff);
    for (let sy = 0; sy < size * scale; sy += 1) {
      const screenY = y + sy;
      if (screenY < 0 || screenY >= TMS9918_HEIGHT) {
        continue;
      }
      if ((visibleSpritesPerLine[screenY] ?? 0) >= 4) {
        continue;
      }
      const patternRow = Math.floor(sy / scale);
      const rowPatternOffset =
        size === 16
          ? (pattern & 0xfc) * 8 + (patternRow & 0x07) + (patternRow >= 8 ? 16 : 0)
          : pattern * 8 + patternRow;
      const leftByte = vram[maskVramAddress(patternBase + rowPatternOffset)] ?? 0;
      const rightByte =
        size === 16 ? (vram[maskVramAddress(patternBase + rowPatternOffset + 8)] ?? 0) : 0;
      for (let sx = 0; sx < size * scale; sx += 1) {
        const screenX = x + sx;
        if (screenX < 0 || screenX >= TMS9918_WIDTH) {
          continue;
        }
        const patternCol = Math.floor(sx / scale);
        const bits = patternCol < 8 ? leftByte : rightByte;
        const mask = 0x80 >> (patternCol & 0x07);
        if ((bits & mask) !== 0) {
          framebuffer[screenY * TMS9918_WIDTH + screenX] = rgb;
        }
      }
      visibleSpritesPerLine[screenY] = (visibleSpritesPerLine[screenY] ?? 0) + 1;
    }
  }
}

/** Creates a mutable TMS9918/TMS9929 device model for the TEC-1G runtime. */
export function createTms9918(
  options: { videoStandard?: Tms9918VideoStandard } = {}
): Tms9918Device {
  let active = true;
  let videoStandard: Tms9918VideoStandard = options.videoStandard ?? 'pal';
  let status = 0;
  let address = 0;
  let controlLatch: number | null = null;
  let frameCycleCounter = 0;
  let nmiPending = false;
  let frameDirty = false;
  const registers = new Uint8Array(8);
  const vram = new Uint8Array(TMS9918_VRAM_SIZE);

  const setFrameInterrupt = (): void => {
    status |= TMS9918_INTERRUPT_FLAG;
    if ((reg(registers, 1) & TMS9918_INTERRUPT_ENABLE) !== 0) {
      nmiPending = true;
    }
  };

  return {
    setActive(nextActive: boolean): void {
      active = nextActive;
      frameDirty = true;
      if (!active) {
        nmiPending = false;
      }
    },
    setVideoStandard(standard: Tms9918VideoStandard): void {
      videoStandard = standard;
      frameCycleCounter = 0;
      frameDirty = true;
    },
    writeControl(value: number): void {
      if (!active) {
        return;
      }
      const byte = maskByte(value);
      if (controlLatch === null) {
        controlLatch = byte;
        return;
      }
      const first = controlLatch;
      controlLatch = null;
      if ((byte & TMS9918_REGISTER_WRITE) !== 0) {
        registers[byte & 0x07] = first;
        frameDirty = true;
        return;
      }
      address = maskVramAddress(((byte & 0x3f) << 8) | first);
    },
    writeData(value: number): void {
      if (!active) {
        return;
      }
      vram[address] = maskByte(value);
      address = maskVramAddress(address + 1);
      frameDirty = true;
    },
    readStatus(): number {
      if (!active) {
        return 0xff;
      }
      const out = status & 0xff;
      status &= ~TMS9918_INTERRUPT_FLAG;
      nmiPending = false;
      controlLatch = null;
      return out;
    },
    readData(): number {
      if (!active) {
        return 0xff;
      }
      const out = vram[address] ?? 0;
      address = maskVramAddress(address + 1);
      return out;
    },
    peekStatus(): number {
      return active ? status & 0xff : 0xff;
    },
    advanceCycles(cycles: number): boolean {
      if (!active || cycles <= 0) {
        return false;
      }
      let presentedDirtyFrame = false;
      frameCycleCounter += cycles;
      const frameCycles = FRAME_CYCLES[videoStandard];
      while (frameCycleCounter >= frameCycles) {
        frameCycleCounter -= frameCycles;
        setFrameInterrupt();
        if (frameDirty) {
          presentedDirtyFrame = true;
          frameDirty = false;
        }
      }
      return presentedDirtyFrame;
    },
    consumeNmi(): boolean {
      if (!active || !nmiPending) {
        return false;
      }
      nmiPending = false;
      return true;
    },
    reset(): void {
      status = 0;
      address = 0;
      controlLatch = null;
      frameCycleCounter = 0;
      nmiPending = false;
      frameDirty = true;
      registers.fill(0);
      vram.fill(0);
    },
    snapshot(): Tms9918Snapshot {
      return {
        active,
        videoStandard,
        registers: Array.from(registers),
        status: status & 0xff,
        vram,
        framebuffer: renderGraphicsOne(registers, vram),
      };
    },
  };
}
