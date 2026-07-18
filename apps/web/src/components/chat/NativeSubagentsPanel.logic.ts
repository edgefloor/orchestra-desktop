import type { NativeSubagentSummary } from "~/nativeSubagents";

export type NativeSubagentRestoration =
  | { readonly kind: "none" }
  | { readonly kind: "close" }
  | { readonly kind: "open"; readonly agent: NativeSubagentSummary };

export function deriveNativeSubagentRestoration(input: {
  readonly requestedAgentThreadId: string | undefined;
  readonly selectedAgentThreadId: string | null;
  readonly agents: ReadonlyArray<NativeSubagentSummary>;
}): NativeSubagentRestoration {
  if (!input.requestedAgentThreadId) {
    return { kind: "none" };
  }
  const requested = input.agents.find(
    (agent) => agent.agentThreadId === input.requestedAgentThreadId,
  );
  if (!requested) {
    return input.selectedAgentThreadId ? { kind: "close" } : { kind: "none" };
  }
  return requested.agentThreadId === input.selectedAgentThreadId
    ? { kind: "none" }
    : { kind: "open", agent: requested };
}

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
