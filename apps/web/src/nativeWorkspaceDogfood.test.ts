import {
  EnvironmentId,
  EventId,
  ThreadId,
  TurnId,
  type AutomationRun,
  type OrchestraReplayEvent,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveNativeSubagents } from "./nativeSubagents";
import type { WorkLogEntry } from "./session-logic";
import {
  buildWorkspaceTaskTabs,
  workspaceTaskTabKey,
  type WorkspaceTaskTabSource,
} from "./components/WorkspaceTaskTabs.logic";
import {
  deriveAutomationWorkspaceState,
  type AutomationWorkspaceState,
} from "./components/chat/AutomationProfileDialog.logic";
import {
  buildWorkflowTreeQuery,
  workflowRunDisplayState,
} from "./components/chat/WorkflowRunTree.logic";
import {
  deriveTaskAttention,
  deriveTaskAttentionRuntimeState,
  readTaskAttentionRunCursor,
} from "./components/chat/TaskAttentionView.logic";

const environmentId = EnvironmentId.make("local");
const threadId = ThreadId.make("dogfood-task");

function task(): WorkspaceTaskTabSource {
  return {
    environmentId,
    id: threadId,
    title: "Dogfood native workspace",
    updatedAt: "2026-07-17T00:00:00.000Z",
    archivedAt: null,
    session: { status: "running" },
  };
}

function workflowEvent(
  revision: number,
  status: "waitingApproval" | "completed",
): OrchestraReplayEvent {
  return {
    schemaVersion: 1,
    eventId: `workflow-51:${revision}`,
    runId: "workflow-51",
    sequence: revision,
    revision,
    kind: revision === 1 ? "invoked" : "resumed",
    projection: {
      schemaVersion: 1,
      runId: "workflow-51",
      workflowSha256: "workflow-sha",
      parentThreadId: threadId,
      sourceRevision: "source-revision",
      status,
      promotion: status === "completed" ? "applied" : "pending",
      steps: [
        {
          id: "accept",
          status,
          attempts: 1,
          rounds: 1,
          outputKeys: [],
          finalResponse: null,
          error: null,
        },
      ],
      nextAction: status === "waitingApproval" ? "Review the gate" : "Run complete",
    },
  };
}

function workLog(event: OrchestraReplayEvent): WorkLogEntry {
  return {
    id: event.eventId,
    createdAt: `2026-07-17T00:00:0${event.revision}.000Z`,
    label: "Orchestra workflow",
    tone: "info",
    toolData: event,
  };
}

function subagentActivity(status: "running" | "completed"): OrchestrationThreadActivity {
  return {
    id: EventId.make(`child-${status}`),
    tone: "tool",
    kind: status === "running" ? "tool.started" : "tool.completed",
    summary: "Native subagent",
    payload: {
      itemType: "collab_agent_tool_call",
      status: status === "running" ? "inProgress" : "completed",
      data: {
        item: {
          type: "collabAgentToolCall",
          receiverThreadIds: ["child-51"],
          agentsStates: { "child-51": { status, message: `Child ${status}` } },
        },
      },
    },
    turnId: TurnId.make("turn-51"),
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}

const emptyCounts = {
  queued: 0,
  running: 0,
  blocked: 0,
  waitingGate: 0,
  handoff: 0,
  terminal: 0,
};

function automationRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    schemaVersion: 1,
    runId: "automation-51",
    ownerThreadId: threadId,
    sourceRevision: "source-revision",
    profileDigest: "profile-digest",
    profileRevision: 1,
    profileRevisionStatus: "active",
    profileDiagnostics: [],
    trackerProjectSlug: "orchestra",
    leaseEpoch: 1,
    revision: 1,
    status: "running",
    reconciliation: "complete",
    queueCounts: emptyCounts,
    claimsTotal: 0,
    claims: [],
    queuePreview: [],
    queuePreviewTruncated: false,
    nextAction: { text: "Remain resident", truncated: false },
    ...overrides,
  };
}

describe("redesigned native workspace dogfood contract", () => {
  it("keeps one native task while a child, workflow gate, Attention, and Evidence inspection progress", () => {
    const activeTask = task();
    const tabs = buildWorkspaceTaskTabs({
      tasks: [activeTask],
      activeTaskKey: workspaceTaskTabKey(activeTask),
    });
    expect(tabs.map((entry) => entry.id)).toEqual([threadId]);

    expect(
      deriveNativeSubagents([subagentActivity("running"), subagentActivity("completed")]).agents,
    ).toMatchObject([{ agentThreadId: "child-51", status: "completed" }]);

    const waiting = workflowEvent(1, "waitingApproval");
    expect(
      deriveTaskAttention({
        approvals: [],
        workLogEntries: [workLog(waiting)],
        automationRun: null,
        providerError: null,
      }).items,
    ).toMatchObject([{ kind: "waiting_gate", runId: "workflow-51", stepId: "accept" }]);

    expect(
      buildWorkflowTreeQuery({
        threadId,
        runId: "workflow-51",
        selector: "evidence_content",
        evidenceId: "opaque-evidence-51",
      }),
    ).toEqual({
      threadId,
      runId: "workflow-51",
      selector: "evidence_content",
      evidenceId: "opaque-evidence-51",
      maxItems: 20,
      maxBytes: 65_536,
    });

    expect(
      deriveTaskAttention({
        approvals: [],
        workLogEntries: [workLog(waiting), workLog(workflowEvent(2, "completed"))],
        automationRun: null,
        providerError: null,
      }),
    ).toEqual({ count: 0, items: [], omitted: 0 });
  });

  it("covers the native loading and lifecycle presentation matrix without renderer-owned states", () => {
    expect([
      workflowRunDisplayState("pending"),
      workflowRunDisplayState("running"),
      workflowRunDisplayState("waitingApproval"),
      workflowRunDisplayState("paused"),
      workflowRunDisplayState("completed"),
      workflowRunDisplayState("failed"),
      workflowRunDisplayState("cancelled"),
      workflowRunDisplayState("unavailable"),
    ]).toEqual([
      "queued",
      "running",
      "waiting",
      "paused",
      "completed",
      "failed",
      "cancelled",
      "unavailable",
    ]);

    const states: ReadonlyArray<
      readonly [AutomationWorkspaceState, Parameters<typeof deriveAutomationWorkspaceState>[0]]
    > = [
      ["idle", { pendingAction: null, validation: null, run: null, error: null }],
      ["validating", { pendingAction: "validating", validation: null, run: null, error: null }],
      ["queued", { pendingAction: "starting", validation: null, run: null, error: null }],
      [
        "running",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({ queueCounts: { ...emptyCounts, running: 1 } }),
          error: null,
        },
      ],
      [
        "waiting",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({ queueCounts: { ...emptyCounts, waitingGate: 1 } }),
          error: null,
        },
      ],
      [
        "paused",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({ status: "suspended" }),
          error: null,
        },
      ],
      [
        "reconciling",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({ reconciliation: "required" }),
          error: null,
        },
      ],
      [
        "completed",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({
            claimsTotal: 1,
            queueCounts: { ...emptyCounts, terminal: 1 },
            claims: [
              {
                claimId: "claim-51",
                issueId: "issue-51",
                issueIdentifier: "ORC-51",
                issueTitle: { text: "Dogfood native workspace", truncated: false },
                trackerState: "Done",
                attempt: 1,
                profileDigest: "profile-digest",
                profileRevision: 1,
                status: "completed",
                worktree: "/repo/.worktrees/orc-51",
                sourceRevision: "source-revision",
                effects: [],
                hookReceipts: [],
                cleanup: { status: "retained", attempts: 0 },
                nextAction: { text: "Claim complete", truncated: false },
              },
            ],
          }),
          error: null,
        },
      ],
      [
        "failed",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({ status: "failed" }),
          error: null,
        },
      ],
      [
        "cancelled",
        {
          pendingAction: null,
          validation: null,
          run: automationRun({ status: "cancelled" }),
          error: null,
        },
      ],
      ["unavailable", { pendingAction: null, validation: null, run: null, error: "offline" }],
    ];

    for (const [expected, input] of states) {
      expect(deriveAutomationWorkspaceState(input)).toBe(expected);
    }

    expect([
      deriveTaskAttentionRuntimeState({
        hasRunCursor: false,
        loading: false,
        hasSnapshot: false,
        error: null,
        recovered: false,
      }),
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: true,
        hasSnapshot: false,
        error: null,
        recovered: false,
      }),
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: false,
        hasSnapshot: true,
        error: "offline",
        recovered: false,
      }),
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: false,
        hasSnapshot: true,
        error: null,
        recovered: true,
      }),
    ]).toEqual(["empty", "loading", "stale", "recovered"]);
  });

  it("reattaches only the same task Run cursor after renderer reload", () => {
    const storage = {
      getItem: (key: string) =>
        new Map([
          ["t3code:automation-run:dogfood-task", "automation-51"],
          ["t3code:automation-run:other-task", "automation-other"],
        ]).get(key) ?? null,
    };

    expect(readTaskAttentionRunCursor(storage, threadId)).toBe("automation-51");
    expect(readTaskAttentionRunCursor(storage, ThreadId.make("missing-task"))).toBeNull();
  });
});
