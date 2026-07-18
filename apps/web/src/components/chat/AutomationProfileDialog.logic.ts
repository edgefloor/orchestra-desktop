import type {
  AutomationLinearReadResult,
  AutomationRun,
  AutomationRunResult,
  AutomationStartInput,
  AutomationValidateResult,
  AutomationValidateInput,
  ThreadId,
} from "@t3tools/contracts";

export type AutomationWorkspacePendingAction =
  | "validating"
  | "starting"
  | "inspecting"
  | "pausing"
  | "reconciling"
  | "cancelling"
  | "steering";

export type AutomationWorkspaceState =
  | "idle"
  | "validating"
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "reconciling"
  | "completed"
  | "failed"
  | "cancelled"
  | "unavailable";

export type AutomationRunAction =
  | "Start"
  | "Inspect"
  | "Pause"
  | "Refresh"
  | "Resume"
  | "Cancel run"
  | "Cancel issue"
  | "Steer issue";

export type AutomationRunActionFeedback = {
  readonly kind: "accepted" | "stale";
  readonly action: AutomationRunAction;
  readonly detail: string;
};

const MAX_AUTOMATION_ACTION_FEEDBACK_BYTES = 512;

export function boundedAutomationFeedbackText(value: string): string {
  const normalized = value.trim();
  const encoder = new TextEncoder();
  if (encoder.encode(normalized).byteLength <= MAX_AUTOMATION_ACTION_FEEDBACK_BYTES) {
    return normalized;
  }
  const characters = Array.from(normalized).slice(0, MAX_AUTOMATION_ACTION_FEEDBACK_BYTES);
  while (
    characters.length > 0 &&
    encoder.encode(`${characters.join("")}…`).byteLength > MAX_AUTOMATION_ACTION_FEEDBACK_BYTES
  ) {
    characters.pop();
  }
  return `${characters.join("")}…`;
}

export function acceptedAutomationRunAction(
  action: AutomationRunAction,
  run: AutomationRun,
): AutomationRunActionFeedback {
  return {
    kind: "accepted",
    action,
    detail: boundedAutomationFeedbackText(
      `${action} accepted native Run revision ${run.revision} under lease ${run.leaseEpoch}.`,
    ),
  };
}

export function staleAutomationRunAction(
  action: AutomationRunAction,
  message: string,
  run: AutomationRun | null,
): AutomationRunActionFeedback | null {
  if (!run) return null;
  return {
    kind: "stale",
    action,
    detail: boundedAutomationFeedbackText(
      `${action} failed: ${message} Retained Run revision ${run.revision} may be stale.`,
    ),
  };
}

export function automationRunStorageKey(threadId: ThreadId): string {
  return `t3code:automation-run:${threadId}`;
}

export function deriveAutomationWorkspaceState(input: {
  readonly pendingAction: AutomationWorkspacePendingAction | null;
  readonly validation: AutomationValidateResult | null;
  readonly run: AutomationRun | null;
  readonly error: string | null;
}): AutomationWorkspaceState {
  if (input.error && input.run === null) return "unavailable";
  if (input.pendingAction === "validating") return "validating";
  if (input.pendingAction === "starting") return "queued";
  if (input.pendingAction === "reconciling") return "reconciling";
  const run = input.run;
  if (!run) return "idle";
  if (run.status === "suspended") return "paused";
  if (run.status === "failed") return "failed";
  if (run.status === "cancelled") return "cancelled";
  if (run.reconciliation === "in_progress" || run.reconciliation === "required") {
    return "reconciling";
  }
  if (run.reconciliation === "blocked" || run.queueCounts.waitingGate > 0) return "waiting";
  if (run.queueCounts.running > 0) return "running";
  if (run.queueCounts.queued > 0) return "queued";
  if (run.claims.length > 0 && run.claims.every((claim) => claim.status === "completed")) {
    return "completed";
  }
  return "idle";
}

export function automationWorkspaceCapabilities(input: {
  readonly pending: boolean;
  readonly validation: AutomationValidateResult | null;
  readonly run: AutomationRun | null;
}) {
  const terminal = input.run?.status === "cancelled" || input.run?.status === "failed";
  const missingRequiredSecret = input.validation?.diagnostics.some(
    (diagnostic) => diagnostic.code === "missing_secret",
  );
  return {
    validate: !input.pending,
    start:
      !input.pending &&
      input.validation?.valid === true &&
      !missingRequiredSecret &&
      input.run === null,
    inspect: !input.pending && input.run !== null,
    pause: !input.pending && input.run?.status === "running",
    resume: !input.pending && input.run?.status === "suspended",
    refresh: !input.pending && input.run !== null && !terminal,
    cancel: !input.pending && input.run !== null && !terminal,
  };
}

export function buildAutomationValidateInput(input: {
  readonly threadId: ThreadId;
  readonly profilePath: string;
  readonly issueIdentifier: string;
  readonly issueTitle: string;
  readonly issueState: string;
  readonly issueLabels: string;
  readonly attempt: string;
}): AutomationValidateInput {
  const identifier = input.issueIdentifier.trim();
  return {
    threadId: input.threadId,
    profilePath: input.profilePath.trim(),
    fixtureIssue: {
      id: identifier,
      identifier,
      title: input.issueTitle,
      state: input.issueState.trim(),
      labels: input.issueLabels
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
      blockedBy: [],
    },
    attempt: Math.max(1, Number.parseInt(input.attempt, 10) || 1),
  };
}

export function buildAutomationStartInput(input: {
  readonly threadId: ThreadId;
  readonly profilePath: string;
}): AutomationStartInput {
  return {
    threadId: input.threadId,
    profilePath: input.profilePath.trim(),
  };
}

export function automationRunRows(result: AutomationRunResult) {
  return result.run.claims.map((claim) => ({
    claimId: claim.claimId,
    issueId: claim.issueId,
    issueIdentifier: claim.issueIdentifier,
    issueTitle: claim.issueTitle,
    trackerState: claim.trackerState,
    priority: claim.priority,
    attempt: claim.attempt,
    workflowInvocations: claim.workflowInvocations,
    turnsInWindow: claim.turnsInWindow,
    continuationCount: claim.continuationCount,
    retryAttempt: claim.retryAttempt,
    lastProgressAtMs: claim.lastProgressAtMs,
    status: claim.status,
    profileDigest: claim.profileDigest,
    profileRevision: claim.profileRevision,
    sourceRevision: claim.sourceRevision,
    worktree: claim.worktree,
    issueTask: claim.issueTask,
    issueTaskThreadId: claim.issueTask?.threadId,
    latestSteeringReceipt: claim.latestSteeringReceipt,
    workflowRunId: claim.workflowRunId,
    workflowStatus: claim.workflowStatus,
    cleanup: claim.cleanup,
    hookReceipts: claim.hookReceipts,
    effects: claim.effects.map((effect) => ({
      effectId: effect.effectId,
      idempotencyKey: effect.idempotencyKey,
      kind: effect.kind,
      status: effect.status,
      gatePolicy: effect.gatePolicy,
      requestSha256: effect.requestSha256,
      bodyPreview: effect.bodyPreview,
      providerReceipt: effect.providerReceipt,
      failure: effect.failure,
    })),
    nextAction: claim.nextAction,
  }));
}

export function automationCoordinationSummary(result: AutomationRunResult) {
  const coordination = result.run.coordination;
  const dispatchIntent = coordination.dispatchIntent;
  return {
    cycle: coordination.cycle,
    scanRevision: coordination.scanRevision,
    intakeStatus: coordination.intakeStatus,
    inputCursor: coordination.inputCursor,
    outputCursor: coordination.outputCursor,
    error: coordination.error,
    nextAction: coordination.nextAction,
    dispatchIntent: dispatchIntent
      ? {
          intentId: dispatchIntent.intentId,
          kind: dispatchIntent.kind,
          status: dispatchIntent.status,
          claimId: dispatchIntent.claimId,
          issueId: dispatchIntent.issueId,
          attempt: dispatchIntent.attempt,
          readyAtMs: dispatchIntent.readyAtMs,
        }
      : undefined,
  };
}

export function automationLinearRows(result: AutomationLinearReadResult) {
  return result.issues.slice(0, 25).map((issue) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state,
    priority: issue.priority,
    labels: issue.labels,
    blockedByCount: issue.blockedBy.length,
  }));
}

export function automationLinearAvailability(result: AutomationLinearReadResult) {
  return result.status === "skipped"
    ? {
        kind: "warning" as const,
        title: "Linear intake skipped",
        detail: result.nextAction,
      }
    : {
        kind: "ready" as const,
        title: "Linear intake ready",
        detail: result.nextAction,
      };
}
