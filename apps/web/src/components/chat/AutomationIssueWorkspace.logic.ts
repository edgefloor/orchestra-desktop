import type { AutomationIssueClaim, AutomationRunResult, ThreadId } from "@t3tools/contracts";

import {
  projectAutomationWorkspace,
  type AutomationWorkspaceIssue,
} from "./AutomationWorkspace.logic";

export type AutomationIssueWorkspaceRuntimeState =
  | "loading"
  | "ready"
  | "stale"
  | "error"
  | "temporarilyUnavailable";

export interface AutomationIssueWorkspaceLocator {
  /** T3 host-task identity used only to route provider RPCs. */
  readonly routeThreadId: ThreadId;
  /** Provider-native Automation Root owner identity used to validate returned data. */
  readonly automationOwnerThreadId: string;
  readonly automationRunId: string;
  readonly issueId: string;
  /** Provider-native child identity; never a T3 host-task route identity. */
  readonly issueTaskThreadId: string;
}

export interface AutomationIssueWorkspaceSnapshot {
  readonly runResult: AutomationRunResult;
  readonly issue: AutomationWorkspaceIssue;
}

export interface AutomationIssueRequestSequence {
  current: number;
}

export function beginAutomationIssueRequest(sequence: AutomationIssueRequestSequence): number {
  sequence.current += 1;
  return sequence.current;
}

export function isCurrentAutomationIssueRequest(
  sequence: AutomationIssueRequestSequence,
  requestId: number,
): boolean {
  return sequence.current === requestId;
}

export function selectExactAutomationIssueSnapshot(
  runResult: AutomationRunResult,
  locator: AutomationIssueWorkspaceLocator,
): AutomationIssueWorkspaceSnapshot | null {
  if (
    runResult.run.runId !== locator.automationRunId ||
    runResult.run.ownerThreadId !== locator.automationOwnerThreadId
  ) {
    return null;
  }

  const claim = runResult.run.claims.find(
    (candidate) =>
      candidate.issueId === locator.issueId &&
      candidate.issueTask?.threadId === locator.issueTaskThreadId,
  );
  if (!claim) return null;
  const focusedResult: AutomationRunResult = {
    run: {
      ...runResult.run,
      claims: [claim],
      claimsTotal: 1,
      queuePreview: runResult.run.queuePreview.filter(
        (candidate) => candidate.issueId === locator.issueId,
      ),
      queuePreviewTruncated: false,
    },
  };
  const issue = projectAutomationWorkspace(focusedResult).issues.find(
    (candidate) => candidate.issueId === locator.issueId,
  );
  return issue ? { runResult, issue } : null;
}

export function deriveAutomationIssueWorkspaceRuntimeState(input: {
  readonly availability: "available" | "temporarilyUnavailable";
  readonly loading: boolean;
  readonly hasSnapshot: boolean;
  readonly error: string | null;
}): AutomationIssueWorkspaceRuntimeState {
  if (input.availability === "temporarilyUnavailable") return "temporarilyUnavailable";
  if (input.loading && !input.hasSnapshot) return "loading";
  if (input.error) return input.hasSnapshot ? "stale" : "error";
  return input.hasSnapshot ? "ready" : "loading";
}

export function safeAutomationIssueUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function automationIssueClaimUrl(claim: AutomationIssueClaim | undefined): string | null {
  return safeAutomationIssueUrl(claim?.issueUrl);
}

export function exactAutomationStatusInput(locator: AutomationIssueWorkspaceLocator) {
  return {
    threadId: locator.routeThreadId,
    runId: locator.automationRunId,
    focusedIssueId: locator.issueId,
  };
}
