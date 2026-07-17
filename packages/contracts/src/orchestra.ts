import * as Schema from "effect/Schema";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ORCHESTRA_REPLAY_MAX_EVENTS = 64;
export const ORCHESTRA_PROJECTION_TEXT_MAX_CHARS = 4_097;

const OrchestraProjectionText = Schema.String.check(
  Schema.isMaxLength(ORCHESTRA_PROJECTION_TEXT_MAX_CHARS),
);

export const OrchestraRunStatus = Schema.Literals([
  "pending",
  "running",
  "waitingApproval",
  "completed",
  "failed",
  "cancelled",
]);
export type OrchestraRunStatus = typeof OrchestraRunStatus.Type;

export const OrchestraStepStatus = Schema.Literals([
  "pending",
  "running",
  "retrying",
  "waitingApproval",
  "completed",
  "failed",
  "cancelled",
]);
export type OrchestraStepStatus = typeof OrchestraStepStatus.Type;

export const OrchestraBoundedText = Schema.Struct({
  text: Schema.String,
  truncated: Schema.Boolean,
});

const NullableOptionalString = Schema.optional(Schema.NullOr(OrchestraProjectionText));

export const OrchestraRunProjection = Schema.Struct({
  schemaVersion: NonNegativeInt,
  runId: TrimmedNonEmptyString,
  workflowSha256: TrimmedNonEmptyString,
  parentThreadId: TrimmedNonEmptyString,
  sourceRevision: TrimmedNonEmptyString,
  status: OrchestraRunStatus,
  promotion: Schema.Literals(["pending", "applied", "notRequired"]),
  steps: Schema.Array(
    Schema.Struct({
      id: TrimmedNonEmptyString,
      status: OrchestraStepStatus,
      attempts: NonNegativeInt,
      rounds: NonNegativeInt,
      outputKeys: Schema.Array(Schema.String),
      finalResponse: NullableOptionalString,
      error: NullableOptionalString,
    }),
  ),
  nextAction: OrchestraProjectionText,
});

export const OrchestraLifecycleKind = Schema.Literals([
  "invoked",
  "resumed",
  "cancelled",
  "recovered",
]);

export const OrchestraReplayEvent = Schema.Struct({
  schemaVersion: NonNegativeInt,
  eventId: TrimmedNonEmptyString,
  runId: TrimmedNonEmptyString,
  sequence: NonNegativeInt,
  revision: NonNegativeInt,
  kind: OrchestraLifecycleKind,
  projection: OrchestraRunProjection,
});
export type OrchestraReplayEvent = typeof OrchestraReplayEvent.Type;

export const OrchestraTaskReplay = Schema.Struct({
  latest: OrchestraReplayEvent,
  events: Schema.Array(OrchestraReplayEvent).check(Schema.isMaxLength(ORCHESTRA_REPLAY_MAX_EVENTS)),
  replayTruncated: Schema.Boolean,
});
export type OrchestraTaskReplay = typeof OrchestraTaskReplay.Type;

export const OrchestraAgentReference = Schema.Struct({
  threadId: TrimmedNonEmptyString,
  taskPath: TrimmedNonEmptyString,
});

export const OrchestraExecutionStepProjection = Schema.Struct({
  id: TrimmedNonEmptyString,
  status: OrchestraStepStatus,
  attempts: NonNegativeInt,
  rounds: NonNegativeInt,
  agent: Schema.optional(Schema.NullOr(OrchestraAgentReference)),
  contextSha256: NullableOptionalString,
  approvalDecision: Schema.optional(Schema.NullOr(OrchestraBoundedText)),
  error: Schema.optional(Schema.NullOr(OrchestraBoundedText)),
  outputCount: NonNegativeInt,
});
export type OrchestraExecutionStepProjection = typeof OrchestraExecutionStepProjection.Type;

export const OrchestraStepCounts = Schema.Struct({
  pending: NonNegativeInt,
  running: NonNegativeInt,
  retrying: NonNegativeInt,
  waitingApproval: NonNegativeInt,
  completed: NonNegativeInt,
  failed: NonNegativeInt,
  cancelled: NonNegativeInt,
});

export const OrchestraExecutionRunProjection = Schema.Struct({
  schemaVersion: NonNegativeInt,
  runId: TrimmedNonEmptyString,
  workflowSha256: TrimmedNonEmptyString,
  sourceRevision: TrimmedNonEmptyString,
  status: OrchestraRunStatus,
  promotion: Schema.Literals(["pending", "applied", "notRequired"]),
  stepCounts: OrchestraStepCounts,
  nextAction: OrchestraBoundedText,
});
export type OrchestraExecutionRunProjection = typeof OrchestraExecutionRunProjection.Type;

export const OrchestraOutputProjection = Schema.Struct({
  stepId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  sha256: TrimmedNonEmptyString,
  canonicalBytes: NonNegativeInt,
  value: Schema.optional(Schema.Unknown),
});
export type OrchestraOutputProjection = typeof OrchestraOutputProjection.Type;

export const OrchestraEvidenceReference = Schema.Struct({
  evidenceId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  kind: Schema.Literals(["check", "change", "skill", "other"]),
  provenance: Schema.Literals([
    "runtime_check",
    "runtime_change",
    "skill_snapshot",
    "runtime_other",
  ]),
  stepId: NullableOptionalString,
  bytes: NonNegativeInt,
  sha256: NullableOptionalString,
  availability: Schema.Literals(["available", "content_too_large", "malformed"]),
});
export type OrchestraEvidenceReference = typeof OrchestraEvidenceReference.Type;

export const OrchestraEvidenceContentProjection = Schema.Struct({
  evidenceId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  kind: Schema.Literals(["check", "change", "skill", "other"]),
  provenance: Schema.Literals([
    "runtime_check",
    "runtime_change",
    "skill_snapshot",
    "runtime_other",
  ]),
  availability: Schema.Literals(["available", "content_too_large", "malformed"]),
  bytes: NonNegativeInt,
  sha256: NullableOptionalString,
  mediaType: TrimmedNonEmptyString,
  content: NullableOptionalString,
});
export type OrchestraEvidenceContentProjection = typeof OrchestraEvidenceContentProjection.Type;

export const OrchestraHistoryCursor = Schema.Struct({
  sequence: NonNegativeInt,
  itemId: TrimmedNonEmptyString,
  revision: NonNegativeInt,
});
export type OrchestraHistoryCursor = typeof OrchestraHistoryCursor.Type;

export const OrchestraHistoryRecord = Schema.Struct({
  sequence: NonNegativeInt,
  itemId: TrimmedNonEmptyString,
  revision: NonNegativeInt,
  kind: TrimmedNonEmptyString,
  stepId: NullableOptionalString,
  summary: OrchestraProjectionText,
});
export type OrchestraHistoryRecord = typeof OrchestraHistoryRecord.Type;

export const OrchestraRunDigest = Schema.Struct({
  runId: TrimmedNonEmptyString,
  stateSha256: TrimmedNonEmptyString,
  text: OrchestraProjectionText,
  omittedSteps: NonNegativeInt,
});

export const OrchestraQueryInput = Schema.Struct({
  threadId: ThreadId,
  runId: TrimmedNonEmptyString,
  selector: Schema.Literals([
    "run",
    "steps",
    "outputs",
    "evidence",
    "evidence_content",
    "history",
    "digest",
  ]),
  stepId: Schema.optional(Schema.String),
  evidenceId: Schema.optional(Schema.String),
  after: Schema.optional(Schema.String),
  historyAfter: Schema.optional(OrchestraHistoryCursor),
  maxItems: Schema.optional(NonNegativeInt),
  maxBytes: Schema.optional(NonNegativeInt),
});
export type OrchestraQueryInput = typeof OrchestraQueryInput.Type;

export const OrchestraRunResult = Schema.Struct({
  selector: Schema.Literal("run"),
  result: OrchestraExecutionRunProjection,
});

export const OrchestraStepsResult = Schema.Struct({
  selector: Schema.Literal("steps"),
  result: Schema.Struct({
    items: Schema.Array(OrchestraExecutionStepProjection),
    next: NullableOptionalString,
  }),
});

export const OrchestraEvidenceResult = Schema.Struct({
  selector: Schema.Literal("evidence"),
  result: Schema.Struct({
    items: Schema.Array(OrchestraEvidenceReference),
    next: NullableOptionalString,
  }),
});

export const OrchestraEvidenceContentResult = Schema.Struct({
  selector: Schema.Literal("evidence_content"),
  result: OrchestraEvidenceContentProjection,
});

export const OrchestraOutputsResult = Schema.Struct({
  selector: Schema.Literal("outputs"),
  result: Schema.Struct({
    items: Schema.Array(OrchestraOutputProjection),
    next: NullableOptionalString,
  }),
});

export const OrchestraHistoryResult = Schema.Struct({
  selector: Schema.Literal("history"),
  result: Schema.Struct({
    items: Schema.Array(OrchestraHistoryRecord),
    next: Schema.optional(Schema.NullOr(OrchestraHistoryCursor)),
  }),
});

export const OrchestraDigestResult = Schema.Struct({
  selector: Schema.Literal("digest"),
  result: OrchestraRunDigest,
});

export const OrchestraQueryResult = Schema.Union([
  OrchestraRunResult,
  OrchestraStepsResult,
  OrchestraOutputsResult,
  OrchestraEvidenceResult,
  OrchestraEvidenceContentResult,
  OrchestraHistoryResult,
  OrchestraDigestResult,
]);
export type OrchestraQueryResult = typeof OrchestraQueryResult.Type;

export const OrchestraQueryResponse = Schema.Struct({ result: OrchestraQueryResult });

export class OrchestraQueryError extends Schema.TaggedErrorClass<OrchestraQueryError>()(
  "OrchestraQueryError",
  {
    message: TrimmedNonEmptyString,
    threadId: Schema.optional(ThreadId),
    cause: Schema.optional(Schema.Defect()),
  },
) {}
