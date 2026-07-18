# Orchestra native shell acceptance evidence

This directory contains the sealed native-shell evidence for `edgefloor/codex-orchestra#66`.
It is captured from the standalone `edgefloor/orchestra-desktop` fork, not from the deployed
wireframe or a replacement renderer.

The manifest binds the evidence to Desktop source commit
`fa24bf561bcd807e71c3aa786c83c0d8277307b6` and tree
`622c518832281fb157283a62b54090e57fe2e53b`. The harness launches the production Electron main,
preload, server, and web artifacts, creates the project and task through the native backend, and
drives the production Browser panel's real `<webview>` guest.

## Reproduce

From the repository root:

```sh
vp run build:desktop
node apps/desktop/scripts/capture-orchestra-native-shell.mjs
node scripts/verify-orchestra-native-shell.ts
```

Two clean captures were run against the bound source. Both produced the same 28 passing semantic
assertions and verified closed owned ports plus an empty owned process group. The narrow screenshot
was byte-identical in both runs:

- `native-workspace-1024x768-dark.png`:
  `828a584ce17c0a8d7781000d706a2c615d07299fcdb45bc566f69bb7001aff51`

The wide screenshot contains the current dynamic loopback port in the visible address bar, so a
fresh run is expected to change its bytes while preserving the verified semantics. The two observed
wide hashes were:

- first run: `f2120768e0f81bc1ba5fc7ff3d36a6256acb7087702d0fba8085fafa580985de`
- published second run: `b84ec2415162831bfd15dea855e4c05c91a3818ba5e46ce47a5c96fce9eb7026`

## Human observation

Both final PNGs were directly inspected. They show the native project, task, tabs, composer, and
truthful unauthenticated-provider recovery state. The 1440×900 capture shows the production Browser
panel with the real guest page. The 1024×768 capture shows the Browser disclosure remains reachable
with no visible clipping.

This deterministic evidence does not claim a live authenticated provider or MCP broker session.
That separate dogfood boundary remains open in `edgefloor/codex-orchestra#66`. Distribution signing
and notarization remain tracked by `edgefloor/codex-orchestra#56`.
