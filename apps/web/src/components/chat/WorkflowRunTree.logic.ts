import type {
  OrchestraEvidenceReference,
  OrchestraEvidenceContentProjection,
  OrchestraExecutionStepProjection,
  OrchestraHistoryCursor,
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

export function preserveWorkflowStepOrder(
  steps: ReadonlyArray<OrchestraExecutionStepProjection>,
): OrchestraExecutionStepProjection[] {
  return [...steps];
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
  readonly after?: string;
  readonly historyAfter?: OrchestraHistoryCursor;
}): OrchestraQueryInput {
  const { threadId, runId, selector, stepId, evidenceId, after, historyAfter } = input;
  return {
    threadId,
    runId,
    selector,
    ...(stepId ? { stepId } : {}),
    ...(evidenceId ? { evidenceId } : {}),
    ...(after ? { after } : {}),
    ...(historyAfter ? { historyAfter } : {}),
    maxItems: selector === "history" ? 30 : selector === "steps" ? 50 : 20,
    maxBytes: 64 * 1024,
  };
}

export function mergeWorkflowPage<T>(
  current: ReadonlyArray<T>,
  incoming: ReadonlyArray<T>,
  identity: (item: T) => string,
): T[] {
  const byIdentity = new Map(current.map((item) => [identity(item), item]));
  for (const item of incoming) byIdentity.set(identity(item), item);
  return [...byIdentity.values()];
}

export function workflowContinuationAdvanced(
  current: string | OrchestraHistoryCursor,
  next: string | OrchestraHistoryCursor,
): boolean {
  if (typeof current === "string" || typeof next === "string") {
    return typeof current === "string" && typeof next === "string" && current !== next;
  }
  return (
    current.sequence !== next.sequence ||
    current.itemId !== next.itemId ||
    current.revision !== next.revision
  );
}

export type EvidenceErrorState =
  | "missing_or_expired"
  | "unauthorized"
  | "integrity_failure"
  | "invalid_reference"
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
  if (
    normalized.includes("integrity") ||
    normalized.includes("checksum") ||
    normalized.includes("digest mismatch") ||
    normalized.includes("corrupt")
  ) {
    return "integrity_failure";
  }
  if (normalized.includes("invalid")) return "invalid_reference";
  if (normalized.includes("malformed")) return "malformed";
  return "unavailable";
}

export type EvidenceContentDisplayState =
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "empty" }
  | { readonly kind: "content_too_large" }
  | { readonly kind: "malformed" }
  | { readonly kind: "integrity_failure" }
  | { readonly kind: "unsupported_media" };

function evidenceMediaTypeIsText(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  return ["application/json", "text/markdown", "text/plain", "text/x-diff"].includes(normalized);
}

export function evidenceContentDisplayState(
  reference: OrchestraEvidenceReference,
  content: OrchestraEvidenceContentProjection,
): EvidenceContentDisplayState {
  if (
    reference.evidenceId !== content.evidenceId ||
    reference.name !== content.name ||
    reference.bytes !== content.bytes ||
    reference.kind !== content.kind ||
    reference.provenance !== content.provenance ||
    (reference.sha256 ?? null) !== (content.sha256 ?? null)
  ) {
    return { kind: "integrity_failure" };
  }
  if (content.availability === "content_too_large") return { kind: "content_too_large" };
  if (content.availability === "malformed" || typeof content.content !== "string") {
    return { kind: "malformed" };
  }
  if (!evidenceMediaTypeIsText(content.mediaType)) return { kind: "unsupported_media" };
  if (content.content.length === 0) return { kind: "empty" };
  return { kind: "text", content: content.content };
}

export function compactEvidenceReference(item: OrchestraEvidenceReference): {
  readonly identity: string;
  readonly provenance: string;
  readonly availability: string;
} {
  return {
    identity: item.evidenceId.slice(0, 12),
    provenance: item.provenance.replaceAll("_", " "),
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
