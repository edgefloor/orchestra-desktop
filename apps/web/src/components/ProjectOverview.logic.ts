import type { WorkspaceTaskTabSource } from "./WorkspaceTaskTabs.logic";

export const MAX_PROJECT_OVERVIEW_TASKS = 8;

export interface ProjectOverviewSummary<T extends WorkspaceTaskTabSource = WorkspaceTaskTabSource> {
  readonly activeTasks: number;
  readonly attentionTasks: number;
  readonly runningTasks: number;
  readonly recentTasks: T[];
  readonly omittedTasks: number;
}

function needsAttention(task: WorkspaceTaskTabSource): boolean {
  return Boolean(
    task.hasPendingApprovals || task.hasPendingUserInput || task.hasActionableProposedPlan,
  );
}

export function deriveProjectOverviewSummary<T extends WorkspaceTaskTabSource>(
  tasks: ReadonlyArray<T>,
  limit = MAX_PROJECT_OVERVIEW_TASKS,
): ProjectOverviewSummary<T> {
  const active = tasks
    .filter((task) => task.archivedAt === null)
    .sort((left, right) => {
      const recency = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      return recency !== 0 ? recency : left.id.localeCompare(right.id);
    });
  const boundedLimit = Math.max(1, limit);
  return {
    activeTasks: active.length,
    attentionTasks: active.filter(needsAttention).length,
    runningTasks: active.filter(
      (task) => task.session?.status === "starting" || task.session?.status === "running",
    ).length,
    recentTasks: active.slice(0, boundedLimit),
    omittedTasks: Math.max(0, active.length - boundedLimit),
  };
}
