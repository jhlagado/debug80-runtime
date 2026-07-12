# Debug80 Runtime

`@jhlagado/debug80-runtime` contains the UI-independent Z80 CPU and platform
models used by Debug80 and by headless program verification.

It does not depend on AZM, Glimmer, Visual Studio Code or the Debug Adapter
Protocol.

The package is ESM-only and requires Node.js 20 or newer.

## Headless Session

```ts
import { createTec1gHeadlessSession } from '@jhlagado/debug80-runtime/headless';
import { parseIntelHex } from '@jhlagado/debug80-runtime';

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

The `@jhlagado/debug80-runtime/headless` export is the stable public runner
boundary. It executes language-neutral HEX and optional D8 data; AZM and
Glimmer remain build-time concerns outside this package.

## Runner API

- `stepInstruction`, `runUntil`, and `runCycles` execute with cycle propagation.
- `runMatrixScans` and `runVideoFrames` advance distinct hardware boundaries.
- `pressMatrixKey`, `releaseMatrixKey`, `tapMatrixKey`, and `setJoystick`
  provide input without UI events.
- `memory.readByte`, `readWord`, `readBytes`, and the matching write methods
  accept numeric addresses or D8 symbol names.
- `matrixSnapshot`, `hudSnapshot`, `lcdSnapshot`, and `speakerSnapshot` return
  copied semantic device state. Speaker snapshots retain bounded edge history.
- `videoStateSnapshot` returns registers, status, VRAM, standard, and frame
  count without rendering. `videoSpritesSnapshot` decodes sprite attributes.
  `videoSnapshot` additionally renders the 256x192 framebuffer and is therefore
  intentionally more expensive.
- `reset` restores the original program, overlays, entry point, stack pointer,
  devices, counters, trace, and captured speaker edges.

Snapshots are detached from mutable emulator storage. Programs that use MON-3
random services are reproducible after `reset` when the same pinned ROM and
initial program image are supplied.
