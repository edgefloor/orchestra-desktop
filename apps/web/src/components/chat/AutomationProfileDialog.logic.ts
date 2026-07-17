import type {
  AutomationLinearReadResult,
  AutomationQueueReadResult,
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
    inspect: !input.pending && input.run !== null && !terminal,
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

export function automationQueueItemKey(item: AutomationQueueReadResult["items"][number]): string {
  return `${item.issueId}:${item.claimId ?? item.category}`;
}

export function mergeAutomationQueuePage(
  current: AutomationQueueReadResult | null,
  incoming: AutomationQueueReadResult,
): AutomationQueueReadResult {
  if (!current || current.category !== incoming.category) return incoming;
  const items = new Map(current.items.map((item) => [automationQueueItemKey(item), item]));
  for (const item of incoming.items) items.set(automationQueueItemKey(item), item);
  return { ...incoming, items: [...items.values()] };
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
