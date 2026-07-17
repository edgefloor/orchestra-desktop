import { ApprovalRequestId, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { TaskAttentionView } from "./TaskAttentionView";

const baseProps = {
  environmentId: EnvironmentId.make("local"),
  threadId: ThreadId.make("task-49"),
  runtimeRevisionKey: "2026-07-17T00:00:00.000Z",
  workLogEntries: [],
  providerError: null,
  respondingRequestIds: [],
  onRespondToApproval: vi.fn(async () => undefined),
  onReviewComposer: vi.fn(),
  onOpenAutomationWorkspace: vi.fn(),
} as const;

describe("TaskAttentionView", () => {
  it("keeps an empty canonical Attention view in the normal task shell", () => {
    const markup = renderToStaticMarkup(<TaskAttentionView {...baseProps} approvals={[]} />);

    expect(markup).toContain('aria-label="Task attention"');
    expect(markup).toContain("Attention");
    expect(markup).toContain("No items need intervention");
    expect(markup).not.toContain('role="dialog"');
  });

  it("renders the native approval count without moving the approval prompt into chat", () => {
    const markup = renderToStaticMarkup(
      <TaskAttentionView
        {...baseProps}
        approvals={[
          {
            requestId: ApprovalRequestId.make("approval-49"),
            requestKind: "command",
            createdAt: "2026-07-17T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(markup).toContain("1 native item");
    expect(markup).not.toContain("PENDING APPROVAL");
  });
});
