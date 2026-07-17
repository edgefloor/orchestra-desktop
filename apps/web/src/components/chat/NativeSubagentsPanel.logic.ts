export function shouldApplyNativeSubagentResult(input: {
  readonly activeRequestId: number;
  readonly resultRequestId: number;
  readonly selectedAgentThreadId: string | null;
  readonly resultAgentThreadId: string;
}): boolean {
  return (
    input.activeRequestId === input.resultRequestId &&
    input.selectedAgentThreadId === input.resultAgentThreadId
  );
}
