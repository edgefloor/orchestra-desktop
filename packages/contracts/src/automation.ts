import * as Schema from "effect/Schema";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const AutomationIssueBlocker = Schema.Struct({
  id: Schema.optional(Schema.String),
  identifier: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
});

export const AutomationIssue = Schema.Struct({
  id: TrimmedNonEmptyString,
  identifier: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Number),
  state: TrimmedNonEmptyString,
  branchName: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  labels: Schema.Array(Schema.String),
  blockedBy: Schema.Array(AutomationIssueBlocker),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
});
export type AutomationIssue = typeof AutomationIssue.Type;

export const AutomationValidateInput = Schema.Struct({
  threadId: ThreadId,
  profilePath: TrimmedNonEmptyString,
  fixtureIssue: AutomationIssue,
  attempt: Schema.optional(NonNegativeInt),
});
export type AutomationValidateInput = typeof AutomationValidateInput.Type;

export const AutomationStartInput = Schema.Struct({
  threadId: ThreadId,
  profilePath: TrimmedNonEmptyString,
});
export type AutomationStartInput = typeof AutomationStartInput.Type;

export const AutomationValidationSeverity = Schema.Literals(["error", "warning"]);
export const AutomationDiagnosticCode = Schema.Literals([
  "missing_workflow_file",
  "workflow_parse_error",
  "workflow_front_matter_not_a_map",
  "missing_field",
  "invalid_value",
  "unknown_field",
  "unsupported_tracker",
  "missing_secret",
  "prohibited_codex_command",
  "policy_broadening",
  "unsafe_workspace_root",
  "missing_orchestra_extension",
  "unsupported_effect",
  "workflow_compile_error",
  "workflow_input_missing",
  "workflow_input_incompatible",
  "workflow_input_needs_default",
  "template_parse_error",
  "template_render_error",
]);

export const AutomationDiagnostic = Schema.Struct({
  severity: AutomationValidationSeverity,
  code: AutomationDiagnosticCode,
  path: Schema.String,
  message: Schema.String,
});

export const AutomationEffect = Schema.Literals([
  "tracker.comment",
  "tracker.transition",
  "tracker.link_pull_request",
]);
export type AutomationEffect = typeof AutomationEffect.Type;

export const AutomationSecretReference = Schema.Struct({
  kind: Schema.Literals(["environment", "inline_digest"]),
  reference: Schema.String,
  digest: Schema.String,
});

export const AutomationWorkflowInput = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["string", "number", "boolean", "object", "array", "json"]),
  required: Schema.Boolean,
  default: Schema.optional(Schema.Json),
});

export const AutomationWorkflowPreview = Schema.Struct({
  renderedPrompt: Schema.optional(Schema.String),
  workflow: Schema.optional(Schema.String),
  effects: Schema.Array(AutomationEffect),
  inputs: Schema.Array(AutomationWorkflowInput),
  secretReferences: Schema.Array(AutomationSecretReference),
});
export type AutomationWorkflowPreview = typeof AutomationWorkflowPreview.Type;

export const AutomationProfile = Schema.Struct({
  tracker: Schema.Struct({
    kind: Schema.String,
    endpoint: Schema.String,
    projectSlug: Schema.String,
    requiredLabels: Schema.Array(Schema.String),
    activeStates: Schema.Array(Schema.String),
    terminalStates: Schema.Array(Schema.String),
    credential: AutomationSecretReference,
  }),
  polling: Schema.Struct({ intervalMs: Schema.Number }),
  workspace: Schema.Struct({ root: Schema.String }),
  hooks: Schema.Struct({
    afterCreate: Schema.optional(Schema.String),
    beforeRun: Schema.optional(Schema.String),
    afterRun: Schema.optional(Schema.String),
    beforeRemove: Schema.optional(Schema.String),
    timeoutMs: Schema.Number,
  }),
  agent: Schema.Struct({
    maxConcurrentAgents: Schema.Number,
    maxTurns: Schema.Number,
    maxRetryBackoffMs: Schema.Number,
    maxConcurrentAgentsByState: Schema.Record(Schema.String, Schema.Number),
  }),
  codex: Schema.Struct({
    approvalPolicy: Schema.Json,
    threadSandbox: Schema.String,
    turnSandboxPolicy: Schema.Json,
    turnTimeoutMs: Schema.Number,
    readTimeoutMs: Schema.Number,
    stallTimeoutMs: Schema.Number,
  }),
  orchestra: Schema.Struct({
    workflowPath: Schema.String,
    workflowSha256: Schema.String,
    workflowName: Schema.String,
    effects: Schema.Array(AutomationEffect),
  }),
  promptTemplate: Schema.String,
});
export type AutomationProfile = typeof AutomationProfile.Type;

export const AutomationValidateResult = Schema.Struct({
  valid: Schema.Boolean,
  profile: Schema.optional(AutomationProfile),
  profileDigest: Schema.optional(Schema.String),
  preview: Schema.optional(AutomationWorkflowPreview),
  diagnostics: Schema.Array(AutomationDiagnostic),
});
export type AutomationValidateResult = typeof AutomationValidateResult.Type;

export const AutomationRootStatus = Schema.Literals([
  "running",
  "suspended",
  "cancelled",
  "failed",
]);
export const AutomationClaimStatus = Schema.Literals([
  "claimed",
  "running",
  "completed",
  "suspended",
  "cancelled",
  "failed",
]);
export const AutomationBoundedText = Schema.Struct({
  text: Schema.String,
  truncated: Schema.Boolean,
});
export const AutomationGatePolicy = Schema.Literals(["auto_accept", "auto_reject", "ask_human"]);
export const AutomationEffectStatus = Schema.Literals([
  "waiting_gate",
  "rejected",
  "executing",
  "committed",
  "failed",
  "ambiguous",
]);
export const AutomationEffectReceipt = Schema.Struct({
  effectId: Schema.String,
  idempotencyKey: Schema.String,
  kind: AutomationEffect,
  status: AutomationEffectStatus,
  gatePolicy: AutomationGatePolicy,
  requestSha256: Schema.String,
  bodyPreview: AutomationBoundedText,
  providerReceipt: Schema.optional(Schema.String),
  failure: Schema.optional(AutomationBoundedText),
});
export type AutomationEffectReceipt = typeof AutomationEffectReceipt.Type;
export const AutomationSteeringStatus = Schema.Literals(["submitted", "delivered", "failed"]);
export type AutomationSteeringStatus = typeof AutomationSteeringStatus.Type;
export const AutomationSteeringReceipt = Schema.Struct({
  sequence: NonNegativeInt,
  submittedAtMs: NonNegativeInt,
  initiatorThreadId: TrimmedNonEmptyString,
  targetThreadId: TrimmedNonEmptyString,
  authority: TrimmedNonEmptyString,
  inputSha256: TrimmedNonEmptyString,
  inputPreview: Schema.String,
  status: AutomationSteeringStatus,
  providerReceipt: Schema.optional(Schema.String),
  failure: Schema.optional(Schema.String),
});
export type AutomationSteeringReceipt = typeof AutomationSteeringReceipt.Type;
export const AutomationHookReceipt = Schema.Struct({
  kind: Schema.Literals(["after_create", "before_run", "after_run", "before_remove"]),
  invocation: NonNegativeInt,
  commandSha256: Schema.optional(Schema.String),
  status: Schema.Literals(["succeeded", "failed", "skipped"]),
  exitCode: Schema.optional(Schema.Number),
  stdoutPreview: AutomationBoundedText,
  stderrPreview: AutomationBoundedText,
  failure: Schema.optional(AutomationBoundedText),
});
export const AutomationCleanup = Schema.Struct({
  status: Schema.Literals(["retained", "eligible", "retry_pending", "removed"]),
  attempts: NonNegativeInt,
  lastFailure: Schema.optional(AutomationBoundedText),
});
export const AutomationRetryKind = Schema.Literals(["retry", "continuation"]);
export type AutomationRetryKind = typeof AutomationRetryKind.Type;
export const AutomationRetrySchedule = Schema.Struct({
  kind: AutomationRetryKind,
  readyAtMs: NonNegativeInt,
  resetTurnWindow: Schema.Boolean,
});
export type AutomationRetrySchedule = typeof AutomationRetrySchedule.Type;
export const AutomationCoordinationIntakeStatus = Schema.Literals([
  "not_started",
  "ready",
  "skipped",
]);
export type AutomationCoordinationIntakeStatus = typeof AutomationCoordinationIntakeStatus.Type;
export const AutomationDispatchIntentKind = Schema.Literals(["new_claim", "retry", "continuation"]);
export type AutomationDispatchIntentKind = typeof AutomationDispatchIntentKind.Type;
export const AutomationDispatchIntentStatus = Schema.Literals(["pending", "started", "completed"]);
export type AutomationDispatchIntentStatus = typeof AutomationDispatchIntentStatus.Type;
export const AutomationDispatchIntent = Schema.Struct({
  intentId: Schema.String,
  claimId: Schema.String,
  issueId: Schema.String,
  kind: AutomationDispatchIntentKind,
  status: AutomationDispatchIntentStatus,
  attempt: NonNegativeInt,
  profileDigest: Schema.String,
  createdAtMs: NonNegativeInt,
  readyAtMs: Schema.optional(NonNegativeInt),
});
export type AutomationDispatchIntent = typeof AutomationDispatchIntent.Type;
export const AutomationCoordination = Schema.Struct({
  cycle: NonNegativeInt,
  scanRevision: NonNegativeInt,
  inputCursor: Schema.optional(Schema.String),
  outputCursor: Schema.optional(Schema.String),
  intakeStatus: AutomationCoordinationIntakeStatus,
  pageDigest: Schema.optional(Schema.String),
  startedAtMs: Schema.optional(NonNegativeInt),
  completedAtMs: Schema.optional(NonNegativeInt),
  error: Schema.optional(AutomationBoundedText),
  nextAction: AutomationBoundedText,
  dispatchIntent: Schema.optional(AutomationDispatchIntent),
});
export type AutomationCoordination = typeof AutomationCoordination.Type;
export const AutomationIssueClaim = Schema.Struct({
  claimId: Schema.String,
  issueId: Schema.String,
  issueIdentifier: Schema.String,
  issueTitle: AutomationBoundedText,
  trackerState: Schema.String,
  priority: Schema.optional(Schema.Number),
  attempt: NonNegativeInt,
  workflowInvocations: NonNegativeInt,
  turnsInWindow: NonNegativeInt,
  continuationCount: NonNegativeInt,
  retryAttempt: NonNegativeInt,
  scheduledRetry: Schema.optional(AutomationRetrySchedule),
  lastProgressAtMs: Schema.optional(NonNegativeInt),
  profileDigest: Schema.String,
  profileRevision: NonNegativeInt,
  status: AutomationClaimStatus,
  worktree: Schema.String,
  sourceRevision: Schema.String,
  issueTask: Schema.optional(
    Schema.Struct({
      threadId: Schema.String,
      taskPath: Schema.String,
    }),
  ),
  workflowRunId: Schema.optional(Schema.String),
  workflowStatus: Schema.optional(
    Schema.Literals(["pending", "running", "waitingApproval", "completed", "failed", "cancelled"]),
  ),
  effects: Schema.Array(AutomationEffectReceipt),
  latestSteeringReceipt: Schema.optional(AutomationSteeringReceipt),
  hookReceipts: Schema.Array(AutomationHookReceipt),
  cleanup: AutomationCleanup,
  nextAction: AutomationBoundedText,
});
export type AutomationIssueClaim = typeof AutomationIssueClaim.Type;

export const AutomationQueueCategory = Schema.Literals([
  "queued",
  "running",
  "blocked",
  "waiting_gate",
  "handoff",
  "terminal",
]);
export const AutomationQueueCounts = Schema.Struct({
  queued: NonNegativeInt,
  running: NonNegativeInt,
  blocked: NonNegativeInt,
  waitingGate: NonNegativeInt,
  handoff: NonNegativeInt,
  terminal: NonNegativeInt,
});
export const AutomationQueueBlocker = Schema.Struct({
  id: Schema.optional(AutomationBoundedText),
  identifier: Schema.optional(AutomationBoundedText),
  state: Schema.optional(AutomationBoundedText),
});
export type AutomationQueueBlocker = typeof AutomationQueueBlocker.Type;
export const AutomationQueueItem = Schema.Struct({
  issueId: Schema.String,
  issueIdentifier: Schema.String,
  issueTitle: AutomationBoundedText,
  state: Schema.String,
  priority: Schema.optional(Schema.Number),
  claimId: Schema.optional(Schema.String),
  category: AutomationQueueCategory,
  nextAction: AutomationBoundedText,
  blockedBy: Schema.optional(Schema.Array(AutomationQueueBlocker)),
});
export type AutomationQueueItem = typeof AutomationQueueItem.Type;

export const AutomationRun = Schema.Struct({
  schemaVersion: Schema.Number,
  runId: Schema.String,
  ownerThreadId: Schema.String,
  sourceRevision: Schema.String,
  profileDigest: Schema.String,
  profileRevision: NonNegativeInt,
  profileRevisionStatus: Schema.Literals(["active", "pending_valid", "rejected"]),
  pendingProfileDigest: Schema.optional(Schema.String),
  rejectedProfileDigest: Schema.optional(Schema.String),
  profileDiagnostics: Schema.Array(AutomationBoundedText),
  trackerProjectSlug: Schema.String,
  leaseEpoch: NonNegativeInt,
  revision: NonNegativeInt,
  status: AutomationRootStatus,
  reconciliation: Schema.Literals(["complete", "required", "in_progress", "blocked"]),
  coordination: AutomationCoordination,
  queueCounts: AutomationQueueCounts,
  claimsTotal: NonNegativeInt,
  claims: Schema.Array(AutomationIssueClaim),
  queuePreview: Schema.Array(AutomationQueueItem),
  queuePreviewTruncated: Schema.Boolean,
  nextAction: AutomationBoundedText,
});
export type AutomationRun = typeof AutomationRun.Type;

export const AutomationRunInput = AutomationValidateInput;
export type AutomationRunInput = typeof AutomationRunInput.Type;

export const AutomationRunResult = Schema.Struct({ run: AutomationRun });
export type AutomationRunResult = typeof AutomationRunResult.Type;

export const AutomationSteerIssueInput = Schema.Struct({
  threadId: ThreadId,
  runId: TrimmedNonEmptyString,
  claimId: TrimmedNonEmptyString,
  input: TrimmedNonEmptyString,
});
export type AutomationSteerIssueInput = typeof AutomationSteerIssueInput.Type;

export const AutomationSteerIssueResult = Schema.Struct({
  run: AutomationRun,
  receipt: AutomationSteeringReceipt,
});
export type AutomationSteerIssueResult = typeof AutomationSteerIssueResult.Type;

export const AutomationLinearReadKind = Schema.Literals(["candidates", "terminal", "refresh"]);
export const AutomationLinearReadInput = Schema.Struct({
  threadId: ThreadId,
  profilePath: TrimmedNonEmptyString,
  kind: AutomationLinearReadKind,
  after: Schema.optional(Schema.String),
  first: Schema.optional(NonNegativeInt),
  issueIdentifier: Schema.optional(Schema.String),
});
export type AutomationLinearReadInput = typeof AutomationLinearReadInput.Type;

export const AutomationLinearReadResult = Schema.Struct({
  status: Schema.Literals(["ready", "skipped"]),
  issues: Schema.Array(AutomationIssue),
  hasNextPage: Schema.Boolean,
  endCursor: Schema.optional(Schema.String),
  nextAction: AutomationBoundedText,
});
export type AutomationLinearReadResult = typeof AutomationLinearReadResult.Type;

export const AutomationQueueReadInput = Schema.Struct({
  threadId: ThreadId,
  runId: TrimmedNonEmptyString,
  category: AutomationQueueCategory,
  offset: Schema.optional(NonNegativeInt),
  limit: Schema.optional(NonNegativeInt),
});
export type AutomationQueueReadInput = typeof AutomationQueueReadInput.Type;

export const AutomationQueueReadResult = Schema.Struct({
  category: AutomationQueueCategory,
  total: NonNegativeInt,
  items: Schema.Array(AutomationQueueItem),
  nextOffset: Schema.optional(NonNegativeInt),
});
export type AutomationQueueReadResult = typeof AutomationQueueReadResult.Type;

export const AutomationCancelInput = Schema.Struct({
  threadId: ThreadId,
  runId: TrimmedNonEmptyString,
});
export type AutomationCancelInput = typeof AutomationCancelInput.Type;

export const AutomationCancelIssueInput = Schema.Struct({
  threadId: ThreadId,
  runId: TrimmedNonEmptyString,
  claimId: TrimmedNonEmptyString,
});
export type AutomationCancelIssueInput = typeof AutomationCancelIssueInput.Type;

export const AutomationLifecycleInput = AutomationCancelInput;
export type AutomationLifecycleInput = typeof AutomationLifecycleInput.Type;

export const AutomationReconcileInput = Schema.Struct({
  threadId: ThreadId,
  runId: TrimmedNonEmptyString,
  profilePath: TrimmedNonEmptyString,
});
export type AutomationReconcileInput = typeof AutomationReconcileInput.Type;

export class AutomationValidateError extends Schema.TaggedErrorClass<AutomationValidateError>()(
  "AutomationValidateError",
  {
    message: TrimmedNonEmptyString,
    threadId: Schema.optional(ThreadId),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export class AutomationRunError extends Schema.TaggedErrorClass<AutomationRunError>()(
  "AutomationRunError",
  {
    message: TrimmedNonEmptyString,
    threadId: Schema.optional(ThreadId),
    cause: Schema.optional(Schema.Defect()),
  },
) {}
