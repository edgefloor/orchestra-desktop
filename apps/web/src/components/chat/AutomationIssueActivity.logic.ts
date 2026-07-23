import type { NativeSubagentDetail, NativeSubagentReadInput, ThreadId } from "@t3tools/contracts";

import type { NativeActivityPresentation } from "./NativeActivityPanel.logic";

export function exactNativeIssueActivityInput(
  ownerThreadId: ThreadId,
  agentThreadId: string,
): NativeSubagentReadInput {
  return { threadId: ownerThreadId, agentThreadId };
}

export function isExactNativeIssueActivityDetail(
  detail: NativeSubagentDetail,
  ownerThreadId: ThreadId,
  agentThreadId: string,
): boolean {
  return detail.parentTaskId === ownerThreadId && detail.agentThreadId === agentThreadId;
}

export function projectAutomationIssueActivityPresentation(input: {
  readonly agentThreadId: string;
  readonly detail: NativeSubagentDetail | null;
  readonly error: string | null;
  readonly loading: boolean;
}): NativeActivityPresentation {
  const { agentThreadId, detail, error, loading } = input;
  const retainedAfterFailure = detail !== null && error !== null;
  const state = retainedAfterFailure
    ? "stale"
    : detail
      ? loading
        ? "refreshing"
        : "ready"
      : loading
        ? "loading"
        : error
          ? "error"
          : "empty";

  return {
    accessibleLabel: "Native Issue task activity",
    identity: {
      label: "Native child",
      value: agentThreadId,
      status: detail?.status,
    },
    state,
    overview: detail
      ? {
          summary: detail.preview,
          metadata: `Updated ${detail.updatedAt}${detail.role ? ` · ${detail.role}` : ""}`,
        }
      : undefined,
    records:
      detail?.items.map((item) => ({
        id: item.id,
        kind: item.type,
        status: item.status,
        summary: item.summary,
      })) ?? [],
    emptyMessage: "No native Issue activity is available yet.",
    loadingMessage: "Loading exact native Issue activity…",
    failure: error
      ? {
          message: error,
          retainedMessage: retainedAfterFailure
            ? "Showing stale native activity retained from the last successful exact read."
            : undefined,
          retryLabel: "Retry Issue activity",
        }
      : undefined,
    truncationMessage: detail?.truncated
      ? "Earlier activity remains in the native Issue task and was not loaded."
      : undefined,
  };
}
