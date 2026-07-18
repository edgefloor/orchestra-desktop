import {
  OrchestraReplayEvent,
  type EnvironmentId,
  type OrchestraEvidenceReference,
  type OrchestraEvidenceContentProjection,
  type OrchestraExecutionRunProjection,
  type OrchestraExecutionStepProjection,
  type OrchestraHistoryCursor,
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
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { queryOrchestra } from "~/state/orchestra";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";
import {
  buildWorkflowTreeQuery,
  compactEvidenceReference,
  compactWorkflowStepSummary,
  evidenceContentDisplayState,
  evidenceErrorState,
  formatBoundedOutputValue,
  mergeWorkflowPage,
  preserveWorkflowStepOrder,
  workflowDetailDisplayState,
  workflowContinuationAdvanced,
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
  recovering: {
    label: "Recovering",
    className: "animate-status-pulse bg-info",
  },
  running: { label: "Running", className: "animate-status-pulse bg-success" },
  unavailable: { label: "Unavailable", className: "bg-muted-foreground" },
  waiting: { label: "Waiting", className: "bg-warning" },
};

type QuerySelector = OrchestraQueryInput["selector"];
type QueryContinuation = string | OrchestraHistoryCursor;

export function findRequestedEvidenceReference(
  evidenceByStep: Readonly<Record<string, ReadonlyArray<OrchestraEvidenceReference>>>,
  requestedEvidenceId: string,
): {
  readonly stepId: string;
  readonly item: OrchestraEvidenceReference;
} | null {
  for (const [stepId, items] of Object.entries(evidenceByStep)) {
    const item = items.find((candidate) => candidate.evidenceId === requestedEvidenceId);
    if (item) return { stepId, item };
  }
  return null;
}

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

export function EvidenceIdentity({ identity }: { readonly identity: string }) {
  return (
    <span data-evidence-identity={identity}>
      <span className="sr-only">Evidence identity: {identity}</span>
      <span aria-hidden="true">id {identity}</span>
    </span>
  );
}

export const OrchestraLifecycleEntry = memo(function OrchestraLifecycleEntry(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly event: OrchestraReplayEvent;
  readonly requestedRunId?: string;
  readonly requestedEvidenceStepId?: string;
  readonly requestedEvidenceId?: string;
  readonly onOpenRun?: (runId: string) => void;
  readonly onOpenEvidence?: (runId: string, stepId: string, evidenceId: string) => void;
}) {
  const {
    environmentId,
    threadId,
    event,
    requestedRunId,
    requestedEvidenceStepId,
    requestedEvidenceId,
    onOpenRun,
    onOpenEvidence,
  } = props;
  const query = useAtomCommand(queryOrchestra, { reportFailure: false });
  const compact = useMemo(() => compactWorkflowStepSummary(event), [event]);
  const disclosureId = useId();
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
  const [continuations, setContinuations] = useState<Readonly<Record<string, QueryContinuation>>>(
    {},
  );
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const restoredRunRequestRef = useRef<string | null>(null);
  const restoredEvidencePageRequestRef = useRef<string | null>(null);
  const restoredEvidenceRequestRef = useRef<string | null>(null);

  const load = useCallback(
    async (
      selector: QuerySelector,
      stepId?: string,
      evidenceId?: string,
      continuation?: QueryContinuation,
    ) => {
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
          ...(typeof continuation === "string" ? { after: continuation } : {}),
          ...(continuation && typeof continuation !== "string"
            ? { historyAfter: continuation }
            : {}),
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
      const updateContinuation = (next: QueryContinuation | null | undefined) => {
        const nextAdvanced =
          !next || !continuation || workflowContinuationAdvanced(continuation, next);
        if (!nextAdvanced) {
          setErrors((current) => ({
            ...current,
            [key]: "Native pagination did not advance; additional detail remains unavailable.",
          }));
        }
        setContinuations((current) => {
          if (next && nextAdvanced) return { ...current, [key]: next };
          const updated = { ...current };
          delete updated[key];
          return updated;
        });
      };
      switch (response.selector) {
        case "run":
          setRun(response.result);
          break;
        case "steps":
          setSteps((current) =>
            continuation
              ? mergeWorkflowPage(current ?? [], response.result.items, (step) => step.id)
              : preserveWorkflowStepOrder(response.result.items),
          );
          updateContinuation(response.result.next);
          break;
        case "outputs":
          if (stepId) {
            setOutputs((current) => ({
              ...current,
              [stepId]: continuation
                ? mergeWorkflowPage(
                    current[stepId] ?? [],
                    response.result.items,
                    (output) => output.name,
                  )
                : response.result.items,
            }));
          }
          updateContinuation(response.result.next);
          break;
        case "evidence":
          if (stepId) {
            setEvidence((current) => ({
              ...current,
              [stepId]: continuation
                ? mergeWorkflowPage(
                    current[stepId] ?? [],
                    response.result.items,
                    (item) => item.evidenceId,
                  )
                : response.result.items,
            }));
          }
          updateContinuation(response.result.next);
          break;
        case "evidence_content":
          setEvidenceContent((current) => ({
            ...current,
            [response.result.evidenceId]: response.result,
          }));
          break;
        case "history":
          setHistory((current) =>
            continuation
              ? mergeWorkflowPage(
                  current ?? [],
                  response.result.items,
                  (item) => `${item.sequence}:${item.itemId}:${item.revision}`,
                )
              : response.result.items,
          );
          updateContinuation(response.result.next);
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
    if (next) onOpenRun?.(event.runId);
    if (next && run === null && steps === null) {
      void Promise.all([load("run"), load("steps")]);
    }
  }, [event.runId, expanded, load, onOpenRun, run, steps]);

  useEffect(() => {
    if (requestedRunId !== event.runId) {
      restoredRunRequestRef.current = null;
      return;
    }

    const restorationKey = `${requestedRunId}:${requestedEvidenceId ?? ""}`;
    if (restoredRunRequestRef.current === restorationKey) return;
    restoredRunRequestRef.current = restorationKey;
    setExpanded(true);
    if (run === null && steps === null) {
      void Promise.all([load("run"), load("steps")]);
    }
  }, [event.runId, load, requestedEvidenceId, requestedRunId, run, steps]);

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
    (stepId: string, item: OrchestraEvidenceReference) => {
      const willExpand = !expandedEvidence.has(item.evidenceId);
      setExpandedEvidence((current) => {
        const next = new Set(current);
        if (willExpand) next.add(item.evidenceId);
        else next.delete(item.evidenceId);
        return next;
      });
      if (willExpand) onOpenEvidence?.(event.runId, stepId, item.evidenceId);
      if (willExpand && evidenceContent[item.evidenceId] === undefined) {
        void load("evidence_content", undefined, item.evidenceId);
      }
    },
    [event.runId, evidenceContent, expandedEvidence, load, onOpenEvidence],
  );

  useEffect(() => {
    if (
      requestedRunId !== event.runId ||
      !requestedEvidenceStepId ||
      !requestedEvidenceId ||
      !steps?.some((step) => step.id === requestedEvidenceStepId)
    ) {
      restoredEvidencePageRequestRef.current = null;
      return;
    }
    setExpandedSteps((current) => new Set(current).add(requestedEvidenceStepId));
    const restorationKey = `${event.runId}:${requestedEvidenceStepId}:${requestedEvidenceId}`;
    if (
      evidence[requestedEvidenceStepId] === undefined &&
      restoredEvidencePageRequestRef.current !== restorationKey
    ) {
      restoredEvidencePageRequestRef.current = restorationKey;
      void load("evidence", requestedEvidenceStepId);
    }
  }, [
    event.runId,
    evidence,
    load,
    requestedEvidenceId,
    requestedEvidenceStepId,
    requestedRunId,
    steps,
  ]);

  useEffect(() => {
    if (requestedRunId !== event.runId || !requestedEvidenceId) {
      restoredEvidenceRequestRef.current = null;
      return;
    }

    const match = findRequestedEvidenceReference(evidence, requestedEvidenceId);
    if (!match) return;
    const restorationKey = `${event.runId}:${requestedEvidenceId}`;
    if (restoredEvidenceRequestRef.current === restorationKey) return;
    restoredEvidenceRequestRef.current = restorationKey;
    setExpanded(true);
    setExpandedSteps((current) => new Set(current).add(match.stepId));
    setExpandedEvidence((current) => new Set(current).add(requestedEvidenceId));
    if (evidenceContent[requestedEvidenceId] === undefined) {
      void load("evidence_content", undefined, requestedEvidenceId);
    }
  }, [event.runId, evidence, evidenceContent, load, requestedEvidenceId, requestedRunId]);

  const nativeState = workflowRunDisplayState(event.projection.status, event.kind);
  const rootUnavailable = Boolean(errors["run:run"] || errors["steps:run"]);

  return (
    <section
      aria-label={`Workflow run ${event.runId}`}
      className="rounded-md px-0.5 py-0.5"
      data-workflow-run-status={nativeState}
    >
      <div>
        <button
          type="button"
          aria-controls={`${disclosureId}-run-details`}
          aria-expanded={expanded}
          className="flex min-h-6 w-full items-center gap-1.5 rounded text-left hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 pointer-coarse:min-h-11"
          data-workflow-run-disclosure
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
          <div
            id={`${disclosureId}-run-details`}
            className="mt-1 ms-7 border-s border-border/45 py-1 ps-3 text-[11px]"
          >
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

            {steps?.map((step, stepIndex) => {
              const stepExpanded = expandedSteps.has(step.id);
              const outputKey = `outputs:${step.id}`;
              const evidenceKey = `evidence:${step.id}`;
              const stepDetailsId = `${disclosureId}-step-${stepIndex}-details`;
              return (
                <div
                  key={step.id}
                  className="mt-2 rounded border border-border/45 bg-background/25"
                  data-workflow-step-id={step.id}
                >
                  <button
                    type="button"
                    aria-controls={stepDetailsId}
                    aria-expanded={stepExpanded}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
                    data-workflow-step-disclosure
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
                      id={stepDetailsId}
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
                        <p
                          className="font-mono text-[10px]"
                          data-workflow-child-task-path={step.agent.taskPath}
                          data-workflow-child-thread-id={step.agent.threadId}
                        >
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
                          <div
                            key={output.name}
                            className="rounded border border-border/40 p-2"
                            data-workflow-output-name={output.name}
                          >
                            <div className="flex items-center gap-1.5 text-foreground/75">
                              <FileKeyIcon className="size-3" />
                              <span className="font-medium">{output.name}</span>
                              <span>{output.canonicalBytes} bytes</span>
                            </div>
                            {value ? (
                              <pre
                                className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px]"
                                data-workflow-output-value
                              >
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
                        const contentState = content
                          ? evidenceContentDisplayState(item, content)
                          : null;
                        return (
                          <div
                            className="rounded border border-border/40 p-2"
                            data-workflow-evidence-availability={reference.availability}
                            data-workflow-evidence-content-state={
                              !itemExpanded
                                ? "collapsed"
                                : loading.has(contentKey)
                                  ? "loading"
                                  : error
                                    ? "error"
                                    : (contentState?.kind ?? "pending")
                            }
                            data-workflow-evidence-kind={item.kind}
                            data-workflow-evidence-name={item.name}
                            data-workflow-evidence-provenance={reference.provenance}
                            key={item.evidenceId}
                          >
                            <button
                              aria-expanded={itemExpanded}
                              className="flex min-h-6 w-full items-center gap-2 text-left pointer-coarse:min-h-11"
                              data-workflow-evidence-disclosure
                              onClick={() => toggleEvidence(step.id, item)}
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
                              <EvidenceIdentity identity={reference.identity} />
                              <span>{item.bytes} bytes</span>
                              <span className="break-all">
                                runtime-reported sha256 {item.sha256 ?? "unavailable"}
                              </span>
                            </div>
                            {itemExpanded ? (
                              <div className="mt-2 border-t border-border/35 pt-2">
                                {loading.has(contentKey) ? (
                                  <p className="flex items-center gap-1.5">
                                    <LoaderCircleIcon className="size-3 animate-spin" />
                                    Loading authorized evidence…
                                  </p>
                                ) : error ? (
                                  <p className="text-destructive" role="alert">
                                    Evidence {evidenceErrorState(error).replaceAll("_", " ")}.
                                  </p>
                                ) : contentState?.kind === "text" && content ? (
                                  <div>
                                    <p className="mb-1 text-[10px] text-muted-foreground">
                                      Plain-text preview · extension-declared {content.mediaType}
                                    </p>
                                    <pre
                                      className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[10px] text-foreground/75"
                                      data-workflow-evidence-preview
                                    >
                                      {contentState.content}
                                    </pre>
                                  </div>
                                ) : contentState?.kind === "integrity_failure" ? (
                                  <p className="text-destructive" role="alert">
                                    Evidence integrity changed since this reference was loaded;
                                    content was not rendered.
                                  </p>
                                ) : contentState?.kind === "unsupported_media" && content ? (
                                  <p>
                                    Evidence media type {content.mediaType} is not rendered inline.
                                  </p>
                                ) : contentState?.kind === "empty" && content ? (
                                  <p>Empty evidence · extension-declared {content.mediaType}</p>
                                ) : contentState?.kind === "content_too_large" && content ? (
                                  <p>
                                    Preview exceeds the native evidence or response budget ·{" "}
                                    {content.mediaType}
                                  </p>
                                ) : contentState?.kind === "malformed" && content ? (
                                  <p>Evidence is not valid UTF-8 text · {content.mediaType}</p>
                                ) : contentState && content ? (
                                  <p>
                                    Evidence {contentState.kind.replaceAll("_", " ")} ·{" "}
                                    {content.mediaType}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {continuations[outputKey] ? (
                        <button
                          type="button"
                          className="min-h-6 rounded border border-border px-2 py-1 text-foreground/75 hover:bg-accent/30 disabled:opacity-50 pointer-coarse:min-h-11"
                          disabled={loading.has(outputKey)}
                          onClick={() =>
                            load("outputs", step.id, undefined, continuations[outputKey])
                          }
                        >
                          Load more outputs
                        </button>
                      ) : null}
                      {continuations[evidenceKey] ? (
                        <button
                          type="button"
                          className="min-h-6 rounded border border-border px-2 py-1 text-foreground/75 hover:bg-accent/30 disabled:opacity-50 pointer-coarse:min-h-11"
                          disabled={loading.has(evidenceKey)}
                          onClick={() =>
                            load("evidence", step.id, undefined, continuations[evidenceKey])
                          }
                        >
                          Load more Evidence
                        </button>
                      ) : null}
                      {errors[outputKey] || errors[evidenceKey] ? (
                        <p className="flex items-start gap-1.5 text-destructive" role="alert">
                          <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />
                          {errors[outputKey] ?? errors[evidenceKey]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {continuations["steps:run"] ? (
              <button
                type="button"
                className="mt-2 min-h-6 rounded border border-border px-2 py-1 text-muted-foreground hover:bg-accent/30 disabled:opacity-50 pointer-coarse:min-h-11"
                disabled={loading.has("steps:run")}
                onClick={() => load("steps", undefined, undefined, continuations["steps:run"])}
              >
                Load more steps
              </button>
            ) : null}

            <div className="mt-2">
              <button
                type="button"
                aria-controls={`${disclosureId}-history-details`}
                aria-expanded={historyExpanded}
                className="flex min-h-6 items-center gap-2 rounded px-1 py-1 text-muted-foreground hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 pointer-coarse:min-h-11"
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
                <div id={`${disclosureId}-history-details`} className="ms-6 mt-1 space-y-1.5">
                  {loading.has("history:run") ? <p>Loading rollout-backed history…</p> : null}
                  {history?.length === 0 ? <p>No native history records are available.</p> : null}
                  {history?.map((item) => (
                    <div key={`${item.sequence}:${item.itemId}:${item.revision}`}>
                      <span className="font-medium text-foreground/75">{item.kind}</span>
                      {item.stepId ? <span> · {item.stepId}</span> : null}
                      <p>{item.summary}</p>
                    </div>
                  ))}
                  {continuations["history:run"] ? (
                    <button
                      type="button"
                      className="min-h-6 rounded border border-border px-2 py-1 text-muted-foreground hover:bg-accent/30 disabled:opacity-50 pointer-coarse:min-h-11"
                      disabled={loading.has("history:run")}
                      onClick={() =>
                        load("history", undefined, undefined, continuations["history:run"])
                      }
                    >
                      Load earlier history
                    </button>
                  ) : null}
                  {errors["history:run"] ? (
                    <p className="flex items-start gap-1.5 text-destructive" role="alert">
                      <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />
                      {errors["history:run"]}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {rootUnavailable ? (
              <p className="mt-2 flex items-start gap-1.5 text-destructive" role="alert">
                <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />
                {errors["run:run"] ?? errors["steps:run"]}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
});
