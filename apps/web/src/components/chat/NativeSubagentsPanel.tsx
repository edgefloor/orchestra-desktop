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
import { memo, useCallback, useMemo, useState } from "react";

import { deriveNativeSubagents, type NativeSubagentSummary } from "~/nativeSubagents";
import { readNativeSubagent } from "~/state/nativeSubagents";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

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
  if (agent.agentPath) return agent.agentPath.split("/").filter(Boolean).at(-1) ?? agent.agentPath;
  return `Agent ${agent.agentThreadId.slice(0, 8)}`;
}

export const NativeSubagentsPanel = memo(function NativeSubagentsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly parentThreadId: ThreadId;
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
}) {
  const { environmentId, parentThreadId, activities } = props;
  const readDetail = useAtomCommand(readNativeSubagent, { reportFailure: false });
  const projection = useMemo(() => deriveNativeSubagents(activities), [activities]);
  const [selected, setSelected] = useState<NativeSubagentSummary | null>(null);
  const [detail, setDetail] = useState<NativeSubagentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setSelected(null);
    setDetail(null);
    setLoading(false);
    setError(null);
  }, []);

  const open = useCallback(
    (agent: NativeSubagentSummary) => {
      setSelected(agent);
      setDetail(null);
      setError(null);
      setLoading(true);
      void readDetail({
        environmentId,
        input: { threadId: parentThreadId, agentThreadId: agent.agentThreadId },
      }).then((result) => {
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
    [environmentId, parentThreadId, readDetail],
  );

  return (
    <>
      <section
        aria-label="Native subagents"
        className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border bg-card/35 px-3 sm:px-5"
        data-native-subagents=""
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
          <BotIcon className="size-3.5" />
          Subagents
        </span>
        {projection.agents.length === 0 ? (
          <span className="text-[11px] text-muted-foreground/55">No subagents</span>
        ) : (
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {projection.agents.map((agent) => (
              <button
                key={agent.agentThreadId}
                type="button"
                className="inline-flex max-w-56 shrink-0 items-center gap-2 rounded-md border border-border bg-background/55 px-2 py-1 text-left outline-hidden transition-colors hover:border-strong-border hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => open(agent)}
              >
                <span className="truncate text-[11px] font-medium text-foreground">
                  {agentLabel(agent)}
                </span>
                <AgentStatus status={agent.status} />
              </button>
            ))}
            {projection.truncated ? (
              <span className="self-center text-[10px] text-muted-foreground">
                More in task history
              </span>
            ) : null}
          </div>
        )}
      </section>

      <Dialog open={selected !== null} onOpenChange={(nextOpen) => !nextOpen && close()}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Back to parent task"
                onClick={close}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <DialogTitle>
                  {detail?.nickname ?? (selected ? agentLabel(selected) : "Subagent")}
                </DialogTitle>
                <DialogDescription>
                  Native child task · detail loaded only on request
                </DialogDescription>
              </div>
              <AgentStatus status={detail?.status ?? selected?.status ?? "unavailable"} />
            </div>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Loading bounded child history…
              </div>
            ) : null}
            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive">
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            {detail ? (
              <>
                <div className="rounded-md border border-border bg-background/45 p-3">
                  <div className="text-sm font-medium text-foreground">{detail.preview}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                    {detail.role ? <span>{detail.role}</span> : null}
                    <span>{detail.agentThreadId}</span>
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
                        <p className="mt-1 text-xs leading-relaxed text-foreground/85">
                          {item.summary}
                        </p>
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
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
});
