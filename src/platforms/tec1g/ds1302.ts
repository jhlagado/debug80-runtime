/**
 * @file DS1302 RTC bit-bang emulation.
 */

type Ds1302Mode = 'idle' | 'command' | 'read' | 'write';

const CE_BIT = 0x10;
const CLK_BIT = 0x40;
const IO_OUT_BIT = 0x80;
const REGISTER_COUNT = 0x20;
const RAM_OFFSET = 0x20;
const RAM_SIZE = 0x20;
const RAM_MASK = 0x1f;
const WRITE_PROTECT_INDEX = 0x07;

const REG_SECONDS = 0x00;
const REG_MINUTES = 0x01;
const REG_HOURS = 0x02;
const REG_DATE = 0x03;
const REG_MONTH = 0x04;
const REG_DAY = 0x05;
const REG_YEAR = 0x06;
const REG_CONTROL = 0x07;

/**
 * Minimal DS1302 bit-bang implementation.
 */
export class Ds1302 {
  private registers = new Uint8Array(REGISTER_COUNT);
  private ram = new Uint8Array(RAM_SIZE);
  private ce = false;
  private clk = false;
  private ioOut = 1;
  private mode: Ds1302Mode = 'idle';
  private bitIndex = 0;
  private command = 0;
  private address = 0;
  private dataShift = 0;
  private burst = false;
  private timeFrozen = false;

  /**
   * Writes a new IO bus value (bit-bang).
   */
  write(value: number): void {
    const nextCe = (value & CE_BIT) !== 0;
    const nextClk = (value & CLK_BIT) !== 0;
    const ioIn = (value & IO_OUT_BIT) !== 0 ? 1 : 0;

    if (!nextCe) {
      this.resetTransaction();
      this.ce = false;
      this.clk = nextClk;
      return;
    }

    if (!this.ce && nextCe) {
      this.beginTransaction();
    }

    if (!this.clk && nextClk) {
      this.handleClockRise(ioIn);
    }

    this.ce = nextCe;
    this.clk = nextClk;
  }

  /**
   * Reads the current data line bit.
   */
  read(): number {
    return this.ioOut & 0x01;
  }

  private beginTransaction(): void {
    this.mode = 'command';
    this.bitIndex = 0;
    this.command = 0;
    this.dataShift = 0;
    this.address = 0;
    this.ioOut = 1;
    this.ce = true;
  }

  private resetTransaction(): void {
    this.mode = 'idle';
    this.bitIndex = 0;
    this.command = 0;
    this.dataShift = 0;
    this.address = 0;
    this.ioOut = 1;
  }

  private handleClockRise(ioIn: number): void {
    if (this.mode === 'command') {
      this.command |= (ioIn & 0x01) << this.bitIndex;
      this.bitIndex += 1;
      if (this.bitIndex >= 8) {
        const rawCommand = this.command;
        const readMode = (rawCommand & 0x01) !== 0;
        let addr = (rawCommand >> 1) & 0x3f;
        let burst = false;
        if ((rawCommand & 0xfe) === 0xbe) {
          burst = true;
          addr = 0x00;
        } else if ((rawCommand & 0xfe) === 0xfe) {
          burst = true;
          addr = RAM_OFFSET;
        }
        this.address = addr;
        this.burst = burst;
        this.bitIndex = 0;
        this.dataShift = 0;
        this.command = 0;
        if (readMode) {
          this.refreshTimeRegisters();
          this.mode = 'read';
          this.dataShift = this.readRegister(this.address) ?? 0;
        } else {
          this.mode = 'write';
        }
      }
      return;
    }

    if (this.mode === 'write') {
      this.dataShift |= (ioIn & 0x01) << this.bitIndex;
      this.bitIndex += 1;
      if (this.bitIndex >= 8) {
        this.writeRegister(this.address, this.dataShift & 0xff);
        if (this.burst) {
          this.address = this.nextBurstAddress(this.address);
          this.dataShift = 0;
          this.bitIndex = 0;
        } else {
          this.mode = 'command';
          this.bitIndex = 0;
          this.dataShift = 0;
        }
      }
      return;
    }

    if (this.mode === 'read') {
      const bit = (this.dataShift >> this.bitIndex) & 0x01;
      this.ioOut = bit;
      this.bitIndex += 1;
      if (this.bitIndex >= 8) {
        if (this.burst) {
          this.address = this.nextBurstAddress(this.address);
          this.dataShift = this.readRegister(this.address) ?? 0;
          this.bitIndex = 0;
        } else {
          this.mode = 'command';
          this.bitIndex = 0;
        }
      }
    }
  }

  private readRegister(addr: number): number {
    if (addr < REGISTER_COUNT) {
      return this.registers[addr] ?? 0;
    }
    if (addr >= RAM_OFFSET && addr < RAM_OFFSET + RAM_SIZE) {
      return this.ram[(addr - RAM_OFFSET) & RAM_MASK] ?? 0;
    }
    return 0;
  }

  private writeRegister(addr: number, value: number): void {
    if (addr < REGISTER_COUNT) {
      if (this.isWriteProtected() && addr !== REG_CONTROL) {
        return;
      }
      this.registers[addr] = value & 0xff;
      if (addr <= REG_YEAR) {
        this.timeFrozen = true;
        this.applyTimeRegisterWrite();
      }
      return;
    }
    if (addr >= RAM_OFFSET && addr < RAM_OFFSET + RAM_SIZE) {
      if (this.isWriteProtected()) {
        return;
      }
      this.ram[(addr - RAM_OFFSET) & RAM_MASK] = value & 0xff;
    }
  }

  private nextBurstAddress(addr: number): number {
    if (addr < REGISTER_COUNT) {
      return (addr + 1) & 0x1f;
    }
    if (addr >= RAM_OFFSET && addr < RAM_OFFSET + RAM_SIZE) {
      const next = (addr - RAM_OFFSET + 1) & RAM_MASK;
      return RAM_OFFSET + next;
    }
    return addr;
  }

  private isWriteProtected(): boolean {
    const value = this.registers[WRITE_PROTECT_INDEX] ?? 0;
    return (value & 0x80) !== 0;
  }

  private refreshTimeRegisters(): void {
    if (this.timeFrozen) {
      return;
    }
    const now = new Date();
    const seconds = this.toBcd(now.getSeconds());
    const minutes = this.toBcd(now.getMinutes());
    const hours = this.toBcd(now.getHours());
    const date = this.toBcd(now.getDate());
    const month = this.toBcd(now.getMonth() + 1);
    const day = this.toBcd(now.getDay() === 0 ? 7 : now.getDay());
    const year = this.toBcd(now.getFullYear() % 100);
    this.registers[REG_SECONDS] = seconds;
    this.registers[REG_MINUTES] = minutes;
    this.registers[REG_HOURS] = hours;
    this.registers[REG_DATE] = date;
    this.registers[REG_MONTH] = month;
    this.registers[REG_DAY] = day;
    this.registers[REG_YEAR] = year;
  }

  private applyTimeRegisterWrite(): void {
    const seconds = this.fromBcd(this.registers[REG_SECONDS] ?? 0);
    const minutes = this.fromBcd(this.registers[REG_MINUTES] ?? 0);
    const hours = this.fromBcd(this.registers[REG_HOURS] ?? 0);
    const date = this.fromBcd(this.registers[REG_DATE] ?? 1);
    const month = this.fromBcd(this.registers[REG_MONTH] ?? 1) - 1;
    const day = this.fromBcd(this.registers[REG_DAY] ?? 1);
    const year = this.fromBcd(this.registers[REG_YEAR] ?? 0);
    void seconds;
    void minutes;
    void hours;
    void date;
    void month;
    void day;
    void year;
    void day;
  }

  private toBcd(value: number): number {
    const v = Math.max(0, Math.min(99, Math.trunc(value)));
    return ((Math.floor(v / 10) << 4) | (v % 10)) & 0xff;
  }

  private fromBcd(value: number): number {
    const high = (value >> 4) & 0x0f;
    const low = value & 0x0f;
    return high * 10 + low;
  }
}
