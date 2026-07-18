/**
 * ProviderAdapter - Provider-specific runtime adapter contract.
 *
 * Defines the provider-native session/protocol operations that `ProviderService`
 * routes to after resolving the target provider. Implementations should focus
 * on provider behavior only and avoid cross-provider orchestration concerns.
 *
 * @module ProviderAdapter
 */
import type {
  AutomationLinearReadInput,
  AutomationLinearReadResult,
  AutomationLifecycleInput,
  AutomationQueueReadInput,
  AutomationQueueReadResult,
  AutomationReconcileInput,
  AutomationRunInput,
  AutomationRunResult,
  AutomationStartInput,
  AutomationStatusInput,
  AutomationSteerIssueInput,
  AutomationSteerIssueResult,
  AutomationCancelInput,
  AutomationCancelIssueInput,
  AutomationValidateInput,
  AutomationValidateResult,
  OrchestraQueryInput,
  OrchestraQueryResult,
  ApprovalRequestId,
  ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderUserInputAnswers,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ThreadId,
  ProviderTurnStartResult,
  NativeSubagentDetail,
  TurnId,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export type ProviderSessionModelSwitchMode = "in-session" | "unsupported";

export interface ProviderAdapterCapabilities {
  /**
   * Declares whether changing the model on an existing session is supported.
   */
  readonly sessionModelSwitch: ProviderSessionModelSwitchMode;
}

export interface ProviderThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface ProviderThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<ProviderThreadTurnSnapshot>;
}

export interface ProviderAdapterShape<TError> {
  /**
   * Provider kind implemented by this adapter.
   */
  readonly provider: ProviderDriverKind;
  readonly capabilities: ProviderAdapterCapabilities;

  /**
   * Start a provider-backed session.
   */
  readonly startSession: (
    input: ProviderSessionStartInput,
  ) => Effect.Effect<ProviderSession, TError>;

  /**
   * Send a turn to an active provider session.
   */
  readonly sendTurn: (
    input: ProviderSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, TError>;

  /**
   * Interrupt an active turn.
   */
  readonly interruptTurn: (threadId: ThreadId, turnId?: TurnId) => Effect.Effect<void, TError>;

  /**
   * Respond to an interactive approval request.
   */
  readonly respondToRequest: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void, TError>;

  /**
   * Respond to a structured user-input request.
   */
  readonly respondToUserInput: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void, TError>;

  /**
   * Stop one provider session.
   */
  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, TError>;

  /**
   * List currently active provider sessions for this adapter.
   */
  readonly listSessions: () => Effect.Effect<ReadonlyArray<ProviderSession>>;

  /**
   * Check whether this adapter owns an active session id.
   */
  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;

  /**
   * Read a provider thread snapshot.
   */
  readonly readThread: (threadId: ThreadId) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /** Read a direct native child lazily through the parent provider session. */
  readonly readNativeSubagent?: (
    threadId: ThreadId,
    agentThreadId: string,
  ) => Effect.Effect<NativeSubagentDetail, TError>;

  /**
   * Roll back a provider thread by N turns.
   */
  readonly rollbackThread: (
    threadId: ThreadId,
    numTurns: number,
  ) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /** Codex-native extension point. Other provider adapters leave this absent. */
  readonly validateAutomationProfile?: (
    threadId: ThreadId,
    input: Omit<AutomationValidateInput, "threadId">,
  ) => Effect.Effect<AutomationValidateResult, TError>;
  readonly runAutomationFixture?: (
    threadId: ThreadId,
    input: Omit<AutomationRunInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly startAutomation?: (
    threadId: ThreadId,
    input: Omit<AutomationStartInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly readLinearAutomation?: (
    threadId: ThreadId,
    input: Omit<AutomationLinearReadInput, "threadId">,
  ) => Effect.Effect<AutomationLinearReadResult, TError>;
  readonly readAutomationQueue?: (
    threadId: ThreadId,
    input: Omit<AutomationQueueReadInput, "threadId">,
  ) => Effect.Effect<AutomationQueueReadResult, TError>;
  readonly automationStatus?: (
    threadId: ThreadId,
    input: Omit<AutomationStatusInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly pauseAutomation?: (
    threadId: ThreadId,
    input: Omit<AutomationLifecycleInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly refreshAutomation?: (
    threadId: ThreadId,
    input: Omit<AutomationReconcileInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly resumeAutomation?: (
    threadId: ThreadId,
    input: Omit<AutomationReconcileInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly cancelAutomation?: (
    threadId: ThreadId,
    input: Omit<AutomationCancelInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly cancelAutomationIssue?: (
    threadId: ThreadId,
    input: Omit<AutomationCancelIssueInput, "threadId">,
  ) => Effect.Effect<AutomationRunResult, TError>;
  readonly steerAutomationIssue?: (
    threadId: ThreadId,
    input: Omit<AutomationSteerIssueInput, "threadId">,
  ) => Effect.Effect<AutomationSteerIssueResult, TError>;
  readonly queryOrchestra?: (
    threadId: ThreadId,
    input: Omit<OrchestraQueryInput, "threadId">,
  ) => Effect.Effect<OrchestraQueryResult, TError>;

  /**
   * Stop all sessions owned by this adapter.
   */
  readonly stopAll: () => Effect.Effect<void, TError>;

  /**
   * Canonical runtime event stream emitted by this adapter.
   */
  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}
