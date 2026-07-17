import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { WorkspaceStatusAnnouncer } from "./WorkspaceStatusAnnouncer";
import { buildWorkspaceStatusSnapshot } from "./WorkspaceStatusAnnouncer.logic";

const input = {
  scopeKey: "environment:thread",
  tasks: [],
  subagents: [],
  workflowRuns: [],
  pendingApprovalIds: [],
  pendingUserInputIds: [],
  actionablePlanId: null,
  providerFailed: false,
} as const;

describe("WorkspaceStatusAnnouncer", () => {
  it("mounts one centralized, initially silent polite and assertive region", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceStatusAnnouncer snapshot={buildWorkspaceStatusSnapshot(input)} />,
    );
    expect(markup).toContain('data-workspace-status-announcer=""');
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).toContain('role="alert" aria-live="assertive" aria-atomic="true"');
  });
});
