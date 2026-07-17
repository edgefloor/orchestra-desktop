import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import {
  buildWorkspaceTaskTabs,
  resolveWorkspaceTaskTabNavigation,
  resolveWorkspaceTaskTabStatus,
  workspaceTaskTabKey,
  type WorkspaceTaskTabSource,
} from "./WorkspaceTaskTabs.logic";

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

describe("workspace task tabs", () => {
  it("derives bounded recent tabs from native tasks and retains an older active task", () => {
    const tasks = Array.from({ length: 10 }, (_, index) =>
      task(`task-${index}`, `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const activeTaskKey = workspaceTaskTabKey(tasks[0]!);

    const tabs = buildWorkspaceTaskTabs({ tasks, activeTaskKey, limit: 4 });

    expect(tabs).toHaveLength(4);
    expect(tabs.map((entry) => entry.id)).toEqual([
      ThreadId.make("task-9"),
      ThreadId.make("task-8"),
      ThreadId.make("task-7"),
      ThreadId.make("task-0"),
    ]);
  });

  it("deduplicates tasks and excludes archived tasks", () => {
    const current = task("current", "2026-07-17T00:00:00.000Z");
    const replacement = { ...current, title: "Canonical title" };
    const archived = task("archived", "2026-07-18T00:00:00.000Z", {
      archivedAt: "2026-07-18T01:00:00.000Z",
    });

    expect(
      buildWorkspaceTaskTabs({ tasks: [current, replacement, archived], activeTaskKey: null }),
    ).toEqual([replacement]);
  });

  it("prioritizes error, attention, and running status without inventing task state", () => {
    expect(
      resolveWorkspaceTaskTabStatus(task("error", "2026-07-17", { session: { status: "error" } })),
    ).toBe("error");
    expect(
      resolveWorkspaceTaskTabStatus(task("input", "2026-07-17", { hasPendingUserInput: true })),
    ).toBe("attention");
    expect(
      resolveWorkspaceTaskTabStatus(
        task("running", "2026-07-17", { session: { status: "running" } }),
      ),
    ).toBe("running");
    expect(resolveWorkspaceTaskTabStatus(task("idle", "2026-07-17"))).toBe("idle");
  });

  it("supports wrapping arrow navigation plus Home and End", () => {
    expect(
      resolveWorkspaceTaskTabNavigation({ currentIndex: 0, key: "ArrowLeft", taskCount: 3 }),
    ).toBe(2);
    expect(
      resolveWorkspaceTaskTabNavigation({ currentIndex: 2, key: "ArrowRight", taskCount: 3 }),
    ).toBe(0);
    expect(resolveWorkspaceTaskTabNavigation({ currentIndex: 1, key: "Home", taskCount: 3 })).toBe(
      0,
    );
    expect(resolveWorkspaceTaskTabNavigation({ currentIndex: 1, key: "End", taskCount: 3 })).toBe(
      2,
    );
    expect(
      resolveWorkspaceTaskTabNavigation({ currentIndex: 1, key: "Enter", taskCount: 3 }),
    ).toBeNull();
  });
});
