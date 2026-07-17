import {
  ApprovalRequestId,
  ThreadId,
  type AutomationRun,
  type OrchestraReplayEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { PendingApproval, WorkLogEntry } from "../../session-logic";
import {
  MAX_ATTENTION_ITEMS,
  buildAttentionWorkflowQuery,
  deriveTaskAttention,
  deriveTaskAttentionRuntimeState,
  readTaskAttentionRunCursor,
  taskAttentionActionRoute,
} from "./TaskAttentionView.logic";

function workflowEvent(revision: number, status: "waitingApproval" | "completed"): WorkLogEntry {
  const event: OrchestraReplayEvent = {
    schemaVersion: 1,
    eventId: `run-1:${revision}`,
    runId: "run-1",
    sequence: revision,
    revision,
    kind: revision > 1 ? "resumed" : "invoked",
    projection: {
      schemaVersion: 1,
      runId: "run-1",
      workflowSha256: "workflow-sha",
      parentThreadId: "task-49",
      sourceRevision: "source-revision",
      status,
      promotion: "pending",
      steps: [
        {
          id: "publish",
          status,
          attempts: 1,
          rounds: 1,
          outputKeys: [],
          finalResponse: null,
          error: null,
        },
      ],
      nextAction: status === "waitingApproval" ? "Approve the publish step" : "Run complete",
    },
  };
  return {
    id: event.eventId,
    createdAt: `2026-07-17T00:00:0${revision}.000Z`,
    label: "Orchestra workflow",
    tone: "info",
    toolData: event,
  };
}

function automationRun(): AutomationRun {
  return {
    schemaVersion: 1,
    runId: "automation-49",
    ownerThreadId: "task-49",
    sourceRevision: "source-revision",
    profileDigest: "profile-digest",
    profileRevision: 1,
    profileRevisionStatus: "active",
    profileDiagnostics: [],
    trackerProjectSlug: "orchestra",
    leaseEpoch: 2,
    revision: 4,
    status: "running",
    reconciliation: "blocked",
    queueCounts: {
      queued: 0,
      running: 1,
      blocked: 0,
      waitingGate: 1,
      handoff: 0,
      terminal: 0,
    },
    claimsTotal: 1,
    claims: [
      {
        claimId: "claim-49",
        issueId: "issue-49",
        issueIdentifier: "ORC-49",
        issueTitle: { text: "Build Attention", truncated: false },
        trackerState: "In Progress",
        attempt: 1,
        profileDigest: "profile-digest",
        profileRevision: 1,
        status: "running",
        worktree: "/repo/.worktrees/orc-49",
        sourceRevision: "source-revision",
        effects: [
          {
            effectId: "effect-gate",
            idempotencyKey: "gate-idempotency",
            kind: "tracker.transition",
            status: "waiting_gate",
            gatePolicy: "ask_human",
            requestSha256: "gate-sha",
            bodyPreview: { text: "Move ORC-49 to Done", truncated: false },
          },
          {
            effectId: "effect-ambiguous",
            idempotencyKey: "ambiguous-idempotency",
            kind: "tracker.comment",
            status: "ambiguous",
            gatePolicy: "auto_accept",
            requestSha256: "ambiguous-sha",
            bodyPreview: { text: "Comment may have landed", truncated: false },
            failure: { text: "Provider response was interrupted", truncated: false },
          },
        ],
        hookReceipts: [],
        cleanup: { status: "retained", attempts: 0 },
        nextAction: { text: "Resolve effects", truncated: false },
      },
    ],
    queuePreview: [],
    queuePreviewTruncated: false,
    nextAction: { text: "Reconcile the provider receipt", truncated: false },
  };
}

describe("deriveTaskAttention", () => {
  it("keeps count parity while distinguishing native attention categories", () => {
    const approvals: PendingApproval[] = [
      {
        requestId: ApprovalRequestId.make("approval-49"),
        requestKind: "command",
        createdAt: "2026-07-17T00:00:00.000Z",
        detail: "pnpm test",
      },
    ];
    const result = deriveTaskAttention({
      approvals,
      workLogEntries: [workflowEvent(1, "waitingApproval")],
      automationRun: automationRun(),
      providerError: "Provider disconnected",
    });

    expect(result.count).toBe(6);
    expect(result.items.map((item) => item.kind)).toEqual([
      "approval",
      "reconciliation_failure",
      "ambiguous_effect",
      "waiting_gate",
      "waiting_gate",
      "provider_failure",
    ]);
    expect(result.omitted).toBe(0);
  });

  it("uses only the latest native workflow revision and removes resolved gates", () => {
    const result = deriveTaskAttention({
      approvals: [],
      workLogEntries: [workflowEvent(1, "waitingApproval"), workflowEvent(2, "completed")],
      automationRun: null,
      providerError: null,
    });

    expect(result).toEqual({ count: 0, items: [], omitted: 0 });
  });

  it("bounds the list without changing the canonical count", () => {
    const approvals = Array.from({ length: MAX_ATTENTION_ITEMS + 3 }, (_, index) => ({
      requestId: ApprovalRequestId.make(`approval-${index}`),
      requestKind: "command" as const,
      createdAt: "2026-07-17T00:00:00.000Z",
    }));
    const result = deriveTaskAttention({
      approvals,
      workLogEntries: [],
      automationRun: null,
      providerError: null,
    });

    expect(result.count).toBe(MAX_ATTENTION_ITEMS + 3);
    expect(result.items).toHaveLength(MAX_ATTENTION_ITEMS);
    expect(result.omitted).toBe(3);
  });
});

describe("attention recovery", () => {
  it("represents loading, stale, error, recovered, and empty native snapshots", () => {
    expect(
      deriveTaskAttentionRuntimeState({
        hasRunCursor: false,
        loading: false,
        hasSnapshot: false,
        error: null,
        recovered: false,
      }),
    ).toBe("empty");
    expect(
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: true,
        hasSnapshot: false,
        error: null,
        recovered: false,
      }),
    ).toBe("loading");
    expect(
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: false,
        hasSnapshot: true,
        error: "offline",
        recovered: false,
      }),
    ).toBe("stale");
    expect(
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: false,
        hasSnapshot: false,
        error: "offline",
        recovered: false,
      }),
    ).toBe("error");
    expect(
      deriveTaskAttentionRuntimeState({
        hasRunCursor: true,
        loading: false,
        hasSnapshot: true,
        error: null,
        recovered: true,
      }),
    ).toBe("recovered");
  });

  it("builds a bounded task-authorized workflow detail query", () => {
    expect(
      buildAttentionWorkflowQuery({
        threadId: ThreadId.make("task-49"),
        runId: "run-49",
      }),
    ).toEqual({
      threadId: "task-49",
      runId: "run-49",
      selector: "steps",
      maxItems: 20,
      maxBytes: 32 * 1024,
    });
  });

  it("reattaches after reload using only the active task native Run cursor", () => {
    const values = new Map([
      ["t3code:automation-run:task-49", " automation-49 "],
      ["t3code:automation-run:task-other", "automation-other"],
    ]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(readTaskAttentionRunCursor(storage, ThreadId.make("task-49"))).toBe("automation-49");
    expect(readTaskAttentionRunCursor(storage, ThreadId.make("task-missing"))).toBeNull();
  });

  it("routes actions only to existing native approval and Symphony surfaces", () => {
    expect(
      taskAttentionActionRoute({
        id: "approval:1",
        kind: "approval",
        title: "Approval",
        summary: "Review",
        requestId: ApprovalRequestId.make("approval-1"),
      }),
    ).toBe("native_approval");
    expect(
      taskAttentionActionRoute({
        id: "workflow:1",
        kind: "waiting_gate",
        title: "Gate",
        summary: "Review",
        runId: "run-1",
        stepId: "step-1",
      }),
    ).toBe("workflow_approval");
    expect(
      taskAttentionActionRoute({
        id: "automation:1",
        kind: "ambiguous_effect",
        title: "Effect",
        summary: "Inspect",
        runId: "automation-1",
      }),
    ).toBe("automation_workspace");
    expect(
      taskAttentionActionRoute({
        id: "provider:1",
        kind: "provider_failure",
        title: "Provider failure",
        summary: "Offline",
      }),
    ).toBe("none");
  });
});
