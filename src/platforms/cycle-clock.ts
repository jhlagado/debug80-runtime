/**
 * @file Simple cycle-based scheduler for platform runtimes.
 */

export type CycleCallback = () => void;

interface CycleEvent {
  id: number;
  at: number;
  interval?: number;
  callback: CycleCallback;
}

/**
 * Schedules callbacks to run at specific cycle counts.
 */
export class CycleClock {
  private nowCycles = 0;
  private nextId = 1;
  private queue: CycleEvent[] = [];

  now(): number {
    return this.nowCycles;
  }

  scheduleAt(at: number, callback: CycleCallback): number {
    const event: CycleEvent = {
      id: this.nextId++,
      at: Math.max(0, at),
      callback,
    };
    this.insertEvent(event);
    return event.id;
  }

  scheduleIn(delta: number, callback: CycleCallback): number {
    return this.scheduleAt(this.nowCycles + Math.max(0, delta), callback);
  }

  scheduleEvery(interval: number, callback: CycleCallback): number {
    const safeInterval = Math.max(1, interval);
    const event: CycleEvent = {
      id: this.nextId++,
      at: this.nowCycles + safeInterval,
      interval: safeInterval,
      callback,
    };
    this.insertEvent(event);
    return event.id;
  }

  cancel(id: number): boolean {
    const index = this.queue.findIndex((event) => event.id === id);
    if (index === -1) {
      return false;
    }
    this.queue.splice(index, 1);
    return true;
  }

  advance(cycles: number): void {
    if (cycles <= 0) {
      return;
    }
    this.nowCycles += cycles;
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (!next) {
        break;
      }
      if (next.at > this.nowCycles) {
        break;
      }
      this.queue.shift();
      next.callback();
      if (next.interval !== undefined && next.interval > 0) {
        next.at += next.interval;
        this.insertEvent(next);
      }
    }
  }

  private insertEvent(event: CycleEvent): void {
    if (this.queue.length === 0) {
      this.queue.push(event);
      return;
    }
    const index = this.queue.findIndex((item) => item.at > event.at);
    if (index === -1) {
      this.queue.push(event);
    } else {
      this.queue.splice(index, 0, event);
    }
  }
}
