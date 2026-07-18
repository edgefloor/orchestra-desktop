import type { AutomationRunResult } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationRunWorkspace } from "./AutomationRunWorkspace";

const runResult: AutomationRunResult = {
  run: {
    schemaVersion: 1,
    runId: "automation-root-70",
    ownerThreadId: "task-70",
    sourceRevision: "source-70",
    profileDigest: "profile-70",
    profileRevision: 2,
    profileRevisionStatus: "active",
    profileDiagnostics: [],
    trackerProjectSlug: "orchestra",
    leaseEpoch: 1,
    revision: 7,
    status: "running",
    reconciliation: "complete",
    coordination: {
      cycle: 4,
      scanRevision: 9,
      inputCursor: "cursor-8",
      outputCursor: "cursor-9",
      intakeStatus: "ready",
      pageDigest: "page-9",
      startedAtMs: 100,
      completedAtMs: 101,
      nextAction: { text: "Scan again", truncated: false },
      dispatchIntent: {
        intentId: "intent-70",
        claimId: "claim-70",
        issueId: "issue-70",
        kind: "new_claim",
        status: "completed",
        attempt: 1,
        profileDigest: "profile-70",
        createdAtMs: 99,
        readyAtMs: 100,
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
    claimsTotal: 1,
    queuePreview: [],
    queuePreviewTruncated: false,
    claims: [
      {
        claimId: "claim-70",
        issueId: "issue-70",
        issueIdentifier: "ORC-70",
        issueTitle: { text: "Deliver the Symphony workspace", truncated: false },
        trackerState: "In Progress",
        priority: 1,
        attempt: 2,
        workflowInvocations: 3,
        turnsInWindow: 5,
        continuationCount: 1,
        retryAttempt: 0,
        lastProgressAtMs: 102,
        profileDigest: "profile-70",
        profileRevision: 2,
        status: "running",
        worktree: "/repo/.worktrees/orc-70",
        sourceRevision: "source-70",
        issueTask: { threadId: "issue-task-70", taskPath: "/root/automation_orc_70" },
        workflowRunId: "workflow-70",
        workflowStatus: "running",
        latestSteeringReceipt: {
          sequence: 1,
          submittedAtMs: 103,
          initiatorThreadId: "task-70",
          targetThreadId: "issue-task-70",
          authority: "automation-claim-native-send-input-v1",
          inputSha256: "steer-70",
          inputPreview: "Keep the UI bounded.",
          status: "delivered",
        },
        effects: [
          {
            effectId: "effect-70",
            idempotencyKey: "idem-70",
            kind: "tracker.comment",
            status: "committed",
            gatePolicy: "auto_accept",
            requestSha256: "request-70",
            bodyPreview: { text: "Verified", truncated: false },
          },
        ],
        hookReceipts: [],
        cleanup: { status: "retained", attempts: 0 },
        nextAction: { text: "Continue the issue task", truncated: false },
      },
    ],
    nextAction: { text: "Automation remains resident", truncated: false },
  },
};

function render(
  initialView: "issues" | "activity" | "events",
  options: {
    readonly result?: AutomationRunResult;
    readonly pending?: boolean;
    readonly queueOffset?: number;
    readonly queueResult?: Parameters<typeof AutomationRunWorkspace>[0]["queueResult"];
  } = {},
) {
  return renderToStaticMarkup(
    <AutomationRunWorkspace
      initialView={initialView}
      onCancelClaim={vi.fn()}
      onInspectQueue={vi.fn()}
      onOpenIssueTask={vi.fn()}
      onSteerClaim={vi.fn()}
      onSteeringInputChange={vi.fn()}
      pending={options.pending ?? false}
      queueResult={options.queueResult ?? null}
      queueOffset={options.queueOffset ?? 0}
      runResult={options.result ?? runResult}
      steeringInputs={{}}
    />,
  );
}

describe("AutomationRunWorkspace", () => {
  it("renders an accessible Issues master/detail view by default", () => {
    const markup = render("issues");

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Symphony views"');
    expect(markup).toContain('id="automation-view-tab-issues"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-label="Symphony issues"');
    expect(markup).toContain('aria-controls="automation-issue-inspector"');
    expect(markup).toContain('aria-label="ORC-70 inspector"');
    expect(markup).toContain("Open issue task");
    expect(markup).toContain("Send guidance");
    expect(markup).toContain("Cancel issue");
  });

  it("renders human-readable Activity without mirroring child task history", () => {
    const markup = render("activity");

    expect(markup).toContain('aria-label="Automation activity"');
    expect(markup).toContain("Guidance delivered for ORC-70");
    expect(markup).toContain("Root Run is running");
    expect(markup).not.toContain("Exact record");
  });

  it("renders grouped exact Events and explains missing chronology", () => {
    const markup = render("events");

    expect(markup).toContain('aria-label="Automation events"');
    expect(markup).toContain("Groups without native timestamps");
    expect(markup).toContain("Coordination (1)");
    expect(markup).toContain("Effects (1)");
    expect(markup).toContain("Exact record");
  });

  it("keeps coordination failures visible and announced outside raw Events", () => {
    const result: AutomationRunResult = {
      run: {
        ...runResult.run,
        coordination: {
          ...runResult.run.coordination,
          intakeStatus: "skipped",
          error: { text: "Linear intake failed", truncated: false },
        },
      },
    };
    const markup = render("issues", { result });

    expect(markup).toContain('aria-label="Automation coordination"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Linear intake failed");
    expect(markup).toContain("Dispatch intent");
  });

  it("makes bounded queue paging reversible and disables issue actions while pending", () => {
    const markup = render("issues", {
      pending: true,
      queueOffset: 25,
      queueResult: {
        category: "running",
        total: 50,
        items: [],
        nextOffset: 50,
      },
    });

    expect(markup).toContain("First running page");
    expect(markup).toContain("Next running page");
    expect(markup).toContain("running queue page empty at offset 25 of 50");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Cancel issue<\/button>/);
  });
});
