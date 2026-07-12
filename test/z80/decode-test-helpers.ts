import { init as initCpu } from '../../src/z80/cpu.js';
import { Cpu, Callbacks } from '../../src/z80/types.js';
import { DecodeContext } from '../../src/z80/decode-types.js';

export interface DecodeTestContext {
  cpu: Cpu;
  memory: Uint8Array;
  cb: Callbacks;
  ctx: DecodeContext;
}

export const initDecodeTestContext = (): DecodeTestContext => {
  const cpu = initCpu();
  const memory = new Uint8Array(65536);
  const cb: Callbacks = {
    mem_read: (addr: number) => memory[addr & 0xffff],
    mem_write: (addr: number, val: number) => {
      memory[addr & 0xffff] = val & 0xff;
    },
    io_read: () => 0,
    io_write: () => {},
  };

  return { cpu, memory, cb, ctx: { cpu, cb } };
};
