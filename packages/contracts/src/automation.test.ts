import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  AutomationRun,
  AutomationStartInput,
  AutomationStatusInput,
  AutomationSteeringReceipt,
  AutomationSteerIssueInput,
} from "./automation.ts";

const decodeAutomationRun = Schema.decodeUnknownSync(AutomationRun);
const decodeAutomationStartInput = Schema.decodeUnknownSync(AutomationStartInput);
const decodeAutomationStatusInput = Schema.decodeUnknownSync(AutomationStatusInput);
const decodeAutomationSteerIssueInput = Schema.decodeUnknownSync(AutomationSteerIssueInput);
const decodeAutomationSteeringReceipt = Schema.decodeUnknownSync(AutomationSteeringReceipt);

describe("production Automation operations", () => {
  it("accepts only the task and repository-relative profile path when starting", () => {
    expect(
      decodeAutomationStartInput({
        threadId: "task-60",
        profilePath: "WORKFLOW.md",
      }),
    ).toEqual({ threadId: "task-60", profilePath: "WORKFLOW.md" });

    expect(() =>
      decodeAutomationStartInput({
        threadId: "task-60",
        profilePath: "",
      }),
    ).toThrow();
  });

  it("keeps focused issue context exclusive to status inspection", () => {
    expect(
      decodeAutomationStatusInput({
        threadId: "task-60",
        runId: "automation-root-60",
        focusedIssueId: "issue-60",
      }),
    ).toEqual({
      threadId: "task-60",
      runId: "automation-root-60",
      focusedIssueId: "issue-60",
    });
    expect(
      decodeAutomationStatusInput({
        threadId: "task-60",
        runId: "automation-root-60",
        focusedIssueId: null,
      }),
    ).toEqual({ threadId: "task-60", runId: "automation-root-60", focusedIssueId: null });
    expect(() =>
      decodeAutomationStatusInput({
        threadId: "task-60",
        runId: "automation-root-60",
        focusedIssueId: " ",
      }),
    ).toThrow();
  });

  it("requires a bounded claim target and non-empty steering instruction", () => {
    expect(
      decodeAutomationSteerIssueInput({
        threadId: "task-60",
        runId: "automation-root-60",
        claimId: "claim-60",
        input: "Re-run the focused provider tests.",
      }),
    ).toEqual({
      threadId: "task-60",
      runId: "automation-root-60",
      claimId: "claim-60",
      input: "Re-run the focused provider tests.",
    });

    expect(() =>
      decodeAutomationSteerIssueInput({
        threadId: "task-60",
        runId: "automation-root-60",
        claimId: "claim-60",
        input: " ",
      }),
    ).toThrow();
  });

  it("decodes the durable native steering receipt used for reload", () => {
    expect(
      decodeAutomationSteeringReceipt({
        sequence: 2,
        submittedAtMs: 1_768_435_260_000,
        initiatorThreadId: "task-60",
        targetThreadId: "child-60",
        authority: "automation-claim",
        inputSha256: "a".repeat(64),
        inputPreview: "Re-run focused tests.",
        status: "delivered",
        providerReceipt: "turn-60",
      }),
    ).toMatchObject({
      sequence: 2,
      status: "delivered",
      targetThreadId: "child-60",
      providerReceipt: "turn-60",
    });
  });

  it("preserves coordination intent and claim progress counters on reload", () => {
    const run = {
      schemaVersion: 1,
      runId: "automation-root-60",
      ownerThreadId: "task-60",
      sourceRevision: "abc123",
      profileDigest: "profile-60",
      profileRevision: 2,
      profileRevisionStatus: "active",
      profileDiagnostics: [],
      trackerProjectSlug: "orchestra",
      leaseEpoch: 1,
      revision: 8,
      status: "running",
      reconciliation: "complete",
      coordination: {
        cycle: 3,
        scanRevision: 7,
        inputCursor: "cursor-6",
        outputCursor: "cursor-7",
        intakeStatus: "ready",
        pageDigest: "page-7",
        startedAtMs: 1_768_435_260_000,
        completedAtMs: 1_768_435_260_100,
        nextAction: { text: "Dispatch the retained intent.", truncated: false },
        dispatchIntent: {
          intentId: "intent-60",
          claimId: "claim-60",
          issueId: "issue-60",
          kind: "continuation",
          status: "started",
          attempt: 2,
          profileDigest: "profile-60",
          createdAtMs: 1_768_435_260_050,
          readyAtMs: 1_768_435_260_075,
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
      claims: [
        {
          claimId: "claim-60",
          issueId: "issue-60",
          issueIdentifier: "ORC-60",
          issueTitle: { text: "Recover retained work", truncated: false },
          issueUrl: "https://linear.app/orchestra/issue/ORC-60",
          trackerState: "In Progress",
          attempt: 2,
          workflowInvocations: 4,
          turnsInWindow: 8,
          continuationCount: 3,
          retryAttempt: 1,
          scheduledRetry: {
            kind: "continuation",
            readyAtMs: 1_768_435_260_500,
            resetTurnWindow: true,
          },
          lastProgressAtMs: 1_768_435_260_090,
          profileDigest: "profile-60",
          profileRevision: 2,
          status: "running",
          worktree: "/tmp/orchestra-60",
          sourceRevision: "abc123",
          effects: [],
          hookReceipts: [],
          cleanup: { status: "retained", attempts: 0 },
          nextAction: { text: "Resume the workflow run.", truncated: false },
        },
      ],
      queuePreview: [
        {
          issueId: "issue-61",
          issueIdentifier: "ORC-61",
          issueTitle: { text: "Wait for dependency", truncated: false },
          state: "Blocked",
          category: "blocked",
          nextAction: { text: "Wait for ORC-59.", truncated: false },
          blockedBy: [
            {
              id: { text: "issue-59", truncated: false },
              identifier: { text: "ORC-59", truncated: false },
              state: { text: "In Progress", truncated: false },
            },
          ],
        },
      ],
      queuePreviewTruncated: false,
      nextAction: { text: "Continue coordination.", truncated: false },
    } as const;

    expect(decodeAutomationRun(run)).toMatchObject({
      coordination: {
        cycle: 3,
        scanRevision: 7,
        intakeStatus: "ready",
        dispatchIntent: {
          intentId: "intent-60",
          kind: "continuation",
          status: "started",
          attempt: 2,
        },
      },
      claims: [
        {
          workflowInvocations: 4,
          turnsInWindow: 8,
          continuationCount: 3,
          retryAttempt: 1,
          scheduledRetry: {
            kind: "continuation",
            readyAtMs: 1_768_435_260_500,
            resetTurnWindow: true,
          },
          lastProgressAtMs: 1_768_435_260_090,
          issueUrl: "https://linear.app/orchestra/issue/ORC-60",
        },
      ],
      queuePreview: [
        {
          issueIdentifier: "ORC-61",
          blockedBy: [
            {
              identifier: { text: "ORC-59", truncated: false },
              state: { text: "In Progress", truncated: false },
            },
          ],
        },
      ],
    });

    const [{ issueUrl: _legacyIssueUrl, ...legacyClaim }] = run.claims;
    expect(
      decodeAutomationRun({
        ...run,
        claims: [legacyClaim],
      }).claims[0]?.issueUrl,
    ).toBeNull();

    expect(
      decodeAutomationRun({
        ...run,
        claims: [{ ...run.claims[0], issueUrl: null }],
      }).claims[0]?.issueUrl,
    ).toBeNull();

    const { coordination: _, ...withoutCoordination } = run;
    expect(() => decodeAutomationRun(withoutCoordination)).toThrow();
  });
});
