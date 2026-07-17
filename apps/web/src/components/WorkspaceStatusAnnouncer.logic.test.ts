import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkspaceStatusSnapshot,
  diffWorkspaceStatusSnapshots,
  MAX_WORKSPACE_STATUS_ANNOUNCEMENT_ITEMS,
} from "./WorkspaceStatusAnnouncer.logic";

const emptyInput = {
  scopeKey: "environment:thread",
  tasks: [],
  subagents: [],
  workflowRuns: [],
  pendingApprovalIds: [],
  pendingUserInputIds: [],
  actionablePlanId: null,
  providerFailed: false,
} as const;

describe("workspace status announcements", () => {
  it("keeps reorder and activity-only changes out of the semantic signature", () => {
    const first = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      subagents: [
        { agentThreadId: "a", agentPath: "/root/a", status: "running", recentActivity: ["one"] },
        { agentThreadId: "b", agentPath: "/root/b", status: "pending", recentActivity: [] },
      ],
    });
    const reordered = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      subagents: [
        { agentThreadId: "b", agentPath: "/root/b", status: "pending", recentActivity: [] },
        { agentThreadId: "a", agentPath: "/renamed/a", status: "running", recentActivity: ["two"] },
      ],
    });

    expect(reordered.signature).toBe(first.signature);
    expect(diffWorkspaceStatusSnapshots(first, reordered)).toBeNull();
  });

  it("announces running to completed transitions politely", () => {
    const running = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      subagents: [
        {
          agentThreadId: "agent-one",
          agentPath: "/root/tester",
          status: "running",
          recentActivity: [],
        },
      ],
    });
    const completed = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      subagents: [
        {
          agentThreadId: "agent-one",
          agentPath: "/root/tester",
          status: "completed",
          recentActivity: [],
        },
      ],
    });

    expect(diffWorkspaceStatusSnapshots(running, completed)).toEqual({
      politeness: "polite",
      text: "tester completed.",
    });
  });

  it("uses an assertive alert for failed and unavailable states", () => {
    const previous = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      subagents: [
        { agentThreadId: "a", agentPath: "/root/a", status: "running", recentActivity: [] },
        { agentThreadId: "b", agentPath: "/root/b", status: "running", recentActivity: [] },
      ],
    });
    const current = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      subagents: [
        { agentThreadId: "a", agentPath: "/root/a", status: "failed", recentActivity: [] },
        { agentThreadId: "b", agentPath: "/root/b", status: "unavailable", recentActivity: [] },
      ],
    });

    expect(diffWorkspaceStatusSnapshots(previous, current)).toEqual({
      politeness: "assertive",
      text: "a failed. b unavailable.",
    });
  });

  it("is silent when the active task scope changes", () => {
    const previous = buildWorkspaceStatusSnapshot(emptyInput);
    const current = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      scopeKey: "environment:other-thread",
      providerFailed: true,
    });
    expect(diffWorkspaceStatusSnapshots(previous, current)).toBeNull();
  });

  it("coalesces and bounds multiple semantic changes", () => {
    const previous = buildWorkspaceStatusSnapshot(emptyInput);
    const current = buildWorkspaceStatusSnapshot({
      ...emptyInput,
      pendingApprovalIds: Array.from(
        { length: MAX_WORKSPACE_STATUS_ANNOUNCEMENT_ITEMS + 2 },
        (_, index) => `request-${index}`,
      ),
    });

    expect(diffWorkspaceStatusSnapshots(previous, current)).toEqual({
      politeness: "polite",
      text: "Approval request needs attention. Approval request needs attention. Approval request needs attention. And 2 more status updates.",
    });
  });
});
