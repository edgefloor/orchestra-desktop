import {
  ThreadId,
  type AutomationLinearReadResult,
  type AutomationQueueReadInput,
  type AutomationQueueReadResult,
  type AutomationRunResult,
  type AutomationValidateResult,
  type EnvironmentId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { CheckCircle2Icon, CircleAlertIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import {
  cancelAutomationIssue,
  cancelAutomation,
  pauseAutomation,
  readLinearAutomation,
  readAutomationQueue,
  readAutomationStatus,
  refreshAutomation,
  resumeAutomation,
  startAutomation,
  steerAutomationIssue,
  validateAutomationProfile,
} from "~/state/automation";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  automationLinearRows,
  automationLinearAvailability,
  automationRunStorageKey,
  automationRunRows,
  automationWorkspaceCapabilities,
  buildAutomationStartInput,
  buildAutomationValidateInput,
  deriveAutomationWorkspaceState,
  mergeAutomationQueuePage,
  type AutomationWorkspacePendingAction,
} from "./AutomationProfileDialog.logic";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";

interface AutomationWorkspaceProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly threadTitle: string;
  readonly onClose: () => void;
  readonly onOpenIssueTask: (input: {
    readonly threadId: ThreadId;
    readonly automationRunId: string;
    readonly issueId: string;
  }) => void;
}

function readableError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The Automation request failed.";
}

export const AutomationWorkspace = memo(function AutomationWorkspace({
  environmentId,
  threadId,
  threadTitle,
  onClose,
  onOpenIssueTask,
}: AutomationWorkspaceProps) {
  const validate = useAtomCommand(validateAutomationProfile, { reportFailure: false });
  const start = useAtomCommand(startAutomation, { reportFailure: false });
  const steerIssue = useAtomCommand(steerAutomationIssue, { reportFailure: false });
  const cancel = useAtomCommand(cancelAutomation, { reportFailure: false });
  const cancelIssue = useAtomCommand(cancelAutomationIssue, { reportFailure: false });
  const pause = useAtomCommand(pauseAutomation, { reportFailure: false });
  const readStatus = useAtomCommand(readAutomationStatus, { reportFailure: false });
  const refresh = useAtomCommand(refreshAutomation, { reportFailure: false });
  const resume = useAtomCommand(resumeAutomation, { reportFailure: false });
  const readLinear = useAtomCommand(readLinearAutomation, { reportFailure: false });
  const readQueue = useAtomCommand(readAutomationQueue, { reportFailure: false });
  const [profilePath, setProfilePath] = useState("WORKFLOW.md");
  const [issueIdentifier, setIssueIdentifier] = useState("DOGFOOD-1");
  const [issueState, setIssueState] = useState("Todo");
  const [issueLabels, setIssueLabels] = useState("automation");
  const [attempt, setAttempt] = useState("1");
  const [runId, setRunId] = useState("");
  const [pendingAction, setPendingAction] = useState<AutomationWorkspacePendingAction | null>(null);
  const pending = pendingAction !== null;
  const [result, setResult] = useState<AutomationValidateResult | null>(null);
  const [runResult, setRunResult] = useState<AutomationRunResult | null>(null);
  const [linearResult, setLinearResult] = useState<AutomationLinearReadResult | null>(null);
  const [queueResult, setQueueResult] = useState<AutomationQueueReadResult | null>(null);
  const [steeringInputs, setSteeringInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const restoredRunId = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const acceptRunResult = useCallback(
    (value: AutomationRunResult) => {
      setRunResult(value);
      setRunId(value.run.runId);
      localStorage.setItem(automationRunStorageKey(threadId), value.run.runId);
    },
    [threadId],
  );

  const loadRun = useCallback(
    (candidateRunId = runId) => {
      const normalizedRunId = candidateRunId.trim();
      if (!normalizedRunId) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setPendingAction("inspecting");
      setError(null);
      void readStatus({
        environmentId,
        input: { threadId, runId: normalizedRunId },
      }).then((commandResult) => {
        if (requestIdRef.current !== requestId) return;
        setPendingAction(null);
        if (commandResult._tag === "Success") {
          acceptRunResult(commandResult.value);
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          setError(readableError(squashAtomCommandFailure(commandResult)));
        }
      });
    },
    [acceptRunResult, environmentId, readStatus, runId, threadId],
  );

  useEffect(() => {
    if (runResult) return;
    const storedRunId = localStorage.getItem(automationRunStorageKey(threadId));
    if (!storedRunId || restoredRunId.current === storedRunId) return;
    restoredRunId.current = storedRunId;
    setRunId(storedRunId);
    loadRun(storedRunId);
  }, [loadRun, runResult, threadId]);

  const submit = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPendingAction("validating");
    setError(null);
    setResult(null);
    setRunResult(null);
    setQueueResult(null);
    void validate({
      environmentId,
      input: buildAutomationValidateInput({
        threadId,
        profilePath: profilePath.trim(),
        issueIdentifier,
        issueTitle: threadTitle,
        issueState,
        issueLabels,
        attempt,
      }),
    }).then((commandResult) => {
      if (requestIdRef.current !== requestId) return;
      setPendingAction(null);
      if (commandResult._tag === "Success") {
        setResult(commandResult.value);
        return;
      }
      if (!isAtomCommandInterrupted(commandResult)) {
        setError(readableError(squashAtomCommandFailure(commandResult)));
      }
    });
  }, [
    attempt,
    environmentId,
    issueIdentifier,
    issueLabels,
    issueState,
    profilePath,
    threadId,
    threadTitle,
    validate,
  ]);

  const run = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPendingAction("starting");
    setError(null);
    setRunResult(null);
    void start({
      environmentId,
      input: buildAutomationStartInput({
        threadId,
        profilePath: profilePath.trim(),
      }),
    }).then((commandResult) => {
      if (requestIdRef.current !== requestId) return;
      setPendingAction(null);
      if (commandResult._tag === "Success") {
        acceptRunResult(commandResult.value);
        return;
      }
      if (!isAtomCommandInterrupted(commandResult)) {
        setError(readableError(squashAtomCommandFailure(commandResult)));
      }
    });
  }, [acceptRunResult, environmentId, profilePath, start, threadId]);

  const steerClaim = useCallback(
    (claimId: string) => {
      if (!runResult) return;
      const input = steeringInputs[claimId]?.trim() ?? "";
      if (!input) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setPendingAction("steering");
      setError(null);
      void steerIssue({
        environmentId,
        input: { threadId, runId: runResult.run.runId, claimId, input },
      }).then((commandResult) => {
        if (requestIdRef.current !== requestId) return;
        setPendingAction(null);
        if (commandResult._tag === "Success") {
          acceptRunResult({ run: commandResult.value.run });
          setSteeringInputs((current) => ({ ...current, [claimId]: "" }));
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          setError(readableError(squashAtomCommandFailure(commandResult)));
        }
      });
    },
    [acceptRunResult, environmentId, runResult, steerIssue, steeringInputs, threadId],
  );

  const cancelRun = useCallback(() => {
    if (!runResult) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPendingAction("cancelling");
    setError(null);
    void cancel({
      environmentId,
      input: { threadId, runId: runResult.run.runId },
    }).then((commandResult) => {
      if (requestIdRef.current !== requestId) return;
      setPendingAction(null);
      if (commandResult._tag === "Success") {
        acceptRunResult(commandResult.value);
        return;
      }
      if (!isAtomCommandInterrupted(commandResult)) {
        setError(readableError(squashAtomCommandFailure(commandResult)));
      }
    });
  }, [acceptRunResult, cancel, environmentId, runResult, threadId]);

  const cancelClaim = useCallback(
    (claimId: string) => {
      if (!runResult) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setPendingAction("cancelling");
      setError(null);
      void cancelIssue({
        environmentId,
        input: { threadId, runId: runResult.run.runId, claimId },
      }).then((commandResult) => {
        if (requestIdRef.current !== requestId) return;
        setPendingAction(null);
        if (commandResult._tag === "Success") {
          acceptRunResult(commandResult.value);
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          setError(readableError(squashAtomCommandFailure(commandResult)));
        }
      });
    },
    [acceptRunResult, cancelIssue, environmentId, runResult, threadId],
  );

  const runLifecycleAction = useCallback(
    (action: "status" | "pause" | "refresh" | "resume") => {
      if (!runResult) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setPendingAction(
        action === "pause" ? "pausing" : action === "status" ? "inspecting" : "reconciling",
      );
      setError(null);
      const base = {
        environmentId,
        input: { threadId, runId: runResult.run.runId },
      };
      const command =
        action === "status"
          ? readStatus(base)
          : action === "pause"
            ? pause(base)
            : action === "refresh"
              ? refresh({
                  environmentId,
                  input: { ...base.input, profilePath: profilePath.trim() },
                })
              : resume({
                  environmentId,
                  input: { ...base.input, profilePath: profilePath.trim() },
                });
      void command.then((commandResult) => {
        if (requestIdRef.current !== requestId) return;
        setPendingAction(null);
        if (commandResult._tag === "Success") {
          acceptRunResult(commandResult.value);
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          setError(readableError(squashAtomCommandFailure(commandResult)));
        }
      });
    },
    [
      acceptRunResult,
      environmentId,
      pause,
      profilePath,
      readStatus,
      refresh,
      resume,
      runResult,
      threadId,
    ],
  );

  const readLinearIssues = useCallback(
    (kind: "candidates" | "terminal" | "refresh") => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setPendingAction("inspecting");
      setError(null);
      setLinearResult(null);
      void readLinear({
        environmentId,
        input: {
          threadId,
          profilePath: profilePath.trim(),
          kind,
          first: 25,
          issueIdentifier: kind === "refresh" ? issueIdentifier.trim() : undefined,
        },
      }).then((commandResult) => {
        if (requestIdRef.current !== requestId) return;
        setPendingAction(null);
        if (commandResult._tag === "Success") {
          setLinearResult(commandResult.value);
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          setError(readableError(squashAtomCommandFailure(commandResult)));
        }
      });
    },
    [environmentId, issueIdentifier, profilePath, readLinear, threadId],
  );

  const inspectQueue = useCallback(
    (category: AutomationQueueReadInput["category"], offset?: number) => {
      if (!runResult) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setPendingAction("inspecting");
      setError(null);
      void readQueue({
        environmentId,
        input: {
          threadId,
          runId: runResult.run.runId,
          category,
          offset,
          limit: 25,
        },
      }).then((commandResult) => {
        if (requestIdRef.current !== requestId) return;
        setPendingAction(null);
        if (commandResult._tag === "Success") {
          setQueueResult((current) =>
            offset === undefined
              ? commandResult.value
              : mergeAutomationQueuePage(current, commandResult.value),
          );
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          setError(readableError(squashAtomCommandFailure(commandResult)));
        }
      });
    },
    [environmentId, readQueue, runResult, threadId],
  );

  const workspaceState = deriveAutomationWorkspaceState({
    pendingAction,
    validation: result,
    run: runResult?.run ?? null,
    error,
  });
  const capabilities = automationWorkspaceCapabilities({
    pending,
    validation: result,
    run: runResult?.run ?? null,
  });
  const linearAvailability = linearResult ? automationLinearAvailability(linearResult) : null;

  return (
    <section
      aria-label="Symphony automation workspace"
      className="flex max-h-[min(58vh,44rem)] shrink-0 flex-col border-b border-border bg-card/55"
      data-automation-workspace=""
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Symphony automation</h3>
            <Badge aria-live="polite" role="status" variant="outline">
              {workspaceState}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Task-scoped native automation for {threadTitle}. Run state is reloaded from Codex after
            renderer or host restarts.
          </p>
        </div>
        <Button
          aria-label="Close Symphony workspace"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </header>
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6"
        data-automation-workspace-scroll=""
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="automation-profile-path">Profile path</Label>
            <Input
              id="automation-profile-path"
              value={profilePath}
              onChange={(event) => setProfilePath(event.target.value)}
              placeholder="WORKFLOW.md"
            />
            <p className="text-xs text-muted-foreground">
              Resolved inside the task repository by Codex. Paths outside the repository are
              rejected.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="automation-issue-identifier">Preview issue</Label>
            <Input
              id="automation-issue-identifier"
              value={issueIdentifier}
              onChange={(event) => setIssueIdentifier(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="automation-issue-state">Issue state</Label>
            <Input
              id="automation-issue-state"
              value={issueState}
              onChange={(event) => setIssueState(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="automation-issue-labels">Issue labels</Label>
            <Input
              id="automation-issue-labels"
              value={issueLabels}
              onChange={(event) => setIssueLabels(event.target.value)}
              placeholder="automation, dogfood"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="automation-attempt">Attempt</Label>
            <Input
              id="automation-attempt"
              inputMode="numeric"
              value={attempt}
              onChange={(event) => setAttempt(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <Label htmlFor="automation-run-id">Existing root Run</Label>
          <div className="flex gap-2">
            <Input
              id="automation-run-id"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              placeholder="automation-…"
            />
            <Button
              disabled={pending || !runId.trim()}
              onClick={() => loadRun()}
              type="button"
              variant="outline"
            >
              Reattach
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Reloads the bounded native projection for this task; child histories remain in their
            Codex tasks.
          </p>
        </div>

        {error ? (
          <div
            className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive"
            role="alert"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4 rounded-xl border bg-muted/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {result.valid ? (
                <CheckCircle2Icon className="size-4 text-emerald-500" />
              ) : (
                <CircleAlertIcon className="size-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {result.valid ? "Profile is valid" : "Profile needs changes"}
              </span>
              {result.profile?.orchestra.workflowName ? (
                <Badge variant="outline">{result.profile.orchestra.workflowName}</Badge>
              ) : null}
            </div>
            {result.profileDigest ? (
              <div className="text-xs text-muted-foreground">
                Digest <code className="select-all">{result.profileDigest}</code>
              </div>
            ) : null}
            {result.preview?.effects.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.preview.effects.map((effect) => (
                  <Badge key={effect} variant="secondary">
                    {effect}
                  </Badge>
                ))}
              </div>
            ) : null}
            {result.preview?.inputs.length ? (
              <div className="space-y-2 text-xs">
                <div className="font-medium uppercase tracking-wide text-muted-foreground">
                  Workflow inputs
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.preview.inputs.map((input) => (
                    <Badge key={input.name} variant="outline">
                      {input.name} · {input.kind} · {input.required ? "required" : "optional"}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {result.preview?.secretReferences.length ? (
              <div className="space-y-2 text-xs">
                <div className="font-medium uppercase tracking-wide text-muted-foreground">
                  Secret references
                </div>
                {result.preview.secretReferences.map((secret) => (
                  <div className="rounded-md border bg-background p-2" key={secret.digest}>
                    <span className="font-medium">{secret.kind}</span>{" "}
                    <code className="select-all">{secret.reference}</code>{" "}
                    <span className="text-muted-foreground">digest {secret.digest}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {result.diagnostics.length ? (
              <div className="space-y-2">
                {result.diagnostics.map((diagnostic, index) => (
                  <div key={`${diagnostic.path}:${diagnostic.code}:${index}`} className="text-sm">
                    <span
                      className={
                        diagnostic.severity === "error" ? "text-destructive" : "text-amber-600"
                      }
                    >
                      {diagnostic.path || "profile"}
                    </span>{" "}
                    <span className="text-muted-foreground">{diagnostic.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {result.preview?.renderedPrompt ? (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rendered task prompt
                </div>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs">
                  {result.preview.renderedPrompt}
                </pre>
              </div>
            ) : null}
            {result.profile ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Canonical profile
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3">
                  {JSON.stringify(result.profile, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {runResult ? (
          <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2Icon className="size-4 text-emerald-500" />
              <span className="text-sm font-medium">Automation {runResult.run.status}</span>
              <Badge variant="outline">{runResult.run.trackerProjectSlug}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Root Run <code className="select-all">{runResult.run.runId}</code>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                Owner task <code className="select-all">{runResult.run.ownerThreadId}</code>
              </div>
              <div>
                Source revision <code className="select-all">{runResult.run.sourceRevision}</code>
              </div>
              <div>
                Profile digest <code className="select-all">{runResult.run.profileDigest}</code>
              </div>
              <div>
                Claims {runResult.run.claims.length} shown / {runResult.run.claimsTotal} total
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">reconciliation {runResult.run.reconciliation}</Badge>
              <Badge
                variant={
                  runResult.run.profileRevisionStatus === "rejected" ? "destructive" : "outline"
                }
              >
                profile r{runResult.run.profileRevision}{" "}
                {runResult.run.profileRevisionStatus.replace("_", " ")}
              </Badge>
              <span>lease epoch {runResult.run.leaseEpoch}</span>
              <span>revision {runResult.run.revision}</span>
            </div>
            {runResult.run.pendingProfileDigest ? (
              <div className="text-xs text-muted-foreground">
                Pending valid profile{" "}
                <code className="select-all">{runResult.run.pendingProfileDigest}</code>
              </div>
            ) : null}
            {runResult.run.rejectedProfileDigest ? (
              <div className="text-xs text-destructive">
                Rejected profile{" "}
                <code className="select-all">{runResult.run.rejectedProfileDigest}</code>
              </div>
            ) : null}
            {runResult.run.profileDiagnostics.map((diagnostic, index) => (
              <div className="text-xs text-destructive" key={`${index}-${diagnostic.text}`}>
                {diagnostic.text}
                {diagnostic.truncated ? "…" : ""}
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
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
                  onClick={() => inspectQueue(category)}
                  size="xs"
                  variant="outline"
                >
                  {category.replace("_", " ")} {count}
                </Button>
              ))}
            </div>
            {runResult.run.queuePreview.length ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Native queue preview ({runResult.run.queuePreview.length})
                  {runResult.run.queuePreviewTruncated ? " · truncated" : ""}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {runResult.run.queuePreview.map((item) => (
                    <div
                      className="rounded-md border bg-background p-2"
                      key={`${item.issueId}:${item.claimId ?? item.category}`}
                    >
                      <span className="font-medium">{item.issueIdentifier}</span>{" "}
                      <Badge variant="outline">{item.category.replace("_", " ")}</Badge>{" "}
                      <span className="text-muted-foreground">{item.state}</span>
                      <div className="mt-1 text-muted-foreground">
                        {item.nextAction.text}
                        {item.nextAction.truncated ? "…" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : runResult.run.queuePreviewTruncated ? (
              <p className="text-xs text-amber-600">
                Native queue preview is truncated; inspect a category for bounded detail.
              </p>
            ) : null}
            {runResult.run.claimsTotal > runResult.run.claims.length ? (
              <p className="text-xs text-amber-600">
                Claim projection is bounded;{" "}
                {runResult.run.claimsTotal - runResult.run.claims.length} additional claim(s) are
                not in this snapshot.
              </p>
            ) : null}
            {automationRunRows(runResult).map((claim) => (
              <div key={claim.claimId} className="space-y-2 rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{claim.issueIdentifier}</span>
                  <Badge variant="secondary">{claim.status}</Badge>
                  <Badge variant="outline">profile r{claim.profileRevision}</Badge>
                  <Badge variant="outline">attempt {claim.attempt}</Badge>
                  {claim.status === "claimed" ||
                  claim.status === "running" ||
                  claim.status === "suspended" ? (
                    <Button
                      disabled={pending}
                      onClick={() => cancelClaim(claim.claimId)}
                      size="xs"
                      variant="destructive"
                    >
                      Cancel issue
                    </Button>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {claim.issueTitle.text}
                  {claim.issueTitle.truncated ? "…" : ""}
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    Tracker state <span className="text-foreground">{claim.trackerState}</span>
                  </div>
                  <div>
                    Priority <span className="text-foreground">{claim.priority ?? "none"}</span>
                  </div>
                  <div>
                    Source <code className="select-all">{claim.sourceRevision}</code>
                  </div>
                  <div>
                    Profile digest <code className="select-all">{claim.profileDigest}</code>
                  </div>
                  <div className="sm:col-span-2">
                    Worktree <code className="select-all">{claim.worktree}</code>
                  </div>
                </div>
                {claim.issueTask ? (
                  <div className="space-y-1 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                    <div>
                      Issue task <code className="select-all">{claim.issueTask.threadId}</code>
                    </div>
                    <div>
                      Agent path <code className="select-all">{claim.issueTask.taskPath}</code>
                    </div>
                    <Button
                      onClick={() =>
                        onOpenIssueTask({
                          threadId: ThreadId.make(claim.issueTask!.threadId),
                          automationRunId: runResult.run.runId,
                          issueId: claim.issueId,
                        })
                      }
                      size="xs"
                      variant="outline"
                    >
                      Open issue task
                    </Button>
                  </div>
                ) : null}
                {claim.latestSteeringReceipt ? (
                  <div className="space-y-1 rounded-md border bg-muted/25 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Latest guidance</span>
                      <Badge
                        variant={
                          claim.latestSteeringReceipt.status === "failed"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {claim.latestSteeringReceipt.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {claim.latestSteeringReceipt.inputPreview}
                    </div>
                    {claim.latestSteeringReceipt.failure ? (
                      <div className="text-destructive">{claim.latestSteeringReceipt.failure}</div>
                    ) : null}
                  </div>
                ) : null}
                {claim.status === "running" && claim.issueTaskThreadId ? (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                    <Label htmlFor={`automation-steer-${claim.claimId}`}>Guide Issue task</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`automation-steer-${claim.claimId}`}
                        maxLength={16_384}
                        onChange={(event) =>
                          setSteeringInputs((current) => ({
                            ...current,
                            [claim.claimId]: event.target.value,
                          }))
                        }
                        placeholder="Send bounded guidance through native Codex authority"
                        value={steeringInputs[claim.claimId] ?? ""}
                      />
                      <Button
                        disabled={pending || !(steeringInputs[claim.claimId]?.trim() ?? "")}
                        onClick={() => steerClaim(claim.claimId)}
                        size="sm"
                        variant="outline"
                      >
                        Send guidance
                      </Button>
                    </div>
                  </div>
                ) : null}
                {claim.workflowRunId ? (
                  <div className="text-xs text-muted-foreground">
                    Workflow Run <code className="select-all">{claim.workflowRunId}</code>
                    {claim.workflowStatus ? ` · ${claim.workflowStatus}` : ""}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant={claim.cleanup.status === "retry_pending" ? "destructive" : "outline"}
                  >
                    cleanup {claim.cleanup.status.replace("_", " ")}
                  </Badge>
                  {claim.cleanup.attempts ? <span>{claim.cleanup.attempts} attempt(s)</span> : null}
                </div>
                {claim.cleanup.lastFailure ? (
                  <div className="text-xs text-destructive">
                    {claim.cleanup.lastFailure.text}
                    {claim.cleanup.lastFailure.truncated ? "…" : ""}
                  </div>
                ) : null}
                {claim.hookReceipts.length ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Worktree hooks ({claim.hookReceipts.length})
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {claim.hookReceipts.map((hook) => (
                        <div
                          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/25 p-2"
                          key={`${hook.kind}:${hook.invocation}`}
                        >
                          <span className="font-medium">{hook.kind.replace("_", " ")}</span>
                          <Badge variant={hook.status === "failed" ? "destructive" : "outline"}>
                            {hook.status}
                          </Badge>
                          {hook.exitCode !== undefined ? <span>exit {hook.exitCode}</span> : null}
                          {hook.commandSha256 ? (
                            <span>
                              command <code className="select-all">{hook.commandSha256}</code>
                            </span>
                          ) : null}
                          {hook.stdoutPreview.text ? (
                            <span>
                              stdout {hook.stdoutPreview.text}
                              {hook.stdoutPreview.truncated ? "…" : ""}
                            </span>
                          ) : null}
                          {hook.stderrPreview.text ? (
                            <span>
                              stderr {hook.stderrPreview.text}
                              {hook.stderrPreview.truncated ? "…" : ""}
                            </span>
                          ) : null}
                          {hook.failure ? (
                            <span className="text-destructive">
                              {hook.failure.text}
                              {hook.failure.truncated ? "…" : ""}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {claim.effects.map((effect) => (
                  <div
                    key={effect.effectId}
                    className="space-y-1 rounded-md border bg-muted/25 p-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{effect.kind}</span>
                      <Badge variant={effect.status === "committed" ? "secondary" : "outline"}>
                        {effect.status}
                      </Badge>
                      <span className="text-muted-foreground">{effect.gatePolicy}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Effect <code className="select-all">{effect.effectId}</code> · request{" "}
                      <code className="select-all">{effect.requestSha256}</code>
                    </div>
                    <div className="text-muted-foreground">
                      Idempotency <code className="select-all">{effect.idempotencyKey}</code>
                    </div>
                    <div className="text-muted-foreground">
                      {effect.bodyPreview.text}
                      {effect.bodyPreview.truncated ? "…" : ""}
                    </div>
                    {effect.providerReceipt ? (
                      <div className="text-muted-foreground">
                        Provider receipt{" "}
                        <code className="select-all">{effect.providerReceipt}</code>
                      </div>
                    ) : null}
                    {effect.failure ? (
                      <div className="text-destructive">
                        {effect.failure.text}
                        {effect.failure.truncated ? "…" : ""}
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="text-xs text-muted-foreground">
                  {claim.nextAction.text}
                  {claim.nextAction.truncated ? "…" : ""}
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground">
              {runResult.run.nextAction.text}
              {runResult.run.nextAction.truncated ? "…" : ""}
            </div>
          </div>
        ) : null}

        {queueResult ? (
          <div className="space-y-2 rounded-xl border bg-muted/25 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {queueResult.category.replace("_", " ")} ({queueResult.total})
              </span>
              {queueResult.nextOffset !== undefined ? (
                <Button
                  disabled={pending}
                  onClick={() => inspectQueue(queueResult.category, queueResult.nextOffset)}
                  size="xs"
                  variant="ghost"
                >
                  Next page
                </Button>
              ) : null}
            </div>
            {queueResult.items.map((item) => (
              <details key={`${item.issueId}:${item.claimId ?? "queue"}`}>
                <summary className="cursor-pointer text-xs">
                  {item.issueIdentifier} · {item.state}
                  {item.priority ? ` · priority ${item.priority}` : ""}
                </summary>
                <div className="mt-1 space-y-1 pl-4 text-xs text-muted-foreground">
                  <div>
                    {item.issueTitle.text}
                    {item.issueTitle.truncated ? "…" : ""}
                  </div>
                  <div>
                    {item.nextAction.text}
                    {item.nextAction.truncated ? "…" : ""}
                  </div>
                  {item.claimId ? <code className="select-all">Claim {item.claimId}</code> : null}
                </div>
              </details>
            ))}
          </div>
        ) : null}

        {linearResult ? (
          <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{linearAvailability?.title}</span>
              <Badge variant="outline">{linearResult.status}</Badge>
            </div>
            {linearAvailability?.kind === "warning" ? (
              <div
                className="rounded-md border border-amber-500/40 bg-amber-500/8 p-3 text-xs text-amber-700"
                role="alert"
              >
                {linearAvailability.detail.text}
                {linearAvailability.detail.truncated ? "…" : ""}
              </div>
            ) : null}
            {automationLinearRows(linearResult).map((issue) => (
              <div key={issue.id} className="rounded-lg border bg-background p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{issue.identifier}</span>
                  <Badge variant="secondary">{issue.state}</Badge>
                  {issue.priority ? <span>priority {issue.priority}</span> : null}
                </div>
                <div className="mt-1 text-muted-foreground">{issue.title}</div>
                {issue.labels.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {issue.labels.map((label) => (
                      <Badge key={label} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {issue.blockedByCount ? (
                  <div className="mt-2 text-muted-foreground">
                    Blocked by {issue.blockedByCount} issue
                    {issue.blockedByCount === 1 ? "" : "s"}
                  </div>
                ) : null}
              </div>
            ))}
            {linearResult.hasNextPage ? (
              <p className="text-xs text-amber-600">
                Linear intake is bounded; more issues are available from the native provider.
              </p>
            ) : null}
            <div className="text-xs text-muted-foreground">
              {linearAvailability?.detail.text}
              {linearAvailability?.detail.truncated ? "…" : ""}
            </div>
          </div>
        ) : null}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
        {result?.valid ? (
          <>
            <Button
              disabled={pending}
              onClick={() => readLinearIssues("candidates")}
              variant="ghost"
            >
              Read active Linear
            </Button>
            <Button disabled={pending} onClick={() => readLinearIssues("terminal")} variant="ghost">
              Read terminal Linear
            </Button>
            <Button disabled={pending} onClick={() => readLinearIssues("refresh")} variant="ghost">
              Refresh issue
            </Button>
          </>
        ) : null}
        {capabilities.pause ? (
          <Button onClick={() => runLifecycleAction("pause")} variant="outline">
            Pause
          </Button>
        ) : null}
        {capabilities.inspect || capabilities.refresh ? (
          <>
            {capabilities.inspect ? (
              <Button onClick={() => runLifecycleAction("status")} variant="ghost">
                Inspect
              </Button>
            ) : null}
            {capabilities.refresh ? (
              <Button onClick={() => runLifecycleAction("refresh")} variant="ghost">
                Refresh
              </Button>
            ) : null}
          </>
        ) : null}
        {capabilities.resume ? (
          <Button onClick={() => runLifecycleAction("resume")} variant="outline">
            Resume
          </Button>
        ) : null}
        {capabilities.cancel ? (
          <Button onClick={cancelRun} variant="destructive">
            Cancel run
          </Button>
        ) : null}
        {capabilities.start ? (
          <Button onClick={run} variant="outline">
            {pending ? <Spinner /> : null}
            Start automation
          </Button>
        ) : null}
        <Button
          disabled={
            !capabilities.validate ||
            !profilePath.trim() ||
            !issueIdentifier.trim() ||
            !issueState.trim()
          }
          onClick={submit}
        >
          {pending ? <Spinner /> : null}
          Validate and preview
        </Button>
      </footer>
    </section>
  );
});
