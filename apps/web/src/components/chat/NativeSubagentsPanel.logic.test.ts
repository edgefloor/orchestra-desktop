import { describe, expect, it } from "vite-plus/test";

import { shouldApplyNativeSubagentResult } from "./NativeSubagentsPanel.logic";

describe("shouldApplyNativeSubagentResult", () => {
  it("accepts only the latest response for the currently selected native child", () => {
    expect(
      shouldApplyNativeSubagentResult({
        activeRequestId: 2,
        resultRequestId: 2,
        selectedAgentThreadId: "child-b",
        resultAgentThreadId: "child-b",
      }),
    ).toBe(true);
    expect(
      shouldApplyNativeSubagentResult({
        activeRequestId: 2,
        resultRequestId: 1,
        selectedAgentThreadId: "child-b",
        resultAgentThreadId: "child-a",
      }),
    ).toBe(false);
    expect(
      shouldApplyNativeSubagentResult({
        activeRequestId: 2,
        resultRequestId: 2,
        selectedAgentThreadId: null,
        resultAgentThreadId: "child-b",
      }),
    ).toBe(false);
  });
});
