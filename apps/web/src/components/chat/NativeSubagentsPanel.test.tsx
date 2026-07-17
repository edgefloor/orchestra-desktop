import {
  EnvironmentId,
  EventId,
  ThreadId,
  TurnId,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { NativeSubagentsPanel } from "./NativeSubagentsPanel";

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
    const markup = renderToStaticMarkup(
      <NativeSubagentsPanel
        environmentId={environmentId}
        parentThreadId={parentThreadId}
        activities={[subagentActivity()]}
      />,
    );

    expect(markup).toContain("reviewer");
    expect(markup).toContain("Running");
  });
});
