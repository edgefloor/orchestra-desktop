import { describe, expect, it } from "vite-plus/test";

import { boundedAutomationText, readableAutomationError } from "./AutomationError.logic";

describe("Automation error text", () => {
  it("normalizes one shared fallback for non-Error failures", () => {
    expect(readableAutomationError({ reason: "opaque" })).toBe("The Automation request failed.");
  });

  it("trims and byte-bounds multibyte text at the requested limit", () => {
    const bounded = boundedAutomationText(`  ${"🥁".repeat(20)}  `, 23);

    expect(new TextEncoder().encode(bounded).byteLength).toBeLessThanOrEqual(23);
    expect(bounded).toBe("🥁🥁🥁🥁🥁…");
  });

  it("handles a byte limit that cannot fit an ellipsis", () => {
    expect(boundedAutomationText("too long", 2)).toBe("");
  });
});
