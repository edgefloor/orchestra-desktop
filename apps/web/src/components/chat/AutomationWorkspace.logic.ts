import type {
  AutomationIssueClaim,
  AutomationQueueItem,
  AutomationQueueReadResult,
  AutomationRun,
  AutomationRunResult,
} from "@t3tools/contracts";

import type { NativeActivityPresentation } from "./NativeActivityPanel.logic";

export type AutomationIssueExecutionState =
  | "running"
  | "retrying"
  | "waiting"
  | "blocked"
  | "handoff"
  | "reconciling"
  | "queued"
  | "claimed"
  | "suspended"
  | "failed"
  | "cancelled"
  | "completed";

export type AutomationWorkspaceIssue = {
  readonly key: string;
  readonly issueId: string;
  readonly issueIdentifier: string;
  readonly issueTitle: AutomationQueueItem["issueTitle"];
  readonly trackerState: string;
  readonly executionState: AutomationIssueExecutionState;
  readonly priority?: number | undefined;
  readonly claim?: AutomationIssueClaim | undefined;
  readonly queue?: AutomationQueueItem | undefined;
  readonly progressSummary: string;
  readonly lastProgressAtMs?: number | undefined;
};

export type AutomationWorkspaceActivity = {
  readonly key: string;
  readonly issueKey?: string;
  readonly occurredAtMs?: number | undefined;
  readonly status: string;
  readonly summary: string;
  readonly detail: string;
};

export type AutomationWorkspaceRecoveryKind =
  | "coordination"
  | "dispatch"
  | "reconciliation"
  | "retry"
  | "effect"
  | "hook"
  | "cleanup"
  | "blocker";

export type AutomationWorkspaceRecoveryAction =
  | "inspect"
  | "refresh"
  | "resume"
  | "open_issue_task";

export type AutomationWorkspaceRecovery = {
  readonly key: string;
  readonly kind: AutomationWorkspaceRecoveryKind;
  readonly status: string;
  readonly summary: string;
  readonly detail: string;
  readonly resolution: string;
  readonly issueKey?: string | undefined;
  readonly issueIdentifier?: string | undefined;
  readonly claimId?: string | undefined;
  readonly actions: readonly AutomationWorkspaceRecoveryAction[];
};

export type AutomationWorkspaceEventGroupName =
  | "coordination"
  | "dispatch"
  | "reconciliation"
  | "hooks"
  | "effects"
  | "steering"
  | "cleanup";

export type AutomationWorkspaceEvent = {
  readonly key: string;
  readonly group: AutomationWorkspaceEventGroupName;
  readonly issueKey?: string;
  readonly issueId?: string;
  readonly claimId?: string;
  readonly occurredAtMs?: number | undefined;
  readonly label: string;
  readonly status: string;
  readonly exact: Readonly<Record<string, unknown>>;
};

export type AutomationWorkspaceEventGroup = {
  readonly key: AutomationWorkspaceEventGroupName;
  readonly label: string;
  readonly events: readonly AutomationWorkspaceEvent[];
  readonly total: number;
  readonly truncated: boolean;
};

export type AutomationWorkspaceProjection = {
  readonly issues: readonly AutomationWorkspaceIssue[];
  readonly activity: readonly AutomationWorkspaceActivity[];
  readonly recovery: readonly AutomationWorkspaceRecovery[];
  readonly eventGroups: readonly AutomationWorkspaceEventGroup[];
  readonly bounds: {
    readonly issues: {
      readonly shown: number;
      readonly available: number;
      readonly truncated: boolean;
    };
    readonly claims: {
      readonly shown: number;
      readonly total: number;
      readonly truncated: boolean;
    };
    readonly queue: {
      readonly source: "page" | "preview" | "none";
      readonly category?: AutomationQueueReadResult["category"] | undefined;
      readonly shown: number;
      readonly total?: number | undefined;
      readonly nextOffset?: number | undefined;
      readonly truncated: boolean;
    };
    readonly activity: {
      readonly shown: number;
      readonly available: number;
      readonly truncated: boolean;
    };
    readonly recovery: {
      readonly shown: number;
      readonly available: number;
      readonly truncated: boolean;
    };
  };
};

export type AutomationWorkspaceProjectionLimits = {
  readonly issues?: number;
  readonly activity?: number;
  readonly recovery?: number;
  readonly eventsPerGroup?: number;
};

function formatActivityMoment(value: number | undefined): string {
  if (value === undefined) return "Not recorded";
  if (value < 100_000_000_000) return `${value} ms`;
  return new Date(value).toLocaleString();
}

const DEFAULT_ISSUE_LIMIT = 100;
const DEFAULT_ACTIVITY_LIMIT = 100;
const DEFAULT_RECOVERY_LIMIT = 100;
const DEFAULT_EVENTS_PER_GROUP_LIMIT = 50;

const executionStateRank: Readonly<Record<AutomationIssueExecutionState, number>> = {
  running: 0,
  retrying: 1,
  waiting: 2,
  blocked: 3,
  handoff: 4,
  reconciling: 5,
  queued: 6,
  claimed: 7,
  suspended: 8,
  failed: 9,
  cancelled: 10,
  completed: 11,
};

const eventGroupOrder = [
  ["coordination", "Coordination"],
  ["dispatch", "Dispatch"],
  ["reconciliation", "Reconciliation"],
  ["hooks", "Hooks"],
  ["effects", "Effects"],
  ["steering", "Steering"],
  ["cleanup", "Cleanup"],
] as const satisfies readonly (readonly [AutomationWorkspaceEventGroupName, string])[];

function boundedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

function preferredClaim(
  current: AutomationIssueClaim | undefined,
  incoming: AutomationIssueClaim,
): AutomationIssueClaim {
  if (!current) return incoming;
  if (incoming.attempt !== current.attempt)
    return incoming.attempt > current.attempt ? incoming : current;
  const incomingProgress = incoming.lastProgressAtMs ?? -1;
  const currentProgress = current.lastProgressAtMs ?? -1;
  if (incomingProgress !== currentProgress)
    return incomingProgress > currentProgress ? incoming : current;
  return compareText(incoming.claimId, current.claimId) >= 0 ? incoming : current;
}

function deriveExecutionState(input: {
  readonly run: AutomationRun;
  readonly claim?: AutomationIssueClaim | undefined;
  readonly queue?: AutomationQueueItem | undefined;
}): AutomationIssueExecutionState {
  const { claim, queue, run } = input;
  if (claim?.status === "failed" || claim?.workflowStatus === "failed") return "failed";
  if (claim?.status === "cancelled" || claim?.workflowStatus === "cancelled") return "cancelled";
  if (claim?.status === "completed") return "completed";
  if (claim?.status === "suspended") return "suspended";
  if (claim?.scheduledRetry) return "retrying";
  if (queue?.category === "waiting_gate" || claim?.workflowStatus === "waitingApproval") {
    return "waiting";
  }
  if (queue?.category === "blocked") return "blocked";
  if (queue?.category === "handoff") return "handoff";
  if (claim && run.reconciliation !== "complete") return "reconciling";
  if (
    queue?.category === "running" ||
    claim?.status === "running" ||
    claim?.workflowStatus === "running"
  ) {
    return "running";
  }
  if (queue?.category === "terminal") {
    return "completed";
  }
  if (queue?.category === "queued") return "queued";
  return claim ? "claimed" : "queued";
}

function progressSummary(claim: AutomationIssueClaim | undefined): string {
  if (!claim) return "Awaiting claim";
  const parts = [
    `attempt ${claim.attempt}`,
    `${claim.workflowInvocations} invocation${claim.workflowInvocations === 1 ? "" : "s"}`,
    `${claim.turnsInWindow} turn${claim.turnsInWindow === 1 ? "" : "s"}`,
  ];
  if (claim.continuationCount > 0)
    parts.push(
      `${claim.continuationCount} continuation${claim.continuationCount === 1 ? "" : "s"}`,
    );
  if (claim.retryAttempt > 0) parts.push(`retry ${claim.retryAttempt}`);
  return parts.join(" · ");
}

function projectIssues(
  run: AutomationRun,
  queueResult: AutomationQueueReadResult | null | undefined,
): AutomationWorkspaceIssue[] {
  const claims = new Map<string, AutomationIssueClaim>();
  for (const claim of run.claims) {
    claims.set(claim.issueId, preferredClaim(claims.get(claim.issueId), claim));
  }

  const queues = new Map<string, AutomationQueueItem>();
  for (const queue of run.queuePreview) queues.set(queue.issueId, queue);
  for (const queue of queueResult?.items ?? []) queues.set(queue.issueId, queue);

  const issueIds = new Set([...claims.keys(), ...queues.keys()]);
  return [...issueIds]
    .map((issueId): AutomationWorkspaceIssue => {
      const claim = claims.get(issueId);
      const queue = queues.get(issueId);
      return {
        key: issueId,
        issueId,
        issueIdentifier: queue?.issueIdentifier ?? claim?.issueIdentifier ?? issueId,
        issueTitle: queue?.issueTitle ?? claim?.issueTitle ?? { text: issueId, truncated: false },
        trackerState: queue?.state ?? claim?.trackerState ?? "Unknown",
        executionState: deriveExecutionState({ run, claim, queue }),
        priority: queue?.priority ?? claim?.priority,
        claim,
        queue,
        progressSummary: progressSummary(claim),
        lastProgressAtMs: claim?.lastProgressAtMs,
      };
    })
    .sort((left, right) => {
      const state =
        executionStateRank[left.executionState] - executionStateRank[right.executionState];
      if (state !== 0) return state;
      const priority =
        (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER);
      if (priority !== 0) return priority;
      const progress = (right.lastProgressAtMs ?? -1) - (left.lastProgressAtMs ?? -1);
      if (progress !== 0) return progress;
      const identifier = compareText(left.issueIdentifier, right.issueIdentifier);
      return identifier !== 0 ? identifier : compareText(left.issueId, right.issueId);
    });
}

function activityForIssue(issue: AutomationWorkspaceIssue): AutomationWorkspaceActivity[] {
  const claim = issue.claim;
  if (!claim) {
    return [
      {
        key: `issue:${issue.issueId}:queued`,
        issueKey: issue.key,
        status: issue.executionState,
        summary: `${issue.issueIdentifier} is ${issue.executionState.replace("_", " ")}`,
        detail: issue.queue?.nextAction.text ?? "Awaiting a durable Automation claim.",
      },
    ];
  }

  const activity: AutomationWorkspaceActivity[] = [
    {
      key: `claim:${claim.claimId}:progress:${claim.lastProgressAtMs ?? "none"}`,
      issueKey: issue.key,
      occurredAtMs: claim.lastProgressAtMs,
      status: issue.executionState,
      summary: `${issue.issueIdentifier} is ${issue.executionState.replace("_", " ")}`,
      detail: `${issue.progressSummary}. ${claim.nextAction.text}`,
    },
  ];
  if (claim.latestSteeringReceipt) {
    activity.push({
      key: `steering:${claim.claimId}:${claim.latestSteeringReceipt.sequence}`,
      issueKey: issue.key,
      occurredAtMs: claim.latestSteeringReceipt.submittedAtMs,
      status: claim.latestSteeringReceipt.status,
      summary: `Guidance ${claim.latestSteeringReceipt.status} for ${issue.issueIdentifier}`,
      detail:
        claim.latestSteeringReceipt.status === "failed" && claim.latestSteeringReceipt.failure
          ? claim.latestSteeringReceipt.failure
          : claim.latestSteeringReceipt.inputPreview,
    });
  }
  for (const effect of claim.effects) {
    if (effect.status !== "failed" && effect.status !== "ambiguous") continue;
    activity.push({
      key: `effect:${claim.claimId}:${effect.effectId}:${effect.status}`,
      issueKey: issue.key,
      status: effect.status,
      summary: `${effect.kind} effect is ${effect.status} for ${issue.issueIdentifier}`,
      detail:
        effect.failure?.text ??
        `Effect ${effect.effectId} has no durable failure detail in this snapshot.`,
    });
  }
  for (const hook of claim.hookReceipts) {
    if (hook.status !== "failed") continue;
    activity.push({
      key: `hook:${claim.claimId}:${hook.kind}:${hook.invocation}:failed`,
      issueKey: issue.key,
      status: hook.status,
      summary: `${hook.kind.replace("_", " ")} hook failed for ${issue.issueIdentifier}`,
      detail:
        hook.failure?.text ||
        hook.stderrPreview.text ||
        `Hook invocation ${hook.invocation} has no durable failure detail in this snapshot.`,
    });
  }
  if (claim.cleanup.status === "retry_pending") {
    activity.push({
      key: `cleanup:${claim.claimId}:retry_pending:${claim.cleanup.attempts}`,
      issueKey: issue.key,
      status: claim.cleanup.status,
      summary: `Worktree cleanup will retry for ${issue.issueIdentifier}`,
      detail:
        claim.cleanup.lastFailure?.text ??
        `${claim.cleanup.attempts} cleanup attempt${claim.cleanup.attempts === 1 ? "" : "s"} recorded without a failure detail.`,
    });
  }
  return activity;
}

function availableRunActions(run: AutomationRun): AutomationWorkspaceRecoveryAction[] {
  const actions: AutomationWorkspaceRecoveryAction[] = ["inspect"];
  if (run.status === "cancelled" || run.status === "failed") return actions;
  actions.push("refresh");
  if (run.status === "suspended") actions.push("resume");
  return actions;
}

function availableIssueActions(
  run: AutomationRun,
  issue: AutomationWorkspaceIssue,
): AutomationWorkspaceRecoveryAction[] {
  const claim = issue.claim;
  const actions = availableRunActions(run);
  if (claim?.issueTask) actions.push("open_issue_task");
  return actions;
}

const recoveryKindRank: Readonly<Record<AutomationWorkspaceRecoveryKind, number>> = {
  coordination: 0,
  dispatch: 1,
  reconciliation: 2,
  blocker: 3,
  effect: 4,
  hook: 5,
  cleanup: 6,
  retry: 7,
};

function recoveryStatusRank(status: string): number {
  if (status === "error" || status === "failed") return 0;
  if (status === "ambiguous") return 1;
  if (status === "blocked") return 2;
  if (status === "started" || status === "executing") return 3;
  if (status === "pending" || status === "waiting_gate" || status === "retry_pending") return 4;
  return 5;
}

function orderedRecovery(
  items: readonly AutomationWorkspaceRecovery[],
): AutomationWorkspaceRecovery[] {
  const deduplicated = [...new Map(items.map((item) => [item.key, item])).values()];
  return deduplicated.sort((left, right) => {
    const urgency =
      recoveryKindRank[left.kind] - recoveryKindRank[right.kind] ||
      recoveryStatusRank(left.status) - recoveryStatusRank(right.status);
    if (urgency !== 0) return urgency;
    return compareText(
      `${left.issueIdentifier ?? ""}\0${left.claimId ?? ""}\0${left.key}`,
      `${right.issueIdentifier ?? ""}\0${right.claimId ?? ""}\0${right.key}`,
    );
  });
}

function projectRecovery(
  run: AutomationRun,
  issues: readonly AutomationWorkspaceIssue[],
): AutomationWorkspaceRecovery[] {
  const recovery: AutomationWorkspaceRecovery[] = [];
  if (run.coordination.error) {
    recovery.push({
      key: `coordination:${run.runId}:${run.coordination.scanRevision}:error`,
      kind: "coordination",
      status: "error",
      summary: `Coordination cycle ${run.coordination.cycle} failed`,
      detail: run.coordination.error.text,
      resolution: "Use the existing Refresh action to request another native coordination cycle.",
      actions: availableRunActions(run),
    });
  }
  const intent = run.coordination.dispatchIntent;
  if (intent && intent.status !== "completed") {
    const issue = issues.find((candidate) => candidate.issueId === intent.issueId);
    recovery.push({
      key: `dispatch:${intent.intentId}:${intent.status}`,
      kind: "dispatch",
      status: intent.status,
      summary: `Dispatch ${intent.kind.replace("_", " ")} is ${intent.status}`,
      detail: `Intent ${intent.intentId} · claim ${intent.claimId} · attempt ${intent.attempt}`,
      resolution: "Use Inspect or Refresh to observe the next native dispatch transition.",
      issueKey: issue?.key,
      issueIdentifier: issue?.issueIdentifier,
      claimId: intent.claimId,
      actions: issue ? availableIssueActions(run, issue) : availableRunActions(run),
    });
  }
  if (run.reconciliation !== "complete") {
    recovery.push({
      key: `reconciliation:${run.runId}:${run.revision}:${run.reconciliation}`,
      kind: "reconciliation",
      status: run.reconciliation,
      summary: `Root Run reconciliation is ${run.reconciliation.replace("_", " ")}`,
      detail: run.nextAction.text,
      resolution: "Use the existing Refresh action to request native reconciliation.",
      actions: availableRunActions(run),
    });
  }

  for (const issue of issues) {
    const claim = issue.claim;
    const actions = availableIssueActions(run, issue);
    if (issue.queue?.category === "blocked") {
      const blockers = issue.queue.blockedBy ?? [];
      if (blockers.length === 0) {
        recovery.push({
          key: `blocker:${issue.issueId}:unavailable`,
          kind: "blocker",
          status: "blocked",
          summary: `${issue.issueIdentifier} is blocked in ${issue.trackerState}`,
          detail: issue.queue.nextAction.text,
          resolution:
            "This legacy snapshot has no blocker identities; inspect the tracker, then use Refresh to request a current projection.",
          issueKey: issue.key,
          issueIdentifier: issue.issueIdentifier,
          claimId: claim?.claimId,
          actions,
        });
      }
      for (const [index, blocker] of blockers.entries()) {
        const identifier = blocker.identifier?.text ?? blocker.id?.text ?? `blocker ${index + 1}`;
        const state = blocker.state?.text ?? "unknown state";
        recovery.push({
          key: `blocker:${issue.issueId}:${blocker.id?.text ?? blocker.identifier?.text ?? index}:${index}`,
          kind: "blocker",
          status: "blocked",
          summary: `${issue.issueIdentifier} is blocked by ${identifier}`,
          detail: `${identifier} · ${state}. ${issue.queue.nextAction.text}`,
          resolution:
            "Inspect the durable blocker in the tracker, then use Refresh to observe the next native queue projection.",
          issueKey: issue.key,
          issueIdentifier: issue.issueIdentifier,
          claimId: claim?.claimId,
          actions,
        });
      }
    }
    if (!claim) continue;
    for (const effect of claim.effects) {
      if (
        effect.status !== "failed" &&
        effect.status !== "ambiguous" &&
        effect.status !== "executing" &&
        effect.status !== "waiting_gate"
      ) {
        continue;
      }
      recovery.push({
        key: `effect:${claim.claimId}:${effect.effectId}:${effect.status}`,
        kind: "effect",
        status: effect.status,
        summary: `${effect.kind} effect is ${effect.status.replace("_", " ")}`,
        detail:
          effect.failure?.text ??
          `${effect.bodyPreview.text}${effect.bodyPreview.truncated ? "…" : ""}`,
        resolution:
          "Effect resolution is unavailable from this Symphony workspace; inspect the durable receipt before taking provider-specific action.",
        issueKey: issue.key,
        issueIdentifier: issue.issueIdentifier,
        claimId: claim.claimId,
        actions,
      });
    }
    for (const hook of claim.hookReceipts) {
      if (hook.status !== "failed") continue;
      recovery.push({
        key: `hook:${claim.claimId}:${hook.kind}:${hook.invocation}`,
        kind: "hook",
        status: hook.status,
        summary: `${hook.kind.replace("_", " ")} hook failed`,
        detail:
          hook.failure?.text ||
          hook.stderrPreview.text ||
          `Hook invocation ${hook.invocation} has no durable failure detail in this snapshot.`,
        resolution: claim.issueTask
          ? "Open the Issue task to inspect the failure, then use Inspect or Refresh to observe native state changes."
          : "No Issue task is available in this snapshot; use Inspect or Refresh for native state changes.",
        issueKey: issue.key,
        issueIdentifier: issue.issueIdentifier,
        claimId: claim.claimId,
        actions,
      });
    }
    if (claim.cleanup.status === "retry_pending") {
      recovery.push({
        key: `cleanup:${claim.claimId}:retry_pending:${claim.cleanup.attempts}`,
        kind: "cleanup",
        status: claim.cleanup.status,
        summary: "Worktree cleanup is retrying",
        detail:
          claim.cleanup.lastFailure?.text ??
          `${claim.cleanup.attempts} cleanup attempt${claim.cleanup.attempts === 1 ? "" : "s"} recorded without a failure detail.`,
        resolution:
          "Cleanup retry is runtime-owned; use Inspect or Refresh to observe its next durable state.",
        issueKey: issue.key,
        issueIdentifier: issue.issueIdentifier,
        claimId: claim.claimId,
        actions,
      });
    }
    if (claim.scheduledRetry) {
      const schedule = claim.scheduledRetry;
      recovery.push({
        key: `retry:${claim.claimId}:${schedule.kind}:${schedule.readyAtMs}`,
        kind: "retry",
        status: "scheduled",
        summary: `${schedule.kind === "retry" ? `Retry ${claim.retryAttempt}` : `Continuation ${claim.continuationCount}`} is scheduled for ${issue.issueIdentifier}`,
        detail: `Ready at ${schedule.readyAtMs} ms · ${schedule.resetTurnWindow ? "turn window resets" : "turn window retained"}. ${claim.nextAction.text}`,
        resolution:
          "Retry dispatch is runtime-owned; use Inspect or Refresh to observe the retained schedule.",
        issueKey: issue.key,
        issueIdentifier: issue.issueIdentifier,
        claimId: claim.claimId,
        actions,
      });
    }
  }
  return orderedRecovery(recovery);
}

function projectActivity(
  run: AutomationRun,
  issues: readonly AutomationWorkspaceIssue[],
): AutomationWorkspaceActivity[] {
  const activity: AutomationWorkspaceActivity[] = [
    {
      key: `root:${run.runId}:revision:${run.revision}`,
      status: run.status,
      summary: `Root Run is ${run.status}`,
      detail: `${run.claimsTotal} claim${run.claimsTotal === 1 ? "" : "s"}; reconciliation ${run.reconciliation}. ${run.nextAction.text}`,
    },
    {
      key: `coordination:${run.runId}:${run.coordination.scanRevision}`,
      occurredAtMs: run.coordination.completedAtMs ?? run.coordination.startedAtMs,
      status: run.coordination.intakeStatus,
      summary: `Coordination cycle ${run.coordination.cycle} is ${run.coordination.intakeStatus.replace("_", " ")}`,
      detail: run.coordination.nextAction.text,
    },
    ...issues.flatMap(activityForIssue),
  ];
  if (run.coordination.error) {
    activity.push({
      key: `coordination:${run.runId}:${run.coordination.scanRevision}:error`,
      occurredAtMs: run.coordination.completedAtMs ?? run.coordination.startedAtMs,
      status: "error",
      summary: `Coordination cycle ${run.coordination.cycle} reported an error`,
      detail: run.coordination.error.text,
    });
  }
  if (run.coordination.dispatchIntent) {
    const intent = run.coordination.dispatchIntent;
    activity.push({
      key: `dispatch:${intent.intentId}`,
      issueKey: intent.issueId,
      occurredAtMs: intent.readyAtMs ?? intent.createdAtMs,
      status: intent.status,
      summary: `Dispatch ${intent.kind.replace("_", " ")} is ${intent.status}`,
      detail: `Claim ${intent.claimId} · attempt ${intent.attempt}`,
    });
  }
  if (run.reconciliation !== "complete") {
    activity.push({
      key: `reconciliation:${run.runId}:${run.revision}:${run.reconciliation}`,
      status: run.reconciliation,
      summary: `Root Run reconciliation is ${run.reconciliation.replace("_", " ")}`,
      detail: run.nextAction.text,
    });
  }
  return activity.sort((left, right) => {
    const occurred = (right.occurredAtMs ?? -1) - (left.occurredAtMs ?? -1);
    return occurred !== 0 ? occurred : compareText(left.key, right.key);
  });
}

function exactRecord<T extends object>(value: T): Readonly<Record<string, unknown>> {
  return value as Readonly<Record<string, unknown>>;
}

function projectEvents(
  run: AutomationRun,
): Map<AutomationWorkspaceEventGroupName, AutomationWorkspaceEvent[]> {
  const groups = new Map<AutomationWorkspaceEventGroupName, AutomationWorkspaceEvent[]>(
    eventGroupOrder.map(([name]) => [name, []]),
  );
  groups.get("coordination")!.push({
    key: `coordination:${run.runId}:${run.coordination.scanRevision}`,
    group: "coordination",
    occurredAtMs: run.coordination.completedAtMs ?? run.coordination.startedAtMs,
    label: `Coordination cycle ${run.coordination.cycle}`,
    status: run.coordination.intakeStatus,
    exact: exactRecord(run.coordination),
  });
  if (run.coordination.dispatchIntent) {
    const intent = run.coordination.dispatchIntent;
    groups.get("dispatch")!.push({
      key: `dispatch:${intent.intentId}`,
      group: "dispatch",
      issueKey: intent.issueId,
      issueId: intent.issueId,
      claimId: intent.claimId,
      occurredAtMs: intent.readyAtMs ?? intent.createdAtMs,
      label: intent.kind.replace("_", " "),
      status: intent.status,
      exact: exactRecord(intent),
    });
  }
  groups.get("reconciliation")!.push({
    key: `reconciliation:${run.runId}:${run.revision}`,
    group: "reconciliation",
    label: "Root Run reconciliation",
    status: run.reconciliation,
    exact: {
      runId: run.runId,
      rootStatus: run.status,
      reconciliation: run.reconciliation,
      leaseEpoch: run.leaseEpoch,
      revision: run.revision,
      profileRevision: run.profileRevision,
      profileRevisionStatus: run.profileRevisionStatus,
      pendingProfileDigest: run.pendingProfileDigest,
      rejectedProfileDigest: run.rejectedProfileDigest,
      profileDiagnostics: run.profileDiagnostics,
    },
  });

  for (const claim of run.claims) {
    for (const hook of claim.hookReceipts) {
      groups.get("hooks")!.push({
        key: `hook:${claim.claimId}:${hook.kind}:${hook.invocation}`,
        group: "hooks",
        issueKey: claim.issueId,
        issueId: claim.issueId,
        claimId: claim.claimId,
        label: hook.kind.replace("_", " "),
        status: hook.status,
        exact: exactRecord(hook),
      });
    }
    for (const effect of claim.effects) {
      groups.get("effects")!.push({
        key: `effect:${claim.claimId}:${effect.effectId}`,
        group: "effects",
        issueKey: claim.issueId,
        issueId: claim.issueId,
        claimId: claim.claimId,
        label: effect.kind,
        status: effect.status,
        exact: exactRecord(effect),
      });
    }
    if (claim.latestSteeringReceipt) {
      groups.get("steering")!.push({
        key: `steering:${claim.claimId}:${claim.latestSteeringReceipt.sequence}`,
        group: "steering",
        issueKey: claim.issueId,
        issueId: claim.issueId,
        claimId: claim.claimId,
        occurredAtMs: claim.latestSteeringReceipt.submittedAtMs,
        label: "Issue task guidance",
        status: claim.latestSteeringReceipt.status,
        exact: exactRecord(claim.latestSteeringReceipt),
      });
    }
    groups.get("cleanup")!.push({
      key: `cleanup:${claim.claimId}:${claim.cleanup.status}:${claim.cleanup.attempts}`,
      group: "cleanup",
      issueKey: claim.issueId,
      issueId: claim.issueId,
      claimId: claim.claimId,
      label: "Worktree cleanup",
      status: claim.cleanup.status,
      exact: exactRecord(claim.cleanup),
    });
  }

  for (const events of groups.values()) {
    events.sort((left, right) => {
      const occurred = (right.occurredAtMs ?? -1) - (left.occurredAtMs ?? -1);
      return occurred !== 0 ? occurred : compareText(left.key, right.key);
    });
  }
  return groups;
}

export function projectAutomationWorkspace(
  result: AutomationRunResult,
  queueResult?: AutomationQueueReadResult | null,
  limits: AutomationWorkspaceProjectionLimits = {},
): AutomationWorkspaceProjection {
  const issueLimit = boundedLimit(limits.issues, DEFAULT_ISSUE_LIMIT);
  const activityLimit = boundedLimit(limits.activity, DEFAULT_ACTIVITY_LIMIT);
  const recoveryLimit = boundedLimit(limits.recovery, DEFAULT_RECOVERY_LIMIT);
  const eventLimit = boundedLimit(limits.eventsPerGroup, DEFAULT_EVENTS_PER_GROUP_LIMIT);
  const allIssues = projectIssues(result.run, queueResult);
  const issues = allIssues.slice(0, issueLimit);
  const allActivity = projectActivity(result.run, allIssues);
  const activity = allActivity.slice(0, activityLimit);
  const allRecovery = projectRecovery(result.run, allIssues);
  const recovery = allRecovery.slice(0, recoveryLimit);
  const events = projectEvents(result.run);
  const eventGroups = eventGroupOrder.map(([key, label]): AutomationWorkspaceEventGroup => {
    const allEvents = events.get(key) ?? [];
    return {
      key,
      label,
      events: allEvents.slice(0, eventLimit),
      total: allEvents.length,
      truncated: allEvents.length > eventLimit,
    };
  });
  const queueShown = queueResult?.items.length ?? result.run.queuePreview.length;
  const queueTotal = queueResult?.total;
  const queueTruncated = queueResult
    ? queueResult.nextOffset !== undefined || queueResult.items.length < queueResult.total
    : result.run.queuePreviewTruncated;

  return {
    issues,
    activity,
    recovery,
    eventGroups,
    bounds: {
      issues: {
        shown: issues.length,
        available: allIssues.length,
        truncated: issues.length < allIssues.length,
      },
      claims: {
        shown: result.run.claims.length,
        total: result.run.claimsTotal,
        truncated: result.run.claims.length < result.run.claimsTotal,
      },
      queue: {
        source: queueResult
          ? "page"
          : result.run.queuePreview.length > 0 || result.run.queuePreviewTruncated
            ? "preview"
            : "none",
        category: queueResult?.category,
        shown: queueShown,
        total: queueTotal,
        nextOffset: queueResult?.nextOffset,
        truncated: queueTruncated,
      },
      activity: {
        shown: activity.length,
        available: allActivity.length,
        truncated: activity.length < allActivity.length,
      },
      recovery: {
        shown: recovery.length,
        available: allRecovery.length,
        truncated: recovery.length < allRecovery.length,
      },
    },
  };
}

export function projectAutomationRootActivityPresentation(
  run: AutomationRun,
  projection: Pick<AutomationWorkspaceProjection, "activity" | "bounds">,
): NativeActivityPresentation {
  return {
    accessibleLabel: "Automation activity",
    identity: {
      label: "Root Run",
      value: run.runId,
      status: run.status,
    },
    state: projection.activity.length === 0 ? "empty" : "ready",
    overview: {
      summary: `${projection.bounds.activity.shown} durable activity ${
        projection.bounds.activity.shown === 1 ? "summary" : "summaries"
      } in this native snapshot`,
      metadata: `Revision ${run.revision} · reconciliation ${run.reconciliation.replace("_", " ")}`,
    },
    records: projection.activity.map((entry) => ({
      id: entry.key,
      status: entry.status,
      summary: entry.summary,
      detail: entry.detail,
      occurredAt: formatActivityMoment(entry.occurredAtMs),
    })),
    emptyMessage: "No durable Root or Issue activity is available in this native snapshot.",
    truncationMessage: projection.bounds.activity.truncated
      ? `Showing ${projection.bounds.activity.shown} of ${projection.bounds.activity.available} durable activity summaries.`
      : undefined,
  };
}

export function retainAutomationIssueSelection(
  selectedIssueId: string | null,
  issues: readonly AutomationWorkspaceIssue[],
): string | null {
  if (selectedIssueId === null) return null;
  return issues.some((issue) => issue.issueId === selectedIssueId) ? selectedIssueId : null;
}
