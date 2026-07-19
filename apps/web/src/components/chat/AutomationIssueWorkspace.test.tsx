import { ThreadId, type AutomationRunResult } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationIssueWorkspacePresentation } from "./AutomationIssueWorkspace";
import {
  beginAutomationIssueRequest,
  deriveAutomationIssueWorkspaceRuntimeState,
  exactAutomationStatusInput,
  isCurrentAutomationIssueRequest,
  safeAutomationIssueUrl,
  selectExactAutomationIssueSnapshot,
  type AutomationIssueWorkspaceLocator,
} from "./AutomationIssueWorkspace.logic";

const locator: AutomationIssueWorkspaceLocator = {
  ownerThreadId: ThreadId.make("symphony-task-42"),
  automationRunId: "automation-42",
  issueId: "linear-issue-42",
  issueTaskThreadId: ThreadId.make("issue-task-42"),
};

const runResult: AutomationRunResult = {
  run: {
    schemaVersion: 1,
    runId: "automation-42",
    ownerThreadId: "symphony-task-42",
    sourceRevision: "source-42",
    profileDigest: "profile-42",
    profileRevision: 1,
    profileRevisionStatus: "active",
    profileDiagnostics: [],
    trackerProjectSlug: "orchestra",
    leaseEpoch: 3,
    revision: 8,
    status: "running",
    reconciliation: "complete",
    coordination: {
      cycle: 2,
      scanRevision: 4,
      intakeStatus: "ready",
      nextAction: { text: "Continue", truncated: false },
    },
    queueCounts: {
      queued: 0,
      running: 1,
      blocked: 0,
      waitingGate: 0,
      handoff: 0,
      terminal: 0,
    },
    claimsTotal: 2,
    claims: [
      {
        claimId: "decoy-claim",
        issueId: "linear-issue-42",
        issueIdentifier: "LIN-42",
        issueTitle: { text: "Wrong task", truncated: false },
        issueUrl: "https://linear.app/acme/issue/LIN-42/wrong",
        trackerState: "In Progress",
        attempt: 9,
        workflowInvocations: 1,
        turnsInWindow: 1,
        continuationCount: 0,
        retryAttempt: 0,
        profileDigest: "profile-42",
        profileRevision: 1,
        status: "running",
        worktree: "/repo/wrong",
        sourceRevision: "source-42",
        issueTask: { threadId: "wrong-task", taskPath: "/root/wrong" },
        effects: [],
        hookReceipts: [],
        cleanup: { status: "retained", attempts: 0 },
        nextAction: { text: "Wrong", truncated: false },
      },
      {
        claimId: "claim-42",
        issueId: "linear-issue-42",
        issueIdentifier: "LIN-42",
        issueTitle: { text: "Complete selected issue context", truncated: false },
        issueUrl: "https://linear.app/acme/issue/LIN-42/selected-context?view=full%2Fexact",
        trackerState: "In Progress",
        priority: 1,
        attempt: 2,
        workflowInvocations: 3,
        turnsInWindow: 4,
        continuationCount: 0,
        retryAttempt: 0,
        lastProgressAtMs: 100,
        profileDigest: "profile-42",
        profileRevision: 1,
        status: "running",
        worktree: "/repo/.worktrees/lin-42",
        sourceRevision: "source-42",
        issueTask: { threadId: "issue-task-42", taskPath: "/root/lin_42" },
        workflowRunId: "workflow-42",
        workflowStatus: "running",
        latestSteeringReceipt: {
          sequence: 2,
          submittedAtMs: 101,
          initiatorThreadId: "symphony-task-42",
          targetThreadId: "issue-task-42",
          authority: "automation-claim-native-send-input-v1",
          inputSha256: "guidance-42",
          inputPreview: "Keep the exact claim visible.",
          status: "delivered",
        },
        effects: [
          {
            effectId: "effect-42",
            idempotencyKey: "idem-42",
            kind: "tracker.comment",
            status: "waiting_gate",
            gatePolicy: "ask_human",
            requestSha256: "request-42",
            bodyPreview: { text: "Post verified evidence", truncated: false },
          },
        ],
        hookReceipts: [],
        cleanup: { status: "retained", attempts: 0 },
        nextAction: { text: "Continue", truncated: false },
      },
    ],
    queuePreview: [],
    queuePreviewTruncated: false,
    nextAction: { text: "Continue", truncated: false },
  },
};

describe("AutomationIssueWorkspace exact native context", () => {
  it("requests focused native status and selects only the exact issue-task claim", () => {
    expect(exactAutomationStatusInput(locator)).toEqual({
      threadId: "symphony-task-42",
      runId: "automation-42",
      focusedIssueId: "linear-issue-42",
    });
    expect(selectExactAutomationIssueSnapshot(runResult, locator)?.issue.claim?.claimId).toBe(
      "claim-42",
    );
    expect(
      selectExactAutomationIssueSnapshot(runResult, {
        ...locator,
        issueTaskThreadId: ThreadId.make("missing-task"),
      }),
    ).toBeNull();
    expect(
      selectExactAutomationIssueSnapshot(runResult, {
        ...locator,
        automationRunId: "different-run",
      }),
    ).toBeNull();
    expect(
      selectExactAutomationIssueSnapshot(runResult, {
        ...locator,
        ownerThreadId: ThreadId.make("different-owner"),
      }),
    ).toBeNull();
  });

  it("represents loading, ready, stale, error, and temporary unavailability", () => {
    expect(
      deriveAutomationIssueWorkspaceRuntimeState({
        availability: "available",
        loading: true,
        hasSnapshot: false,
        error: null,
      }),
    ).toBe("loading");
    expect(
      deriveAutomationIssueWorkspaceRuntimeState({
        availability: "available",
        loading: false,
        hasSnapshot: true,
        error: null,
      }),
    ).toBe("ready");
    expect(
      deriveAutomationIssueWorkspaceRuntimeState({
        availability: "available",
        loading: false,
        hasSnapshot: true,
        error: "offline",
      }),
    ).toBe("stale");
    expect(
      deriveAutomationIssueWorkspaceRuntimeState({
        availability: "available",
        loading: false,
        hasSnapshot: false,
        error: "offline",
      }),
    ).toBe("error");
    expect(
      deriveAutomationIssueWorkspaceRuntimeState({
        availability: "temporarilyUnavailable",
        loading: false,
        hasSnapshot: true,
        error: "offline",
      }),
    ).toBe("temporarilyUnavailable");
  });

  it("keeps status and steering request generations independent", () => {
    const status = { current: 0 };
    const steering = { current: 0 };
    const firstStatus = beginAutomationIssueRequest(status);
    const activeSteering = beginAutomationIssueRequest(steering);
    const activeStatus = beginAutomationIssueRequest(status);

    expect(isCurrentAutomationIssueRequest(status, firstStatus)).toBe(false);
    expect(isCurrentAutomationIssueRequest(status, activeStatus)).toBe(true);
    expect(isCurrentAutomationIssueRequest(steering, activeSteering)).toBe(true);
  });

  it("accepts only safe HTTP(S) tracker URLs without rewriting provider text", () => {
    const exact = "HTTPS://linear.app/acme/issue/LIN-42?next=%2Fexact";
    expect(safeAutomationIssueUrl(`  ${exact}  `)).toBe(exact);
    expect(safeAutomationIssueUrl("javascript:alert(1)")).toBeNull();
    expect(safeAutomationIssueUrl("file:///tmp/issue")).toBeNull();
    expect(safeAutomationIssueUrl("https://user:secret@linear.app/issue/LIN-42")).toBeNull();
    expect(safeAutomationIssueUrl("/relative/issue/LIN-42")).toBeNull();
  });
});

describe("AutomationIssueWorkspacePresentation", () => {
  it("renders exact issue context, durable receipts, steering, and bounded scroll without fabricated decisions", () => {
    const snapshot = selectExactAutomationIssueSnapshot(runResult, locator)!;
    const markup = renderToStaticMarkup(
      <AutomationIssueWorkspacePresentation
        error={null}
        fallbackIdentifier="Issue linear-issue-42"
        fallbackTitle={undefined}
        guidance="Continue carefully"
        onGuidanceChange={vi.fn()}
        onOpenDiff={vi.fn()}
        onOpenSymphony={vi.fn()}
        onOpenTracker={vi.fn()}
        onRefresh={vi.fn()}
        onSendGuidance={vi.fn()}
        pending={false}
        runtimeState="ready"
        snapshot={snapshot}
      />,
    );

    expect(markup).toContain('aria-label="LIN-42 issue workspace"');
    expect(markup).toContain('data-automation-issue-workspace="ready"');
    expect(markup).toContain("execution running");
    expect(markup).toContain("claim running");
    expect(markup).toContain("tracker In Progress");
    expect(markup).toContain("Attempt");
    expect(markup).toContain("claim-42");
    expect(markup).toContain("/repo/.worktrees/lin-42");
    expect(markup).toContain("workflow-42");
    expect(markup).toContain("Parent: Symphony");
    expect(markup).toContain("Open Symphony");
    expect(markup).toContain("Diff");
    expect(markup).toContain("Open in Linear");
    expect(markup).toContain("Proposed effects");
    expect(markup).toContain("Post verified evidence");
    expect(markup).toContain("Keep the exact claim visible.");
    expect(markup).toContain("Send guidance");
    expect(markup).toContain("max-h-[45vh]");
    expect(markup).toContain("overflow-x-hidden");
    expect(markup).toContain("flex-col");
    expect(markup).toContain("sm:flex-row");
    expect(markup).not.toMatch(/>Approve<|>Reject</);
  });

  it("does not offer tracker navigation for an unsafe retained URL", () => {
    const unsafeResult: AutomationRunResult = {
      run: {
        ...runResult.run,
        claims: runResult.run.claims.map((claim) =>
          claim.claimId === "claim-42" ? { ...claim, issueUrl: "javascript:alert(1)" } : claim,
        ),
      },
    };
    const snapshot = selectExactAutomationIssueSnapshot(unsafeResult, locator)!;
    const markup = renderToStaticMarkup(
      <AutomationIssueWorkspacePresentation
        error={null}
        fallbackIdentifier="LIN-42"
        fallbackTitle={undefined}
        guidance=""
        onGuidanceChange={vi.fn()}
        onOpenDiff={vi.fn()}
        onOpenSymphony={vi.fn()}
        onOpenTracker={vi.fn()}
        onRefresh={vi.fn()}
        onSendGuidance={vi.fn()}
        pending={false}
        runtimeState="ready"
        snapshot={snapshot}
      />,
    );

    expect(markup).not.toContain("Open in Linear");
  });
});
