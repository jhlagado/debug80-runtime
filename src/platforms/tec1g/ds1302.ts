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

const CLOCK_HALT_BIT = 0x80;
const HOUR_12_BIT = 0x80;
const HOUR_PM_BIT = 0x20;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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
  // Until a time register is written the clock reads the host's local time.
  // After that it counts on from what was written, one tick per host second
  // since `tickBaseMs`, unless the clock-halt bit is set.
  private followsHost = true;
  private tickBaseMs = 0;

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
    } else if (this.clk && !nextClk && this.mode === 'read') {
      this.handleClockFall();
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
  }

  /**
   * Outputs the next data bit. The DS1302 drives I/O on falling edges: the
   * first data bit on the fall after the last command bit.
   */
  private handleClockFall(): void {
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
      if (addr <= REG_YEAR) {
        this.refreshTimeRegisters();
        if (this.followsHost || addr === REG_SECONDS) {
          this.followsHost = false;
          this.tickBaseMs = Date.now();
        }
      }
      this.registers[addr] = value & 0xff;
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
    if (!this.followsHost) {
      this.advanceWrittenTime();
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

  /**
   * Counts the written time on by the whole host seconds since the last tick.
   * While the clock-halt bit is set the registers hold and no time is owed.
   */
  private advanceWrittenTime(): void {
    const now = Date.now();
    if (((this.registers[REG_SECONDS] ?? 0) & CLOCK_HALT_BIT) !== 0) {
      this.tickBaseMs = now;
      return;
    }
    const elapsed = Math.floor((now - this.tickBaseMs) / 1000);
    for (let i = 0; i < elapsed; i += 1) {
      this.tick();
    }
    this.tickBaseMs += elapsed * 1000;
  }

  /**
   * Advances the time registers by one second, carrying as the chip does.
   */
  private tick(): void {
    const r = this.registers;
    if ((r[REG_SECONDS] = this.bcdStep(r[REG_SECONDS] ?? 0, 0x59)) !== 0) return;
    if ((r[REG_MINUTES] = this.bcdStep(r[REG_MINUTES] ?? 0, 0x59)) !== 0) return;
    if (!this.tickHours()) return;
    r[REG_DAY] = (r[REG_DAY] ?? 1) >= 7 ? 1 : (r[REG_DAY] ?? 0) + 1;
    const year = this.fromBcd(r[REG_YEAR] ?? 0);
    const month = this.fromBcd(r[REG_MONTH] ?? 1);
    const leap = month === 2 && year % 4 === 0 ? 1 : 0;
    const last = this.toBcd((MONTH_DAYS[month - 1] ?? 31) + leap);
    if ((r[REG_DATE] ?? 1) < last) {
      r[REG_DATE] = this.bcdStep(r[REG_DATE] ?? 1, 0x99);
      return;
    }
    r[REG_DATE] = 0x01;
    if ((r[REG_MONTH] ?? 1) < 0x12) {
      r[REG_MONTH] = this.bcdStep(r[REG_MONTH] ?? 1, 0x99);
      return;
    }
    r[REG_MONTH] = 0x01;
    r[REG_YEAR] = this.bcdStep(r[REG_YEAR] ?? 0, 0x99);
  }

  /**
   * Advances the hours register; returns true when the date carries.
   */
  private tickHours(): boolean {
    const hours = this.registers[REG_HOURS] ?? 0;
    if ((hours & HOUR_12_BIT) === 0) {
      this.registers[REG_HOURS] = this.bcdStep(hours, 0x23);
      return this.registers[REG_HOURS] === 0;
    }
    const flags = hours & (HOUR_12_BIT | HOUR_PM_BIT);
    const hour = hours & 0x1f;
    if (hour === 0x11) {
      const next = flags ^ HOUR_PM_BIT;
      this.registers[REG_HOURS] = next | 0x12;
      return (next & HOUR_PM_BIT) === 0;
    }
    this.registers[REG_HOURS] = flags | (hour === 0x12 ? 0x01 : this.bcdStep(hour, 0x12));
    return false;
  }

  /**
   * Increments a BCD value, wrapping to zero after `max`.
   */
  private bcdStep(value: number, max: number): number {
    if (value >= max) {
      return 0;
    }
    return (value & 0x0f) >= 9 ? (value & 0xf0) + 0x10 : value + 1;
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
