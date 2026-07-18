# Orchestra workspace acceptance artifacts

This directory is reserved for the thirteen deterministic Product screenshots required by
`edgefloor/codex-orchestra#63`. `manifest.example.json` illustrates the manifest metadata shape;
the executable scenario matrix lives in `scripts/verify-orchestra-acceptance.ts`. The example is
not acceptance evidence.

The example's zero object IDs and digests are placeholders. A completed capture must write
`manifest.json` plus all thirteen PNG files named by the manifest. The verifier checks the exact scenario
matrix, metadata, semantic assertions, PNG dimensions, and digests. It deliberately performs no
pixel comparison.

Do not copy the deployed design reference into this directory. These artifacts must be captured
from the standalone Orchestra desktop fork.
