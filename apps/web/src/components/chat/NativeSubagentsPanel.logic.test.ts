import { describe, expect, it } from "vite-plus/test";

import type { NativeSubagentSummary } from "~/nativeSubagents";
import {
  deriveNativeSubagentRestoration,
  shouldApplyNativeSubagentResult,
} from "./NativeSubagentsPanel.logic";

const child: NativeSubagentSummary = {
  agentThreadId: "child-b",
  agentPath: "/root/child-b",
  status: "running",
  recentActivity: [],
};

describe("deriveNativeSubagentRestoration", () => {
  it("opens only a requested projected child that differs from the current selection", () => {
    expect(
      deriveNativeSubagentRestoration({
        requestedAgentThreadId: "child-b",
        selectedAgentThreadId: "child-a",
        agents: [child],
      }),
    ).toEqual({ kind: "open", agent: child });
    expect(
      deriveNativeSubagentRestoration({
        requestedAgentThreadId: "child-b",
        selectedAgentThreadId: "child-b",
        agents: [child],
      }),
    ).toEqual({ kind: "none" });
  });

  it("leaves an unavailable request on the list and closes stale detail", () => {
    expect(
      deriveNativeSubagentRestoration({
        requestedAgentThreadId: "missing-child",
        selectedAgentThreadId: null,
        agents: [child],
      }),
    ).toEqual({ kind: "none" });
    expect(
      deriveNativeSubagentRestoration({
        requestedAgentThreadId: "missing-child",
        selectedAgentThreadId: "child-b",
        agents: [child],
      }),
    ).toEqual({ kind: "close" });
  });

  it("does not interfere with ordinary user-driven selection without a request", () => {
    expect(
      deriveNativeSubagentRestoration({
        requestedAgentThreadId: undefined,
        selectedAgentThreadId: "child-b",
        agents: [child],
      }),
    ).toEqual({ kind: "none" });
  });
});

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
