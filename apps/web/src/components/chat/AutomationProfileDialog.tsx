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
  acceptedAutomationRunAction,
  automationLinearRows,
  automationLinearAvailability,
  automationRunStorageKey,
  automationWorkspaceCapabilities,
  buildAutomationStartInput,
  buildAutomationValidateInput,
  boundedAutomationFeedbackText,
  deriveAutomationWorkspaceState,
  resolveAutomationWorkspaceRunCursor,
  staleAutomationRunAction,
  type AutomationRunAction,
  type AutomationRunActionFeedback,
  type AutomationWorkspacePendingAction,
} from "./AutomationProfileDialog.logic";
import {
  AutomationRunWorkspace,
  type AutomationIssueTaskNavigationInput,
} from "./AutomationRunWorkspace";
import { AutomationRunActionFeedbackNotice } from "./AutomationRunActionFeedback";
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
  readonly onOpenIssueTask: (input: AutomationIssueTaskNavigationInput) => void;
  readonly initialAutomationRunId?: string | null;
}

export type { AutomationIssueTaskNavigationInput };

function readableError(cause: unknown): string {
  return boundedAutomationFeedbackText(
    cause instanceof Error ? cause.message : "The Automation request failed.",
  );
}

export const AutomationWorkspace = memo(function AutomationWorkspace({
  environmentId,
  threadId,
  threadTitle,
  onClose,
  onOpenIssueTask,
  initialAutomationRunId,
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
  const [queueOffset, setQueueOffset] = useState(0);
  const [steeringInputs, setSteeringInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<AutomationRunActionFeedback | null>(null);
  const restoredRunId = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const acceptRunResult = useCallback(
    (value: AutomationRunResult, action?: AutomationRunAction) => {
      setRunResult(value);
      setRunId(value.run.runId);
      setQueueResult(null);
      setQueueOffset(0);
      setActionFeedback(action ? acceptedAutomationRunAction(action, value.run) : null);
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
    const candidateRunId = resolveAutomationWorkspaceRunCursor({
      initialAutomationRunId,
      storedAutomationRunId: runResult
        ? null
        : localStorage.getItem(automationRunStorageKey(threadId)),
    });
    if (
      !candidateRunId ||
      runResult?.run.runId === candidateRunId ||
      restoredRunId.current === candidateRunId
    ) {
      return;
    }
    restoredRunId.current = candidateRunId;
    setRunId(candidateRunId);
    loadRun(candidateRunId);
  }, [initialAutomationRunId, loadRun, runResult, threadId]);

  const submit = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setPendingAction("validating");
    setError(null);
    setResult(null);
    setQueueResult(null);
    setQueueOffset(0);
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
        acceptRunResult(commandResult.value, "Start");
        return;
      }
      if (!isAtomCommandInterrupted(commandResult)) {
        const message = readableError(squashAtomCommandFailure(commandResult));
        setError(message);
        setActionFeedback(staleAutomationRunAction("Start", message, runResult?.run ?? null));
      }
    });
  }, [acceptRunResult, environmentId, profilePath, runResult, start, threadId]);

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
          acceptRunResult({ run: commandResult.value.run }, "Steer issue");
          setSteeringInputs((current) => ({ ...current, [claimId]: "" }));
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          const message = readableError(squashAtomCommandFailure(commandResult));
          setError(message);
          setActionFeedback(staleAutomationRunAction("Steer issue", message, runResult.run));
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
        acceptRunResult(commandResult.value, "Cancel run");
        return;
      }
      if (!isAtomCommandInterrupted(commandResult)) {
        const message = readableError(squashAtomCommandFailure(commandResult));
        setError(message);
        setActionFeedback(staleAutomationRunAction("Cancel run", message, runResult.run));
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
          acceptRunResult(commandResult.value, "Cancel issue");
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          const message = readableError(squashAtomCommandFailure(commandResult));
          setError(message);
          setActionFeedback(staleAutomationRunAction("Cancel issue", message, runResult.run));
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
          const actionLabel =
            action === "status"
              ? "Inspect"
              : action === "pause"
                ? "Pause"
                : action === "refresh"
                  ? "Refresh"
                  : "Resume";
          acceptRunResult(commandResult.value, actionLabel);
          return;
        }
        if (!isAtomCommandInterrupted(commandResult)) {
          const actionLabel =
            action === "status"
              ? "Inspect"
              : action === "pause"
                ? "Pause"
                : action === "refresh"
                  ? "Refresh"
                  : "Resume";
          const message = readableError(squashAtomCommandFailure(commandResult));
          setError(message);
          setActionFeedback(staleAutomationRunAction(actionLabel, message, runResult.run));
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
          setQueueResult(commandResult.value);
          setQueueOffset(offset ?? 0);
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
      className="flex h-[min(58vh,44rem)] max-h-[min(58vh,44rem)] shrink-0 flex-col border-b border-border bg-card/55"
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
        {error ? (
          <div
            className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive"
            role="alert"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <AutomationRunActionFeedbackNotice feedback={actionFeedback} />

        <details className="rounded-xl border bg-muted/10 p-3" open={!runResult}>
          <summary className="cursor-pointer text-sm font-medium">
            Configuration and profile validation
          </summary>
          <div className="mt-4 space-y-5">
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
                    {result.diagnostics.map((diagnostic) => (
                      <div
                        key={`${diagnostic.path}:${diagnostic.code}:${diagnostic.message}`}
                        className="text-sm"
                      >
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
          </div>
        </details>

        {runResult ? (
          <AutomationRunWorkspace
            onCancelClaim={cancelClaim}
            onInspectQueue={inspectQueue}
            onInspectRun={() => runLifecycleAction("status")}
            onOpenIssueTask={onOpenIssueTask}
            onRefreshRun={() => runLifecycleAction("refresh")}
            onResumeRun={() => runLifecycleAction("resume")}
            onSteerClaim={steerClaim}
            onSteeringInputChange={(claimId, value) =>
              setSteeringInputs((current) => ({ ...current, [claimId]: value }))
            }
            pending={pending}
            queueResult={queueResult}
            queueOffset={queueOffset}
            runResult={runResult}
            steeringInputs={steeringInputs}
          />
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
