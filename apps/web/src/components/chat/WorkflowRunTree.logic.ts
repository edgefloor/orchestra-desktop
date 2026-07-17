import type {
  OrchestraEvidenceReference,
  OrchestraExecutionStepProjection,
  OrchestraQueryInput,
  OrchestraReplayEvent,
  OrchestraRunStatus,
  OrchestraStepStatus,
  ThreadId,
} from "@t3tools/contracts";

export const MAX_INITIAL_WORKFLOW_STEPS = 6;
export const MAX_INLINE_OUTPUT_CHARS = 480;

export type WorkflowRunDisplayState =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "recovering"
  | "unavailable";

const STEP_PRIORITY: Record<OrchestraStepStatus, number> = {
  failed: 0,
  waitingApproval: 1,
  running: 2,
  retrying: 3,
  pending: 4,
  cancelled: 5,
  completed: 6,
};

export function workflowRunDisplayState(
  status: OrchestraRunStatus | "paused" | "unavailable",
  lifecycleKind?: OrchestraReplayEvent["kind"],
): WorkflowRunDisplayState {
  if (status === "unavailable") return "unavailable";
  if (status === "paused") return "paused";
  if (lifecycleKind === "recovered" && status === "running") return "recovering";
  switch (status) {
    case "pending":
      return "queued";
    case "waitingApproval":
      return "waiting";
    default:
      return status;
  }
}

export function workflowDetailDisplayState(
  nativeState: WorkflowRunDisplayState,
  detailError: string | null,
): WorkflowRunDisplayState {
  return detailError ? "unavailable" : nativeState;
}

export function sortWorkflowSteps(
  steps: ReadonlyArray<OrchestraExecutionStepProjection>,
): OrchestraExecutionStepProjection[] {
  return [...steps].sort((left, right) => left.id.localeCompare(right.id));
}

export function compactWorkflowStepSummary(event: OrchestraReplayEvent): {
  readonly total: number;
  readonly completed: number;
  readonly items: ReadonlyArray<{ readonly id: string; readonly status: OrchestraStepStatus }>;
  readonly omitted: number;
} {
  const ordered = [...event.projection.steps].sort(
    (left, right) =>
      STEP_PRIORITY[left.status] - STEP_PRIORITY[right.status] || left.id.localeCompare(right.id),
  );
  const items = ordered.slice(0, MAX_INITIAL_WORKFLOW_STEPS).map((step) => ({
    id: step.id,
    status: step.status,
  }));
  return {
    total: ordered.length,
    completed: ordered.filter((step) => step.status === "completed").length,
    items,
    omitted: ordered.length - items.length,
  };
}

export function buildWorkflowTreeQuery(input: {
  readonly threadId: ThreadId;
  readonly runId: string;
  readonly selector: OrchestraQueryInput["selector"];
  readonly stepId?: string;
  readonly evidenceId?: string;
}): OrchestraQueryInput {
  const { threadId, runId, selector, stepId, evidenceId } = input;
  return {
    threadId,
    runId,
    selector,
    ...(stepId ? { stepId } : {}),
    ...(evidenceId ? { evidenceId } : {}),
    maxItems: selector === "history" ? 30 : selector === "steps" ? 50 : 20,
    maxBytes: 64 * 1024,
  };
}

export type EvidenceErrorState =
  | "missing_or_expired"
  | "unauthorized"
  | "malformed"
  | "unavailable";

export function evidenceErrorState(message: string): EvidenceErrorState {
  const normalized = message.toLowerCase();
  if (normalized.includes("not authorized") || normalized.includes("unauthorized")) {
    return "unauthorized";
  }
  if (normalized.includes("not found") || normalized.includes("expired")) {
    return "missing_or_expired";
  }
  if (normalized.includes("invalid") || normalized.includes("malformed")) return "malformed";
  return "unavailable";
}

export function compactEvidenceReference(item: OrchestraEvidenceReference): {
  readonly identity: string;
  readonly provenance: string;
  readonly integrity: string;
  readonly availability: string;
} {
  return {
    identity: item.evidenceId.slice(0, 12),
    provenance: item.provenance.replaceAll("_", " "),
    integrity: item.sha256 ? item.sha256.slice(0, 16) : "unavailable",
    availability: item.availability.replaceAll("_", " "),
  };
}

export function formatBoundedOutputValue(value: unknown): string | null {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  return serialized.length <= MAX_INLINE_OUTPUT_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_INLINE_OUTPUT_CHARS - 1)}…`;
}

export function workflowStepKind(step: OrchestraExecutionStepProjection): string {
  return step.status === "waitingApproval" || step.approvalDecision ? "Approval gate" : "Step";
}
