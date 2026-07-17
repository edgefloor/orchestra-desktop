import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { WorkspaceContextRail, WorkspaceTaskContextBar } from "./WorkspaceContextRail";

describe("WorkspaceContextRail", () => {
  it("keeps task-scoped context beside the native timeline", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextRail
        activeView="subagents"
        subagents={<div>Native child agents</div>}
        workflow={<div>Native Workflow Runs</div>}
        attention={<div>Native attention</div>}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain('data-workspace-context-rail=""');
    expect(markup).toContain('aria-label="Task context"');
    expect(markup).toContain("Native child agents");
    expect(markup).not.toContain("Native attention");
    expect(markup).toContain('data-workspace-context-variant="rail"');
  });

  it("renders the same task context inside a narrow-desktop sheet", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextRail
        variant="sheet"
        activeView="attention"
        subagents={<div>Native child agents</div>}
        workflow={<div>Native Workflow Runs</div>}
        attention={<div>Native attention</div>}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain('data-workspace-context-variant="sheet"');
    expect(markup).toContain("Native attention");
    expect(markup).not.toContain("Native child agents");
  });

  it("renders native context navigation in the worktree bar", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTaskContextBar
        projectName="orchestra"
        workspaceRoot="/workspace/orchestra"
        activeView="attention"
        onSelectView={vi.fn()}
      />,
    );

    expect(markup).toContain("/workspace/orchestra");
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Subagents");
    expect(markup).toContain("Workflow");
    expect(markup).toContain("Attention");
  });

  it("renders Workflow as a shared task context panel", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextRail
        activeView="workflow"
        subagents={<div>Native child agents</div>}
        workflow={<div>Native Workflow Runs</div>}
        attention={<div>Native attention</div>}
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain("Native Workflow Runs");
    expect(markup).not.toContain("Native child agents");
    expect(markup).not.toContain("Native attention");
  });
});
