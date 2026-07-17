import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { resolveWorkspaceTabNavigation } from "./workspaceTabNavigation";

export interface WorkspaceTaskTabSource {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly title: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly hasPendingApprovals?: boolean;
  readonly hasPendingUserInput?: boolean;
  readonly hasActionableProposedPlan?: boolean;
  readonly session?: {
    readonly status:
      | "idle"
      | "starting"
      | "running"
      | "ready"
      | "interrupted"
      | "stopped"
      | "error";
  } | null;
}

export type WorkspaceTaskTabStatus = "attention" | "error" | "idle" | "running";

export function workspaceTaskTabKey(
  task: Pick<WorkspaceTaskTabSource, "environmentId" | "id">,
): string {
  return scopedThreadKey(scopeThreadRef(task.environmentId, task.id));
}

export function resolveWorkspaceTaskTabStatus(
  task: WorkspaceTaskTabSource,
): WorkspaceTaskTabStatus {
  if (task.session?.status === "error") return "error";
  if (task.hasPendingApprovals || task.hasPendingUserInput || task.hasActionableProposedPlan) {
    return "attention";
  }
  if (task.session?.status === "starting" || task.session?.status === "running") return "running";
  return "idle";
}

export function resolveWorkspaceTaskTabNavigation(input: {
  readonly currentIndex: number;
  readonly key: string;
  readonly taskCount: number;
}): number | null {
  return resolveWorkspaceTabNavigation({
    currentIndex: input.currentIndex,
    key: input.key,
    tabCount: input.taskCount,
  });
}
