import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { GitBranchIcon } from "lucide-react";
import { memo, useMemo } from "react";

import type { WorkLogEntry } from "../../session-logic";
import { OrchestraLifecycleEntry } from "./OrchestraLifecycleEntry";
import { deriveWorkspaceWorkflowRuns } from "./WorkflowRunsView.logic";

export const WorkflowRunsView = memo(function WorkflowRunsView(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly workLogEntries: ReadonlyArray<WorkLogEntry>;
  readonly requestedRunId?: string;
  readonly requestedEvidenceId?: string;
  readonly onOpenRun?: (runId: string) => void;
  readonly onOpenEvidence?: (runId: string, evidenceId: string) => void;
}) {
  const projection = useMemo(
    () => deriveWorkspaceWorkflowRuns(props.workLogEntries, undefined, props.requestedRunId),
    [props.requestedRunId, props.workLogEntries],
  );
  const requestedRunAvailable =
    props.requestedRunId === undefined ||
    projection.items.some(({ event }) => event.runId === props.requestedRunId);

  if (projection.items.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border p-5 text-center">
        <GitBranchIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">No Workflow Runs yet</p>
        <p className="mt-1 max-w-56 text-xs leading-relaxed text-muted-foreground">
          Task-owned Runs appear here from the native lifecycle. Details remain unloaded until you
          expand a Run.
        </p>
        {!requestedRunAvailable ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            Requested Run {props.requestedRunId} is unavailable in the native task history.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-label="Task Workflow Runs" className="space-y-2">
      <div className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {projection.items.length} native {projection.items.length === 1 ? "Run" : "Runs"} · detail
        loads on request
      </div>
      {projection.items.map(({ event }) => (
        <div
          key={`${event.runId}:${event.revision}:${event.sequence}`}
          className="rounded-md border border-border bg-background/45 p-2"
        >
          <OrchestraLifecycleEntry
            environmentId={props.environmentId}
            threadId={props.threadId}
            event={event}
            {...(event.runId === props.requestedRunId
              ? {
                  requestedRunId: props.requestedRunId,
                  ...(props.requestedEvidenceId
                    ? { requestedEvidenceId: props.requestedEvidenceId }
                    : {}),
                }
              : {})}
            {...(props.onOpenRun ? { onOpenRun: props.onOpenRun } : {})}
            {...(props.onOpenEvidence ? { onOpenEvidence: props.onOpenEvidence } : {})}
          />
        </div>
      ))}
      {projection.omitted > 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {projection.omitted} earlier {projection.omitted === 1 ? "Run remains" : "Runs remain"} in
          the native task history.
        </p>
      ) : null}
      {!requestedRunAvailable ? (
        <p className="px-1 text-[11px] text-destructive" role="alert">
          Requested Run {props.requestedRunId} is unavailable in the native task history.
        </p>
      ) : null}
    </section>
  );
});
