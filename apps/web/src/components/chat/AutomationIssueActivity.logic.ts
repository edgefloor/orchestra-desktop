import type { NativeSubagentDetail, NativeSubagentReadInput, ThreadId } from "@t3tools/contracts";

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
