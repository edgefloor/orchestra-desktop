import type {
  AutomationIssueClaim,
  AutomationQueueItem,
  AutomationQueueReadResult,
  AutomationRunResult,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  projectAutomationWorkspace,
  retainAutomationIssueSelection,
} from "./AutomationWorkspace.logic";

function claim(overrides: Partial<AutomationIssueClaim> = {}): AutomationIssueClaim {
  return {
    claimId: "claim-1",
    issueId: "issue-1",
    issueIdentifier: "ORC-1",
    issueTitle: { text: "First issue", truncated: false },
    issueUrl: null,
    trackerState: "Todo",
    priority: 2,
    attempt: 1,
    workflowInvocations: 1,
    turnsInWindow: 2,
    continuationCount: 0,
    retryAttempt: 0,
    lastProgressAtMs: 40,
    profileDigest: "profile-digest",
    profileRevision: 1,
    status: "running",
    worktree: "/repo/.worktrees/orc-1",
    sourceRevision: "source-revision",
    issueTask: { threadId: "issue-task-1", taskPath: "/root/automation_orc_1" },
    workflowRunId: "workflow-run-1",
    workflowStatus: "running",
    effects: [],
    hookReceipts: [],
    cleanup: { status: "retained", attempts: 0 },
    nextAction: { text: "Continue the workflow", truncated: false },
    ...overrides,
  };
}

function queueItem(overrides: Partial<AutomationQueueItem> = {}): AutomationQueueItem {
  return {
    issueId: "issue-1",
    issueIdentifier: "ORC-1",
    issueTitle: { text: "Fresh queue title", truncated: false },
    state: "In Progress",
    priority: 1,
    claimId: "claim-1",
    category: "running",
    nextAction: { text: "Observe the active workflow", truncated: false },
    ...overrides,
  };
}

function runResult(claims: readonly AutomationIssueClaim[] = [claim()]): AutomationRunResult {
  return {
    run: {
      schemaVersion: 1,
      runId: "root-1",
      ownerThreadId: "task-1",
      sourceRevision: "source-revision",
      profileDigest: "profile-digest",
      profileRevision: 2,
      profileRevisionStatus: "active",
      profileDiagnostics: [],
      trackerProjectSlug: "orchestra",
      leaseEpoch: 1,
      revision: 9,
      status: "running",
      reconciliation: "complete",
      coordination: {
        cycle: 3,
        scanRevision: 7,
        inputCursor: "cursor-1",
        outputCursor: "cursor-2",
        intakeStatus: "ready",
        pageDigest: "page-digest",
        startedAtMs: 30,
        completedAtMs: 31,
        nextAction: { text: "Scan again when due", truncated: false },
        dispatchIntent: {
          intentId: "intent-1",
          claimId: "claim-1",
          issueId: "issue-1",
          kind: "new_claim",
          status: "completed",
          attempt: 1,
          profileDigest: "profile-digest",
          createdAtMs: 20,
          readyAtMs: 21,
        },
      },
      queueCounts: {
        queued: 1,
        running: 1,
        blocked: 0,
        waitingGate: 0,
        handoff: 0,
        terminal: 0,
      },
      claimsTotal: claims.length,
      claims,
      queuePreview: [queueItem()],
      queuePreviewTruncated: false,
      nextAction: { text: "Automation remains resident", truncated: false },
    },
  };
}

describe("projectAutomationWorkspace issues", () => {
  it("fuses queue and claim observations by durable issue identity", () => {
    const projection = projectAutomationWorkspace(runResult());

    expect(projection.issues).toHaveLength(1);
    expect(projection.issues[0]).toMatchObject({
      key: "issue-1",
      issueId: "issue-1",
      issueIdentifier: "ORC-1",
      issueTitle: { text: "Fresh queue title", truncated: false },
      trackerState: "In Progress",
      priority: 1,
      executionState: "running",
      progressSummary: "attempt 1 · 1 invocation · 2 turns",
      claim: { claimId: "claim-1", workflowRunId: "workflow-run-1" },
      queue: { category: "running" },
    });
  });

  it("lets an explicit queue page replace preview tracker fields without replacing claim detail", () => {
    const queue: AutomationQueueReadResult = {
      category: "waiting_gate",
      total: 2,
      items: [
        queueItem({
          issueIdentifier: "ORC-1-FRESH",
          issueTitle: { text: "Newest tracker title", truncated: true },
          state: "Needs Approval",
          category: "waiting_gate",
        }),
      ],
      nextOffset: 1,
    };

    const projection = projectAutomationWorkspace(runResult(), queue);

    expect(projection.issues[0]).toMatchObject({
      issueIdentifier: "ORC-1-FRESH",
      issueTitle: { text: "Newest tracker title", truncated: true },
      trackerState: "Needs Approval",
      executionState: "waiting",
      claim: { claimId: "claim-1" },
    });
    expect(projection.bounds.queue).toEqual({
      source: "page",
      category: "waiting_gate",
      shown: 1,
      total: 2,
      nextOffset: 1,
      truncated: true,
    });
  });

  it("derives retry, reconciliation, terminal, and queue-only states deterministically", () => {
    const initial = runResult([
      claim({
        issueId: "retry",
        claimId: "claim-retry",
        issueIdentifier: "ORC-2",
        retryAttempt: 2,
        scheduledRetry: { kind: "retry", readyAtMs: 120, resetTurnWindow: true },
      }),
      claim({
        issueId: "failed",
        claimId: "claim-failed",
        issueIdentifier: "ORC-3",
        status: "failed",
        workflowStatus: "failed",
      }),
      claim({
        issueId: "done",
        claimId: "claim-done",
        issueIdentifier: "ORC-4",
        status: "completed",
        workflowStatus: "completed",
      }),
    ]);
    const result: AutomationRunResult = {
      run: {
        ...initial.run,
        reconciliation: "required",
        queuePreview: [
          queueItem({
            issueId: "queued",
            claimId: undefined,
            issueIdentifier: "ORC-5",
            category: "queued",
          }),
          queueItem({
            issueId: "retry",
            claimId: "claim-retry",
            issueIdentifier: "ORC-2",
            category: "running",
          }),
        ],
      },
    };

    const projection = projectAutomationWorkspace(result);

    expect(projection.issues.map((issue) => [issue.issueId, issue.executionState])).toEqual([
      ["retry", "retrying"],
      ["queued", "queued"],
      ["failed", "failed"],
      ["done", "completed"],
    ]);
  });

  it("selects the latest deterministic claim when duplicate claim observations exist", () => {
    const projection = projectAutomationWorkspace(
      runResult([
        claim({ claimId: "old", attempt: 1, lastProgressAtMs: 99 }),
        claim({
          claimId: "new",
          attempt: 2,
          lastProgressAtMs: 10,
          retryAttempt: 1,
          scheduledRetry: { kind: "retry", readyAtMs: 120, resetTurnWindow: true },
        }),
      ]),
    );

    expect(projection.issues).toHaveLength(1);
    expect(projection.issues[0]?.claim?.claimId).toBe("new");
    expect(projection.issues[0]?.executionState).toBe("retrying");
  });
});

describe("projectAutomationWorkspace activity and events", () => {
  it("orders human activity by durable recency", () => {
    const activeClaim = claim({
      lastProgressAtMs: 40,
      latestSteeringReceipt: {
        sequence: 2,
        submittedAtMs: 50,
        initiatorThreadId: "task-1",
        targetThreadId: "issue-task-1",
        authority: "automation-claim-native-send-input-v1",
        inputSha256: "guidance-sha",
        inputPreview: "Focus on recovery.",
        status: "delivered",
        providerReceipt: "submission-2",
      },
    });

    const projection = projectAutomationWorkspace(runResult([activeClaim]));

    expect(projection.activity.slice(0, 4).map((entry) => entry.key)).toEqual([
      "steering:claim-1:2",
      "claim:claim-1:progress:40",
      "coordination:root-1:7",
      "dispatch:intent-1",
    ]);
    expect(projection.activity[0]).toMatchObject({
      summary: "Guidance delivered for ORC-1",
      detail: "Focus on recovery.",
    });
  });

  it("groups exact durable records with stable keys", () => {
    const activeClaim = claim({
      hookReceipts: [
        {
          kind: "before_run",
          invocation: 1,
          commandSha256: "command-sha",
          status: "succeeded",
          exitCode: 0,
          stdoutPreview: { text: "ready", truncated: false },
          stderrPreview: { text: "", truncated: false },
        },
      ],
      effects: [
        {
          effectId: "effect-1",
          idempotencyKey: "effect-idempotency",
          kind: "tracker.comment",
          status: "committed",
          gatePolicy: "auto_accept",
          requestSha256: "request-sha",
          bodyPreview: { text: "Verified", truncated: false },
          providerReceipt: "comment-1",
        },
      ],
      latestSteeringReceipt: {
        sequence: 1,
        submittedAtMs: 50,
        initiatorThreadId: "task-1",
        targetThreadId: "issue-task-1",
        authority: "automation-claim-native-send-input-v1",
        inputSha256: "guidance-sha",
        inputPreview: "Continue.",
        status: "delivered",
      },
      cleanup: {
        status: "retry_pending",
        attempts: 2,
        lastFailure: { text: "busy", truncated: false },
      },
    });

    const projection = projectAutomationWorkspace(runResult([activeClaim]));

    expect(projection.eventGroups.map((group) => group.key)).toEqual([
      "coordination",
      "dispatch",
      "reconciliation",
      "hooks",
      "effects",
      "steering",
      "cleanup",
    ]);
    expect(projection.eventGroups.map((group) => group.events[0]?.key)).toEqual([
      "coordination:root-1:7",
      "dispatch:intent-1",
      "reconciliation:root-1:9",
      "hook:claim-1:before_run:1",
      "effect:claim-1:effect-1",
      "steering:claim-1:1",
      "cleanup:claim-1:retry_pending:2",
    ]);
    expect(projection.eventGroups[4]?.events[0]?.exact).toEqual(activeClaim.effects[0]);
  });

  it("reports independent projection and protocol truncation", () => {
    const initial = runResult([
      claim({ issueId: "issue-1", claimId: "claim-1" }),
      claim({ issueId: "issue-2", claimId: "claim-2", issueIdentifier: "ORC-2" }),
      claim({ issueId: "issue-3", claimId: "claim-3", issueIdentifier: "ORC-3" }),
    ]);
    const result: AutomationRunResult = {
      run: { ...initial.run, claimsTotal: 8, queuePreviewTruncated: true },
    };

    const projection = projectAutomationWorkspace(result, null, {
      issues: 2,
      activity: 1,
      eventsPerGroup: 1,
    });

    expect(projection.bounds.issues).toEqual({ shown: 2, available: 3, truncated: true });
    expect(projection.bounds.claims).toEqual({ shown: 3, total: 8, truncated: true });
    expect(projection.bounds.queue).toMatchObject({ source: "preview", truncated: true });
    expect(projection.bounds.activity.truncated).toBe(true);
    expect(projection.eventGroups.find((group) => group.key === "cleanup")).toMatchObject({
      total: 3,
      truncated: true,
    });
  });
});

describe("projectAutomationWorkspace recovery", () => {
  it("projects only durable recovery conditions and marks effect resolution unavailable", () => {
    const recoveringClaim = claim({
      retryAttempt: 2,
      scheduledRetry: { kind: "retry", readyAtMs: 1_789_000_002_000, resetTurnWindow: true },
      effects: [
        {
          effectId: "effect-failed",
          idempotencyKey: "idem-failed",
          kind: "tracker.comment",
          status: "failed",
          gatePolicy: "auto_accept",
          requestSha256: "request-failed",
          bodyPreview: { text: "Post update", truncated: false },
          failure: { text: "Provider rejected the comment", truncated: false },
        },
        {
          effectId: "effect-ambiguous",
          idempotencyKey: "idem-ambiguous",
          kind: "tracker.transition",
          status: "ambiguous",
          gatePolicy: "auto_accept",
          requestSha256: "request-ambiguous",
          bodyPreview: { text: "Move to Done", truncated: false },
        },
        {
          effectId: "effect-waiting",
          idempotencyKey: "idem-waiting",
          kind: "tracker.link_pull_request",
          status: "waiting_gate",
          gatePolicy: "ask_human",
          requestSha256: "request-waiting",
          bodyPreview: { text: "Link PR 12", truncated: false },
        },
        {
          effectId: "effect-executing",
          idempotencyKey: "idem-executing",
          kind: "tracker.comment",
          status: "executing",
          gatePolicy: "auto_accept",
          requestSha256: "request-executing",
          bodyPreview: { text: "Publish update", truncated: false },
        },
      ],
      hookReceipts: [
        {
          kind: "before_run",
          invocation: 2,
          commandSha256: "hook-command",
          status: "failed",
          exitCode: 1,
          stdoutPreview: { text: "", truncated: false },
          stderrPreview: { text: "Dependency missing", truncated: false },
          failure: { text: "Hook exited unsuccessfully", truncated: false },
        },
      ],
      cleanup: {
        status: "retry_pending",
        attempts: 3,
        lastFailure: { text: "Worktree is busy", truncated: false },
      },
    });
    const initial = runResult([recoveringClaim]);
    const result: AutomationRunResult = {
      run: {
        ...initial.run,
        reconciliation: "blocked",
        coordination: {
          ...initial.run.coordination,
          intakeStatus: "skipped",
          error: { text: "Linear intake failed", truncated: false },
          dispatchIntent: {
            ...initial.run.coordination.dispatchIntent!,
            status: "pending",
          },
        },
        queuePreview: [
          queueItem({
            category: "blocked",
            state: "Blocked",
            nextAction: { text: "Inspect tracker blockers", truncated: false },
            blockedBy: [
              {
                id: { text: "issue-blocker", truncated: false },
                identifier: { text: "ORC-0", truncated: false },
                state: { text: "In Progress", truncated: false },
              },
            ],
          }),
        ],
      },
    };

    const projection = projectAutomationWorkspace(result);

    expect(projection.recovery.map((item) => [item.kind, item.status])).toEqual([
      ["coordination", "error"],
      ["dispatch", "pending"],
      ["reconciliation", "blocked"],
      ["blocker", "blocked"],
      ["effect", "failed"],
      ["effect", "ambiguous"],
      ["effect", "executing"],
      ["effect", "waiting_gate"],
      ["hook", "failed"],
      ["cleanup", "retry_pending"],
      ["retry", "scheduled"],
    ]);
    expect(
      projection.recovery
        .filter((item) => item.kind === "effect")
        .every(
          (item) =>
            item.resolution ===
            "Effect resolution is unavailable from this Symphony workspace; inspect the durable receipt before taking provider-specific action.",
        ),
    ).toBe(true);
    expect(projection.recovery.find((item) => item.kind === "blocker")).toMatchObject({
      issueIdentifier: "ORC-1",
      summary: "ORC-1 is blocked by ORC-0",
      detail: "ORC-0 · In Progress. Inspect tracker blockers",
      resolution:
        "Inspect the durable blocker in the tracker, then use Refresh to observe the next native queue projection.",
      actions: ["inspect", "refresh", "open_issue_task"],
    });
    expect(projection.recovery.find((item) => item.kind === "retry")).toMatchObject({
      summary: "Retry 2 is scheduled for ORC-1",
      detail: "Ready at 1789000002000 ms · turn window resets. Continue the workflow",
    });
    expect(
      projection.recovery
        .filter((item) => item.issueKey)
        .every((item) =>
          item.actions.every((action) =>
            ["inspect", "refresh", "resume", "open_issue_task"].includes(action),
          ),
        ),
    ).toBe(true);
    expect(projectAutomationWorkspace(result, null, { recovery: 2 }).bounds.recovery).toEqual({
      shown: 2,
      available: 11,
      truncated: true,
    });
  });

  it("keeps pending and started dispatch intents visible until completion", () => {
    const initial = runResult();
    const projectIntent = (status: "pending" | "started" | "completed") =>
      projectAutomationWorkspace({
        run: {
          ...initial.run,
          coordination: {
            ...initial.run.coordination,
            dispatchIntent: { ...initial.run.coordination.dispatchIntent!, status },
          },
        },
      }).recovery.filter((item) => item.kind === "dispatch");

    expect(projectIntent("pending")).toMatchObject([{ status: "pending" }]);
    expect(projectIntent("started")).toMatchObject([{ status: "started" }]);
    expect(projectIntent("completed")).toEqual([]);
  });

  it("deduplicates durable keys and derives Resume only for suspended roots", () => {
    const effect = {
      effectId: "effect-duplicate",
      idempotencyKey: "idem-duplicate",
      kind: "tracker.comment" as const,
      status: "failed" as const,
      gatePolicy: "auto_accept" as const,
      requestSha256: "request-duplicate",
      bodyPreview: { text: "Publish update", truncated: false },
    };
    const initial = runResult([claim({ effects: [effect, effect] })]);
    const projection = projectAutomationWorkspace({
      run: { ...initial.run, status: "suspended" },
    });
    const effects = projection.recovery.filter((item) => item.kind === "effect");

    expect(effects).toHaveLength(1);
    expect(effects[0]?.actions).toEqual(["inspect", "refresh", "resume", "open_issue_task"]);
  });

  it("adds failed and ambiguous operations to human-readable Activity", () => {
    const projection = projectAutomationWorkspace(
      runResult([
        claim({
          effects: [
            {
              effectId: "effect-failed",
              idempotencyKey: "idem-failed",
              kind: "tracker.comment",
              status: "failed",
              gatePolicy: "auto_accept",
              requestSha256: "request-failed",
              bodyPreview: { text: "Post update", truncated: false },
              failure: { text: "Comment failed", truncated: false },
            },
            {
              effectId: "effect-ambiguous",
              idempotencyKey: "idem-ambiguous",
              kind: "tracker.transition",
              status: "ambiguous",
              gatePolicy: "auto_accept",
              requestSha256: "request-ambiguous",
              bodyPreview: { text: "Transition", truncated: false },
            },
          ],
          hookReceipts: [
            {
              kind: "after_run",
              invocation: 1,
              status: "failed",
              exitCode: 2,
              stdoutPreview: { text: "", truncated: false },
              stderrPreview: { text: "Hook failed", truncated: false },
            },
          ],
          cleanup: { status: "retry_pending", attempts: 1 },
        }),
      ]),
    );

    expect(projection.activity.map((entry) => entry.summary)).toEqual(
      expect.arrayContaining([
        "tracker.comment effect is failed for ORC-1",
        "tracker.transition effect is ambiguous for ORC-1",
        "after run hook failed for ORC-1",
        "Worktree cleanup will retry for ORC-1",
      ]),
    );
  });
});

describe("retainAutomationIssueSelection", () => {
  it("retains only an issue identity that remains in the accepted bounded projection", () => {
    const issues = projectAutomationWorkspace(runResult()).issues;

    expect(retainAutomationIssueSelection("issue-1", issues)).toBe("issue-1");
    expect(retainAutomationIssueSelection("issue-missing", issues)).toBeNull();
    expect(retainAutomationIssueSelection(null, issues)).toBeNull();
  });
});
