import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationWorkspace } from "./AutomationProfileDialog";
import { AutomationRunActionFeedbackNotice } from "./AutomationRunActionFeedback";

describe("AutomationWorkspace", () => {
  it("renders Symphony as a bounded task workspace instead of a detached dialog", () => {
    const markup = renderToStaticMarkup(
      <AutomationWorkspace
        environmentId={EnvironmentId.make("local")}
        threadId={ThreadId.make("task-48")}
        threadTitle="Move Symphony into the task workspace"
        onClose={vi.fn()}
        onOpenIssueTask={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Symphony automation workspace"');
    expect(markup).toContain("Task-scoped native automation");
    expect(markup).toContain("idle");
    expect(markup).toContain('aria-label="Close Symphony workspace"');
    expect(markup).not.toContain("Start fixture");
    expect(markup).not.toContain('role="dialog"');
  });
});

describe("AutomationRunActionFeedbackNotice", () => {
  it("visibly distinguishes accepted native state from a retained stale snapshot", () => {
    const accepted = renderToStaticMarkup(
      <AutomationRunActionFeedbackNotice
        feedback={{
          kind: "accepted",
          action: "Refresh",
          detail: "Refresh accepted native Run revision 18 under lease 3.",
        }}
      />,
    );
    const stale = renderToStaticMarkup(
      <AutomationRunActionFeedbackNotice
        feedback={{
          kind: "stale",
          action: "Resume",
          detail: "Resume failed. Retained Run revision 17 may be stale.",
        }}
      />,
    );

    expect(accepted).toContain('data-automation-action-feedback="accepted"');
    expect(accepted).toContain('role="status"');
    expect(stale).toContain('data-automation-action-feedback="stale"');
    expect(stale).toContain('role="alert"');
    expect(stale).toContain("may be stale");
  });
});
