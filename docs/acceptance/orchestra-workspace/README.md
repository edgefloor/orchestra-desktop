# Orchestra workspace acceptance artifacts

This directory is reserved for the deterministic Product screenshot matrix required by
`edgefloor/codex-orchestra#63`. `manifest.example.json` illustrates the manifest metadata shape;
the authoritative scenario names and count live in `scripts/verify-orchestra-acceptance.ts`. The
example is not acceptance evidence.

The example's zero object IDs and digests are placeholders. A completed capture must write
`manifest.json` plus every PNG in that verifier-owned matrix. The verifier checks the exact scenario
set, metadata, semantic assertions, PNG dimensions, and digests. It deliberately performs no pixel
comparison.

Do not copy the deployed design reference into this directory. These artifacts must be captured
from the standalone Orchestra desktop fork.
