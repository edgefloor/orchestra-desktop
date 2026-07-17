import {
  OrchestraReplayEvent,
  type ApprovalRequestId,
  type AutomationRun,
  type OrchestraQueryInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import type {
  LatestProposedPlanState,
  PendingApproval,
  PendingUserInput,
  WorkLogEntry,
} from "../../session-logic";
import { proposedPlanTitle } from "../../proposedPlan";
import { automationRunStorageKey } from "./AutomationProfileDialog.logic";

export const MAX_ATTENTION_ITEMS = 12;
export const MAX_ATTENTION_DETAIL_CHARS = 480;

export type TaskAttentionKind =
  | "approval"
  | "user_input"
  | "proposed_plan"
  | "waiting_gate"
  | "workflow_failure"
  | "workflow_recovery"
  | "automation_gate"
  | "ambiguous_effect"
  | "reconciliation_failure"
  | "provider_failure";

export type TaskAttentionRuntimeState =
  | "empty"
  | "loading"
  | "ready"
  | "stale"
  | "error"
  | "recovered";

export interface TaskAttentionItem {
  readonly id: string;
  readonly kind: TaskAttentionKind;
  readonly title: string;
  readonly summary: string;
  readonly status?: string;
  readonly requestId?: ApprovalRequestId;
  readonly runId?: string;
  readonly stepId?: string;
  readonly claimId?: string;
  readonly effectId?: string;
}

export interface TaskAttentionProjection {
  readonly count: number;
  readonly items: ReadonlyArray<TaskAttentionItem>;
  readonly omitted: number;
}

export type TaskAttentionActionRoute =
  | "native_approval"
  | "composer_attention"
  | "plan_workspace"
  | "workflow_workspace"
  | "automation_workspace"
  | "none";

export function readTaskAttentionRunCursor(
  storage: Pick<Storage, "getItem">,
  threadId: ThreadId,
): string | null {
  const value = storage.getItem(automationRunStorageKey(threadId))?.trim();
  return value ? value : null;
}

export function taskAttentionActionRoute(item: TaskAttentionItem): TaskAttentionActionRoute {
  switch (item.kind) {
    case "user_input":
      return "composer_attention";
    case "proposed_plan":
      return "plan_workspace";
    case "approval":
      return "native_approval";
    case "waiting_gate":
    case "workflow_failure":
    case "workflow_recovery":
      return "workflow_workspace";
    case "automation_gate":
    case "ambiguous_effect":
    case "reconciliation_failure":
      return "automation_workspace";
    case "provider_failure":
      return "none";
  }
}

const isReplayEvent = Schema.is(OrchestraReplayEvent);

function bounded(value: string): string {
  const normalized = value.trim();
  return normalized.length <= MAX_ATTENTION_DETAIL_CHARS
    ? normalized
    : `${normalized.slice(0, MAX_ATTENTION_DETAIL_CHARS - 1)}…`;
}

function latestWorkflowEvents(workLogEntries: ReadonlyArray<WorkLogEntry>) {
  const latestByRunId = new Map<string, OrchestraReplayEvent>();
  for (const entry of workLogEntries) {
    if (!isReplayEvent(entry.toolData)) continue;
    const current = latestByRunId.get(entry.toolData.runId);
    if (
      !current ||
      entry.toolData.revision > current.revision ||
      (entry.toolData.revision === current.revision && entry.toolData.sequence > current.sequence)
    ) {
      latestByRunId.set(entry.toolData.runId, entry.toolData);
    }
  }
  return [...latestByRunId.values()];
}

function approvalSummary(approval: PendingApproval): string {
  switch (approval.requestKind) {
    case "command":
      return approval.detail ? bounded(approval.detail) : "A command is waiting for your decision.";
    case "file-read":
      return approval.detail
        ? bounded(approval.detail)
        : "A file-read request is waiting for your decision.";
    case "file-change":
      return approval.detail
        ? bounded(approval.detail)
        : "A file-change request is waiting for your decision.";
  }
}

export function deriveTaskAttention(input: {
  readonly approvals: ReadonlyArray<PendingApproval>;
  readonly pendingUserInputs: ReadonlyArray<PendingUserInput>;
  readonly actionableProposedPlan: LatestProposedPlanState | null;
  readonly workLogEntries: ReadonlyArray<WorkLogEntry>;
  readonly automationRun: AutomationRun | null;
  readonly providerError: string | null;
}): TaskAttentionProjection {
  const items: TaskAttentionItem[] = [];

  for (const pending of input.pendingUserInputs) {
    const question = pending.questions[0];
    items.push({
      id: `user-input:${pending.requestId}`,
      kind: "user_input",
      title: question?.header ? `Input requested · ${question.header}` : "Input requested",
      summary: bounded(question?.question ?? "The native task is waiting for your input."),
      requestId: pending.requestId,
    });
  }

  for (const approval of input.approvals) {
    items.push({
      id: `approval:${approval.requestId}`,
      kind: "approval",
      title: `${approval.requestKind.replace("-", " ")} approval`,
      summary: approvalSummary(approval),
      requestId: approval.requestId,
    });
  }

  for (const event of latestWorkflowEvents(input.workLogEntries)) {
    const failedSteps = event.projection.steps.filter((step) => step.status === "failed");
    const waitingSteps = event.projection.steps.filter((step) => step.status === "waitingApproval");
    if (event.projection.status === "failed") {
      const firstFailedStep = failedSteps[0];
      items.push({
        id: `workflow:${event.runId}:failed`,
        kind: "workflow_failure",
        title: firstFailedStep ? `Workflow failed · ${firstFailedStep.id}` : "Workflow Run failed",
        summary: bounded(event.projection.nextAction),
        status: event.projection.status,
        runId: event.runId,
        ...(firstFailedStep ? { stepId: firstFailedStep.id } : {}),
      });
    } else {
      for (const step of failedSteps) {
        items.push({
          id: `workflow:${event.runId}:failed:${step.id}`,
          kind: "workflow_failure",
          title: `Workflow step failed · ${step.id}`,
          summary: bounded(event.projection.nextAction),
          status: step.status,
          runId: event.runId,
          stepId: step.id,
        });
      }
    }
    if (
      event.kind === "recovered" &&
      event.projection.status === "running" &&
      waitingSteps.length === 0
    ) {
      items.push({
        id: `workflow:${event.runId}:recovering`,
        kind: "workflow_recovery",
        title: "Workflow Run recovering",
        summary: bounded(event.projection.nextAction),
        status: event.projection.status,
        runId: event.runId,
      });
    }
    for (const step of waitingSteps) {
      items.push({
        id: `workflow:${event.runId}:${step.id}`,
        kind: "waiting_gate",
        title: `Workflow gate · ${step.id}`,
        summary: bounded(event.projection.nextAction),
        status: step.status,
        runId: event.runId,
        stepId: step.id,
      });
    }
  }

  if (input.actionableProposedPlan) {
    items.push({
      id: `proposed-plan:${input.actionableProposedPlan.id}`,
      kind: "proposed_plan",
      title:
        proposedPlanTitle(input.actionableProposedPlan.planMarkdown) ??
        "Plan ready for implementation",
      summary: bounded(input.actionableProposedPlan.planMarkdown),
    });
  }

  const automationRun = input.automationRun;
  if (automationRun?.reconciliation === "blocked") {
    items.push({
      id: `automation:${automationRun.runId}:reconciliation`,
      kind: "reconciliation_failure",
      title: "Automation reconciliation blocked",
      summary: bounded(automationRun.nextAction.text),
      status: automationRun.reconciliation,
      runId: automationRun.runId,
    });
  }

  if (automationRun) {
    for (const claim of automationRun.claims) {
      for (const effect of claim.effects) {
        if (effect.status === "waiting_gate") {
          items.push({
            id: `automation:${automationRun.runId}:${claim.claimId}:${effect.effectId}`,
            kind: "automation_gate",
            title: `${effect.kind} gate · ${claim.issueIdentifier}`,
            summary: bounded(effect.bodyPreview.text),
            status: effect.status,
            runId: automationRun.runId,
            claimId: claim.claimId,
            effectId: effect.effectId,
          });
        } else if (effect.status === "failed" || effect.status === "ambiguous") {
          items.push({
            id: `automation:${automationRun.runId}:${claim.claimId}:${effect.effectId}`,
            kind: "ambiguous_effect",
            title: `${effect.kind} ${effect.status} · ${claim.issueIdentifier}`,
            summary: bounded(effect.failure?.text ?? effect.bodyPreview.text),
            status: effect.status,
            runId: automationRun.runId,
            claimId: claim.claimId,
            effectId: effect.effectId,
          });
        }
      }
    }
  }

  if (input.providerError) {
    items.push({
      id: "provider:failure",
      kind: "provider_failure",
      title: "Provider failure",
      summary: bounded(input.providerError),
    });
  }

  const priority: Record<TaskAttentionKind, number> = {
    user_input: 0,
    approval: 1,
    workflow_failure: 2,
    reconciliation_failure: 3,
    ambiguous_effect: 4,
    waiting_gate: 5,
    automation_gate: 6,
    workflow_recovery: 7,
    proposed_plan: 8,
    provider_failure: 9,
  };
  items.sort(
    (left, right) => priority[left.kind] - priority[right.kind] || left.id.localeCompare(right.id),
  );
  const visible = items.slice(0, MAX_ATTENTION_ITEMS);
  return { count: items.length, items: visible, omitted: items.length - visible.length };
}

export function deriveTaskAttentionRuntimeState(input: {
  readonly hasRunCursor: boolean;
  readonly loading: boolean;
  readonly hasSnapshot: boolean;
  readonly error: string | null;
  readonly recovered: boolean;
}): TaskAttentionRuntimeState {
  if (!input.hasRunCursor) return "empty";
  if (input.loading && !input.hasSnapshot) return "loading";
  if (input.error) return input.hasSnapshot ? "stale" : "error";
  if (input.recovered) return "recovered";
  return "ready";
}

export function buildAttentionWorkflowQuery(input: {
  readonly threadId: ThreadId;
  readonly runId: string;
}): OrchestraQueryInput {
  return {
    threadId: input.threadId,
    runId: input.runId,
    selector: "steps",
    maxItems: 20,
    maxBytes: 32 * 1024,
  };
}
