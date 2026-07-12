/**
 * @file SD card SPI bit-bang emulation (TEC-1G port 0xFD).
 */

type SdCommand = {
  cmd: number;
  arg: number;
  crc: number;
};

export type SdSpiOptions = {
  csMask?: number;
  csActiveLow?: boolean;
  highCapacity?: boolean;
  image?: Uint8Array;
  onWrite?: (image: Uint8Array) => void;
};

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;
const DEFAULT_CS_MASK = 0x04;

/**
 * Bit-banged SD card SPI helper for port 0xFD.
 */
export class SdSpi {
  private csMask: number;
  private csActiveLow: boolean;
  private highCapacity: boolean;
  private csActive = false;
  private clk = false;
  private inShift = 0;
  private inBitIndex = 0;
  private outShift = 0xff;
  private outBitIndex = 0;
  private ioOut = 1;
  private commandBytes: number[] = [];
  private lastCommand: SdCommand | undefined;
  private outputQueue: number[] = [];
  private image: Uint8Array | null = null;
  private onWrite?: (image: Uint8Array) => void;
  private pendingResponse: number[] | null = null;
  private delayBytes = 0;
  private appCommand = false;
  private initTries = 0;
  private ready = false;
  private writeState: {
    start: number;
    awaitingToken: boolean;
    buffer: Uint8Array;
    index: number;
    crcRemaining: number;
  } | null = null;

  /**
   * Creates a new SD SPI bit-bang helper.
   */
  public constructor(options: SdSpiOptions = {}) {
    this.csMask = options.csMask ?? DEFAULT_CS_MASK;
    this.csActiveLow = options.csActiveLow !== false;
    this.highCapacity = options.highCapacity !== false;
    this.image = options.image ?? null;
    if (options.onWrite !== undefined) {
      this.onWrite = options.onWrite;
    }
  }

  /**
   * Writes a new bus value to the SPI bit-bang interface.
   */
  public write(value: number): void {
    const nextClk = (value & CLK_BIT) !== 0;
    const csLineHigh = (value & this.csMask) !== 0;
    const nextCsActive = this.csActiveLow ? !csLineHigh : csLineHigh;

    if (!nextCsActive) {
      this.csActive = false;
      this.clk = nextClk;
      return;
    }

    if (!this.csActive && nextCsActive) {
      const appCommand = this.appCommand;
      if (!this.hasActiveTransaction()) {
        this.beginTransaction();
        this.appCommand = appCommand;
      }
    }

    if (!this.clk && nextClk) {
      const bit = (value & MOSI_BIT) !== 0 ? 1 : 0;
      this.shiftIn(bit);
      this.shiftOut();
    }

    this.csActive = nextCsActive;
    this.clk = nextClk;
  }

  /**
   * Reads the current MISO bit on the TEC-1G SDIO port.
   *
   * MON-3 samples bit 7 with `in a,(SDIO)` followed by `rla`.
   */
  public read(): number {
    if (!this.csActive) {
      return 0xff;
    }
    return this.ioOut ? 0x80 : 0x00;
  }

  /**
   * Returns the last parsed command frame, if any.
   */
  public getLastCommand(): SdCommand | undefined {
    return this.lastCommand;
  }

  private hasActiveTransaction(): boolean {
    return (
      this.commandBytes.length > 0 ||
      this.pendingResponse !== null ||
      this.outputQueue.length > 0 ||
      this.outShift !== 0xff ||
      this.outBitIndex !== 0 ||
      this.writeState !== null
    );
  }

  private beginTransaction(): void {
    this.inShift = 0;
    this.inBitIndex = 0;
    this.outShift = 0xff;
    this.outBitIndex = 0;
    this.ioOut = 1;
    this.commandBytes = [];
    this.outputQueue = [];
    this.lastCommand = undefined;
    this.appCommand = false;
    this.pendingResponse = null;
    this.delayBytes = 0;
    this.writeState = null;
    this.csActive = true;
  }

  private shiftIn(bit: number): void {
    this.inShift = ((this.inShift << 1) | (bit & 0x01)) & 0xff;
    this.inBitIndex += 1;
    if (this.inBitIndex >= 8) {
      const byte = this.inShift & 0xff;
      if (this.writeState) {
        this.consumeWriteByte(byte);
        this.inShift = 0;
        this.inBitIndex = 0;
        return;
      }
      if (this.commandBytes.length === 0 && (byte & 0xc0) !== 0x40) {
        this.inShift = 0;
        this.inBitIndex = 0;
        return;
      }
      this.commandBytes.push(byte);
      if (this.commandBytes.length >= 6) {
        this.captureCommand();
        this.commandBytes = [];
      }
      this.inShift = 0;
      this.inBitIndex = 0;
    }
  }

  private shiftOut(): void {
    if (this.outBitIndex === 0 && this.pendingResponse) {
      if (this.delayBytes > 0) {
        this.delayBytes -= 1;
      } else {
        this.enqueueResponse(this.pendingResponse);
        this.pendingResponse = null;
      }
    }
    this.ioOut = (this.outShift >> (7 - this.outBitIndex)) & 0x01;
    this.outBitIndex += 1;
    if (this.outBitIndex >= 8) {
      this.outBitIndex = 0;
      this.outShift = this.outputQueue.shift() ?? 0xff;
    }
  }

  private captureCommand(): void {
    const [cmd, a3, a2, a1, a0, crc] = this.commandBytes;
    if (
      cmd === undefined ||
      a3 === undefined ||
      a2 === undefined ||
      a1 === undefined ||
      a0 === undefined ||
      crc === undefined
    ) {
      return;
    }
    if ((cmd & 0xc0) !== 0x40) {
      return;
    }
    const arg = ((a3 << 24) | (a2 << 16) | (a1 << 8) | a0) >>> 0;
    this.lastCommand = { cmd: cmd & 0x3f, arg, crc };
    this.handleCommand(this.lastCommand);
  }

  private enqueueResponse(bytes: number[]): void {
    this.outputQueue.push(...bytes.map((value) => value & 0xff));
    if (this.outputQueue.length > 0) {
      this.outBitIndex = 0;
      this.outShift = this.outputQueue.shift() ?? 0xff;
    }
  }

  private handleCommand(command: SdCommand): void {
    switch (command.cmd) {
      case 0: {
        this.ready = false;
        this.initTries = 0;
        this.appCommand = false;
        this.pendingResponse = [0x01];
        this.delayBytes = 1;
        break;
      }
      case 8: {
        this.pendingResponse = [0x01, 0x00, 0x00, 0x01, 0xaa];
        this.delayBytes = 1;
        break;
      }
      case 55: {
        this.appCommand = true;
        this.pendingResponse = [this.ready ? 0x00 : 0x01];
        this.delayBytes = 1;
        break;
      }
      case 41: {
        if (!this.appCommand) {
          this.pendingResponse = [0x05];
          this.delayBytes = 1;
          break;
        }
        this.appCommand = false;
        this.initTries += 1;
        if (this.initTries >= 2) {
          this.ready = true;
          this.pendingResponse = [0x00];
        } else {
          this.pendingResponse = [0x01];
        }
        this.delayBytes = 1;
        break;
      }
      case 58: {
        const ocr = this.highCapacity ? 0xc0 : 0x80;
        this.pendingResponse = [this.ready ? 0x00 : 0x01, ocr, 0x00, 0x00, 0x00];
        this.delayBytes = 1;
        break;
      }
      case 16: {
        this.pendingResponse = [this.ready ? 0x00 : 0x01];
        this.delayBytes = 1;
        break;
      }
      case 13: {
        const r1 = this.ready ? 0x00 : 0x01;
        this.pendingResponse = [r1, 0x00];
        this.delayBytes = 1;
        break;
      }
      case 9: {
        if (!this.ready) {
          this.pendingResponse = [0x01];
          this.delayBytes = 1;
          break;
        }
        this.pendingResponse = [0x00, 0xfe, ...this.makeCsd(), 0xff, 0xff];
        this.delayBytes = 1;
        break;
      }
      case 10: {
        if (!this.ready) {
          this.pendingResponse = [0x01];
          this.delayBytes = 1;
          break;
        }
        this.pendingResponse = [0x00, 0xfe, ...this.makeCid(), 0xff, 0xff];
        this.delayBytes = 1;
        break;
      }
      case 17: {
        if (!this.ready) {
          this.pendingResponse = [0x01];
          this.delayBytes = 1;
          break;
        }
        const payload = this.readBlock(command.arg);
        this.pendingResponse = [0x00, 0xfe, ...payload, 0xff, 0xff];
        this.delayBytes = 1;
        break;
      }
      case 24: {
        if (!this.ready) {
          this.pendingResponse = [0x01];
          this.delayBytes = 1;
          break;
        }
        const start = this.resolveAddress(command.arg);
        this.writeState = {
          start,
          awaitingToken: true,
          buffer: new Uint8Array(512),
          index: 0,
          crcRemaining: 0,
        };
        this.pendingResponse = [0x00];
        this.delayBytes = 1;
        break;
      }
      default: {
        this.pendingResponse = [this.ready ? 0x00 : 0x01];
        this.delayBytes = 1;
        break;
      }
    }
  }

  private resolveAddress(arg: number): number {
    return this.highCapacity ? ((arg >>> 0) << 9) >>> 0 : arg >>> 0;
  }

  private readBlock(arg: number): number[] {
    // SDHC uses block (LBA) addressing; SDSC uses byte addressing.
    const start = this.resolveAddress(arg);
    const payload = new Array<number>(512).fill(0x00);
    if (!this.image || this.image.length === 0) {
      return payload;
    }
    for (let i = 0; i < 512; i += 1) {
      const idx = start + i;
      if (idx >= 0 && idx < this.image.length) {
        payload[i] = this.image[idx] ?? 0x00;
      }
    }
    return payload;
  }

  private makeCid(): number[] {
    const cid = new Array<number>(16).fill(0x00);
    cid[0] = 0x03;
    cid[1] = 0x44;
    cid[2] = 0x38;
    cid[3] = 0x44; // PNM, visible to TEC-1G SD diagnostics.
    cid[4] = 0x45;
    cid[5] = 0x42;
    cid[6] = 0x38;
    cid[7] = 0x30;
    cid[8] = 0x10;
    return cid;
  }

  private makeCsd(): number[] {
    const csd = new Array<number>(16).fill(0x00);
    csd[0] = this.highCapacity ? 0x40 : 0x00;
    csd[1] = 0x0e;
    csd[5] = 0x5a;
    csd[8] = 0x00;
    csd[9] = 0x1f;
    csd[10] = 0xff;
    return csd;
  }

  private consumeWriteByte(byte: number): void {
    if (!this.writeState) {
      return;
    }
    if (this.writeState.awaitingToken) {
      if (byte === 0xfe) {
        this.writeState.awaitingToken = false;
      }
      return;
    }
    if (this.writeState.index < 512) {
      this.writeState.buffer[this.writeState.index] = byte & 0xff;
      this.writeState.index += 1;
      if (this.writeState.index >= 512) {
        this.writeState.crcRemaining = 2;
      }
      return;
    }
    if (this.writeState.crcRemaining > 0) {
      this.writeState.crcRemaining -= 1;
      if (this.writeState.crcRemaining === 0) {
        this.commitWrite();
      }
    }
  }

  private commitWrite(): void {
    if (!this.writeState) {
      return;
    }
    if (this.image && this.image.length > 0) {
      const end = this.writeState.start + this.writeState.buffer.length;
      for (let i = 0; i < this.writeState.buffer.length; i += 1) {
        const idx = this.writeState.start + i;
        if (idx >= 0 && idx < this.image.length && idx < end) {
          this.image[idx] = this.writeState.buffer[i] ?? 0x00;
        }
      }
      if (this.onWrite) {
        this.onWrite(this.image);
      }
    }
    // Data response token: 0bxxx00101 = 0x05 (accepted).
    this.pendingResponse = [0x05, 0xff];
    this.delayBytes = 1;
    this.writeState = null;
  }
}
