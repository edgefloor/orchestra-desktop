import type {
  EnvironmentId,
  NativeSubagentDetail,
  NativeSubagentStatus,
  OrchestrationThreadActivity,
  ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ArrowLeftIcon, BotIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { deriveNativeSubagents, type NativeSubagentSummary } from "~/nativeSubagents";
import { readNativeSubagent } from "~/state/nativeSubagents";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { shouldApplyNativeSubagentResult } from "./NativeSubagentsPanel.logic";

const STATUS_PRESENTATION: Record<
  NativeSubagentStatus,
  { readonly label: string; readonly className: string }
> = {
  cancelled: { label: "Cancelled", className: "bg-muted-foreground" },
  completed: { label: "Completed", className: "bg-success" },
  failed: { label: "Failed", className: "bg-destructive" },
  pending: { label: "Starting", className: "bg-info" },
  running: { label: "Running", className: "animate-status-pulse bg-success" },
  unavailable: { label: "Unavailable", className: "bg-muted-foreground" },
  waiting: { label: "Waiting", className: "bg-warning" },
};

function readableError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not load the native child task.";
}

function AgentStatus({ status }: { readonly status: NativeSubagentStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", presentation.className)} />
      {presentation.label}
    </span>
  );
}

function agentLabel(agent: NativeSubagentSummary): string {
  if (agent.agentPath) {
    return agent.agentPath.split("/").findLast((segment) => segment.length > 0) ?? agent.agentPath;
  }
  return `Agent ${agent.agentThreadId.slice(0, 8)}`;
}

export function NativeSubagentDetailPanel(props: {
  readonly parentThreadId: ThreadId;
  readonly selected: NativeSubagentSummary;
  readonly detail: NativeSubagentDetail | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onRetry: () => void;
}) {
  const { parentThreadId, selected, detail, loading, error, onBack, onRetry } = props;
  const childName = detail?.nickname ?? agentLabel(selected);

  return (
    <div aria-label={`Native child task ${childName}`} className="space-y-3">
      <div className="flex items-start gap-2 border-b border-border pb-3">
        <Button size="icon-sm" variant="ghost" aria-label="Back to parent task" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{childName}</div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            <span className="font-mono">Parent {detail?.parentTaskId ?? parentThreadId}</span>
            <span aria-hidden> → </span>
            <span className="font-mono">
              Child {detail?.agentThreadId ?? selected.agentThreadId}
            </span>
          </div>
        </div>
        <AgentStatus status={detail?.status ?? selected.status} />
      </div>

      {loading ? (
        <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" />
          Loading bounded child history…
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive"
        >
          <div className="flex items-start gap-2">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
            Retry child detail
          </Button>
        </div>
      ) : null}
      {detail ? (
        <>
          <div className="rounded-md border border-border bg-background/45 p-3">
            <div className="text-sm font-medium text-foreground">{detail.preview}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
              {detail.role ? <span>{detail.role}</span> : null}
              <span>{detail.updatedAt}</span>
            </div>
          </div>
          <div aria-label="Bounded child activity" className="space-y-1.5">
            {detail.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No child activity is available.</p>
            ) : (
              detail.items.map((item) => (
                <div key={item.id} className="rounded-md border border-border/70 px-3 py-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span>{item.type}</span>
                    {item.status ? <span>{item.status}</span> : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/85">{item.summary}</p>
                </div>
              ))
            )}
            {detail.truncated ? (
              <p className="text-[11px] text-muted-foreground">
                Earlier child activity remains in the native task and was not loaded.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export const NativeSubagentsPanel = memo(function NativeSubagentsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly parentThreadId: ThreadId;
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
  readonly onOpenChild?: (agentThreadId: string) => void;
}) {
  const { environmentId, parentThreadId, activities, onOpenChild } = props;
  const readDetail = useAtomCommand(readNativeSubagent, { reportFailure: false });
  const projection = useMemo(() => deriveNativeSubagents(activities), [activities]);
  const [selected, setSelected] = useState<NativeSubagentSummary | null>(null);
  const selectedRef = useRef<NativeSubagentSummary | null>(null);
  const requestIdRef = useRef(0);
  const [detail, setDetail] = useState<NativeSubagentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    requestIdRef.current += 1;
    selectedRef.current = null;
    setSelected(null);
    setDetail(null);
    setLoading(false);
    setError(null);
  }, []);

  const open = useCallback(
    (agent: NativeSubagentSummary) => {
      onOpenChild?.(agent.agentThreadId);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      selectedRef.current = agent;
      setSelected(agent);
      setDetail(null);
      setError(null);
      setLoading(true);
      void readDetail({
        environmentId,
        input: { threadId: parentThreadId, agentThreadId: agent.agentThreadId },
      }).then((result) => {
        if (
          !shouldApplyNativeSubagentResult({
            activeRequestId: requestIdRef.current,
            resultRequestId: requestId,
            selectedAgentThreadId: selectedRef.current?.agentThreadId ?? null,
            resultAgentThreadId: agent.agentThreadId,
          })
        ) {
          return;
        }
        setLoading(false);
        if (result._tag === "Success") {
          setDetail(result.value);
          return;
        }
        if (!isAtomCommandInterrupted(result)) {
          setError(readableError(squashAtomCommandFailure(result)));
        }
      });
    },
    [environmentId, onOpenChild, parentThreadId, readDetail],
  );

  return (
    <section aria-label="Native subagents" className="min-h-full" data-native-subagents="">
      {selected ? (
        <NativeSubagentDetailPanel
          parentThreadId={parentThreadId}
          selected={selected}
          detail={detail}
          loading={loading}
          error={error}
          onBack={close}
          onRetry={() => open(selected)}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
            <BotIcon className="size-3.5" />
            Native child tasks
          </div>
          {projection.agents.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              No subagents
            </div>
          ) : (
            <div className="space-y-1.5" aria-label="Bounded native child list">
              {projection.agents.map((agent) => (
                <button
                  key={agent.agentThreadId}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md border border-border bg-background/55 px-2.5 py-2 text-left outline-hidden transition-colors hover:border-strong-border hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => open(agent)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {agentLabel(agent)}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {agent.recentActivity.at(-1) ?? agent.agentThreadId}
                    </span>
                  </span>
                  <AgentStatus status={agent.status} />
                </button>
              ))}
              {projection.truncated ? (
                <p className="px-1 text-[10px] text-muted-foreground">
                  More child tasks remain in native task history.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
});
