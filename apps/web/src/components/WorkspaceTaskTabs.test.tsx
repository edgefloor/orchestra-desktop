import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { WorkspaceTaskTabs } from "./WorkspaceTaskTabs";
import { workspaceTaskTabKey, type WorkspaceTaskTabSource } from "./WorkspaceTaskTabs.logic";

const environmentId = EnvironmentId.make("local");

function task(id: string, title: string): WorkspaceTaskTabSource {
  return {
    environmentId,
    id: ThreadId.make(id),
    title,
    updatedAt: "2026-07-17T00:00:00.000Z",
    archivedAt: null,
  };
}

describe("WorkspaceTaskTabs", () => {
  it("renders native tasks as an accessible, selected tablist", () => {
    const activeTask = task("active", "Active task");
    const markup = renderToStaticMarkup(
      <WorkspaceTaskTabs
        tasks={[task("other", "Other task"), activeTask]}
        activeTaskKey={workspaceTaskTabKey(activeTask)}
        onSelectTask={vi.fn()}
        onCloseTask={vi.fn()}
        onNewTask={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Project tasks"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Active task");
    expect(markup).toContain('aria-label="Close Active task"');
    expect(markup).toContain('aria-label="New task"');
  });

  it("keeps the native new-task action reachable when the project has no server tasks", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTaskTabs
        tasks={[]}
        activeTaskKey={null}
        onSelectTask={vi.fn()}
        onNewTask={vi.fn()}
      />,
    );

    expect(markup).not.toContain('role="tab"');
    expect(markup).toContain('aria-label="New task"');
  });

  it("renders project overview as a selected peer of native task tabs", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTaskTabs
        tasks={[task("task", "Native task")]}
        activeTaskKey={null}
        projectOverview={{ title: "Overview", active: true, onSelect: vi.fn() }}
        onSelectTask={vi.fn()}
        onNewTask={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Native task");
  });
});
