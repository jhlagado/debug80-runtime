# Coding-agent guidance

## Project identity

This repository is **Debug80 Runtime**, the standalone UI-independent Z80
execution and machine-model library published as
`@jhlagado/debug80-runtime`.

## Ownership

This repository owns:

- the TypeScript Z80 execution engine and its public inspection API;
- generic loaders and bounded headless execution;
- the simple, CP/M 2.2, TEC-1, and TEC-1G machine models currently exported by
  the package; and
- conformance and package-surface tests for those facilities.

It does not own the Debug80 VS Code extension, Atom, Nucleus, Glimmer, Triptych,
or their application and machine contracts. Those projects consume this
package through public exports. Do not introduce sibling-directory imports or
dependencies on their source trees.

The existing TypeScript behavior is a reference implementation. A future Rust
or WebAssembly provider must be introduced behind an explicit runtime contract
and compared against the retained tests before replacing it.

## Verification

Run the focused test while editing, then before handoff run:

```sh
npm run check
```

Keep package exports explicit and verify changes through the packed-package
smoke test. Do not infer hardware correctness from this host runtime.
