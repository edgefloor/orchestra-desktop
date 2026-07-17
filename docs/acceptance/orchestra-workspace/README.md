# Orchestra workspace acceptance artifacts

This directory is reserved for the six deterministic Product screenshots required by
`edgefloor/codex-orchestra#63`. `manifest.example.json` documents the executable contract enforced
by `scripts/verify-orchestra-acceptance.ts`; it is not acceptance evidence.

The example's zero object IDs and digests are placeholders. A completed capture must write
`manifest.json` plus all six PNG files named by the manifest. The verifier checks the exact scenario
matrix, metadata, semantic assertions, PNG dimensions, and digests. It deliberately performs no
pixel comparison.

Do not copy the deployed design reference into this directory. These artifacts must be captured
from the standalone Orchestra desktop fork.
