import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  automationCoordinationSummary,
  automationLinearRows,
  automationLinearAvailability,
  automationRunRows,
  automationWorkspaceCapabilities,
  buildAutomationStartInput,
  buildAutomationValidateInput,
  deriveAutomationWorkspaceState,
} from "./AutomationProfileDialog.logic";

describe("buildAutomationStartInput", () => {
  it("starts production Automation with only the task and profile path", () => {
    expect(
      buildAutomationStartInput({
        threadId: ThreadId.make("task-60"),
        profilePath: " WORKFLOW.md ",
      }),
    ).toEqual({ threadId: "task-60", profilePath: "WORKFLOW.md" });
  });
});

describe("buildAutomationValidateInput", () => {
  it("creates only a task-scoped native validation request", () => {
    const request = buildAutomationValidateInput({
      threadId: ThreadId.make("task-13"),
      profilePath: " WORKFLOW.md ",
      issueIdentifier: " DOGFOOD-13 ",
      issueTitle: "Exercise Automation",
      issueState: " Todo ",
      issueLabels: " automation, dogfood ",
      attempt: "2",
    });

    expect(request).toEqual({
      threadId: "task-13",
      profilePath: "WORKFLOW.md",
      fixtureIssue: {
        id: "DOGFOOD-13",
        identifier: "DOGFOOD-13",
        title: "Exercise Automation",
        state: "Todo",
        labels: ["automation", "dogfood"],
        blockedBy: [],
      },
      attempt: 2,
    });
    expect(request).not.toHaveProperty("repositoryRoot");
    expect(request).not.toHaveProperty("approvalPolicy");
    expect(request).not.toHaveProperty("sandboxPolicy");
  });

  it("bounds malformed attempts to the first attempt", () => {
    const request = buildAutomationValidateInput({
      threadId: ThreadId.make("task-13"),
      profilePath: "WORKFLOW.md",
      issueIdentifier: "DOGFOOD-13",
      issueTitle: "Exercise Automation",
      issueState: "Todo",
      issueLabels: "automation",
      attempt: "-4",
    });

    expect(request.attempt).toBe(1);
  });
});

describe("automationRunRows", () => {
  it("carries the native fixture claim and stable task link into the bounded desktop model", () => {
    const rows = automationRunRows({
      run: {
        schemaVersion: 1,
        runId: "automation-root-1",
        ownerThreadId: "task-33",
        sourceRevision: "abc123",
        profileDigest: "profile-digest",
        profileRevision: 2,
        profileRevisionStatus: "active",
        profileDiagnostics: [],
        trackerProjectSlug: "orchestra",
        leaseEpoch: 1,
        revision: 4,
        status: "running",
        reconciliation: "complete",
        coordination: {
          cycle: 3,
          scanRevision: 7,
          inputCursor: "cursor-2",
          outputCursor: "cursor-3",
          intakeStatus: "ready",
          pageDigest: "page-digest",
          startedAtMs: 40,
          completedAtMs: 41,
          nextAction: { text: "Dispatch the selected issue", truncated: false },
          dispatchIntent: {
            intentId: "intent-33",
            claimId: "claim-1",
            issueId: "issue-33",
            kind: "new_claim",
            status: "completed",
            attempt: 1,
            profileDigest: "claim-profile-digest",
            createdAtMs: 40,
            readyAtMs: 41,
          },
        },
        queueCounts: {
          queued: 0,
          running: 0,
          blocked: 0,
          waitingGate: 0,
          handoff: 0,
          terminal: 1,
        },
        claimsTotal: 1,
        queuePreview: [],
        queuePreviewTruncated: false,
        nextAction: { text: "Automation remains resident", truncated: false },
        claims: [
          {
            claimId: "claim-1",
            issueId: "issue-33",
            issueIdentifier: "ORC-33",
            issueTitle: { text: "Run one fixture issue", truncated: false },
            trackerState: "Todo",
            priority: 2,
            attempt: 1,
            workflowInvocations: 2,
            turnsInWindow: 4,
            continuationCount: 1,
            retryAttempt: 0,
            lastProgressAtMs: 41,
            profileDigest: "claim-profile-digest",
            profileRevision: 1,
            status: "completed",
            worktree: "/repo/.worktrees/orc-33-a1",
            sourceRevision: "abc123",
            issueTask: { threadId: "issue-task-33", taskPath: "/root/automation_orc_33" },
            workflowRunId: "workflow-run-33",
            workflowStatus: "completed",
            latestSteeringReceipt: {
              sequence: 2,
              submittedAtMs: 42,
              initiatorThreadId: "task-33",
              targetThreadId: "issue-task-33",
              authority: "automation-claim-native-send-input-v1",
              inputSha256: "input-sha",
              inputPreview: "Focus on recovery.",
              status: "delivered",
              providerReceipt: "submission-2",
            },
            effects: [
              {
                effectId: "effect-34",
                idempotencyKey: "idem-34",
                kind: "tracker.comment",
                status: "committed",
                gatePolicy: "auto_accept",
                requestSha256: "request-sha",
                bodyPreview: { text: "Implemented and verified.", truncated: false },
                providerReceipt: "fixture-comment:idem-34",
              },
              {
                effectId: "effect-transition-41",
                idempotencyKey: "idem-transition-41",
                kind: "tracker.transition",
                status: "committed",
                gatePolicy: "auto_accept",
                requestSha256: "transition-sha",
                bodyPreview: { text: "Done", truncated: false },
                providerReceipt: "fixture-transition:idem-transition-41",
              },
              {
                effectId: "effect-pr-41",
                idempotencyKey: "idem-pr-41",
                kind: "tracker.link_pull_request",
                status: "committed",
                gatePolicy: "auto_accept",
                requestSha256: "pull-request-sha",
                bodyPreview: {
                  text: "https://github.com/edgefloor/codex-orchestra/pull/43",
                  truncated: false,
                },
                providerReceipt: "fixture-pull-request:idem-pr-41",
              },
            ],
            hookReceipts: [
              {
                kind: "before_run",
                invocation: 1,
                commandSha256: "hook-sha",
                status: "succeeded",
                exitCode: 0,
                stdoutPreview: { text: "ready", truncated: false },
                stderrPreview: { text: "", truncated: false },
              },
            ],
            cleanup: { status: "retained", attempts: 0 },
            nextAction: { text: "claim complete", truncated: false },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        claimId: "claim-1",
        issueId: "issue-33",
        issueIdentifier: "ORC-33",
        issueTitle: { text: "Run one fixture issue", truncated: false },
        trackerState: "Todo",
        priority: 2,
        attempt: 1,
        workflowInvocations: 2,
        turnsInWindow: 4,
        continuationCount: 1,
        retryAttempt: 0,
        lastProgressAtMs: 41,
        status: "completed",
        profileDigest: "claim-profile-digest",
        profileRevision: 1,
        sourceRevision: "abc123",
        worktree: "/repo/.worktrees/orc-33-a1",
        issueTask: { threadId: "issue-task-33", taskPath: "/root/automation_orc_33" },
        issueTaskThreadId: "issue-task-33",
        latestSteeringReceipt: {
          sequence: 2,
          submittedAtMs: 42,
          initiatorThreadId: "task-33",
          targetThreadId: "issue-task-33",
          authority: "automation-claim-native-send-input-v1",
          inputSha256: "input-sha",
          inputPreview: "Focus on recovery.",
          status: "delivered",
          providerReceipt: "submission-2",
        },
        workflowRunId: "workflow-run-33",
        workflowStatus: "completed",
        cleanup: { status: "retained", attempts: 0 },
        hookReceipts: [
          {
            kind: "before_run",
            invocation: 1,
            commandSha256: "hook-sha",
            status: "succeeded",
            exitCode: 0,
            stdoutPreview: { text: "ready", truncated: false },
            stderrPreview: { text: "", truncated: false },
          },
        ],
        effects: [
          {
            effectId: "effect-34",
            idempotencyKey: "idem-34",
            kind: "tracker.comment",
            status: "committed",
            gatePolicy: "auto_accept",
            requestSha256: "request-sha",
            bodyPreview: { text: "Implemented and verified.", truncated: false },
            providerReceipt: "fixture-comment:idem-34",
            failure: undefined,
          },
          {
            effectId: "effect-transition-41",
            idempotencyKey: "idem-transition-41",
            kind: "tracker.transition",
            status: "committed",
            gatePolicy: "auto_accept",
            requestSha256: "transition-sha",
            bodyPreview: { text: "Done", truncated: false },
            providerReceipt: "fixture-transition:idem-transition-41",
            failure: undefined,
          },
          {
            effectId: "effect-pr-41",
            idempotencyKey: "idem-pr-41",
            kind: "tracker.link_pull_request",
            status: "committed",
            gatePolicy: "auto_accept",
            requestSha256: "pull-request-sha",
            bodyPreview: {
              text: "https://github.com/edgefloor/codex-orchestra/pull/43",
              truncated: false,
            },
            providerReceipt: "fixture-pull-request:idem-pr-41",
            failure: undefined,
          },
        ],
        nextAction: { text: "claim complete", truncated: false },
      },
    ]);
    expect(rows[0]).toHaveProperty("worktree", "/repo/.worktrees/orc-33-a1");
    expect(rows[0]).not.toHaveProperty("outputs");
  });
});

describe("automationCoordinationSummary", () => {
  it("projects bounded native coordination and dispatch identity without provider detail", () => {
    const result = {
      run: {
        schemaVersion: 1,
        runId: "automation-root-1",
        ownerThreadId: "task-33",
        sourceRevision: "abc123",
        profileDigest: "profile-digest",
        profileRevision: 2,
        profileRevisionStatus: "active" as const,
        profileDiagnostics: [],
        trackerProjectSlug: "orchestra",
        leaseEpoch: 1,
        revision: 4,
        status: "running" as const,
        reconciliation: "complete" as const,
        coordination: {
          cycle: 3,
          scanRevision: 7,
          inputCursor: "cursor-2",
          outputCursor: "cursor-3",
          intakeStatus: "ready" as const,
          pageDigest: "page-digest",
          startedAtMs: 40,
          completedAtMs: 41,
          error: { text: "bounded warning", truncated: true },
          nextAction: { text: "Recover the durable dispatch", truncated: false },
          dispatchIntent: {
            intentId: "intent-33",
            claimId: "claim-1",
            issueId: "issue-33",
            kind: "continuation" as const,
            status: "started" as const,
            attempt: 2,
            profileDigest: "profile-digest",
            createdAtMs: 40,
            readyAtMs: 45,
          },
        },
        queueCounts: {
          queued: 0,
          running: 1,
          blocked: 0,
          waitingGate: 0,
          handoff: 0,
          terminal: 0,
        },
        claimsTotal: 0,
        queuePreview: [],
        queuePreviewTruncated: false,
        claims: [],
        nextAction: { text: "Continue", truncated: false },
      },
    };

    expect(automationCoordinationSummary(result)).toEqual({
      cycle: 3,
      scanRevision: 7,
      intakeStatus: "ready",
      inputCursor: "cursor-2",
      outputCursor: "cursor-3",
      error: { text: "bounded warning", truncated: true },
      nextAction: { text: "Recover the durable dispatch", truncated: false },
      dispatchIntent: {
        intentId: "intent-33",
        kind: "continuation",
        status: "started",
        claimId: "claim-1",
        issueId: "issue-33",
        attempt: 2,
        readyAtMs: 45,
      },
    });
    expect(automationCoordinationSummary(result).dispatchIntent).not.toHaveProperty(
      "profileDigest",
    );
  });
});

describe("automationLinearRows", () => {
  it("projects a bounded normalized summary without provider-specific detail", () => {
    const issues = Array.from({ length: 26 }, (_, index) => ({
      id: `issue-${index}`,
      identifier: `ORC-${index}`,
      title: `Issue ${index}`,
      state: "Todo",
      priority: index % 4 || undefined,
      labels: ["automation"],
      blockedBy: index === 0 ? [{ identifier: "ORC-99" }] : [],
      description: "must not cross the renderer projection",
      url: "https://linear.app/example",
    }));

    const rows = automationLinearRows({
      status: "ready",
      issues,
      hasNextPage: true,
      endCursor: "cursor-25",
      nextAction: { text: "Read the next page", truncated: false },
    });

    expect(rows).toHaveLength(25);
    expect(rows[0]).toEqual({
      id: "issue-0",
      identifier: "ORC-0",
      title: "Issue 0",
      state: "Todo",
      priority: undefined,
      labels: ["automation"],
      blockedByCount: 1,
    });
    expect(rows[0]).not.toHaveProperty("description");
    expect(rows[0]).not.toHaveProperty("url");
  });

  it("keeps missing credentials as an explicit skipped warning", () => {
    expect(
      automationLinearAvailability({
        status: "skipped",
        issues: [],
        hasNextPage: false,
        nextAction: {
          text: "Configure LINEAR_API_KEY to enable live intake.",
          truncated: false,
        },
      }),
    ).toEqual({
      kind: "warning",
      title: "Linear intake skipped",
      detail: {
        text: "Configure LINEAR_API_KEY to enable live intake.",
        truncated: false,
      },
    });
  });
});

describe("Automation workspace lifecycle", () => {
  const running = {
    schemaVersion: 1,
    runId: "automation-root-1",
    ownerThreadId: "task-33",
    sourceRevision: "abc123",
    profileDigest: "profile-digest",
    profileRevision: 1,
    profileRevisionStatus: "active" as const,
    profileDiagnostics: [],
    trackerProjectSlug: "orchestra",
    leaseEpoch: 1,
    revision: 1,
    status: "running" as const,
    reconciliation: "complete" as const,
    coordination: {
      cycle: 0,
      scanRevision: 0,
      intakeStatus: "not_started" as const,
      nextAction: { text: "Start a bounded intake scan", truncated: false },
    },
    queueCounts: {
      queued: 0,
      running: 1,
      blocked: 0,
      waitingGate: 0,
      handoff: 0,
      terminal: 0,
    },
    claimsTotal: 0,
    claims: [],
    queuePreview: [],
    queuePreviewTruncated: false,
    nextAction: { text: "Continue", truncated: false },
  };

  it("derives renderer presentation only from native state and the current request", () => {
    expect(
      deriveAutomationWorkspaceState({
        pendingAction: "validating",
        validation: null,
        run: null,
        error: null,
      }),
    ).toBe("validating");
    expect(
      deriveAutomationWorkspaceState({
        pendingAction: null,
        validation: null,
        run: running,
        error: null,
      }),
    ).toBe("running");
    expect(
      deriveAutomationWorkspaceState({
        pendingAction: null,
        validation: null,
        run: { ...running, reconciliation: "required" },
        error: null,
      }),
    ).toBe("reconciling");
    expect(
      deriveAutomationWorkspaceState({
        pendingAction: null,
        validation: null,
        run: { ...running, status: "suspended" },
        error: null,
      }),
    ).toBe("paused");
    expect(
      deriveAutomationWorkspaceState({
        pendingAction: null,
        validation: null,
        run: null,
        error: "native runtime unavailable",
      }),
    ).toBe("unavailable");
  });

  it("enables only controls supported by the current native run", () => {
    expect(
      automationWorkspaceCapabilities({ pending: false, validation: null, run: running }),
    ).toMatchObject({ pause: true, resume: false, refresh: true, cancel: true, start: false });
    expect(
      automationWorkspaceCapabilities({
        pending: false,
        validation: null,
        run: { ...running, status: "suspended" },
      }),
    ).toMatchObject({ pause: false, resume: true, refresh: true, cancel: true });
    expect(
      automationWorkspaceCapabilities({
        pending: true,
        validation: { valid: true, diagnostics: [] },
        run: null,
      }),
    ).toEqual({
      validate: false,
      start: false,
      inspect: false,
      pause: false,
      resume: false,
      refresh: false,
      cancel: false,
    });
  });

  it("does not enable production start while required native secrets are missing", () => {
    expect(
      automationWorkspaceCapabilities({
        pending: false,
        run: null,
        validation: {
          valid: true,
          profileDigest: "profile-digest",
          diagnostics: [
            {
              path: "secrets.LINEAR_API_KEY",
              code: "missing_secret",
              severity: "warning",
              message: "Secret is not configured",
            },
          ],
        },
      }).start,
    ).toBe(false);
  });
});
