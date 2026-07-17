import type {
  ApprovalRequestId,
  AutomationRun,
  EnvironmentId,
  ProviderApprovalDecision,
  ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { BellRingIcon, CircleAlertIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  LatestProposedPlanState,
  PendingApproval,
  PendingUserInput,
  WorkLogEntry,
} from "../../session-logic";
import { readAutomationStatus } from "~/state/automation";
import { queryOrchestra } from "~/state/orchestra";
import { useAtomCommand } from "~/state/use-atom-command";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import {
  buildAttentionWorkflowQuery,
  deriveTaskAttention,
  deriveTaskAttentionRuntimeState,
  readTaskAttentionRunCursor,
  taskAttentionActionRoute,
  type TaskAttentionItem,
} from "./TaskAttentionView.logic";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface TaskAttentionViewProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly runtimeRevisionKey: string;
  readonly approvals: ReadonlyArray<PendingApproval>;
  readonly pendingUserInputs: ReadonlyArray<PendingUserInput>;
  readonly actionableProposedPlan: LatestProposedPlanState | null;
  readonly workLogEntries: ReadonlyArray<WorkLogEntry>;
  readonly providerError: string | null;
  readonly respondingRequestIds: ReadonlyArray<ApprovalRequestId>;
  readonly onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
  readonly onReviewComposer: () => void;
  readonly onOpenPlanWorkspace: () => void;
  readonly onOpenWorkflowWorkspace: () => void;
  readonly onOpenAutomationWorkspace: () => void;
}

function readableError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Native attention detail is unavailable.";
}

function automationDetail(item: TaskAttentionItem, run: AutomationRun): string {
  if (item.kind === "reconciliation_failure") {
    return `${run.nextAction.text}${run.nextAction.truncated ? "…" : ""}`;
  }
  const claim = run.claims.find((candidate) => candidate.claimId === item.claimId);
  const effect = claim?.effects.find((candidate) => candidate.effectId === item.effectId);
  if (!claim || !effect) return "This item was resolved by the latest native Automation update.";
  const failure = effect.failure
    ? `${effect.failure.text}${effect.failure.truncated ? "…" : ""}`
    : null;
  return [
    `${claim.issueIdentifier} · ${effect.kind} · ${effect.status}`,
    failure ?? `${effect.bodyPreview.text}${effect.bodyPreview.truncated ? "…" : ""}`,
    effect.providerReceipt ? `Provider receipt ${effect.providerReceipt}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const TaskAttentionView = memo(function TaskAttentionView({
  environmentId,
  threadId,
  runtimeRevisionKey,
  approvals,
  pendingUserInputs,
  actionableProposedPlan,
  workLogEntries,
  providerError,
  respondingRequestIds,
  onRespondToApproval,
  onReviewComposer,
  onOpenPlanWorkspace,
  onOpenWorkflowWorkspace,
  onOpenAutomationWorkspace,
}: TaskAttentionViewProps) {
  const readStatus = useAtomCommand(readAutomationStatus, { reportFailure: false });
  const query = useAtomCommand(queryOrchestra, { reportFailure: false });
  const [expandedItems, setExpandedItems] = useState<ReadonlySet<string>>(() => new Set());
  const [automationRun, setAutomationRun] = useState<AutomationRun | null>(null);
  const [hasRunCursor, setHasRunCursor] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeRecovered, setRuntimeRecovered] = useState(false);
  const [detailLoading, setDetailLoading] = useState<ReadonlySet<string>>(() => new Set());
  const [detailById, setDetailById] = useState<Readonly<Record<string, string>>>({});
  const [detailErrors, setDetailErrors] = useState<Readonly<Record<string, string>>>({});
  const hadRuntimeError = useRef(false);
  const refreshRequestIdRef = useRef(0);

  const refreshRuntime = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const runId = readTaskAttentionRunCursor(localStorage, threadId);
    setHasRunCursor(Boolean(runId));
    if (!runId) {
      setAutomationRun(null);
      setRuntimeError(null);
      setRuntimeRecovered(false);
      return;
    }
    setRuntimeLoading(true);
    setRuntimeRecovered(false);
    const result = await readStatus({
      environmentId,
      input: { threadId, runId },
    });
    if (refreshRequestIdRef.current !== requestId) return;
    setRuntimeLoading(false);
    if (result._tag === "Success") {
      setAutomationRun(result.value.run);
      setRuntimeError(null);
      setRuntimeRecovered(hadRuntimeError.current);
      hadRuntimeError.current = false;
      return;
    }
    if (isAtomCommandInterrupted(result)) return;
    const message = readableError(squashAtomCommandFailure(result));
    hadRuntimeError.current = true;
    setRuntimeError(message);
  }, [environmentId, readStatus, threadId]);

  useEffect(() => {
    void refreshRuntime();
  }, [refreshRuntime, runtimeRevisionKey]);

  const projection = useMemo(
    () =>
      deriveTaskAttention({
        approvals,
        pendingUserInputs,
        actionableProposedPlan,
        workLogEntries,
        automationRun,
        providerError,
      }),
    [
      actionableProposedPlan,
      approvals,
      automationRun,
      pendingUserInputs,
      providerError,
      workLogEntries,
    ],
  );
  const runtimeState = deriveTaskAttentionRuntimeState({
    hasRunCursor,
    loading: runtimeLoading,
    hasSnapshot: automationRun !== null,
    error: runtimeError,
    recovered: runtimeRecovered,
  });

  const loadDetail = useCallback(
    async (item: TaskAttentionItem) => {
      if (!item.runId) return;
      const actionRoute = taskAttentionActionRoute(item);
      setDetailLoading((current) => new Set(current).add(item.id));
      setDetailErrors((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      if (actionRoute === "workflow_workspace") {
        const result = await query({
          environmentId,
          input: buildAttentionWorkflowQuery({ threadId, runId: item.runId }),
        });
        setDetailLoading((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        if (result._tag === "Success") {
          const response = result.value;
          if (response.selector === "steps") {
            const step = item.stepId
              ? response.result.items.find((candidate) => candidate.id === item.stepId)
              : response.result.items.find((candidate) =>
                  ["failed", "retrying", "running", "waitingApproval"].includes(candidate.status),
                );
            setDetailById((current) => ({
              ...current,
              [item.id]: step
                ? `${step.id} · ${step.status} · ${step.attempts} attempt(s) · ${step.rounds} round(s)`
                : item.stepId
                  ? "This Workflow item was resolved by the latest native update."
                  : `${response.result.items.length} bounded Workflow steps are available.`,
            }));
          } else {
            setDetailErrors((current) => ({
              ...current,
              [item.id]: "Native workflow detail returned an unexpected selector.",
            }));
          }
          return;
        }
        if (!isAtomCommandInterrupted(result)) {
          setDetailErrors((current) => ({
            ...current,
            [item.id]: readableError(squashAtomCommandFailure(result)),
          }));
        }
        return;
      }

      if (actionRoute !== "automation_workspace") {
        setDetailLoading((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        return;
      }

      const result = await readStatus({
        environmentId,
        input: { threadId, runId: item.runId },
      });
      setDetailLoading((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      if (result._tag === "Success") {
        setAutomationRun(result.value.run);
        setDetailById((current) => ({
          ...current,
          [item.id]: automationDetail(item, result.value.run),
        }));
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        setDetailErrors((current) => ({
          ...current,
          [item.id]: readableError(squashAtomCommandFailure(result)),
        }));
      }
    },
    [environmentId, query, readStatus, threadId],
  );

  const toggleItem = useCallback(
    (item: TaskAttentionItem) => {
      const willExpand = !expandedItems.has(item.id);
      setExpandedItems((current) => {
        const next = new Set(current);
        if (willExpand) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
      if (willExpand && item.runId && !detailById[item.id] && !detailLoading.has(item.id)) {
        void loadDetail(item);
      }
    },
    [detailById, detailLoading, expandedItems, loadDetail],
  );

  return (
    <section aria-label="Task attention" className="space-y-2" data-task-attention="">
      <div className="flex w-full items-center gap-2 px-1 py-1 text-left">
        <BellRingIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Attention</span>
        <Badge variant={projection.count > 0 ? "destructive" : "outline"}>{projection.count}</Badge>
        {runtimeState !== "empty" && runtimeState !== "ready" ? (
          <span role="status" aria-live="polite" className="text-[10px] text-muted-foreground">
            Automation {runtimeState}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {projection.count === 0
            ? "No items need intervention"
            : `${projection.count} native item${projection.count === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="space-y-2 border-t border-border/60 bg-muted/15 px-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Native approvals remain above the composer; task and Run updates resolve this list.
          </p>
          {hasRunCursor ? (
            <Button
              disabled={runtimeLoading}
              onClick={() => void refreshRuntime()}
              size="xs"
              variant="ghost"
            >
              <RefreshCwIcon />
              Refresh
            </Button>
          ) : null}
        </div>

        {runtimeError ? (
          <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
            <CircleAlertIcon className="size-3.5" />
            {runtimeState === "stale" ? "Automation detail is stale. " : ""}
            {runtimeError}
          </div>
        ) : null}

        {projection.items.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Empty — approvals, gates, effects, reconciliation, and provider state are clear.
          </p>
        ) : (
          projection.items.map((item) => {
            const itemExpanded = expandedItems.has(item.id);
            const actionRoute = taskAttentionActionRoute(item);
            return (
              <div className="rounded-md border bg-background/70" key={item.id}>
                <button
                  aria-expanded={itemExpanded}
                  aria-controls={`task-attention-detail-${item.id}`}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => toggleItem(item)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.summary}
                    </span>
                  </span>
                  <Badge variant="outline">{item.kind.replace("_", " ")}</Badge>
                </button>
                {itemExpanded ? (
                  <div
                    id={`task-attention-detail-${item.id}`}
                    className="space-y-2 border-t border-border/60 px-3 py-2 text-xs"
                  >
                    {detailLoading.has(item.id) ? (
                      <p role="status" className="flex items-center gap-1.5 text-muted-foreground">
                        <LoaderCircleIcon className="size-3.5 animate-spin" /> Loading native detail
                      </p>
                    ) : detailErrors[item.id] ? (
                      <p role="alert" className="text-destructive">
                        {detailErrors[item.id]}
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {detailById[item.id] ?? item.summary}
                      </p>
                    )}
                    {actionRoute === "native_approval" && item.requestId ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button onClick={onReviewComposer} size="sm" variant="ghost">
                          Review above composer
                        </Button>
                        <ComposerPendingApprovalActions
                          requestId={item.requestId}
                          isResponding={respondingRequestIds.includes(item.requestId)}
                          onRespondToApproval={onRespondToApproval}
                        />
                      </div>
                    ) : actionRoute === "composer_attention" ? (
                      <div className="flex justify-end">
                        <Button onClick={onReviewComposer} size="sm" variant="outline">
                          Answer above composer
                        </Button>
                      </div>
                    ) : actionRoute === "plan_workspace" ? (
                      <div className="flex justify-end">
                        <Button onClick={onOpenPlanWorkspace} size="sm" variant="outline">
                          Open plan
                        </Button>
                      </div>
                    ) : actionRoute === "automation_workspace" ? (
                      <div className="flex justify-end">
                        <Button onClick={onOpenAutomationWorkspace} size="sm" variant="outline">
                          Open Symphony
                        </Button>
                      </div>
                    ) : actionRoute === "workflow_workspace" ? (
                      <div className="flex justify-end">
                        <Button onClick={onOpenWorkflowWorkspace} size="sm" variant="outline">
                          Open Workflow
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        {projection.omitted > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            +{projection.omitted} more native items; resolve higher-priority items or refresh.
          </p>
        ) : null}
      </div>
    </section>
  );
});
