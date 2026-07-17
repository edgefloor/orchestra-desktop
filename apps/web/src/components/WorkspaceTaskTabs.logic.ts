import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

export const MAX_WORKSPACE_TASK_TABS = 8;

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

export function buildWorkspaceTaskTabs(input: {
  readonly tasks: ReadonlyArray<WorkspaceTaskTabSource>;
  readonly activeTaskKey: string | null;
  readonly limit?: number;
}): WorkspaceTaskTabSource[] {
  const uniqueTasks = new Map<string, WorkspaceTaskTabSource>();
  for (const task of input.tasks) {
    if (task.archivedAt !== null) continue;
    uniqueTasks.set(workspaceTaskTabKey(task), task);
  }

  const orderedTasks = [...uniqueTasks.values()].sort((left, right) => {
    const updatedOrder = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return updatedOrder !== 0
      ? updatedOrder
      : workspaceTaskTabKey(left).localeCompare(workspaceTaskTabKey(right));
  });
  const limit = Math.max(1, input.limit ?? MAX_WORKSPACE_TASK_TABS);
  const visibleTasks = orderedTasks.slice(0, limit);
  if (
    input.activeTaskKey === null ||
    visibleTasks.some((task) => workspaceTaskTabKey(task) === input.activeTaskKey)
  ) {
    return visibleTasks;
  }

  const activeTask = uniqueTasks.get(input.activeTaskKey);
  if (!activeTask) return visibleTasks;
  return [...visibleTasks.slice(0, limit - 1), activeTask];
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
  if (input.taskCount <= 0) return null;
  switch (input.key) {
    case "ArrowLeft":
      return (input.currentIndex - 1 + input.taskCount) % input.taskCount;
    case "ArrowRight":
      return (input.currentIndex + 1) % input.taskCount;
    case "Home":
      return 0;
    case "End":
      return input.taskCount - 1;
    default:
      return null;
  }
}
