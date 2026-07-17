import {
  OrchestraReplayEvent,
  type ApprovalRequestId,
  type AutomationRun,
  type OrchestraQueryInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import type { PendingApproval, WorkLogEntry } from "../../session-logic";
import { automationRunStorageKey } from "./AutomationProfileDialog.logic";

export const MAX_ATTENTION_ITEMS = 12;
export const MAX_ATTENTION_DETAIL_CHARS = 480;

export type TaskAttentionKind =
  | "approval"
  | "waiting_gate"
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
  | "workflow_approval"
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
  if (item.requestId) return "native_approval";
  if (item.stepId) return "workflow_approval";
  if (item.runId) return "automation_workspace";
  return "none";
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
  readonly workLogEntries: ReadonlyArray<WorkLogEntry>;
  readonly automationRun: AutomationRun | null;
  readonly providerError: string | null;
}): TaskAttentionProjection {
  const items: TaskAttentionItem[] = [];

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
    for (const step of event.projection.steps) {
      if (step.status !== "waitingApproval") continue;
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
            kind: "waiting_gate",
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
    approval: 0,
    reconciliation_failure: 1,
    ambiguous_effect: 2,
    waiting_gate: 3,
    provider_failure: 4,
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
