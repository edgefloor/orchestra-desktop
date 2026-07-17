import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveNativeSubagents, MAX_NATIVE_SUBAGENT_SUMMARIES } from "./nativeSubagents";

function activity(
  id: string,
  item: Record<string, unknown>,
  status: string = "inProgress",
): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "tool",
    kind: "tool.started",
    summary: "Subagent activity",
    payload: { itemType: "collab_agent_tool_call", status, data: { item } },
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}

describe("native subagent summaries", () => {
  it("projects stable identity, lifecycle state, and bounded recent activity", () => {
    const result = deriveNativeSubagents([
      activity("event-1", {
        type: "collabAgentToolCall",
        receiverThreadIds: ["child-1"],
        prompt: "Inspect the task",
        agentsStates: { "child-1": { status: "running", message: "Reading files" } },
      }),
      activity(
        "event-2",
        {
          type: "collabAgentToolCall",
          receiverThreadIds: ["child-1"],
          prompt: "Inspect the task",
          agentsStates: { "child-1": { status: "completed", message: "Found the seam" } },
        },
        "completed",
      ),
    ]);

    expect(result).toEqual({
      agents: [
        {
          agentThreadId: "child-1",
          agentPath: null,
          status: "completed",
          recentActivity: ["Reading files", "Found the seam"],
        },
      ],
      truncated: false,
    });
  });

  it("incorporates native subagent activity without copying child history", () => {
    const result = deriveNativeSubagents([
      activity("event-1", {
        type: "subAgentActivity",
        agentThreadId: "child-2",
        agentPath: "/root/reviewer",
        kind: "interrupted",
      }),
    ]);

    expect(result.agents[0]).toMatchObject({
      agentThreadId: "child-2",
      agentPath: "/root/reviewer",
      status: "cancelled",
      recentActivity: ["/root/reviewer · interrupted"],
    });
  });

  it("hard-bounds the number of parent summaries", () => {
    const activities = Array.from({ length: MAX_NATIVE_SUBAGENT_SUMMARIES + 3 }, (_, index) =>
      activity(`event-${index}`, {
        type: "collabAgentToolCall",
        receiverThreadIds: [`child-${index}`],
        prompt: `Task ${index}`,
      }),
    );

    const result = deriveNativeSubagents(activities);
    expect(result.agents).toHaveLength(MAX_NATIVE_SUBAGENT_SUMMARIES);
    expect(result.truncated).toBe(true);
  });
});
