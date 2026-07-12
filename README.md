# Debug80 Runtime

`@jhlagado/debug80-runtime` contains the UI-independent Z80 CPU and platform
models used by Debug80 and by headless program verification.

It does not depend on AZM, Glimmer, Visual Studio Code or the Debug Adapter
Protocol.

The package is ESM-only and requires Node.js 20 or newer.

## Headless Session

```ts
import { createTec1gHeadlessSession, parseIntelHex } from '@jhlagado/debug80-runtime';

const session = createTec1gHeadlessSession({
  program: parseIntelHex(hex),
  debugMap,
  entry: 'Start',
  stackPointer: 0x7fff,
  overlays: [{ address: 0xc000, bytes: monitorRom }],
});

session.runUntil((game) => game.memory.readByte('Score') === 10, {
  maxInstructions: 100_000,
  maxCycles: 1_000_000,
});
```

Every conditional run requires an instruction or cycle budget. Timeout errors
include the PC, registers, cumulative cycle count and a recent instruction
trace.
