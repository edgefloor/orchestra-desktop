import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import {
  resolveWorkspaceTaskTabNavigation,
  resolveWorkspaceTaskTabStatus,
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
