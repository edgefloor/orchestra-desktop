import type {
  AutomationIssueClaim,
  AutomationQueueItem,
  AutomationQueueReadResult,
  AutomationRun,
  AutomationRunResult,
} from "@t3tools/contracts";

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
  };
};

export type AutomationWorkspaceProjectionLimits = {
  readonly issues?: number;
  readonly activity?: number;
  readonly eventsPerGroup?: number;
};

const DEFAULT_ISSUE_LIMIT = 100;
const DEFAULT_ACTIVITY_LIMIT = 100;
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
  if (claim && claim.retryAttempt > 0) return "retrying";
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
      detail: claim.latestSteeringReceipt.inputPreview,
    });
  }
  return activity;
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
  const eventLimit = boundedLimit(limits.eventsPerGroup, DEFAULT_EVENTS_PER_GROUP_LIMIT);
  const allIssues = projectIssues(result.run, queueResult);
  const issues = allIssues.slice(0, issueLimit);
  const allActivity = projectActivity(result.run, allIssues);
  const activity = allActivity.slice(0, activityLimit);
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
    },
  };
}

export function retainAutomationIssueSelection(
  selectedIssueId: string | null,
  issues: readonly AutomationWorkspaceIssue[],
): string | null {
  if (selectedIssueId === null) return null;
  return issues.some((issue) => issue.issueId === selectedIssueId) ? selectedIssueId : null;
}
