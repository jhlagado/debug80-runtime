import { CycleClock } from '../cycle-clock.js';

export type UartParity = 'none' | 'even' | 'odd';

export interface BitbangUartOptions {
  baud: number;
  cyclesPerSecond: number;
  dataBits?: number;
  stopBits?: number;
  parity?: UartParity;
  inverted?: boolean;
}

export interface UartByteEvent {
  byte: number;
  parityOk: boolean;
  framingOk: boolean;
}

export type UartByteHandler = (event: UartByteEvent) => void;

export class BitbangUartDecoder {
  private clock: CycleClock;
  private options: Required<BitbangUartOptions>;
  private cyclesPerBit: number;
  private lineLevel: 0 | 1;
  private receiving = false;
  private bitIndex = 0;
  private currentByte = 0;
  private parityCount = 0;
  private onByte: UartByteHandler | undefined;

  constructor(clock: CycleClock, options: BitbangUartOptions) {
    this.clock = clock;
    this.options = {
      dataBits: options.dataBits ?? 8,
      stopBits: options.stopBits ?? 1,
      parity: options.parity ?? 'none',
      inverted: options.inverted ?? false,
      baud: options.baud,
      cyclesPerSecond: options.cyclesPerSecond,
    };
    this.cyclesPerBit = this.options.cyclesPerSecond / this.options.baud;
    const idle = this.options.inverted ? 0 : 1;
    this.lineLevel = idle;
  }

  setByteHandler(handler: UartByteHandler | undefined): void {
    this.onByte = handler;
  }

  setCyclesPerSecond(hz: number): void {
    if (hz <= 0) {
      return;
    }
    this.options.cyclesPerSecond = hz;
    this.cyclesPerBit = hz / this.options.baud;
  }

  recordLevel(level: 0 | 1): void {
    const prev = this.lineLevel;
    if (prev === level) {
      return;
    }
    this.lineLevel = level;
    if (!this.receiving) {
      const startLevel = this.options.inverted ? 1 : 0;
      if (prev !== startLevel && level === startLevel) {
        this.startFrame();
      }
    }
  }

  private startFrame(): void {
    this.receiving = true;
    this.bitIndex = 0;
    this.currentByte = 0;
    this.parityCount = 0;
    const firstSample = this.clock.now() + this.cyclesPerBit * 1.5;
    this.clock.scheduleAt(firstSample, () => this.sampleBit());
  }

  private sampleBit(): void {
    if (!this.receiving) {
      return;
    }
    const dataBits = this.options.dataBits;
    const parity = this.options.parity;
    const stopBits = this.options.stopBits;
    const parityBits = parity === 'none' ? 0 : 1;
    const totalBits = dataBits + parityBits + stopBits;

    if (this.bitIndex < dataBits) {
      const bit = this.readBit();
      if (bit) {
        this.currentByte |= 1 << this.bitIndex;
        this.parityCount += 1;
      }
      this.bitIndex += 1;
      this.scheduleNextSample();
      return;
    }

    if (this.bitIndex < dataBits + parityBits) {
      const bit = this.readBit();
      const parityOk = this.checkParity(bit);
      this.bitIndex += 1;
      if (this.bitIndex < totalBits) {
        this.scheduleNextSample(parityOk);
      } else {
        this.finishFrame(parityOk, true);
      }
      return;
    }

    const stopBit = this.readBit();
    const framingOk = this.options.inverted ? stopBit === 0 : stopBit === 1;
    this.bitIndex += 1;
    const parityOk = true;
    if (this.bitIndex < totalBits) {
      this.scheduleNextSample(parityOk, framingOk);
      return;
    }
    this.finishFrame(parityOk, framingOk);
  }

  private scheduleNextSample(parityOk = true, framingOk = true): void {
    if (!this.receiving) {
      return;
    }
    const next = this.clock.now() + this.cyclesPerBit;
    this.clock.scheduleAt(next, () => this.sampleBitWithState(parityOk, framingOk));
  }

  private sampleBitWithState(parityOk: boolean, framingOk: boolean): void {
    if (!this.receiving) {
      return;
    }
    const dataBits = this.options.dataBits;
    const parity = this.options.parity;
    const stopBits = this.options.stopBits;
    const parityBits = parity === 'none' ? 0 : 1;
    const totalBits = dataBits + parityBits + stopBits;

    if (this.bitIndex < dataBits) {
      const bit = this.readBit();
      if (bit) {
        this.currentByte |= 1 << this.bitIndex;
        this.parityCount += 1;
      }
      this.bitIndex += 1;
      this.scheduleNextSample(parityOk, framingOk);
      return;
    }

    if (this.bitIndex < dataBits + parityBits) {
      const bit = this.readBit();
      const nextParityOk = parityOk && this.checkParity(bit);
      this.bitIndex += 1;
      if (this.bitIndex < totalBits) {
        this.scheduleNextSample(nextParityOk, framingOk);
      } else {
        this.finishFrame(nextParityOk, framingOk);
      }
      return;
    }

    const stopBit = this.readBit();
    const stopOk = this.options.inverted ? stopBit === 0 : stopBit === 1;
    const nextFramingOk = framingOk && stopOk;
    this.bitIndex += 1;
    if (this.bitIndex < totalBits) {
      this.scheduleNextSample(parityOk, nextFramingOk);
      return;
    }
    this.finishFrame(parityOk, nextFramingOk);
  }

  private readBit(): number {
    const logicalOne = this.options.inverted ? 0 : 1;
    return this.lineLevel === logicalOne ? 1 : 0;
  }

  private checkParity(parityBit: number): boolean {
    if (this.options.parity === 'none') {
      return true;
    }
    const even = this.parityCount % 2 === 0;
    if (this.options.parity === 'even') {
      return parityBit === (even ? 0 : 1);
    }
    return parityBit === (even ? 1 : 0);
  }

  private finishFrame(parityOk: boolean, framingOk: boolean): void {
    this.receiving = false;
    if (this.onByte) {
      this.onByte({
        byte: this.currentByte & 0xff,
        parityOk,
        framingOk,
      });
    }
  }
}
