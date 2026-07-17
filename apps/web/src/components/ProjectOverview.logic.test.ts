import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { WorkspaceTaskTabSource } from "./WorkspaceTaskTabs.logic";
import { deriveProjectOverviewSummary } from "./ProjectOverview.logic";

function task(
  id: string,
  updatedAt: string,
  overrides: Partial<WorkspaceTaskTabSource> = {},
): WorkspaceTaskTabSource {
  return {
    environmentId: EnvironmentId.make("local"),
    id: ThreadId.make(id),
    title: id,
    updatedAt,
    archivedAt: null,
    ...overrides,
  };
}

describe("project overview summary", () => {
  it("derives bounded native task, Attention, and running summaries", () => {
    const tasks = [
      task("older", "2026-07-15T00:00:00.000Z", { hasPendingApprovals: true }),
      task("running", "2026-07-17T00:00:00.000Z", { session: { status: "running" } }),
      task("input", "2026-07-16T00:00:00.000Z", { hasPendingUserInput: true }),
      task("archived", "2026-07-18T00:00:00.000Z", {
        archivedAt: "2026-07-18T01:00:00.000Z",
      }),
    ];

    expect(deriveProjectOverviewSummary(tasks, 2)).toMatchObject({
      activeTasks: 3,
      attentionTasks: 2,
      runningTasks: 1,
      omittedTasks: 1,
      recentTasks: [{ id: ThreadId.make("running") }, { id: ThreadId.make("input") }],
    });
  });

  it("uses stable task identity as the recency tie breaker", () => {
    const updatedAt = "2026-07-17T00:00:00.000Z";
    expect(
      deriveProjectOverviewSummary([task("b", updatedAt), task("a", updatedAt)]).recentTasks.map(
        (entry) => entry.id,
      ),
    ).toEqual([ThreadId.make("a"), ThreadId.make("b")]);
  });
});
