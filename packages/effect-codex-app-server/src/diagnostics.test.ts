import { assert, describe, it } from "@effect/vitest";

import { truncateDiagnosticText } from "./diagnostics.ts";

describe("diagnostic text truncation", () => {
  it("retains text that already fits", () => {
    assert.equal(truncateDiagnosticText("ready", 5), "ready");
  });

  it("uses the exact bound when a code-point boundary fits", () => {
    assert.equal(truncateDiagnosticText("abcdef", 4), "abc…");
  });

  it("drops a complete astral character instead of retaining one surrogate", () => {
    assert.equal(truncateDiagnosticText("xx😀later", 4), "xx…");
  });
});
