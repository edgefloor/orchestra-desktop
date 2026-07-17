import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationWorkspace } from "./AutomationProfileDialog";

describe("AutomationWorkspace", () => {
  it("renders Symphony as a bounded task workspace instead of a detached dialog", () => {
    const markup = renderToStaticMarkup(
      <AutomationWorkspace
        environmentId={EnvironmentId.make("local")}
        threadId={ThreadId.make("task-48")}
        threadTitle="Move Symphony into the task workspace"
        onClose={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Symphony automation workspace"');
    expect(markup).toContain("Task-scoped native automation");
    expect(markup).toContain("idle");
    expect(markup).toContain('aria-label="Close Symphony workspace"');
    expect(markup).not.toContain('role="dialog"');
  });
});
