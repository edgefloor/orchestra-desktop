import { ThreadId, type NativeSubagentDetail } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationIssueActivityPresentation } from "./AutomationIssueActivity";
import {
  exactNativeIssueActivityInput,
  isExactNativeIssueActivityDetail,
} from "./AutomationIssueActivity.logic";

const ownerThreadId = ThreadId.make("automation-owner");
const detail: NativeSubagentDetail = {
  parentTaskId: ownerThreadId,
  agentThreadId: "provider-issue-task",
  status: "running",
  nickname: "ORC-70",
  role: "Issue task",
  preview: "Working on the selected Issue",
  updatedAt: "2026-07-19T04:00:00.000Z",
  items: [
    {
      id: "item-1",
      type: "assistant",
      status: "completed",
      summary: "Verified the native child boundary.",
    },
  ],
  truncated: true,
};

describe("AutomationIssueActivity", () => {
  it("addresses the provider child through its owner instead of a host-task route", () => {
    expect(exactNativeIssueActivityInput(ownerThreadId, "provider-issue-task")).toEqual({
      threadId: "automation-owner",
      agentThreadId: "provider-issue-task",
    });
    expect(isExactNativeIssueActivityDetail(detail, ownerThreadId, "provider-issue-task")).toBe(
      true,
    );
    expect(
      isExactNativeIssueActivityDetail(detail, ownerThreadId, "different-provider-child"),
    ).toBe(false);
  });

  it("renders bounded exact activity, status, and truncation without a host composer", () => {
    const markup = renderToStaticMarkup(
      <AutomationIssueActivityPresentation
        agentThreadId="provider-issue-task"
        detail={detail}
        error={null}
        loading={false}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Native Issue task activity"');
    expect(markup).toContain("provider-issue-task");
    expect(markup).toContain("Verified the native child boundary.");
    expect(markup).toContain("Earlier activity remains in the native Issue task");
    expect(markup).not.toContain("data-chat-composer-form");
  });

  it("renders retryable failure independently from retained detail", () => {
    const markup = renderToStaticMarkup(
      <AutomationIssueActivityPresentation
        agentThreadId="provider-issue-task"
        detail={detail}
        error="native read unavailable"
        loading={false}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-automation-issue-native-activity="stale"');
    expect(markup).toContain("native read unavailable");
    expect(markup).toContain("Retry Issue activity");
    expect(markup).toContain("Showing stale native activity retained");
    expect(markup).toContain("Verified the native child boundary.");
  });
});
