import {
  AutomationLinearReadResult,
  type AutomationLinearReadInput,
  AutomationQueueReadResult,
  AutomationLifecycleInput,
  AutomationReconcileInput,
  type AutomationQueueReadInput,
  AutomationRunResult,
  type AutomationRunInput,
  type AutomationStartInput,
  AutomationSteerIssueResult,
  type AutomationSteerIssueInput,
  type AutomationCancelInput,
  type AutomationCancelIssueInput,
  AutomationValidateResult,
  type AutomationValidateInput,
  OrchestraQueryInput,
  OrchestraQueryResponse,
  type OrchestraQueryResult,
  OrchestraReplayEvent,
  OrchestraTaskReplay,
  ApprovalRequestId,
  DEFAULT_MODEL,
  EventId,
  ProviderDriverKind,
  ProviderItemId,
  type ProviderInstanceId,
  type ProviderApprovalDecision,
  type ProviderEvent,
  type ProviderInteractionMode,
  type ProviderRequestKind,
  type ProviderSession,
  type ProviderTurnStartResult,
  type ProviderUserInputAnswers,
  type NativeSubagentDetail,
  type NativeSubagentStatus,
  NATIVE_SUBAGENT_DETAIL_MAX_ITEMS,
  NATIVE_SUBAGENT_SUMMARY_MAX_CHARS,
  RuntimeMode,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import { normalizeModelSlug } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexRpc from "effect-codex-app-server/rpc";
import * as EffectCodexSchema from "effect-codex-app-server/schema";

import { buildCodexInitializeParams } from "./CodexProvider.ts";
import { expandHomePath } from "../../pathExpansion.ts";
import {
  CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
} from "../CodexDeveloperInstructions.ts";
const decodeV2TurnStartResponse = Schema.decodeUnknownEffect(EffectCodexSchema.V2TurnStartResponse);
const decodeAutomationValidateResponse = Schema.decodeUnknownEffect(AutomationValidateResult);
const decodeAutomationRunResponse = Schema.decodeUnknownEffect(AutomationRunResult);
const decodeAutomationSteerIssueResponse = Schema.decodeUnknownEffect(AutomationSteerIssueResult);
const decodeAutomationLinearReadResponse = Schema.decodeUnknownEffect(AutomationLinearReadResult);
const decodeAutomationQueueReadResponse = Schema.decodeUnknownEffect(AutomationQueueReadResult);
const decodeOrchestraQueryResponse = Schema.decodeUnknownEffect(OrchestraQueryResponse);
const OrchestraThreadReadEnvelope = Schema.Struct({
  orchestra: Schema.optional(OrchestraTaskReplay),
});
export const decodeOrchestraThreadReadEnvelope = Schema.decodeUnknownEffect(
  OrchestraThreadReadEnvelope,
);
const OrchestraProductHandshake = Schema.Struct({
  orchestraProduct: Schema.NullOr(
    Schema.Struct({
      manifestSha256: Schema.String,
      capabilities: Schema.Array(Schema.String),
    }),
  ),
});
const decodeOrchestraProductHandshake = Schema.decodeUnknownEffect(OrchestraProductHandshake);

const PROVIDER = ProviderDriverKind.make("codex");
export const CODEX_AUTOMATION_START_METHOD = "automation/start" as const;
export const CODEX_AUTOMATION_STEER_ISSUE_METHOD = "automation/steerIssue" as const;

export function codexAutomationStartParams(
  providerThreadId: string,
  input: Omit<AutomationStartInput, "threadId">,
) {
  return { ...input, threadId: providerThreadId };
}

export function codexAutomationSteerIssueParams(
  providerThreadId: string,
  input: Omit<AutomationSteerIssueInput, "threadId">,
) {
  return { ...input, threadId: providerThreadId };
}

const ANSI_ESCAPE_CHAR = String.fromCharCode(27);
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, "g");
const CODEX_STDERR_LOG_REGEX =
  /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s+(.*)$/;
const BENIGN_ERROR_LOG_SNIPPETS = [
  "state db missing rollout path for thread",
  "state db record_discrepancy: find_thread_path_by_id_str_in_subdir, falling_back",
];
const CODEX_APP_SERVER_FORCE_KILL_AFTER = "2 seconds" as const;
const MAX_CODEX_DIAGNOSTIC_CHARS = 4_096;
const RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS = [
  "not found",
  "missing thread",
  "no such thread",
  "unknown thread",
  "does not exist",
];

export function hasConfiguredMcpServer(appServerArgs: ReadonlyArray<string> | undefined): boolean {
  return appServerArgs?.some((argument) => argument.includes("mcp_servers.")) === true;
}

export const CodexResumeCursorSchema = Schema.Struct({
  threadId: Schema.String,
});
const CodexUserInputAnswerObject = Schema.Struct({
  answers: Schema.Array(Schema.String),
});
const isCodexResumeCursorSchema = Schema.is(CodexResumeCursorSchema);
const isCodexUserInputAnswerObject = Schema.is(CodexUserInputAnswerObject);

// TODO: Verify `packages/effect-codex-app-server/scripts/generate.ts` so the generated
// `V2TurnStartParams` schema includes `collaborationMode` directly.
const CodexTurnStartParamsWithCollaborationMode = EffectCodexSchema.V2TurnStartParams.pipe(
  Schema.fieldsAssign({
    collaborationMode: Schema.optionalKey(EffectCodexSchema.V2TurnStartParams__CollaborationMode),
  }),
);
const decodeCodexTurnStartParamsWithCollaborationMode = Schema.decodeUnknownEffect(
  CodexTurnStartParamsWithCollaborationMode,
);

export type CodexTurnStartParamsWithCollaborationMode =
  typeof CodexTurnStartParamsWithCollaborationMode.Type;

export type CodexResumeCursor = typeof CodexResumeCursorSchema.Type;
type CodexServiceTier = NonNullable<EffectCodexSchema.V2ThreadStartParams["serviceTier"]>;
type CodexThreadItem =
  | EffectCodexSchema.V2ThreadReadResponse["thread"]["turns"][number]["items"][number]
  | EffectCodexSchema.V2ThreadRollbackResponse["thread"]["turns"][number]["items"][number];
type CodexNativeThread = EffectCodexSchema.V2ThreadReadResponse["thread"];

export interface CodexSessionRuntimeOptions {
  readonly threadId: ThreadId;
  readonly providerInstanceId?: ProviderInstanceId;
  readonly binaryPath: string;
  readonly homePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly runtimeMode: RuntimeMode;
  readonly model?: string;
  readonly serviceTier?: CodexServiceTier | undefined;
  readonly resumeCursor?: CodexResumeCursor;
  readonly appServerArgs?: ReadonlyArray<string>;
  readonly expectedProductManifestSha256?: string;
}

export interface CodexSessionRuntimeSendTurnInput {
  readonly input?: string;
  readonly attachments?: ReadonlyArray<{
    readonly type: "image";
    readonly url: string;
  }>;
  readonly model?: string;
  readonly serviceTier?: CodexServiceTier | undefined;
  readonly effort?: EffectCodexSchema.V2TurnStartParams__ReasoningEffort | undefined;
  readonly interactionMode?: ProviderInteractionMode;
}

export interface CodexThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<CodexThreadItem>;
}

export interface CodexThreadSnapshot {
  readonly threadId: string;
  readonly turns: ReadonlyArray<CodexThreadTurnSnapshot>;
}

export interface CodexSessionRuntimeShape {
  readonly start: () => Effect.Effect<ProviderSession, CodexSessionRuntimeError>;
  readonly getSession: Effect.Effect<ProviderSession>;
  readonly sendTurn: (
    input: CodexSessionRuntimeSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, CodexSessionRuntimeError>;
  readonly interruptTurn: (turnId?: TurnId) => Effect.Effect<void, CodexSessionRuntimeError>;
  readonly readThread: Effect.Effect<CodexThreadSnapshot, CodexSessionRuntimeError>;
  readonly readNativeSubagent: (
    agentThreadId: string,
  ) => Effect.Effect<NativeSubagentDetail, CodexSessionRuntimeError>;
  readonly rollbackThread: (
    numTurns: number,
  ) => Effect.Effect<CodexThreadSnapshot, CodexSessionRuntimeError>;
  readonly validateAutomationProfile?: (
    input: Omit<AutomationValidateInput, "threadId">,
  ) => Effect.Effect<AutomationValidateResult, CodexSessionRuntimeError>;
  readonly runAutomationFixture?: (
    input: Omit<AutomationRunInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly startAutomation?: (
    input: Omit<AutomationStartInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly readLinearAutomation?: (
    input: Omit<AutomationLinearReadInput, "threadId">,
  ) => Effect.Effect<AutomationLinearReadResult, CodexSessionRuntimeError>;
  readonly readAutomationQueue?: (
    input: Omit<AutomationQueueReadInput, "threadId">,
  ) => Effect.Effect<AutomationQueueReadResult, CodexSessionRuntimeError>;
  readonly automationStatus?: (
    input: Omit<AutomationLifecycleInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly pauseAutomation?: (
    input: Omit<AutomationLifecycleInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly refreshAutomation?: (
    input: Omit<AutomationReconcileInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly resumeAutomation?: (
    input: Omit<AutomationReconcileInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly cancelAutomation?: (
    input: Omit<AutomationCancelInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly cancelAutomationIssue?: (
    input: Omit<AutomationCancelIssueInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, CodexSessionRuntimeError>;
  readonly steerAutomationIssue?: (
    input: Omit<AutomationSteerIssueInput, "threadId">,
  ) => Effect.Effect<AutomationSteerIssueResult, CodexSessionRuntimeError>;
  readonly queryOrchestra?: (
    input: Omit<OrchestraQueryInput, "threadId">,
  ) => Effect.Effect<OrchestraQueryResult, CodexSessionRuntimeError>;
  readonly respondToRequest: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void, CodexSessionRuntimeError>;
  readonly respondToUserInput: (
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void, CodexSessionRuntimeError>;
  readonly events: Stream.Stream<ProviderEvent, never>;
  readonly close: Effect.Effect<void>;
}

export type CodexSessionRuntimeError =
  | CodexErrors.CodexAppServerError
  | CodexSessionRuntimePendingApprovalNotFoundError
  | CodexSessionRuntimePendingUserInputNotFoundError
  | CodexSessionRuntimeInvalidUserInputAnswersError
  | CodexSessionRuntimeThreadIdMissingError
  | CodexSessionRuntimeSubagentRelationshipError
  | CodexSessionRuntimeProductMismatchError;

export class CodexSessionRuntimeProductMismatchError extends Schema.TaggedErrorClass<CodexSessionRuntimeProductMismatchError>()(
  "CodexSessionRuntimeProductMismatchError",
  {
    expectedManifestSha256: Schema.String,
    actualManifestSha256: Schema.optional(Schema.String),
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}

const REQUIRED_ORCHESTRA_PRODUCT_CAPABILITIES = [
  "orchestra/query",
  "orchestra/threadItem",
] as const;

export function validateOrchestraProductCompatibility(
  expectedManifestSha256: string,
  actual: {
    readonly manifestSha256: string;
    readonly capabilities: ReadonlyArray<string>;
  } | null,
): CodexSessionRuntimeProductMismatchError | undefined {
  const missingCapabilities = REQUIRED_ORCHESTRA_PRODUCT_CAPABILITIES.filter(
    (capability) => !actual?.capabilities.includes(capability),
  );
  if (actual?.manifestSha256 === expectedManifestSha256 && missingCapabilities.length === 0) {
    return undefined;
  }
  return new CodexSessionRuntimeProductMismatchError({
    expectedManifestSha256,
    ...(actual?.manifestSha256 ? { actualManifestSha256: actual.manifestSha256 } : {}),
    detail: actual
      ? `Orchestra Product mismatch. Missing capabilities: ${missingCapabilities.join(", ") || "none"}.`
      : "The selected Codex binary does not expose the Orchestra Product manifest.",
  });
}

export class CodexSessionRuntimePendingApprovalNotFoundError extends Schema.TaggedErrorClass<CodexSessionRuntimePendingApprovalNotFoundError>()(
  "CodexSessionRuntimePendingApprovalNotFoundError",
  {
    requestId: Schema.String,
  },
) {
  override get message(): string {
    return `Unknown pending Codex approval request: ${this.requestId}`;
  }
}

export class CodexSessionRuntimePendingUserInputNotFoundError extends Schema.TaggedErrorClass<CodexSessionRuntimePendingUserInputNotFoundError>()(
  "CodexSessionRuntimePendingUserInputNotFoundError",
  {
    requestId: Schema.String,
  },
) {
  override get message(): string {
    return `Unknown pending Codex user input request: ${this.requestId}`;
  }
}

export class CodexSessionRuntimeInvalidUserInputAnswersError extends Schema.TaggedErrorClass<CodexSessionRuntimeInvalidUserInputAnswersError>()(
  "CodexSessionRuntimeInvalidUserInputAnswersError",
  {
    questionId: Schema.String,
  },
) {
  override get message(): string {
    return `Invalid Codex user input answers for question '${this.questionId}'`;
  }
}

export class CodexSessionRuntimeThreadIdMissingError extends Schema.TaggedErrorClass<CodexSessionRuntimeThreadIdMissingError>()(
  "CodexSessionRuntimeThreadIdMissingError",
  {
    threadId: Schema.String,
  },
) {
  override get message(): string {
    return `Codex session is missing a provider thread id for ${this.threadId}`;
  }
}

export class CodexSessionRuntimeSubagentRelationshipError extends Schema.TaggedErrorClass<CodexSessionRuntimeSubagentRelationshipError>()(
  "CodexSessionRuntimeSubagentRelationshipError",
  {
    parentThreadId: Schema.String,
    agentThreadId: Schema.String,
  },
) {
  override get message(): string {
    return `Codex thread '${this.agentThreadId}' is not a direct child of '${this.parentThreadId}'`;
  }
}

interface PendingApproval {
  readonly requestId: ApprovalRequestId;
  readonly jsonRpcId: string;
  readonly requestKind: ProviderRequestKind;
  readonly turnId: TurnId | undefined;
  readonly itemId: ProviderItemId | undefined;
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
}

interface ApprovalCorrelation {
  readonly requestId: ApprovalRequestId;
  readonly requestKind: ProviderRequestKind;
  readonly turnId: TurnId | undefined;
  readonly itemId: ProviderItemId | undefined;
}

interface PendingUserInput {
  readonly requestId: ApprovalRequestId;
  readonly turnId: TurnId | undefined;
  readonly itemId: ProviderItemId | undefined;
  readonly answers: Deferred.Deferred<ProviderUserInputAnswers>;
}

type CodexServerNotification = {
  readonly [M in CodexRpc.ServerNotificationMethod]: {
    readonly method: M;
    readonly params: CodexRpc.ServerNotificationParamsByMethod[M];
  };
}[CodexRpc.ServerNotificationMethod];

function makeCodexServerNotification<M extends CodexRpc.ServerNotificationMethod>(
  method: M,
  params: CodexRpc.ServerNotificationParamsByMethod[M],
): CodexServerNotification {
  return { method, params } as CodexServerNotification;
}

function normalizeCodexModelSlug(
  model: string | undefined | null,
  preferredId?: string,
): string | undefined {
  const normalized = normalizeModelSlug(model);
  if (!normalized) {
    return undefined;
  }
  if (preferredId?.endsWith("-codex") && preferredId !== normalized) {
    return preferredId;
  }
  return normalized;
}

function readResumeCursorThreadId(
  resumeCursor: ProviderSession["resumeCursor"],
): string | undefined {
  return isCodexResumeCursorSchema(resumeCursor) ? resumeCursor.threadId : undefined;
}

function runtimeModeToThreadConfig(input: RuntimeMode): {
  readonly approvalPolicy: EffectCodexSchema.V2ThreadStartParams__AskForApproval;
  readonly sandbox: EffectCodexSchema.V2ThreadStartParams__SandboxMode;
} {
  switch (input) {
    case "approval-required":
      return {
        approvalPolicy: "untrusted",
        sandbox: "read-only",
      };
    case "auto-accept-edits":
      return {
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
      };
    case "full-access":
    default:
      return {
        approvalPolicy: "never",
        sandbox: "danger-full-access",
      };
  }
}

function buildThreadStartParams(input: {
  readonly cwd: string;
  readonly runtimeMode: RuntimeMode;
  readonly model: string | undefined;
  readonly serviceTier: CodexServiceTier | undefined;
}): EffectCodexSchema.V2ThreadStartParams {
  const config = runtimeModeToThreadConfig(input.runtimeMode);
  return {
    cwd: input.cwd,
    approvalPolicy: config.approvalPolicy,
    sandbox: config.sandbox,
    ...(input.model ? { model: input.model } : {}),
    ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
  };
}

function runtimeModeToTurnSandboxPolicy(
  input: RuntimeMode,
): EffectCodexSchema.V2TurnStartParams__SandboxPolicy {
  switch (input) {
    case "approval-required":
      return {
        type: "readOnly",
      };
    case "auto-accept-edits":
      return {
        type: "workspaceWrite",
      };
    case "full-access":
    default:
      return {
        type: "dangerFullAccess",
      };
  }
}

function buildCodexCollaborationMode(input: {
  readonly interactionMode?: ProviderInteractionMode;
  readonly model?: string;
  readonly effort?: EffectCodexSchema.V2TurnStartParams__ReasoningEffort;
}): EffectCodexSchema.V2TurnStartParams__CollaborationMode | undefined {
  if (input.interactionMode === undefined) {
    return undefined;
  }
  const model = normalizeCodexModelSlug(input.model) ?? DEFAULT_MODEL;
  return {
    mode: input.interactionMode,
    settings: {
      model,
      reasoning_effort: input.effort ?? "medium",
      developer_instructions:
        input.interactionMode === "plan"
          ? CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS
          : CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    },
  };
}

export function buildTurnStartParams(input: {
  readonly threadId: string;
  readonly runtimeMode: RuntimeMode;
  readonly prompt?: string;
  readonly attachments?: ReadonlyArray<{
    readonly type: "image";
    readonly url: string;
  }>;
  readonly model?: string;
  readonly serviceTier?: CodexServiceTier;
  readonly effort?: EffectCodexSchema.V2TurnStartParams__ReasoningEffort;
  readonly interactionMode?: ProviderInteractionMode;
}): Effect.Effect<
  CodexTurnStartParamsWithCollaborationMode,
  CodexErrors.CodexAppServerProtocolParseError
> {
  const turnInput: Array<EffectCodexSchema.V2TurnStartParams__UserInput> = [];
  if (input.prompt) {
    turnInput.push({
      type: "text",
      text: input.prompt,
    });
  }
  for (const attachment of input.attachments ?? []) {
    turnInput.push(attachment);
  }

  const config = runtimeModeToThreadConfig(input.runtimeMode);
  const collaborationMode = buildCodexCollaborationMode({
    ...(input.interactionMode ? { interactionMode: input.interactionMode } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
  });

  return decodeCodexTurnStartParamsWithCollaborationMode({
    threadId: input.threadId,
    input: turnInput,
    approvalPolicy: config.approvalPolicy,
    sandboxPolicy: runtimeModeToTurnSandboxPolicy(input.runtimeMode),
    ...(input.model ? { model: input.model } : {}),
    ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
    ...(collaborationMode ? { collaborationMode } : {}),
  }).pipe(
    Effect.mapError((cause) =>
      CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
        "decode-request-payload",
        cause,
        { method: "turn/start" },
      ),
    ),
  );
}

export function redactCodexDiagnostic(rawDiagnostic: string): string {
  const redacted = rawDiagnostic
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/giu, "$1[REDACTED]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      "$1[REDACTED]",
    );
  if (redacted.length <= MAX_CODEX_DIAGNOSTIC_CHARS) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_CODEX_DIAGNOSTIC_CHARS - 1)}…`;
}

function classifyCodexStderrLine(rawLine: string): { readonly message: string } | null {
  const line = rawLine.replaceAll(ANSI_ESCAPE_REGEX, "").trim();
  if (!line) {
    return null;
  }

  const match = line.match(CODEX_STDERR_LOG_REGEX);
  if (match) {
    const level = match[1];
    if (level && level !== "ERROR") {
      return null;
    }
    if (BENIGN_ERROR_LOG_SNIPPETS.some((snippet) => line.includes(snippet))) {
      return null;
    }
  }

  return { message: redactCodexDiagnostic(line) };
}

export function isRecoverableThreadResumeError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (!message.includes("thread")) {
    return false;
  }
  return RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS.some((snippet) => message.includes(snippet));
}

type CodexThreadOpenResponse =
  | CodexRpc.ClientRequestResponsesByMethod["thread/start"]
  | CodexRpc.ClientRequestResponsesByMethod["thread/resume"];

type CodexThreadOpenMethod = "thread/start" | "thread/resume";

interface CodexThreadOpenClient {
  readonly request: <M extends CodexThreadOpenMethod>(
    method: M,
    payload: CodexRpc.ClientRequestParamsByMethod[M],
  ) => Effect.Effect<CodexRpc.ClientRequestResponsesByMethod[M], CodexErrors.CodexAppServerError>;
}

export const openCodexThread = (input: {
  readonly client: CodexThreadOpenClient;
  readonly threadId: ThreadId;
  readonly runtimeMode: RuntimeMode;
  readonly cwd: string;
  readonly requestedModel: string | undefined;
  readonly serviceTier: CodexServiceTier | undefined;
  readonly resumeThreadId: string | undefined;
}): Effect.Effect<CodexThreadOpenResponse, CodexErrors.CodexAppServerError> => {
  const resumeThreadId = input.resumeThreadId;
  const startParams = buildThreadStartParams({
    cwd: input.cwd,
    runtimeMode: input.runtimeMode,
    model: input.requestedModel,
    serviceTier: input.serviceTier,
  });

  if (resumeThreadId === undefined) {
    return input.client.request("thread/start", startParams);
  }

  return input.client
    .request("thread/resume", {
      threadId: resumeThreadId,
      ...startParams,
    })
    .pipe(
      Effect.catchIf(isRecoverableThreadResumeError, (error) =>
        Effect.logWarning("codex app-server thread resume fell back to fresh start", {
          threadId: input.threadId,
          requestedRuntimeMode: input.runtimeMode,
          resumeThreadId,
          recoverable: true,
          cause: error,
        }).pipe(Effect.andThen(input.client.request("thread/start", startParams))),
      ),
    );
};

function readNotificationThreadId(notification: CodexServerNotification): string | undefined {
  switch (notification.method) {
    case "thread/started":
      return notification.params.thread.id;
    case "error":
    case "thread/status/changed":
    case "thread/archived":
    case "thread/unarchived":
    case "thread/closed":
    case "thread/name/updated":
    case "thread/tokenUsage/updated":
    case "turn/started":
    case "hook/started":
    case "turn/completed":
    case "hook/completed":
    case "turn/diff/updated":
    case "turn/plan/updated":
    case "item/started":
    case "item/autoApprovalReview/started":
    case "item/autoApprovalReview/completed":
    case "item/completed":
    case "rawResponseItem/completed":
    case "item/agentMessage/delta":
    case "item/plan/delta":
    case "item/commandExecution/outputDelta":
    case "item/commandExecution/terminalInteraction":
    case "item/fileChange/outputDelta":
    case "item/fileChange/patchUpdated":
    case "serverRequest/resolved":
    case "item/mcpToolCall/progress":
    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/summaryPartAdded":
    case "item/reasoning/textDelta":
    case "thread/compacted":
    case "thread/realtime/started":
    case "thread/realtime/itemAdded":
    case "thread/realtime/transcript/delta":
    case "thread/realtime/transcript/done":
    case "thread/realtime/outputAudio/delta":
    case "thread/realtime/sdp":
    case "thread/realtime/error":
    case "thread/realtime/closed":
      return notification.params.threadId;
    default:
      return undefined;
  }
}

function readRouteFields(notification: CodexServerNotification): {
  readonly turnId: TurnId | undefined;
  readonly itemId: ProviderItemId | undefined;
} {
  switch (notification.method) {
    case "thread/started":
      return {
        turnId: undefined,
        itemId: undefined,
      };
    case "turn/started":
    case "turn/completed":
      return {
        turnId: TurnId.make(notification.params.turn.id),
        itemId: undefined,
      };
    case "error":
      return {
        turnId: TurnId.make(notification.params.turnId),
        itemId: undefined,
      };
    case "turn/diff/updated":
    case "turn/plan/updated":
      return {
        turnId: TurnId.make(notification.params.turnId),
        itemId: undefined,
      };
    case "serverRequest/resolved":
      return {
        turnId: undefined,
        itemId: undefined,
      };
    case "item/started":
    case "item/completed":
      return {
        turnId: TurnId.make(notification.params.turnId),
        itemId: ProviderItemId.make(notification.params.item.id),
      };
    case "item/agentMessage/delta":
    case "item/plan/delta":
    case "item/commandExecution/outputDelta":
    case "item/commandExecution/terminalInteraction":
    case "item/fileChange/outputDelta":
    case "item/fileChange/patchUpdated":
    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/summaryPartAdded":
    case "item/reasoning/textDelta":
      return {
        turnId: TurnId.make(notification.params.turnId),
        itemId: ProviderItemId.make(notification.params.itemId),
      };
    default:
      return {
        turnId: undefined,
        itemId: undefined,
      };
  }
}

function rememberCollabReceiverTurns(
  collabReceiverTurns: Map<string, TurnId>,
  notification: CodexServerNotification,
  parentTurnId: TurnId | undefined,
): void {
  if (!parentTurnId) {
    return;
  }

  if (notification.method !== "item/started" && notification.method !== "item/completed") {
    return;
  }

  if (notification.params.item.type !== "collabAgentToolCall") {
    return;
  }

  for (const receiverThreadId of notification.params.item.receiverThreadIds) {
    collabReceiverTurns.set(receiverThreadId, parentTurnId);
  }
}

function shouldSuppressChildConversationNotification(
  method: CodexRpc.ServerNotificationMethod,
): boolean {
  return (
    method === "thread/started" ||
    method === "thread/status/changed" ||
    method === "thread/archived" ||
    method === "thread/unarchived" ||
    method === "thread/closed" ||
    method === "thread/compacted" ||
    method === "thread/name/updated" ||
    method === "thread/tokenUsage/updated" ||
    method === "turn/started" ||
    method === "turn/completed" ||
    method === "turn/plan/updated" ||
    method === "item/plan/delta"
  );
}

function toCodexUserInputAnswer(
  questionId: string,
  value: ProviderUserInputAnswers[string],
): Effect.Effect<
  EffectCodexSchema.ToolRequestUserInputResponse__ToolRequestUserInputAnswer,
  CodexSessionRuntimeInvalidUserInputAnswersError
> {
  if (typeof value === "string") {
    return Effect.succeed({ answers: [value] });
  }
  if (Array.isArray(value)) {
    const answers = value.filter((entry): entry is string => typeof entry === "string");
    return Effect.succeed({ answers });
  }
  if (isCodexUserInputAnswerObject(value)) {
    return Effect.succeed({ answers: value.answers });
  }
  return Effect.fail(new CodexSessionRuntimeInvalidUserInputAnswersError({ questionId }));
}

function toCodexUserInputAnswers(
  answers: ProviderUserInputAnswers,
): Effect.Effect<
  EffectCodexSchema.ToolRequestUserInputResponse["answers"],
  CodexSessionRuntimeInvalidUserInputAnswersError
> {
  return Effect.forEach(
    Object.entries(answers),
    ([questionId, value]) =>
      toCodexUserInputAnswer(questionId, value).pipe(
        Effect.map((answer) => [questionId, answer] as const),
      ),
    { concurrency: 1 },
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));
}

function currentProviderThreadId(session: ProviderSession): string | undefined {
  return readResumeCursorThreadId(session.resumeCursor);
}

function updateSession(
  sessionRef: Ref.Ref<ProviderSession>,
  updates: Partial<ProviderSession>,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    yield* Ref.update(sessionRef, (session) => ({
      ...session,
      ...updates,
      updatedAt,
    }));
  });
}

function parseThreadSnapshot(
  response: EffectCodexSchema.V2ThreadReadResponse | EffectCodexSchema.V2ThreadRollbackResponse,
): CodexThreadSnapshot {
  return {
    threadId: response.thread.id,
    turns: response.thread.turns.map((turn) => ({
      id: TurnId.make(turn.id),
      items: turn.items,
    })),
  };
}

function boundedNativeSubagentText(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, " ") || fallback;
  return normalized.length <= NATIVE_SUBAGENT_SUMMARY_MAX_CHARS
    ? normalized
    : `${normalized.slice(0, NATIVE_SUBAGENT_SUMMARY_MAX_CHARS - 1)}…`;
}

function nativeSubagentItemSummary(item: CodexThreadItem): string {
  switch (item.type) {
    case "userMessage": {
      const text = item.content.flatMap((content) =>
        content.type === "text" ? [content.text] : [],
      );
      return boundedNativeSubagentText(text.join(" "), "User message");
    }
    case "agentMessage":
    case "plan":
      return boundedNativeSubagentText(item.text, item.type === "plan" ? "Plan" : "Agent message");
    case "reasoning":
      return boundedNativeSubagentText(
        item.summary?.join(" ") ?? item.content?.join(" ") ?? "",
        "Reasoning",
      );
    case "commandExecution":
      return boundedNativeSubagentText(item.command, "Command execution");
    case "fileChange":
      return `${item.changes.length} file change${item.changes.length === 1 ? "" : "s"}`;
    case "mcpToolCall":
      return boundedNativeSubagentText(`${item.server} · ${item.tool}`, "MCP tool call");
    case "dynamicToolCall":
      return boundedNativeSubagentText(item.tool, "Tool call");
    case "collabAgentToolCall":
      return boundedNativeSubagentText(item.prompt ?? item.tool, "Agent collaboration");
    case "subAgentActivity":
      return boundedNativeSubagentText(`${item.agentPath} · ${item.kind}`, "Subagent activity");
    case "imageView":
      return boundedNativeSubagentText(item.path, "Image view");
    case "enteredReviewMode":
    case "exitedReviewMode":
      return boundedNativeSubagentText(item.review, "Review mode");
    default:
      return boundedNativeSubagentText(item.type, "Activity");
  }
}

function nativeSubagentStatus(thread: CodexNativeThread): NativeSubagentStatus {
  switch (thread.status.type) {
    case "active":
      return thread.status.activeFlags.length > 0 ? "waiting" : "running";
    case "systemError":
      return "failed";
    case "notLoaded":
      return "unavailable";
    case "idle": {
      const lastTurn = thread.turns.at(-1);
      if (!lastTurn) return "waiting";
      switch (lastTurn.status) {
        case "inProgress":
          return "running";
        case "failed":
          return "failed";
        case "interrupted":
          return "cancelled";
        case "completed":
          return "completed";
      }
    }
  }
}

export function isDirectNativeSubagent(
  parentProviderThreadId: string,
  thread: Pick<CodexNativeThread, "parentThreadId">,
): boolean {
  return thread.parentThreadId === parentProviderThreadId;
}

export function projectNativeSubagentDetail(
  parentTaskId: ThreadId,
  thread: CodexNativeThread,
): NativeSubagentDetail {
  const allItems = thread.turns.flatMap((turn) => turn.items);
  const visibleItems = allItems.slice(-NATIVE_SUBAGENT_DETAIL_MAX_ITEMS);
  return {
    parentTaskId,
    agentThreadId: thread.id,
    status: nativeSubagentStatus(thread),
    nickname: thread.agentNickname
      ? boundedNativeSubagentText(thread.agentNickname, "Subagent")
      : null,
    role: thread.agentRole ? boundedNativeSubagentText(thread.agentRole, "Subagent") : null,
    preview: boundedNativeSubagentText(thread.preview || thread.name || "", "Native subagent"),
    updatedAt: DateTime.formatIso(DateTime.makeUnsafe(thread.updatedAt * 1_000)),
    items: visibleItems.map((item) => ({
      id: item.id,
      type: item.type,
      summary: nativeSubagentItemSummary(item),
      ...(typeof ("status" in item ? item.status : undefined) === "string"
        ? { status: String("status" in item ? item.status : "") }
        : {}),
    })),
    truncated: allItems.length > visibleItems.length,
  };
}

export const makeCodexSessionRuntime = (
  options: CodexSessionRuntimeOptions,
): Effect.Effect<
  CodexSessionRuntimeShape,
  CodexErrors.CodexAppServerError,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtimeScope = yield* Scope.Scope;
    const crypto = yield* Crypto.Crypto;
    const events = yield* Queue.unbounded<ProviderEvent>();
    const pendingApprovalsRef = yield* Ref.make(new Map<ApprovalRequestId, PendingApproval>());
    const approvalCorrelationsRef = yield* Ref.make(new Map<string, ApprovalCorrelation>());
    const pendingUserInputsRef = yield* Ref.make(new Map<ApprovalRequestId, PendingUserInput>());
    const collabReceiverTurnsRef = yield* Ref.make(new Map<string, TurnId>());
    const seenOrchestraEventsRef = yield* Ref.make(new Set<string>());
    const settledTurnIdsRef = yield* Ref.make(new Set<string>());
    const closedRef = yield* Ref.make(false);

    // `~` is not shell-expanded when env vars are set via
    // `child_process.spawn`; `expandHomePath` lets a configured
    // `CODEX_HOME=~/.codex_work` reach codex as an absolute path.
    const resolvedHomePath = options.homePath ? expandHomePath(options.homePath) : undefined;
    const env = {
      ...options.environment,
      ...(resolvedHomePath ? { CODEX_HOME: resolvedHomePath } : {}),
    };
    const extendEnv = options.environment === undefined;
    const spawnCommand = yield* resolveSpawnCommand(
      options.binaryPath,
      ["app-server", ...(options.appServerArgs ?? [])],
      { env, extendEnv },
    );
    const child = yield* spawner
      .spawn(
        ChildProcess.make(spawnCommand.command, spawnCommand.args, {
          cwd: options.cwd,
          env,
          extendEnv,
          forceKillAfter: CODEX_APP_SERVER_FORCE_KILL_AFTER,
          shell: spawnCommand.shell,
        }),
      )
      .pipe(
        Effect.provideService(Scope.Scope, runtimeScope),
        Effect.mapError(
          (cause) =>
            new CodexErrors.CodexAppServerSpawnError({
              command: `${options.binaryPath} app-server`,
              cause,
            }),
        ),
      );

    const clientContext = yield* CodexClient.layerChildProcess(child).pipe(
      Layer.build,
      Effect.provideService(Scope.Scope, runtimeScope),
    );
    const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
      Effect.provide(clientContext),
    );
    const serverNotifications = yield* Queue.unbounded<CodexServerNotification>();
    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
    const randomUUIDv4 = (purpose: CodexErrors.CodexAppServerIdentifierPurpose) =>
      crypto.randomUUIDv4.pipe(
        Effect.mapError(
          (cause) =>
            new CodexErrors.CodexAppServerIdentifierGenerationError({
              purpose,
              cause,
            }),
        ),
      );

    const sessionCreatedAt = yield* nowIso;
    const initialSession = {
      provider: PROVIDER,
      ...(options.providerInstanceId ? { providerInstanceId: options.providerInstanceId } : {}),
      status: "connecting",
      runtimeMode: options.runtimeMode,
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
      threadId: options.threadId,
      ...(options.resumeCursor !== undefined ? { resumeCursor: options.resumeCursor } : {}),
      createdAt: sessionCreatedAt,
      updatedAt: sessionCreatedAt,
    } satisfies ProviderSession;
    const sessionRef = yield* Ref.make<ProviderSession>(initialSession);
    const offerEvent = (event: ProviderEvent) => Queue.offer(events, event).pipe(Effect.asVoid);

    const emitEvent = (event: Omit<ProviderEvent, "id" | "provider" | "createdAt">) =>
      Effect.gen(function* () {
        const id = yield* randomUUIDv4("provider-event");
        return yield* offerEvent({
          id: EventId.make(id),
          provider: PROVIDER,
          ...(options.providerInstanceId ? { providerInstanceId: options.providerInstanceId } : {}),
          createdAt: yield* nowIso,
          ...event,
        });
      });
    const emitSessionEvent = (method: string, message: string) =>
      emitEvent({
        kind: "session",
        threadId: options.threadId,
        method,
        message,
      });

    const readOrchestraReplay = (providerThreadId: string) =>
      Effect.gen(function* () {
        const raw = yield* client.raw.request("thread/read", {
          threadId: providerThreadId,
          includeTurns: false,
        });
        const envelope = yield* decodeOrchestraThreadReadEnvelope(raw).pipe(
          Effect.mapError((error) =>
            CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
              "decode-response-payload",
              error,
              { method: "thread/read" },
            ),
          ),
        );
        return envelope.orchestra;
      });

    const emitOrchestraLifecycle = (event: OrchestraReplayEvent) =>
      Ref.modify(seenOrchestraEventsRef, (seen) => {
        if (seen.has(event.eventId)) {
          return [false, seen] as const;
        }
        const next = new Set(seen);
        next.add(event.eventId);
        return [true, next] as const;
      }).pipe(
        Effect.flatMap((isNew) =>
          isNew
            ? offerEvent({
                id: EventId.make(`orchestra:${event.eventId}`),
                provider: PROVIDER,
                ...(options.providerInstanceId
                  ? { providerInstanceId: options.providerInstanceId }
                  : {}),
                createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
                kind: "notification",
                threadId: options.threadId,
                method: "orchestra/lifecycle",
                payload: event,
              })
            : Effect.void,
        ),
      );

    const refreshOrchestraLifecycle = (providerThreadId: string) =>
      readOrchestraReplay(providerThreadId).pipe(
        Effect.flatMap((replay) =>
          replay
            ? Effect.forEach(
                replay.events.length > 0 ? replay.events : [replay.latest],
                emitOrchestraLifecycle,
                { concurrency: 1, discard: true },
              )
            : Effect.void,
        ),
      );

    const claimTurnSettlement = (turnId: TurnId) =>
      Ref.modify(settledTurnIdsRef, (settled) => {
        if (settled.has(turnId)) {
          return [false, settled] as const;
        }
        const next = new Set(settled);
        next.add(turnId);
        return [true, next] as const;
      });

    const refreshOrchestraLifecycleAfterSettlement = (providerThreadId: string) =>
      refreshOrchestraLifecycle(providerThreadId).pipe(
        Effect.catch((cause) =>
          emitEvent({
            kind: "notification",
            threadId: options.threadId,
            method: "process/stderr",
            message: `Failed to refresh Orchestra lifecycle: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
        ),
        // Notification callbacks run on the protocol's serialized incoming
        // dispatcher. Fork the follow-up request so its response can be routed
        // after the current notification handler returns.
        Effect.forkIn(runtimeScope),
        Effect.asVoid,
      );

    const settlePendingApprovals = (decision: ProviderApprovalDecision) =>
      Ref.get(pendingApprovalsRef).pipe(
        Effect.flatMap((pendingApprovals) =>
          Effect.forEach(
            Array.from(pendingApprovals.values()),
            (pendingApproval) =>
              Deferred.succeed(pendingApproval.decision, decision).pipe(Effect.ignore),
            { discard: true },
          ),
        ),
      );

    const settlePendingUserInputs = (answers: ProviderUserInputAnswers) =>
      Ref.get(pendingUserInputsRef).pipe(
        Effect.flatMap((pendingUserInputs) =>
          Effect.forEach(
            Array.from(pendingUserInputs.values()),
            (pendingUserInput) =>
              Deferred.succeed(pendingUserInput.answers, answers).pipe(Effect.ignore),
            { discard: true },
          ),
        ),
      );

    const handleRawNotification = (notification: CodexServerNotification) =>
      Effect.gen(function* () {
        if (notification.method === "turn/completed") {
          const isFirstSettlement = yield* claimTurnSettlement(
            TurnId.make(notification.params.turn.id),
          );
          if (!isFirstSettlement) {
            return;
          }
        }
        const payload = notification.params;
        const route = readRouteFields(notification);
        const collabReceiverTurns = yield* Ref.get(collabReceiverTurnsRef);
        const childParentTurnId = (() => {
          const providerConversationId = readNotificationThreadId(notification);
          return providerConversationId
            ? collabReceiverTurns.get(providerConversationId)
            : undefined;
        })();

        rememberCollabReceiverTurns(collabReceiverTurns, notification, route.turnId);
        if (childParentTurnId && shouldSuppressChildConversationNotification(notification.method)) {
          yield* Ref.set(collabReceiverTurnsRef, collabReceiverTurns);
          return;
        }

        let requestId: ApprovalRequestId | undefined;
        let requestKind: ProviderRequestKind | undefined;
        let turnId = childParentTurnId ?? route.turnId;
        let itemId = route.itemId;

        if (notification.method === "serverRequest/resolved") {
          const rawRequestId =
            typeof notification.params.requestId === "string"
              ? notification.params.requestId
              : String(notification.params.requestId);
          const correlation = rawRequestId
            ? (yield* Ref.get(approvalCorrelationsRef)).get(rawRequestId)
            : undefined;
          if (correlation) {
            requestId = correlation.requestId;
            requestKind = correlation.requestKind;
            turnId = correlation.turnId ?? turnId;
            itemId = correlation.itemId ?? itemId;
            yield* Ref.update(approvalCorrelationsRef, (current) => {
              const next = new Map(current);
              next.delete(rawRequestId);
              return next;
            });
          }
        }

        yield* Ref.set(collabReceiverTurnsRef, collabReceiverTurns);
        yield* emitEvent({
          kind: "notification",
          threadId: options.threadId,
          method: notification.method,
          ...(turnId ? { turnId } : {}),
          ...(itemId ? { itemId } : {}),
          ...(requestId ? { requestId } : {}),
          ...(requestKind ? { requestKind } : {}),
          ...(notification.method === "item/agentMessage/delta"
            ? { textDelta: notification.params.delta }
            : {}),
          ...(payload !== undefined ? { payload } : {}),
        });
      });

    const currentSessionProviderThreadId = Effect.map(Ref.get(sessionRef), currentProviderThreadId);

    yield* client.handleServerNotification("thread/started", (payload) =>
      currentSessionProviderThreadId.pipe(
        Effect.flatMap((providerThreadId) => {
          if (providerThreadId && payload.thread.id !== providerThreadId) {
            return Effect.void;
          }
          return updateSession(sessionRef, {
            resumeCursor: { threadId: payload.thread.id },
          });
        }),
      ),
    );

    yield* client.handleServerNotification("turn/started", (payload) =>
      currentSessionProviderThreadId.pipe(
        Effect.flatMap((providerThreadId) => {
          if (providerThreadId && payload.threadId !== providerThreadId) {
            return Effect.void;
          }
          return updateSession(sessionRef, {
            status: "running",
            activeTurnId: TurnId.make(payload.turn.id),
          });
        }),
      ),
    );

    yield* client.handleServerNotification("turn/completed", (payload) =>
      currentSessionProviderThreadId.pipe(
        Effect.flatMap((providerThreadId) => {
          if (providerThreadId && payload.threadId !== providerThreadId) {
            return Effect.void;
          }
          const lastError =
            payload.turn.status === "failed" && "error" in payload.turn && payload.turn.error
              ? payload.turn.error.message
              : undefined;
          return updateSession(sessionRef, {
            status: payload.turn.status === "failed" ? "error" : "ready",
            activeTurnId: undefined,
            ...(lastError ? { lastError } : {}),
          }).pipe(Effect.andThen(refreshOrchestraLifecycleAfterSettlement(payload.threadId)));
        }),
      ),
    );

    // The pinned Orchestra Product currently reports the native thread's
    // authoritative idle transition without a separate turn/completed frame.
    // Settle that Product turn at the existing Codex provider seam so the retained shell's
    // normal task timeline cannot remain stuck in "running". Stock Codex is
    // unchanged, and an eventual native turn/completed frame is deduplicated.
    if (options.expectedProductManifestSha256) {
      yield* client.handleServerNotification("thread/status/changed", (payload) =>
        Effect.gen(function* () {
          if (payload.status.type !== "idle") {
            return;
          }
          const session = yield* Ref.get(sessionRef);
          const providerThreadId = currentProviderThreadId(session);
          if (providerThreadId && payload.threadId !== providerThreadId) {
            return;
          }
          const activeTurnId = session.activeTurnId;
          if (!activeTurnId || !(yield* claimTurnSettlement(activeTurnId))) {
            return;
          }
          const failed = session.status === "error";
          yield* updateSession(sessionRef, {
            status: failed ? "error" : "ready",
            activeTurnId: undefined,
          });
          yield* emitEvent({
            kind: "notification",
            threadId: options.threadId,
            method: "turn/completed",
            turnId: activeTurnId,
            payload: {
              threadId: payload.threadId,
              turn: {
                id: activeTurnId,
                items: [],
                status: failed ? "failed" : "completed",
                ...(failed ? { error: { message: session.lastError ?? "Codex turn failed" } } : {}),
              },
            } satisfies EffectCodexSchema.V2TurnCompletedNotification,
          });
          yield* refreshOrchestraLifecycleAfterSettlement(payload.threadId);
        }),
      );
    }

    yield* client.handleServerNotification("error", (payload) =>
      currentSessionProviderThreadId.pipe(
        Effect.flatMap((providerThreadId) => {
          const payloadThreadId = payload.threadId;
          if (providerThreadId && payloadThreadId && payloadThreadId !== providerThreadId) {
            return Effect.void;
          }
          const errorMessage = payload.error.message;
          const willRetry = payload.willRetry;
          return updateSession(sessionRef, {
            status: willRetry ? "running" : "error",
            ...(errorMessage ? { lastError: errorMessage } : {}),
          });
        }),
      ),
    );

    yield* client.handleServerRequest("item/commandExecution/requestApproval", (payload) =>
      Effect.gen(function* () {
        const requestId = ApprovalRequestId.make(yield* randomUUIDv4("command-approval-request"));
        const turnId = TurnId.make(payload.turnId);
        const itemId = ProviderItemId.make(payload.itemId);
        const decision = yield* Deferred.make<ProviderApprovalDecision>();

        yield* Ref.update(pendingApprovalsRef, (current) => {
          const next = new Map(current);
          next.set(requestId, {
            requestId,
            jsonRpcId: payload.approvalId ?? payload.itemId,
            requestKind: "command",
            turnId,
            itemId,
            decision,
          });
          return next;
        });
        yield* Ref.update(approvalCorrelationsRef, (current) => {
          const next = new Map(current);
          next.set(payload.approvalId ?? payload.itemId, {
            requestId,
            requestKind: "command",
            turnId,
            itemId,
          });
          return next;
        });

        yield* emitEvent({
          kind: "request",
          threadId: options.threadId,
          method: "item/commandExecution/requestApproval",
          requestId,
          requestKind: "command",
          ...(turnId ? { turnId } : {}),
          ...(itemId ? { itemId } : {}),
          payload,
        });

        const resolved = yield* Deferred.await(decision).pipe(
          Effect.ensuring(
            Ref.update(pendingApprovalsRef, (current) => {
              const next = new Map(current);
              next.delete(requestId);
              return next;
            }),
          ),
        );
        return {
          decision: resolved,
        } satisfies EffectCodexSchema.CommandExecutionRequestApprovalResponse;
      }),
    );

    yield* client.handleServerRequest("item/fileChange/requestApproval", (payload) =>
      Effect.gen(function* () {
        const requestId = ApprovalRequestId.make(
          yield* randomUUIDv4("file-change-approval-request"),
        );
        const turnId = TurnId.make(payload.turnId);
        const itemId = ProviderItemId.make(payload.itemId);
        const decision = yield* Deferred.make<ProviderApprovalDecision>();

        yield* Ref.update(pendingApprovalsRef, (current) => {
          const next = new Map(current);
          next.set(requestId, {
            requestId,
            jsonRpcId: payload.itemId,
            requestKind: "file-change",
            turnId,
            itemId,
            decision,
          });
          return next;
        });
        yield* Ref.update(approvalCorrelationsRef, (current) => {
          const next = new Map(current);
          next.set(payload.itemId, {
            requestId,
            requestKind: "file-change",
            turnId,
            itemId,
          });
          return next;
        });

        yield* emitEvent({
          kind: "request",
          threadId: options.threadId,
          method: "item/fileChange/requestApproval",
          requestId,
          requestKind: "file-change",
          ...(turnId ? { turnId } : {}),
          ...(itemId ? { itemId } : {}),
          payload,
        });

        const resolved = yield* Deferred.await(decision).pipe(
          Effect.ensuring(
            Ref.update(pendingApprovalsRef, (current) => {
              const next = new Map(current);
              next.delete(requestId);
              return next;
            }),
          ),
        );
        return {
          decision: resolved,
        } satisfies EffectCodexSchema.FileChangeRequestApprovalResponse;
      }),
    );

    yield* client.handleServerRequest("item/tool/requestUserInput", (payload) =>
      Effect.gen(function* () {
        const requestId = ApprovalRequestId.make(yield* randomUUIDv4("user-input-request"));
        const turnId = TurnId.make(payload.turnId);
        const itemId = ProviderItemId.make(payload.itemId);
        const answers = yield* Deferred.make<ProviderUserInputAnswers>();

        yield* Ref.update(pendingUserInputsRef, (current) => {
          const next = new Map(current);
          next.set(requestId, {
            requestId,
            turnId,
            itemId,
            answers,
          });
          return next;
        });

        yield* emitEvent({
          kind: "request",
          threadId: options.threadId,
          method: "item/tool/requestUserInput",
          requestId,
          ...(turnId ? { turnId } : {}),
          ...(itemId ? { itemId } : {}),
          payload,
        });

        const resolvedAnswers = yield* Deferred.await(answers).pipe(
          Effect.ensuring(
            Ref.update(pendingUserInputsRef, (current) => {
              const next = new Map(current);
              next.delete(requestId);
              return next;
            }),
          ),
        );

        return {
          answers: yield* toCodexUserInputAnswers(resolvedAnswers).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerRequestError.invalidParams(error.message, {
                questionId: error.questionId,
              }),
            ),
          ),
        } satisfies EffectCodexSchema.ToolRequestUserInputResponse;
      }),
    );

    yield* client.handleUnknownServerRequest((method) =>
      Effect.fail(CodexErrors.CodexAppServerRequestError.methodNotFound(method)),
    );

    const registerServerNotification = <M extends CodexRpc.ServerNotificationMethod>(method: M) =>
      client.handleServerNotification(method, (params) =>
        Queue.offer(serverNotifications, makeCodexServerNotification(method, params)).pipe(
          Effect.asVoid,
        ),
      );

    yield* Effect.forEach(
      Object.values(
        CodexRpc.SERVER_NOTIFICATION_METHODS,
      ) as ReadonlyArray<CodexRpc.ServerNotificationMethod>,
      registerServerNotification,
      { concurrency: 1, discard: true },
    );

    yield* Stream.fromQueue(serverNotifications).pipe(
      Stream.runForEach(handleRawNotification),
      Effect.forkIn(runtimeScope),
    );

    const stderrRemainderRef = yield* Ref.make("");
    yield* child.stderr.pipe(
      Stream.decodeText(),
      Stream.runForEach((chunk) =>
        Ref.modify(stderrRemainderRef, (current) => {
          const combined = current + chunk;
          const lines = combined.split("\n");
          const remainder = lines.pop() ?? "";
          return [lines.map((line) => line.replace(/\r$/, "")), remainder] as const;
        }).pipe(
          Effect.flatMap((lines) =>
            Effect.forEach(
              lines,
              (line) => {
                const classified = classifyCodexStderrLine(line);
                if (!classified) {
                  return Effect.void;
                }
                return emitEvent({
                  kind: "notification",
                  threadId: options.threadId,
                  method: "process/stderr",
                  message: classified.message,
                });
              },
              { discard: true },
            ),
          ),
        ),
      ),
      Effect.forkIn(runtimeScope),
    );

    const recordChildExit = (exitCode: number | undefined, failure?: unknown) =>
      Ref.get(closedRef).pipe(
        Effect.flatMap((closed) => {
          if (closed) {
            return Effect.void;
          }
          const failed = failure !== undefined || exitCode !== 0;
          const message = failure
            ? `Codex App Server terminated unexpectedly: ${redactCodexDiagnostic(
                failure instanceof Error ? failure.message : String(failure),
              )}`
            : exitCode === 0
              ? "Codex App Server exited."
              : `Codex App Server exited with code ${exitCode}.`;
          return updateSession(sessionRef, {
            status: failed ? "error" : "closed",
            activeTurnId: undefined,
            ...(failed ? { lastError: message } : {}),
          }).pipe(Effect.andThen(emitSessionEvent("session/exited", message)));
        }),
      );

    yield* child.exitCode.pipe(
      Effect.matchEffect({
        onFailure: (failure) => recordChildExit(undefined, failure),
        onSuccess: (exitCode) => recordChildExit(exitCode),
      }),
      Effect.forkIn(runtimeScope),
    );

    const start = Effect.fn("CodexSessionRuntime.start")(function* () {
      yield* emitSessionEvent("session/connecting", "Starting Codex App Server session.");
      if (options.expectedProductManifestSha256) {
        const raw = yield* client.raw.request("initialize", buildCodexInitializeParams());
        const handshake = yield* decodeOrchestraProductHandshake(raw).pipe(
          Effect.mapError((error) =>
            CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
              "decode-response-payload",
              error,
              { method: "initialize" },
            ),
          ),
        );
        const actual = handshake.orchestraProduct;
        const mismatch = validateOrchestraProductCompatibility(
          options.expectedProductManifestSha256,
          actual,
        );
        if (mismatch) return yield* mismatch;
      } else {
        yield* client.request("initialize", buildCodexInitializeParams());
      }
      yield* client.notify("initialized", undefined);

      const requestedModel = normalizeCodexModelSlug(options.model);

      const opened = yield* openCodexThread({
        client,
        threadId: options.threadId,
        runtimeMode: options.runtimeMode,
        cwd: options.cwd,
        requestedModel,
        serviceTier: options.serviceTier,
        resumeThreadId: readResumeCursorThreadId(options.resumeCursor),
      });

      const providerThreadId = opened.thread.id;
      const session = {
        ...(yield* Ref.get(sessionRef)),
        status: "ready",
        cwd: opened.cwd,
        model: opened.model,
        resumeCursor: { threadId: providerThreadId },
        updatedAt: yield* nowIso,
      } satisfies ProviderSession;
      yield* Ref.set(sessionRef, session);
      yield* refreshOrchestraLifecycle(providerThreadId);
      yield* emitSessionEvent("session/ready", "Codex App Server session ready.");
      return session;
    });

    const readProviderThreadId = Effect.gen(function* () {
      const providerThreadId = currentProviderThreadId(yield* Ref.get(sessionRef));
      if (!providerThreadId) {
        return yield* new CodexSessionRuntimeThreadIdMissingError({
          threadId: options.threadId,
        });
      }
      return providerThreadId;
    });

    const close = Effect.gen(function* () {
      const alreadyClosed = yield* Ref.getAndSet(closedRef, true);
      if (alreadyClosed) {
        return;
      }
      yield* settlePendingApprovals("cancel");
      yield* settlePendingUserInputs({});
      yield* updateSession(sessionRef, {
        status: "closed",
        activeTurnId: undefined,
      });
      yield* emitSessionEvent("session/closed", "Session stopped").pipe(
        Effect.catch((cause) =>
          Effect.logError("Failed to emit Codex session closed event.", { cause }),
        ),
      );
      yield* Scope.close(runtimeScope, Exit.void);
      yield* Queue.shutdown(serverNotifications);
      yield* Queue.shutdown(events);
    });

    return {
      start,
      getSession: Ref.get(sessionRef),
      sendTurn: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          if (hasConfiguredMcpServer(options.appServerArgs)) {
            yield* client.request("config/mcpServer/reload", undefined).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Failed to refresh Codex MCP tool catalog before turn.", {
                  cause,
                }),
              ),
            );
          }
          const normalizedModel = normalizeCodexModelSlug(
            input.model ?? (yield* Ref.get(sessionRef)).model,
          );
          const params = yield* buildTurnStartParams({
            threadId: providerThreadId,
            runtimeMode: options.runtimeMode,
            ...(input.input ? { prompt: input.input } : {}),
            ...(input.attachments ? { attachments: input.attachments } : {}),
            ...(normalizedModel ? { model: normalizedModel } : {}),
            ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}),
            ...(input.effort ? { effort: input.effort } : {}),
            ...(input.interactionMode ? { interactionMode: input.interactionMode } : {}),
          });
          const rawResponse = yield* client.raw.request("turn/start", params);
          const response = yield* decodeV2TurnStartResponse(rawResponse).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "turn/start" },
              ),
            ),
          );
          const turnId = TurnId.make(response.turn.id);
          yield* updateSession(sessionRef, {
            status: "running",
            activeTurnId: turnId,
            ...(normalizedModel ? { model: normalizedModel } : {}),
          });
          const resumedProviderThreadId = currentProviderThreadId(yield* Ref.get(sessionRef));
          return {
            threadId: options.threadId,
            turnId,
            ...(resumedProviderThreadId
              ? { resumeCursor: { threadId: resumedProviderThreadId } }
              : {}),
          } satisfies ProviderTurnStartResult;
        }),
      interruptTurn: (turnId) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const session = yield* Ref.get(sessionRef);
          const effectiveTurnId = turnId ?? session.activeTurnId;
          if (!effectiveTurnId) {
            return;
          }
          yield* client.request("turn/interrupt", {
            threadId: providerThreadId,
            turnId: effectiveTurnId,
          });
        }),
      readThread: Effect.gen(function* () {
        const providerThreadId = yield* readProviderThreadId;
        const response = yield* client.request("thread/read", {
          threadId: providerThreadId,
          includeTurns: true,
        });
        return parseThreadSnapshot(response);
      }),
      readNativeSubagent: (agentThreadId) =>
        Effect.gen(function* () {
          const parentProviderThreadId = yield* readProviderThreadId;
          const response = yield* client.request("thread/read", {
            threadId: agentThreadId,
            includeTurns: true,
          });
          if (!isDirectNativeSubagent(parentProviderThreadId, response.thread)) {
            return yield* new CodexSessionRuntimeSubagentRelationshipError({
              parentThreadId: parentProviderThreadId,
              agentThreadId,
            });
          }
          return projectNativeSubagentDetail(options.threadId, response.thread);
        }),
      rollbackThread: (numTurns) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.request("thread/rollback", {
            threadId: providerThreadId,
            numTurns,
          });
          yield* updateSession(sessionRef, {
            status: "ready",
            activeTurnId: undefined,
          });
          return parseThreadSnapshot(response);
        }),
      validateAutomationProfile: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/validate", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationValidateResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/validate" },
              ),
            ),
          );
        }),
      runAutomationFixture: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/runFixture", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/runFixture" },
              ),
            ),
          );
        }),
      startAutomation: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request(
            CODEX_AUTOMATION_START_METHOD,
            codexAutomationStartParams(providerThreadId, input),
          );
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: CODEX_AUTOMATION_START_METHOD },
              ),
            ),
          );
        }),
      readLinearAutomation: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/linear/read", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationLinearReadResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/linear/read" },
              ),
            ),
          );
        }),
      readAutomationQueue: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/queue/read", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationQueueReadResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/queue/read" },
              ),
            ),
          );
        }),
      automationStatus: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/status", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/status" },
              ),
            ),
          );
        }),
      pauseAutomation: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/pause", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/pause" },
              ),
            ),
          );
        }),
      refreshAutomation: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/refresh", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/refresh" },
              ),
            ),
          );
        }),
      resumeAutomation: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/resume", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/resume" },
              ),
            ),
          );
        }),
      cancelAutomationIssue: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/cancelIssue", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/cancelIssue" },
              ),
            ),
          );
        }),
      steerAutomationIssue: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request(
            CODEX_AUTOMATION_STEER_ISSUE_METHOD,
            codexAutomationSteerIssueParams(providerThreadId, input),
          );
          return yield* decodeAutomationSteerIssueResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: CODEX_AUTOMATION_STEER_ISSUE_METHOD },
              ),
            ),
          );
        }),
      cancelAutomation: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("automation/cancel", {
            ...input,
            threadId: providerThreadId,
          });
          return yield* decodeAutomationRunResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "automation/cancel" },
              ),
            ),
          );
        }),
      queryOrchestra: (input) =>
        Effect.gen(function* () {
          const providerThreadId = yield* readProviderThreadId;
          const response = yield* client.raw.request("orchestra/query", {
            ...input,
            threadId: providerThreadId,
          });
          const decoded = yield* decodeOrchestraQueryResponse(response).pipe(
            Effect.mapError((error) =>
              CodexErrors.CodexAppServerProtocolParseError.fromSchemaError(
                "decode-response-payload",
                error,
                { method: "orchestra/query" },
              ),
            ),
          );
          return decoded.result;
        }),
      respondToRequest: (requestId, decision) =>
        Effect.gen(function* () {
          const pending = (yield* Ref.get(pendingApprovalsRef)).get(requestId);
          if (!pending) {
            return yield* new CodexSessionRuntimePendingApprovalNotFoundError({
              requestId,
            });
          }
          yield* Ref.update(pendingApprovalsRef, (current) => {
            const next = new Map(current);
            next.delete(requestId);
            return next;
          });
          yield* Deferred.succeed(pending.decision, decision);
          yield* emitEvent({
            kind: "notification",
            threadId: options.threadId,
            method: "item/requestApproval/decision",
            requestId: pending.requestId,
            requestKind: pending.requestKind,
            ...(pending.turnId ? { turnId: pending.turnId } : {}),
            ...(pending.itemId ? { itemId: pending.itemId } : {}),
            payload: {
              requestId: pending.requestId,
              requestKind: pending.requestKind,
              decision,
            },
          });
        }),
      respondToUserInput: (requestId, answers) =>
        Effect.gen(function* () {
          const pending = (yield* Ref.get(pendingUserInputsRef)).get(requestId);
          if (!pending) {
            return yield* new CodexSessionRuntimePendingUserInputNotFoundError({
              requestId,
            });
          }
          const codexAnswers = yield* toCodexUserInputAnswers(answers);
          yield* Ref.update(pendingUserInputsRef, (current) => {
            const next = new Map(current);
            next.delete(requestId);
            return next;
          });
          yield* Deferred.succeed(pending.answers, answers);
          yield* emitEvent({
            kind: "notification",
            threadId: options.threadId,
            method: "item/tool/requestUserInput/answered",
            requestId: pending.requestId,
            ...(pending.turnId ? { turnId: pending.turnId } : {}),
            ...(pending.itemId ? { itemId: pending.itemId } : {}),
            payload: {
              answers: codexAnswers,
            },
          });
        }),
      events: Stream.fromQueue(events),
      close,
    } satisfies CodexSessionRuntimeShape;
  });
