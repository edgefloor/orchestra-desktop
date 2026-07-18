import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { WorkspaceTaskTabs } from "./WorkspaceTaskTabs";

describe("WorkspaceTaskTabs", () => {
  it("renders native tasks as an accessible, selected tablist", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTaskTabs
        tabs={[
          {
            key: "other",
            title: "Other task",
            active: false,
            status: "running",
            onSelect: vi.fn(),
            onClose: vi.fn(),
          },
          {
            key: "active",
            title: "Active task",
            active: true,
            status: "idle",
            onSelect: vi.fn(),
            onClose: vi.fn(),
          },
        ]}
        onNewTask={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Project tasks"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Active task");
    expect(markup).toContain('aria-label="Close Active task"');
    expect(markup).toContain('aria-label="Idle" role="img"');
    expect(markup).toContain('aria-label="New task"');
  });

  it("keeps the native new-task action reachable when the project has no server tasks", () => {
    const markup = renderToStaticMarkup(<WorkspaceTaskTabs tabs={[]} onNewTask={vi.fn()} />);

    expect(markup).not.toContain('role="tab"');
    expect(markup).toContain('aria-label="New task"');
  });

  it("renders project overview as a selected peer of native task tabs", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTaskTabs
        tabs={[
          { key: "overview", title: "Overview", active: true, onSelect: vi.fn() },
          {
            key: "task",
            title: "Native task",
            active: false,
            status: "idle",
            onSelect: vi.fn(),
          },
        ]}
        onNewTask={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Native task");
  });

  it("names temporarily unavailable contextual tabs without disabling recovery selection", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTaskTabs
        tabs={[
          {
            key: "evidence",
            title: "Evidence proof-1",
            active: true,
            availability: "temporarilyUnavailable",
            onSelect: vi.fn(),
            onClose: vi.fn(),
          },
        ]}
        onNewTask={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Temporarily unavailable" role="img"');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).toContain('aria-label="Close Evidence proof-1"');
  });
});
