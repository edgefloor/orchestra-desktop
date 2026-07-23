import {
  type AutomationQueueReadInput,
  type AutomationQueueReadResult,
  type AutomationRunResult,
} from "@t3tools/contracts";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { resolveWorkspaceTabNavigation } from "../workspaceTabNavigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  formatAutomationMoment,
  projectAutomationRootActivityPresentation,
  projectAutomationWorkspace,
  retainAutomationIssueSelection,
  type AutomationWorkspaceIssue,
  type AutomationWorkspaceProjection,
} from "./AutomationWorkspace.logic";
import { NativeActivityPanel } from "./NativeActivityPanel";

type AutomationWorkspaceView = "issues" | "activity" | "recovery" | "events";

export interface AutomationIssueTaskNavigationInput {
  readonly agentThreadId: string;
  readonly automationRunId: string;
  readonly issueId: string;
  readonly issueIdentifier: string;
  readonly issueTitle: string;
}

const WORKSPACE_VIEWS = ["issues", "activity", "recovery", "events"] as const;
const WORKSPACE_VIEW_LABELS: Record<AutomationWorkspaceView, string> = {
  issues: "Issues",
  activity: "Activity",
  recovery: "Recovery",
  events: "Events",
};

interface AutomationRunWorkspaceProps {
  readonly runResult: AutomationRunResult;
  readonly queueResult: AutomationQueueReadResult | null;
  readonly queueOffset: number;
  readonly pending: boolean;
  readonly steeringInputs: Readonly<Record<string, string>>;
  readonly onInspectQueue: (
    category: AutomationQueueReadInput["category"],
    offset?: number,
  ) => void;
  readonly onInspectRun: () => void;
  readonly onRefreshRun: () => void;
  readonly onResumeRun: () => void;
  readonly onOpenIssueTask: (input: AutomationIssueTaskNavigationInput) => void;
  readonly onCancelClaim: (claimId: string) => void;
  readonly onSteerClaim: (claimId: string) => void;
  readonly onSteeringInputChange: (claimId: string, value: string) => void;
  readonly initialView?: AutomationWorkspaceView;
  readonly initialSelectedIssueId?: string | null;
}

export function automationIssueTaskNavigationInput(
  issue: AutomationWorkspaceIssue,
  automationRunId: string,
): AutomationIssueTaskNavigationInput | null {
  const threadId = issue.claim?.issueTask?.threadId;
  if (!threadId) return null;
  return {
    agentThreadId: threadId,
    automationRunId,
    issueId: issue.issueId,
    issueIdentifier: issue.issueIdentifier,
    issueTitle: issue.issueTitle.text,
  };
}

function RootSummary({ runResult }: { readonly runResult: AutomationRunResult }) {
  const { run } = runResult;
  return (
    <section
      aria-label="Automation root status"
      className="space-y-3 rounded-xl border bg-muted/25 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{run.trackerProjectSlug} · Symphony</span>
            <Badge variant="secondary">{run.status}</Badge>
            <Badge variant="outline">reconciliation {run.reconciliation.replace("_", " ")}</Badge>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            Root Run <code className="select-all">{run.runId}</code>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="outline">{run.queueCounts.running} running</Badge>
          <Badge variant="outline">{run.queueCounts.queued} queued</Badge>
          <Badge variant="outline">{run.queueCounts.waitingGate} waiting</Badge>
          <Badge variant="outline">{run.queueCounts.blocked} blocked</Badge>
        </div>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
        <div>
          Owner task <code className="select-all">{run.ownerThreadId}</code>
        </div>
        <div>
          Source <code className="select-all">{run.sourceRevision}</code>
        </div>
        <div>
          Profile r{run.profileRevision} · {run.profileRevisionStatus.replace("_", " ")} ·{" "}
          <code className="select-all">{run.profileDigest}</code>
        </div>
        <div>
          Lease {run.leaseEpoch} · revision {run.revision}
        </div>
      </div>
      {run.pendingProfileDigest ? (
        <p className="text-xs text-muted-foreground">
          Pending valid profile <code className="select-all">{run.pendingProfileDigest}</code>
        </p>
      ) : null}
      {run.rejectedProfileDigest ? (
        <p className="text-xs text-destructive">
          Rejected profile <code className="select-all">{run.rejectedProfileDigest}</code>
        </p>
      ) : null}
      {run.profileDiagnostics.map((diagnostic) => (
        <div
          className="text-xs text-destructive"
          key={`${diagnostic.text}:${diagnostic.truncated}`}
        >
          {diagnostic.text}
          {diagnostic.truncated ? "…" : ""}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        {run.nextAction.text}
        {run.nextAction.truncated ? "…" : ""}
      </p>
      <section aria-label="Automation coordination" className="space-y-1 border-t pt-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Coordination</span>
          <Badge variant="outline">{run.coordination.intakeStatus.replace("_", " ")}</Badge>
          <span className="text-muted-foreground">cycle {run.coordination.cycle}</span>
          <span className="text-muted-foreground">
            scan revision {run.coordination.scanRevision}
          </span>
          <span className="text-muted-foreground">
            <code className="select-all">{run.coordination.inputCursor ?? "start"}</code> →{" "}
            <code className="select-all">{run.coordination.outputCursor ?? "complete"}</code>
          </span>
        </div>
        {run.coordination.error ? (
          <div className="text-destructive" role="alert">
            {run.coordination.error.text}
            {run.coordination.error.truncated ? "…" : ""}
          </div>
        ) : null}
        {run.coordination.dispatchIntent ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Dispatch intent</span>
            <Badge variant="secondary">
              {run.coordination.dispatchIntent.kind.replace("_", " ")}
            </Badge>
            <Badge variant="outline">{run.coordination.dispatchIntent.status}</Badge>
            <code className="select-all text-muted-foreground">
              {run.coordination.dispatchIntent.intentId}
            </code>
          </div>
        ) : null}
        <p className="text-muted-foreground">
          {run.coordination.nextAction.text}
          {run.coordination.nextAction.truncated ? "…" : ""}
        </p>
      </section>
    </section>
  );
}

function IssueInspector({
  issue,
  runResult,
  pending,
  steeringInput,
  onOpenIssueTask,
  onCancelClaim,
  onSteerClaim,
  onSteeringInputChange,
}: {
  readonly issue: AutomationWorkspaceIssue | null;
  readonly runResult: AutomationRunResult;
  readonly pending: boolean;
  readonly steeringInput: string;
  readonly onOpenIssueTask: AutomationRunWorkspaceProps["onOpenIssueTask"];
  readonly onCancelClaim: AutomationRunWorkspaceProps["onCancelClaim"];
  readonly onSteerClaim: AutomationRunWorkspaceProps["onSteerClaim"];
  readonly onSteeringInputChange: AutomationRunWorkspaceProps["onSteeringInputChange"];
}) {
  if (!issue) {
    return (
      <aside
        aria-label="Issue inspector"
        className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
        id="automation-issue-inspector"
      >
        Select an issue to inspect its durable task, workflow, effects, hooks, and next action.
      </aside>
    );
  }
  const claim = issue.claim;
  return (
    <aside
      aria-label={`${issue.issueIdentifier} inspector`}
      className="min-w-0 space-y-3 rounded-lg border bg-background p-3"
      id="automation-issue-inspector"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{issue.issueIdentifier}</span>
          <Badge variant="secondary">{issue.executionState.replace("_", " ")}</Badge>
          <Badge variant="outline">{issue.trackerState}</Badge>
          {issue.priority !== undefined ? (
            <Badge variant="outline">priority {issue.priority}</Badge>
          ) : null}
        </div>
        <p className="text-sm">
          {issue.issueTitle.text}
          {issue.issueTitle.truncated ? "…" : ""}
        </p>
        <p className="text-xs text-muted-foreground">{issue.progressSummary}</p>
      </div>
      {!claim ? (
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          This issue is visible in the bounded native queue and does not have a durable claim yet.
          {issue.queue?.nextAction.text ? ` ${issue.queue.nextAction.text}` : ""}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">attempt {claim.attempt}</Badge>
            <Badge variant="outline">invocations {claim.workflowInvocations}</Badge>
            <Badge variant="outline">turns {claim.turnsInWindow}</Badge>
            {claim.continuationCount > 0 ? (
              <Badge variant="outline">continuations {claim.continuationCount}</Badge>
            ) : null}
            {claim.retryAttempt > 0 ? (
              <Badge variant="outline">retry {claim.retryAttempt}</Badge>
            ) : null}
            {claim.status === "claimed" ||
            claim.status === "running" ||
            claim.status === "suspended" ? (
              <Button
                disabled={pending}
                onClick={() => onCancelClaim(claim.claimId)}
                size="xs"
                variant="destructive"
              >
                Cancel issue
              </Button>
            ) : null}
          </div>
          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-foreground">Claim </dt>
              <dd className="inline">
                <code className="select-all">{claim.claimId}</code>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Profile </dt>
              <dd className="inline">
                r{claim.profileRevision} · <code className="select-all">{claim.profileDigest}</code>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Source </dt>
              <dd className="inline">
                <code className="select-all">{claim.sourceRevision}</code>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-medium text-foreground">Worktree </dt>
              <dd className="inline break-all">
                <code className="select-all">{claim.worktree}</code>
              </dd>
            </div>
            {claim.workflowRunId ? (
              <div className="sm:col-span-2">
                <dt className="inline font-medium text-foreground">Workflow Run </dt>
                <dd className="inline">
                  <code className="select-all">{claim.workflowRunId}</code>
                  {claim.workflowStatus ? ` · ${claim.workflowStatus}` : ""}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="inline font-medium text-foreground">Last progress </dt>
              <dd className="inline">{formatAutomationMoment(claim.lastProgressAtMs)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Cleanup </dt>
              <dd className="inline">
                {claim.cleanup.status.replace("_", " ")} · {claim.cleanup.attempts} attempt(s)
              </dd>
            </div>
          </dl>
          {claim.issueTask ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
              <div>
                Issue task <code className="select-all">{claim.issueTask.threadId}</code>
              </div>
              <div>
                Agent path <code className="select-all">{claim.issueTask.taskPath}</code>
              </div>
              <Button
                onClick={() => {
                  const input = automationIssueTaskNavigationInput(issue, runResult.run.runId);
                  if (input) onOpenIssueTask(input);
                }}
                size="xs"
                variant="outline"
              >
                Open issue task
              </Button>
            </div>
          ) : null}
          {claim.latestSteeringReceipt ? (
            <div className="space-y-1 rounded-md border bg-muted/20 p-2 text-xs">
              <div className="flex gap-2">
                <span className="font-medium">Latest guidance</span>
                <Badge variant="outline">{claim.latestSteeringReceipt.status}</Badge>
              </div>
              <p className="text-muted-foreground">{claim.latestSteeringReceipt.inputPreview}</p>
              {claim.latestSteeringReceipt.failure ? (
                <p className="text-destructive">{claim.latestSteeringReceipt.failure}</p>
              ) : null}
            </div>
          ) : null}
          {claim.status === "running" && claim.issueTask?.threadId ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
              <Label htmlFor={`automation-steer-${claim.claimId}`}>Guide Issue task</Label>
              <div className="flex gap-2">
                <Input
                  id={`automation-steer-${claim.claimId}`}
                  maxLength={16_384}
                  onChange={(event) => onSteeringInputChange(claim.claimId, event.target.value)}
                  placeholder="Send bounded guidance through native Codex authority"
                  value={steeringInput}
                />
                <Button
                  disabled={pending || !steeringInput.trim()}
                  onClick={() => onSteerClaim(claim.claimId)}
                  size="sm"
                  variant="outline"
                >
                  Send guidance
                </Button>
              </div>
            </div>
          ) : null}
          {claim.cleanup.lastFailure ? (
            <p className="text-xs text-destructive">
              {claim.cleanup.lastFailure.text}
              {claim.cleanup.lastFailure.truncated ? "…" : ""}
            </p>
          ) : null}
          {claim.hookReceipts.length > 0 ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Worktree hooks ({claim.hookReceipts.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {claim.hookReceipts.map((hook) => (
                  <div
                    className="rounded-md border bg-muted/20 p-2"
                    key={`${hook.kind}:${hook.invocation}`}
                  >
                    <span className="font-medium">{hook.kind.replace("_", " ")}</span> ·{" "}
                    {hook.status}
                    {hook.exitCode !== undefined ? ` · exit ${hook.exitCode}` : ""}
                    {hook.commandSha256 ? (
                      <p className="break-all text-muted-foreground">
                        command <code className="select-all">{hook.commandSha256}</code>
                      </p>
                    ) : null}
                    {hook.stdoutPreview.text ? (
                      <p className="text-muted-foreground">
                        stdout {hook.stdoutPreview.text}
                        {hook.stdoutPreview.truncated ? "…" : ""}
                      </p>
                    ) : null}
                    {hook.stderrPreview.text ? (
                      <p className="text-muted-foreground">
                        stderr {hook.stderrPreview.text}
                        {hook.stderrPreview.truncated ? "…" : ""}
                      </p>
                    ) : null}
                    {hook.failure ? (
                      <p className="text-destructive">
                        {hook.failure.text}
                        {hook.failure.truncated ? "…" : ""}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {claim.effects.length > 0 ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Effects ({claim.effects.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {claim.effects.map((effect) => (
                  <div
                    className="space-y-1 rounded-md border bg-muted/20 p-2"
                    key={effect.effectId}
                  >
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium">{effect.kind}</span>
                      <Badge variant={effect.status === "committed" ? "secondary" : "outline"}>
                        {effect.status}
                      </Badge>
                      <span>{effect.gatePolicy}</span>
                    </div>
                    <p className="break-all text-muted-foreground">
                      Effect <code className="select-all">{effect.effectId}</code> · idempotency{" "}
                      <code className="select-all">{effect.idempotencyKey}</code>
                    </p>
                    <p className="break-all text-muted-foreground">
                      request <code className="select-all">{effect.requestSha256}</code>
                    </p>
                    <p className="text-muted-foreground">
                      {effect.bodyPreview.text}
                      {effect.bodyPreview.truncated ? "…" : ""}
                    </p>
                    {effect.failure ? (
                      <p className="text-destructive">
                        {effect.failure.text}
                        {effect.failure.truncated ? "…" : ""}
                      </p>
                    ) : null}
                    {effect.providerReceipt ? (
                      <p className="break-all text-muted-foreground">
                        provider receipt{" "}
                        <code className="select-all">{effect.providerReceipt}</code>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {claim.nextAction.text}
            {claim.nextAction.truncated ? "…" : ""}
          </p>
        </>
      )}
    </aside>
  );
}

function RecoveryView({
  projection,
  runResult,
  pending,
  onInspectRun,
  onRefreshRun,
  onResumeRun,
  onOpenIssueTask,
}: {
  readonly projection: AutomationWorkspaceProjection;
  readonly runResult: AutomationRunResult;
  readonly pending: boolean;
  readonly onInspectRun: AutomationRunWorkspaceProps["onInspectRun"];
  readonly onRefreshRun: AutomationRunWorkspaceProps["onRefreshRun"];
  readonly onResumeRun: AutomationRunWorkspaceProps["onResumeRun"];
  readonly onOpenIssueTask: AutomationRunWorkspaceProps["onOpenIssueTask"];
}) {
  return (
    <div aria-label="Automation recovery" className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Recovery shows durable conditions from this bounded snapshot. Actions appear only where an
        existing native task navigation action is valid.
      </p>
      {projection.recovery.map((item) => {
        const issue = item.issueKey
          ? projection.issues.find((candidate) => candidate.key === item.issueKey)
          : undefined;
        const claim = issue?.claim;
        return (
          <article className="space-y-2 rounded-lg border bg-background p-3" key={item.key}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{item.kind}</Badge>
              <span className="text-sm font-medium">{item.summary}</span>
              <Badge variant="outline">{item.status.replace("_", " ")}</Badge>
              {item.issueIdentifier ? (
                <code className="select-all text-xs text-muted-foreground">
                  {item.issueIdentifier}
                </code>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
            <p className="text-xs">{item.resolution}</p>
            {item.actions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.actions.includes("inspect") ? (
                  <Button disabled={pending} onClick={onInspectRun} size="xs" variant="ghost">
                    Inspect
                  </Button>
                ) : null}
                {item.actions.includes("refresh") ? (
                  <Button disabled={pending} onClick={onRefreshRun} size="xs" variant="outline">
                    Refresh
                  </Button>
                ) : null}
                {item.actions.includes("resume") ? (
                  <Button disabled={pending} onClick={onResumeRun} size="xs" variant="outline">
                    Resume
                  </Button>
                ) : null}
                {item.actions.includes("open_issue_task") && claim?.issueTask ? (
                  <Button
                    onClick={() => {
                      if (!issue) return;
                      const input = automationIssueTaskNavigationInput(issue, runResult.run.runId);
                      if (input) onOpenIssueTask(input);
                    }}
                    size="xs"
                    variant="outline"
                  >
                    Open issue task
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      {projection.recovery.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No recovery conditions are present in this bounded native snapshot.
        </p>
      ) : null}
      {projection.bounds.recovery.truncated ? (
        <p className="text-xs text-amber-600">
          Showing {projection.bounds.recovery.shown} of {projection.bounds.recovery.available}
          recovery conditions.
        </p>
      ) : null}
    </div>
  );
}

export function AutomationRunWorkspace({
  runResult,
  queueResult,
  queueOffset,
  pending,
  steeringInputs,
  onInspectQueue,
  onInspectRun,
  onRefreshRun,
  onResumeRun,
  onOpenIssueTask,
  onCancelClaim,
  onSteerClaim,
  onSteeringInputChange,
  initialView = "issues",
  initialSelectedIssueId,
}: AutomationRunWorkspaceProps) {
  const [activeView, setActiveView] = useState<AutomationWorkspaceView>(initialView);
  const projection = useMemo(
    () => projectAutomationWorkspace(runResult, queueResult),
    [queueResult, runResult],
  );
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    initialSelectedIssueId === undefined
      ? (projection.issues[0]?.issueId ?? null)
      : initialSelectedIssueId,
  );
  useEffect(() => {
    setSelectedIssueId((current) => retainAutomationIssueSelection(current, projection.issues));
  }, [projection.issues]);
  const selectedIssue =
    projection.issues.find((issue) => issue.issueId === selectedIssueId) ?? null;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const targetIndex = resolveWorkspaceTabNavigation({
      currentIndex,
      key: event.key,
      tabCount: WORKSPACE_VIEWS.length,
    });
    if (targetIndex === null) return;
    event.preventDefault();
    const targetView = WORKSPACE_VIEWS[targetIndex];
    if (!targetView) return;
    setActiveView(targetView);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#automation-view-tab-${targetView}`)
      ?.focus();
  };

  return (
    <div className="space-y-3">
      <RootSummary runResult={runResult} />
      <div className="rounded-xl border bg-muted/10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div aria-label="Symphony views" className="flex items-center gap-1" role="tablist">
            {WORKSPACE_VIEWS.map((view, index) => (
              <button
                aria-controls="automation-view-panel"
                aria-selected={activeView === view}
                className={cn(
                  "min-h-7 rounded-md px-3 py-1 text-xs font-medium outline-hidden transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
                  activeView === view && "bg-primary/12 text-primary",
                )}
                id={`automation-view-tab-${view}`}
                key={view}
                onClick={() => setActiveView(view)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                role="tab"
                tabIndex={activeView === view ? 0 : -1}
                type="button"
              >
                {WORKSPACE_VIEW_LABELS[view]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["queued", runResult.run.queueCounts.queued],
                ["running", runResult.run.queueCounts.running],
                ["blocked", runResult.run.queueCounts.blocked],
                ["waiting_gate", runResult.run.queueCounts.waitingGate],
                ["handoff", runResult.run.queueCounts.handoff],
                ["terminal", runResult.run.queueCounts.terminal],
              ] as const
            ).map(([category, count]) => (
              <Button
                disabled={pending || count === 0}
                key={category}
                onClick={() => onInspectQueue(category)}
                size="xs"
                variant="ghost"
              >
                {category.replace("_", " ")} {count}
              </Button>
            ))}
          </div>
        </div>

        <div
          aria-labelledby={`automation-view-tab-${activeView}`}
          className="p-3"
          id="automation-view-panel"
          role="tabpanel"
        >
          {activeView === "issues" ? (
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(34rem,1.35fr)_minmax(20rem,1fr)]">
              <div className="min-w-0 space-y-2">
                <Table aria-label="Symphony issues">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Tracker state</TableHead>
                      <TableHead>Execution</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Attempt</TableHead>
                      <TableHead>Task / Workflow</TableHead>
                      <TableHead>Last activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projection.issues.map((issue) => (
                      <TableRow
                        data-state={issue.issueId === selectedIssueId ? "selected" : undefined}
                        key={issue.key}
                      >
                        <TableCell className="max-w-64 whitespace-normal">
                          <button
                            aria-controls="automation-issue-inspector"
                            aria-pressed={issue.issueId === selectedIssueId}
                            className="text-left outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={() => setSelectedIssueId(issue.issueId)}
                            type="button"
                          >
                            <span className="block font-medium">{issue.issueIdentifier}</span>
                            <span className="line-clamp-2 text-muted-foreground">
                              {issue.issueTitle.text}
                              {issue.issueTitle.truncated ? "…" : ""}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>{issue.trackerState}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {issue.executionState.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{issue.priority ?? "—"}</TableCell>
                        <TableCell>{issue.claim?.attempt ?? "—"}</TableCell>
                        <TableCell>
                          {issue.claim?.issueTask ? "Task" : "—"}
                          {issue.claim?.workflowRunId ? " · Workflow" : ""}
                        </TableCell>
                        <TableCell>{formatAutomationMoment(issue.lastProgressAtMs)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {projection.issues.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No issues are present in this bounded native snapshot.
                  </p>
                ) : null}
                {projection.bounds.issues.truncated ||
                projection.bounds.claims.truncated ||
                projection.bounds.queue.truncated ? (
                  <p className="text-xs text-amber-600">
                    Bounded snapshot: {projection.bounds.issues.shown}/
                    {projection.bounds.issues.available} fused issues,{" "}
                    {projection.bounds.claims.shown}/{projection.bounds.claims.total} claims.
                  </p>
                ) : null}
                {queueResult ? (
                  <p className="text-xs text-muted-foreground">
                    {queueResult.category.replace("_", " ")} queue page{" "}
                    {queueResult.items.length > 0
                      ? `${queueOffset + 1}–${queueOffset + queueResult.items.length}`
                      : `empty at offset ${queueOffset}`}{" "}
                    of {queueResult.total}
                  </p>
                ) : null}
                {queueResult?.nextOffset !== undefined ? (
                  <Button
                    disabled={pending}
                    onClick={() => onInspectQueue(queueResult.category, queueResult.nextOffset)}
                    size="xs"
                    variant="outline"
                  >
                    Next {queueResult.category.replace("_", " ")} page
                  </Button>
                ) : null}
                {queueResult && queueOffset > 0 ? (
                  <Button
                    disabled={pending}
                    onClick={() => onInspectQueue(queueResult.category)}
                    size="xs"
                    variant="ghost"
                  >
                    First {queueResult.category.replace("_", " ")} page
                  </Button>
                ) : null}
              </div>
              <IssueInspector
                issue={selectedIssue}
                onCancelClaim={onCancelClaim}
                onOpenIssueTask={onOpenIssueTask}
                onSteerClaim={onSteerClaim}
                onSteeringInputChange={onSteeringInputChange}
                pending={pending}
                runResult={runResult}
                steeringInput={
                  selectedIssue?.claim ? (steeringInputs[selectedIssue.claim.claimId] ?? "") : ""
                }
              />
            </div>
          ) : activeView === "activity" ? (
            <NativeActivityPanel
              presentation={projectAutomationRootActivityPresentation(runResult.run, projection)}
            />
          ) : activeView === "recovery" ? (
            <RecoveryView
              onInspectRun={onInspectRun}
              onOpenIssueTask={onOpenIssueTask}
              onRefreshRun={onRefreshRun}
              onResumeRun={onResumeRun}
              pending={pending}
              projection={projection}
              runResult={runResult}
            />
          ) : (
            <div className="space-y-3" aria-label="Automation events">
              <p className="text-xs text-muted-foreground">
                Exact durable records are grouped by kind. Groups without native timestamps are not
                presented as chronological history.
              </p>
              {projection.eventGroups.map((group) => (
                <details
                  className="rounded-lg border bg-background p-3"
                  key={group.key}
                  open={group.events.length > 0}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {group.label} ({group.total}){group.truncated ? " · truncated" : ""}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {group.events.map((event) => (
                      <div className="rounded-md border bg-muted/20 p-2 text-xs" key={event.key}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{event.label}</span>
                          <Badge variant="outline">{event.status.replace("_", " ")}</Badge>
                          {event.occurredAtMs !== undefined ? (
                            <span className="text-muted-foreground">
                              {formatAutomationMoment(event.occurredAtMs)}
                            </span>
                          ) : null}
                        </div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">
                            Exact record
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2">
                            {JSON.stringify(event.exact, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                    {group.events.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No durable {group.label.toLowerCase()} records in this snapshot.
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
