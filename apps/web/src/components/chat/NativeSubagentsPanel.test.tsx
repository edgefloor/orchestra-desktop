import {
  EnvironmentId,
  EventId,
  ThreadId,
  TurnId,
  type NativeSubagentDetail,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { NativeSubagentSummary } from "~/nativeSubagents";
import { NativeSubagentDetailPanel, NativeSubagentsPanel } from "./NativeSubagentsPanel";

const environmentId = EnvironmentId.make("local");
const parentThreadId = ThreadId.make("parent-task");

function subagentActivity(): OrchestrationThreadActivity {
  return {
    id: EventId.make("event-1"),
    tone: "tool",
    kind: "tool.started",
    summary: "Subagent activity",
    payload: {
      itemType: "collab_agent_tool_call",
      status: "inProgress",
      data: {
        item: {
          type: "subAgentActivity",
          agentThreadId: "child-1",
          agentPath: "/root/reviewer",
          kind: "started",
        },
      },
    },
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}

describe("NativeSubagentsPanel", () => {
  it("keeps the subagent surface present for an ordinary task", () => {
    const markup = renderToStaticMarkup(
      <NativeSubagentsPanel
        environmentId={environmentId}
        parentThreadId={parentThreadId}
        activities={[]}
      />,
    );

    expect(markup).toContain('aria-label="Native subagents"');
    expect(markup).toContain("No subagents");
  });

  it("renders stable native child identity and lifecycle state", () => {
    const onOpenChild = vi.fn();
    const markup = renderToStaticMarkup(
      <NativeSubagentsPanel
        environmentId={environmentId}
        parentThreadId={parentThreadId}
        activities={[subagentActivity()]}
        onOpenChild={onOpenChild}
      />,
    );

    expect(markup).toContain("reviewer");
    expect(markup).toContain("Running");
    expect(onOpenChild).not.toHaveBeenCalled();
  });

  it("renders inline native lineage, bounded detail, and explicit truncation", () => {
    const selected: NativeSubagentSummary = {
      agentThreadId: "child-1",
      agentPath: "/root/reviewer",
      status: "completed",
      recentActivity: ["Review complete"],
    };
    const detail: NativeSubagentDetail = {
      parentTaskId: parentThreadId,
      agentThreadId: "child-1",
      status: "completed",
      nickname: "Reviewer",
      role: "code review",
      preview: "Found one actionable issue.",
      updatedAt: "2026-07-17T00:00:01.000Z",
      items: [{ id: "item-1", type: "message", summary: "Review complete" }],
      truncated: true,
    };

    const markup = renderToStaticMarkup(
      <NativeSubagentDetailPanel
        parentThreadId={parentThreadId}
        selected={selected}
        detail={detail}
        loading={false}
        error={null}
        onBack={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain("Parent parent-task");
    expect(markup).toContain("Child child-1");
    expect(markup).toContain('aria-label="Back to parent task"');
    expect(markup).toContain("Found one actionable issue.");
    expect(markup).toContain("Earlier child activity remains in the native task");
    expect(markup).not.toContain('role="dialog"');
  });

  it("renders a retryable explicit child-detail failure", () => {
    const markup = renderToStaticMarkup(
      <NativeSubagentDetailPanel
        parentThreadId={parentThreadId}
        selected={{
          agentThreadId: "child-1",
          agentPath: null,
          status: "unavailable",
          recentActivity: [],
        }}
        detail={null}
        loading={false}
        error="The child is no longer available."
        onBack={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("The child is no longer available.");
    expect(markup).toContain("Retry child detail");
  });
});
