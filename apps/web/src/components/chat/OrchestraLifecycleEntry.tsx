import {
  OrchestraReplayEvent,
  type EnvironmentId,
  type OrchestraEvidenceReference,
  type OrchestraEvidenceContentProjection,
  type OrchestraExecutionRunProjection,
  type OrchestraExecutionStepProjection,
  type OrchestraHistoryRecord,
  type OrchestraOutputProjection,
  type OrchestraQueryInput,
  type ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FileKeyIcon,
  GitBranchIcon,
  HistoryIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { queryOrchestra } from "~/state/orchestra";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";
import {
  buildWorkflowTreeQuery,
  compactEvidenceReference,
  compactWorkflowStepSummary,
  evidenceErrorState,
  formatBoundedOutputValue,
  sortWorkflowSteps,
  workflowDetailDisplayState,
  workflowRunDisplayState,
  workflowStepKind,
  type WorkflowRunDisplayState,
} from "./WorkflowRunTree.logic";

const isReplayEvent = Schema.is(OrchestraReplayEvent);

const STATUS_PRESENTATION: Record<
  WorkflowRunDisplayState,
  { readonly label: string; readonly className: string }
> = {
  cancelled: { label: "Cancelled", className: "bg-muted-foreground" },
  completed: { label: "Completed", className: "bg-success" },
  failed: { label: "Failed", className: "bg-destructive" },
  paused: { label: "Paused", className: "bg-warning" },
  queued: { label: "Queued", className: "bg-info" },
  recovering: { label: "Recovering", className: "animate-status-pulse bg-info" },
  running: { label: "Running", className: "animate-status-pulse bg-success" },
  unavailable: { label: "Unavailable", className: "bg-muted-foreground" },
  waiting: { label: "Waiting", className: "bg-warning" },
};

type QuerySelector = OrchestraQueryInput["selector"];

export function readOrchestraReplayEvent(value: unknown): OrchestraReplayEvent | null {
  return isReplayEvent(value) ? value : null;
}

function readableError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not load Orchestra details.";
}

function Status({ state }: { readonly state: WorkflowRunDisplayState }) {
  const presentation = STATUS_PRESENTATION[state];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", presentation.className)} />
      {presentation.label}
    </span>
  );
}

function BoundedText(props: {
  readonly value: { readonly text: string; readonly truncated: boolean };
  readonly className?: string;
}) {
  return (
    <p className={props.className}>
      {props.value.text}
      {props.value.truncated ? "…" : ""}
    </p>
  );
}

export const OrchestraLifecycleEntry = memo(function OrchestraLifecycleEntry(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly event: OrchestraReplayEvent;
}) {
  const { environmentId, threadId, event } = props;
  const query = useAtomCommand(queryOrchestra, { reportFailure: false });
  const compact = useMemo(() => compactWorkflowStepSummary(event), [event]);
  const [expanded, setExpanded] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<ReadonlySet<string>>(() => new Set());
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [run, setRun] = useState<OrchestraExecutionRunProjection | null>(null);
  const [steps, setSteps] = useState<ReadonlyArray<OrchestraExecutionStepProjection> | null>(null);
  const [outputs, setOutputs] = useState<
    Readonly<Record<string, ReadonlyArray<OrchestraOutputProjection>>>
  >({});
  const [evidence, setEvidence] = useState<
    Readonly<Record<string, ReadonlyArray<OrchestraEvidenceReference>>>
  >({});
  const [evidenceContent, setEvidenceContent] = useState<
    Readonly<Record<string, OrchestraEvidenceContentProjection>>
  >({});
  const [expandedEvidence, setExpandedEvidence] = useState<ReadonlySet<string>>(() => new Set());
  const [history, setHistory] = useState<ReadonlyArray<OrchestraHistoryRecord> | null>(null);
  const [continuations, setContinuations] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const load = useCallback(
    async (selector: QuerySelector, stepId?: string, evidenceId?: string) => {
      const key = `${selector}:${evidenceId ?? stepId ?? "run"}`;
      setLoading((current) => new Set(current).add(key));
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      const result = await query({
        environmentId,
        input: buildWorkflowTreeQuery({
          threadId,
          runId: event.runId,
          selector,
          ...(stepId ? { stepId } : {}),
          ...(evidenceId ? { evidenceId } : {}),
        }),
      });
      setLoading((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      if (result._tag !== "Success") {
        if (!isAtomCommandInterrupted(result)) {
          setErrors((current) => ({
            ...current,
            [key]: readableError(squashAtomCommandFailure(result)),
          }));
        }
        return;
      }

      const response = result.value;
      switch (response.selector) {
        case "run":
          setRun(response.result);
          break;
        case "steps":
          setSteps(sortWorkflowSteps(response.result.items));
          if (response.result.next) setContinuations((current) => new Set(current).add(key));
          break;
        case "outputs":
          if (stepId) {
            setOutputs((current) => ({ ...current, [stepId]: response.result.items }));
          }
          if (response.result.next) setContinuations((current) => new Set(current).add(key));
          break;
        case "evidence":
          if (stepId) {
            setEvidence((current) => ({ ...current, [stepId]: response.result.items }));
          }
          if (response.result.next) setContinuations((current) => new Set(current).add(key));
          break;
        case "evidence_content":
          setEvidenceContent((current) => ({
            ...current,
            [response.result.evidenceId]: response.result,
          }));
          break;
        case "history":
          setHistory(response.result.items);
          if (response.result.next) setContinuations((current) => new Set(current).add(key));
          break;
        case "digest":
          break;
      }
    },
    [environmentId, event.runId, query, threadId],
  );

  const toggleRoot = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && run === null && steps === null) {
      void Promise.all([load("run"), load("steps")]);
    }
  }, [expanded, load, run, steps]);

  const toggleStep = useCallback(
    (stepId: string) => {
      const nextExpanded = !expandedSteps.has(stepId);
      setExpandedSteps((current) => {
        const next = new Set(current);
        if (nextExpanded) next.add(stepId);
        else next.delete(stepId);
        return next;
      });
      if (nextExpanded && outputs[stepId] === undefined && evidence[stepId] === undefined) {
        void Promise.all([load("outputs", stepId), load("evidence", stepId)]);
      }
    },
    [evidence, expandedSteps, load, outputs],
  );

  const toggleHistory = useCallback(() => {
    const next = !historyExpanded;
    setHistoryExpanded(next);
    if (next && history === null) void load("history");
  }, [history, historyExpanded, load]);

  const toggleEvidence = useCallback(
    (item: OrchestraEvidenceReference) => {
      const willExpand = !expandedEvidence.has(item.evidenceId);
      setExpandedEvidence((current) => {
        const next = new Set(current);
        if (willExpand) next.add(item.evidenceId);
        else next.delete(item.evidenceId);
        return next;
      });
      if (willExpand && evidenceContent[item.evidenceId] === undefined) {
        void load("evidence_content", undefined, item.evidenceId);
      }
    },
    [evidenceContent, expandedEvidence, load],
  );

  const nativeState = workflowRunDisplayState(event.projection.status, event.kind);
  const rootUnavailable = Boolean(errors["run:run"] || errors["steps:run"]);

  return (
    <div
      role="tree"
      aria-label={`Workflow run ${event.runId}`}
      className="rounded-md px-0.5 py-0.5"
    >
      <div role="treeitem" aria-expanded={expanded}>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded text-left hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          onClick={toggleRoot}
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/70">
            <GitBranchIcon className="size-3.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] leading-5">
            <span className="font-medium text-foreground/82">Orchestra workflow</span>
            <span className="ms-1.5 text-muted-foreground/60">
              {compact.completed}/{compact.total} steps · {event.projection.nextAction}
            </span>
          </span>
          <Status
            state={workflowDetailDisplayState(
              nativeState,
              errors["run:run"] ?? errors["steps:run"] ?? null,
            )}
          />
          <ChevronDownIcon
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {!expanded && compact.total > 0 ? (
          <div
            className="ms-7 mt-0.5 flex max-w-full gap-1 overflow-hidden"
            aria-label="Bounded step summary"
          >
            {compact.items.map((step) => (
              <span
                key={step.id}
                className="max-w-32 truncate rounded border border-border/45 bg-background/35 px-1.5 py-0.5 text-[9px] text-muted-foreground"
              >
                {step.id} · {step.status}
              </span>
            ))}
            {compact.omitted > 0 ? (
              <span className="shrink-0 text-[9px] text-muted-foreground/60">
                +{compact.omitted}
              </span>
            ) : null}
          </div>
        ) : null}

        {expanded ? (
          <div role="group" className="mt-1 ms-7 border-s border-border/45 py-1 ps-3 text-[11px]">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
              <span className="font-mono">{event.runId}</span>
              <span>Revision {event.revision}</span>
              <span>{event.kind}</span>
              {run ? <span>Promotion {run.promotion}</span> : null}
            </div>

            {loading.has("run:run") || loading.has("steps:run") ? (
              <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                <LoaderCircleIcon className="size-3 animate-spin" />
                Loading bounded native run tree…
              </p>
            ) : null}

            {run ? (
              <BoundedText value={run.nextAction} className="mt-2 text-foreground/75" />
            ) : null}

            {steps?.map((step) => {
              const stepExpanded = expandedSteps.has(step.id);
              const outputKey = `outputs:${step.id}`;
              const evidenceKey = `evidence:${step.id}`;
              return (
                <div
                  key={step.id}
                  role="treeitem"
                  aria-expanded={stepExpanded}
                  className="mt-2 rounded border border-border/45 bg-background/25"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
                    onClick={() => toggleStep(step.id)}
                  >
                    {stepExpanded ? (
                      <ChevronDownIcon className="size-3 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="size-3 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">
                      {workflowStepKind(step)} · {step.id}
                    </span>
                    <span className="text-muted-foreground">{step.status}</span>
                    <span className="text-muted-foreground">{step.outputCount} outputs</span>
                  </button>

                  {stepExpanded ? (
                    <div
                      role="group"
                      className="space-y-2 border-t border-border/35 px-3 py-2 text-muted-foreground"
                    >
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span>{step.attempts} attempts</span>
                        <span>{step.rounds} rounds</span>
                        {step.contextSha256 ? (
                          <span className="font-mono">ctx {step.contextSha256}</span>
                        ) : null}
                      </div>
                      {step.agent ? (
                        <p className="font-mono text-[10px]">
                          Child {step.agent.taskPath} · {step.agent.threadId}
                        </p>
                      ) : null}
                      {step.approvalDecision ? (
                        <div className="rounded border border-warning/35 bg-warning/6 p-2">
                          <span className="font-medium text-foreground/75">Decision</span>
                          <BoundedText value={step.approvalDecision} className="mt-1" />
                        </div>
                      ) : null}
                      {step.error ? (
                        <div className="rounded border border-destructive/35 bg-destructive/6 p-2 text-destructive">
                          <span className="font-medium">Failure</span>
                          <BoundedText value={step.error} className="mt-1" />
                        </div>
                      ) : null}

                      {loading.has(outputKey) || loading.has(evidenceKey) ? (
                        <p className="flex items-center gap-1.5">
                          <LoaderCircleIcon className="size-3 animate-spin" />
                          Loading step outputs and evidence references…
                        </p>
                      ) : null}

                      {outputs[step.id]?.map((output) => {
                        const value = formatBoundedOutputValue(output.value);
                        return (
                          <div key={output.name} className="rounded border border-border/40 p-2">
                            <div className="flex items-center gap-1.5 text-foreground/75">
                              <FileKeyIcon className="size-3" />
                              <span className="font-medium">{output.name}</span>
                              <span>{output.canonicalBytes} bytes</span>
                            </div>
                            {value ? (
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px]">
                                {value}
                              </pre>
                            ) : (
                              <p className="mt-1">Value remains runtime-owned · {output.sha256}</p>
                            )}
                          </div>
                        );
                      })}

                      {evidence[step.id]?.map((item) => {
                        const contentKey = `evidence_content:${item.evidenceId}`;
                        const content = evidenceContent[item.evidenceId];
                        const itemExpanded = expandedEvidence.has(item.evidenceId);
                        const error = errors[contentKey];
                        const reference = compactEvidenceReference(item);
                        return (
                          <div
                            className="rounded border border-border/40 p-2"
                            key={item.evidenceId}
                          >
                            <button
                              aria-expanded={itemExpanded}
                              className="flex w-full items-center gap-2 text-left"
                              onClick={() => toggleEvidence(item)}
                              type="button"
                            >
                              {itemExpanded ? (
                                <ChevronDownIcon className="size-3 shrink-0" />
                              ) : (
                                <ChevronRightIcon className="size-3 shrink-0" />
                              )}
                              <span className="min-w-0 flex-1 truncate font-medium text-foreground/75">
                                {item.name}
                              </span>
                              <span>{item.kind}</span>
                              <span>{reference.provenance}</span>
                              <span>{reference.availability}</span>
                            </button>
                            <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10px]">
                              <span>id {reference.identity}</span>
                              <span>{item.bytes} bytes</span>
                              <span>sha256 {reference.integrity}</span>
                            </div>
                            {itemExpanded ? (
                              <div className="mt-2 border-t border-border/35 pt-2">
                                {loading.has(contentKey) ? (
                                  <p className="flex items-center gap-1.5">
                                    <LoaderCircleIcon className="size-3 animate-spin" />
                                    Loading authorized evidence…
                                  </p>
                                ) : error ? (
                                  <p className="text-destructive">
                                    Evidence {evidenceErrorState(error).replaceAll("_", " ")}.
                                  </p>
                                ) : content?.availability === "available" && content.content ? (
                                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[10px] text-foreground/75">
                                    {content.content}
                                  </pre>
                                ) : content ? (
                                  <p>
                                    Evidence {content.availability.replaceAll("_", " ")} ·{" "}
                                    {content.mediaType}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {continuations.has(outputKey) || continuations.has(evidenceKey) ? (
                        <p>Additional step detail remains in the native runtime.</p>
                      ) : null}
                      {errors[outputKey] || errors[evidenceKey] ? (
                        <p className="flex items-start gap-1.5 text-destructive">
                          <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />
                          {errors[outputKey] ?? errors[evidenceKey]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {continuations.has("steps:run") ? (
              <p className="mt-2 text-muted-foreground">
                Additional steps remain in the native runtime.
              </p>
            ) : null}

            <div role="treeitem" aria-expanded={historyExpanded} className="mt-2">
              <button
                type="button"
                className="flex items-center gap-2 rounded px-1 py-1 text-muted-foreground hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                onClick={toggleHistory}
              >
                {historyExpanded ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
                <HistoryIcon className="size-3" />
                Recovery and decision history
              </button>
              {historyExpanded ? (
                <div role="group" className="ms-6 mt-1 space-y-1.5">
                  {loading.has("history:run") ? <p>Loading rollout-backed history…</p> : null}
                  {history?.length === 0 ? <p>No native history records are available.</p> : null}
                  {history?.map((item) => (
                    <div key={`${item.sequence}:${item.itemId}:${item.revision}`}>
                      <span className="font-medium text-foreground/75">{item.kind}</span>
                      {item.stepId ? <span> · {item.stepId}</span> : null}
                      <p>{item.summary}</p>
                    </div>
                  ))}
                  {continuations.has("history:run") ? (
                    <p>Earlier history remains in the native rollout.</p>
                  ) : null}
                  {errors["history:run"] ? (
                    <p className="flex items-start gap-1.5 text-destructive">
                      <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />
                      {errors["history:run"]}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {rootUnavailable ? (
              <p className="mt-2 flex items-start gap-1.5 text-destructive">
                <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />
                {errors["run:run"] ?? errors["steps:run"]}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
