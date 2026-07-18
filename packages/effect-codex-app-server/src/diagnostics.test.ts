import { assert, describe, it } from "@effect/vitest";
import { truncateDiagnosticText as sharedTruncateDiagnosticText } from "@t3tools/shared/diagnosticText";

import { truncateDiagnosticText } from "./diagnostics.ts";

describe("diagnostic text compatibility export", () => {
  it("re-exports the shared diagnostic truncator", () => {
    assert.strictEqual(truncateDiagnosticText, sharedTruncateDiagnosticText);
  });
});
