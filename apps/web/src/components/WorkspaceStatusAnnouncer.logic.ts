import type { NativeSubagentSummary } from "~/nativeSubagents";
import type { WorkspaceWorkflowRun } from "./chat/WorkflowRunsView.logic";
import { workflowRunDisplayState } from "./chat/WorkflowRunTree.logic";
import {
  resolveWorkspaceTaskTabStatus,
  workspaceTaskTabKey,
  type WorkspaceTaskTabSource,
} from "./WorkspaceTaskTabs.logic";

export const MAX_WORKSPACE_STATUS_ANNOUNCEMENT_ITEMS = 3;

export type WorkspaceSemanticStatus =
  | "attention"
  | "cancelled"
  | "completed"
  | "failed"
  | "idle"
  | "paused"
  | "pending"
  | "queued"
  | "recovering"
  | "running"
  | "unavailable"
  | "waiting";

export interface WorkspaceStatusEntry {
  readonly key: string;
  readonly label: string;
  readonly status: WorkspaceSemanticStatus;
}

export interface WorkspaceStatusSnapshot {
  readonly scopeKey: string | null;
  readonly entries: ReadonlyArray<WorkspaceStatusEntry>;
  readonly signature: string;
}

export interface WorkspaceStatusAnnouncement {
  readonly politeness: "assertive" | "polite";
  readonly text: string;
}

export interface WorkspaceStatusSnapshotInput {
  readonly scopeKey: string | null;
  readonly tasks: ReadonlyArray<WorkspaceTaskTabSource>;
  readonly subagents: ReadonlyArray<NativeSubagentSummary>;
  readonly workflowRuns: ReadonlyArray<WorkspaceWorkflowRun>;
  readonly pendingApprovalIds: ReadonlyArray<string>;
  readonly pendingUserInputIds: ReadonlyArray<string>;
  readonly actionablePlanId: string | null;
  readonly providerFailed: boolean;
}

function shortIdentity(value: string): string {
  return value.length <= 8 ? value : value.slice(0, 8);
}

function taskStatus(task: WorkspaceTaskTabSource): WorkspaceSemanticStatus {
  const status = resolveWorkspaceTaskTabStatus(task);
  if (status === "error") return "failed";
  return status;
}

export function buildWorkspaceStatusSnapshot(
  input: WorkspaceStatusSnapshotInput,
): WorkspaceStatusSnapshot {
  const entries: WorkspaceStatusEntry[] = [];

  for (const task of input.tasks) {
    entries.push({
      key: `task:${workspaceTaskTabKey(task)}`,
      label: task.title,
      status: taskStatus(task),
    });
  }
  for (const agent of input.subagents) {
    entries.push({
      key: `subagent:${agent.agentThreadId}`,
      label:
        agent.agentPath?.split("/").findLast((segment) => segment.length > 0) ??
        `Agent ${shortIdentity(agent.agentThreadId)}`,
      status: agent.status,
    });
  }
  for (const { event } of input.workflowRuns) {
    entries.push({
      key: `workflow:${event.runId}`,
      label: `Workflow ${shortIdentity(event.runId)}`,
      status: workflowRunDisplayState(event.projection.status, event.kind),
    });
  }
  for (const requestId of input.pendingApprovalIds) {
    entries.push({
      key: `approval:${requestId}`,
      label: "Approval request",
      status: "attention",
    });
  }
  for (const requestId of input.pendingUserInputIds) {
    entries.push({
      key: `user-input:${requestId}`,
      label: "Input request",
      status: "attention",
    });
  }
  if (input.actionablePlanId) {
    entries.push({
      key: `plan:${input.actionablePlanId}`,
      label: "Proposed plan",
      status: "attention",
    });
  }
  if (input.providerFailed) {
    entries.push({ key: "provider", label: "Provider", status: "failed" });
  }

  entries.sort((left, right) => left.key.localeCompare(right.key));
  return {
    scopeKey: input.scopeKey,
    entries,
    signature: entries.map((entry) => `${entry.key}=${entry.status}`).join("|"),
  };
}

function statusCopy(entry: WorkspaceStatusEntry): string {
  switch (entry.status) {
    case "completed":
      return `${entry.label} completed`;
    case "failed":
      return `${entry.label} failed`;
    case "unavailable":
      return `${entry.label} unavailable`;
    case "attention":
      return `${entry.label} needs attention`;
    default:
      return `${entry.label} is ${entry.status}`;
  }
}

export function diffWorkspaceStatusSnapshots(
  previous: WorkspaceStatusSnapshot,
  current: WorkspaceStatusSnapshot,
): WorkspaceStatusAnnouncement | null {
  if (
    previous.scopeKey !== current.scopeKey ||
    current.scopeKey === null ||
    previous.signature === current.signature
  ) {
    return null;
  }

  const previousByKey = new Map(previous.entries.map((entry) => [entry.key, entry]));
  const failures: WorkspaceStatusEntry[] = [];
  const completions: WorkspaceStatusEntry[] = [];
  const attention: WorkspaceStatusEntry[] = [];

  for (const entry of current.entries) {
    const prior = previousByKey.get(entry.key);
    if (prior?.status === entry.status) continue;
    if (entry.status === "failed" || entry.status === "unavailable") {
      failures.push(entry);
    } else if (prior?.status === "running" && entry.status === "completed") {
      completions.push(entry);
    } else if (entry.status === "attention") {
      attention.push(entry);
    }
  }

  const changes = [...failures, ...completions, ...attention];
  if (changes.length === 0) return null;
  const visible = changes.slice(0, MAX_WORKSPACE_STATUS_ANNOUNCEMENT_ITEMS);
  const omitted = changes.length - visible.length;
  const text = `${visible.map(statusCopy).join(". ")}${
    omitted > 0 ? `. And ${omitted} more status ${omitted === 1 ? "update" : "updates"}` : ""
  }.`;
  return { politeness: failures.length > 0 ? "assertive" : "polite", text };
}
