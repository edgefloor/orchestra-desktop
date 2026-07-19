import { type AutomationRunResult, type EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ExternalLinkIcon, GitCompareIcon, RefreshCwIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readLocalApi } from "~/localApi";
import { readAutomationStatus, steerAutomationIssue } from "~/state/automation";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";
import { readableAutomationError } from "./AutomationError.logic";
import {
  automationIssueClaimUrl,
  beginAutomationIssueRequest,
  deriveAutomationIssueWorkspaceRuntimeState,
  exactAutomationStatusInput,
  isCurrentAutomationIssueRequest,
  selectExactAutomationIssueSnapshot,
  type AutomationIssueWorkspaceLocator,
  type AutomationIssueWorkspaceRuntimeState,
  type AutomationIssueWorkspaceSnapshot,
} from "./AutomationIssueWorkspace.logic";

export interface AutomationIssueWorkspaceProps extends AutomationIssueWorkspaceLocator {
  readonly environmentId: EnvironmentId;
  readonly availability: "available" | "temporarilyUnavailable";
  readonly issueIdentifier: string | undefined;
  readonly issueTitle: string | undefined;
  readonly onOpenSymphony: () => void;
  readonly onOpenDiff: () => void;
  readonly onNativeActivityRefresh?: () => void;
}

export interface AutomationIssueWorkspacePresentationProps {
  readonly snapshot: AutomationIssueWorkspaceSnapshot | null;
  readonly runtimeState: AutomationIssueWorkspaceRuntimeState;
  readonly fallbackIdentifier: string;
  readonly fallbackTitle: string | undefined;
  readonly error: string | null;
  readonly pending: boolean;
  readonly guidance: string;
  readonly onGuidanceChange: (value: string) => void;
  readonly onRefresh: () => void;
  readonly onOpenSymphony: () => void;
  readonly onOpenDiff: () => void;
  readonly onOpenTracker: () => void;
  readonly onSendGuidance: () => void;
}

function formatState(value: string): string {
  return value.replaceAll("_", " ");
}

export function AutomationIssueWorkspacePresentation({
  snapshot,
  runtimeState,
  fallbackIdentifier,
  fallbackTitle,
  error,
  pending,
  guidance,
  onGuidanceChange,
  onRefresh,
  onOpenSymphony,
  onOpenDiff,
  onOpenTracker,
  onSendGuidance,
}: AutomationIssueWorkspacePresentationProps) {
  const issue = snapshot?.issue ?? null;
  const claim = issue?.claim;
  const trackerUrl = automationIssueClaimUrl(claim);
  const identifier = issue?.issueIdentifier ?? fallbackIdentifier;
  const title = issue?.issueTitle.text ?? fallbackTitle;
  const canSteer = claim?.status === "running" && Boolean(claim.issueTask?.threadId);

  return (
    <section
      aria-label={`${identifier} issue workspace`}
      className="max-h-[45vh] min-w-0 shrink-0 space-y-3 overflow-x-hidden overflow-y-auto border-b border-border bg-card/55 px-4 py-3 sm:px-6"
      data-automation-issue-workspace={runtimeState}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{identifier}</h2>
            <Badge aria-live="polite" role="status" variant="outline">
              {runtimeState}
            </Badge>
            {issue ? (
              <Badge variant="secondary">execution {formatState(issue.executionState)}</Badge>
            ) : null}
            {claim ? <Badge variant="outline">claim {formatState(claim.status)}</Badge> : null}
            {issue ? <Badge variant="outline">tracker {issue.trackerState}</Badge> : null}
          </div>
          {title ? <p className="text-sm text-muted-foreground">{title}</p> : null}
          <p className="text-xs text-muted-foreground">
            Parent: Symphony
            {snapshot ? (
              <>
                {" "}
                · Run <code className="select-all">{snapshot.runResult.run.runId}</code>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={onRefresh} size="xs" variant="ghost">
            <RefreshCwIcon /> Refresh
          </Button>
          <Button onClick={onOpenSymphony} size="xs" variant="outline">
            Open Symphony
          </Button>
          <Button onClick={onOpenDiff} size="xs" variant="outline">
            <GitCompareIcon /> Diff
          </Button>
          {trackerUrl ? (
            <Button onClick={onOpenTracker} size="xs" variant="outline">
              <ExternalLinkIcon /> Open in Linear
            </Button>
          ) : null}
        </div>
      </div>

      {runtimeState === "temporarilyUnavailable" ? (
        <p className="text-xs text-amber-700" role="status">
          This persisted issue surface is temporarily unavailable. Its exact Run and issue identity
          are retained for recovery.
        </p>
      ) : null}
      {runtimeState === "loading" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Spinner /> Loading exact native issue context…
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
          {runtimeState === "stale" ? " Retaining the last exact native snapshot." : ""}
        </p>
      ) : null}

      {issue && claim ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <div className="space-y-3">
            <dl className="grid gap-x-4 gap-y-1 rounded-lg border bg-background p-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="inline font-medium">Attempt </dt>
                <dd className="inline">{claim.attempt}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Workflow state </dt>
                <dd className="inline">
                  {claim.workflowStatus ? formatState(claim.workflowStatus) : "not started"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline font-medium">Claim </dt>
                <dd className="inline">
                  <code className="select-all">{claim.claimId}</code>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline font-medium">Worktree </dt>
                <dd className="inline break-all">
                  <code className="select-all">{claim.worktree}</code>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline font-medium">Workflow Run </dt>
                <dd className="inline">
                  <code className="select-all">{claim.workflowRunId ?? "Not recorded"}</code>
                </dd>
              </div>
            </dl>

            {claim.latestSteeringReceipt ? (
              <section
                aria-label="Latest issue guidance"
                className="space-y-1 rounded-lg border bg-background p-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">Latest guidance</h3>
                  <Badge variant="outline">{claim.latestSteeringReceipt.status}</Badge>
                </div>
                <p className="text-muted-foreground">{claim.latestSteeringReceipt.inputPreview}</p>
                {claim.latestSteeringReceipt.failure ? (
                  <p className="text-destructive">{claim.latestSteeringReceipt.failure}</p>
                ) : null}
              </section>
            ) : null}

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <Label htmlFor={`issue-workspace-guidance-${claim.claimId}`}>Guide Issue task</Label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  disabled={!canSteer || pending}
                  id={`issue-workspace-guidance-${claim.claimId}`}
                  maxLength={16_384}
                  onChange={(event) => onGuidanceChange(event.target.value)}
                  placeholder="Send bounded guidance through native Codex authority"
                  value={guidance}
                />
                <Button
                  className="w-full sm:w-auto"
                  disabled={!canSteer || pending || !guidance.trim()}
                  onClick={onSendGuidance}
                  size="sm"
                  variant="outline"
                >
                  Send guidance
                </Button>
              </div>
              {!canSteer ? (
                <p className="text-xs text-muted-foreground" role="status">
                  Issue guidance is available only while the exact native claim is running.
                </p>
              ) : null}
            </div>
          </div>

          <section
            aria-label="Proposed effects"
            className="space-y-2 rounded-lg border bg-background p-3 text-xs"
          >
            <h3 className="font-medium">Proposed effects</h3>
            {claim.effects.length === 0 ? (
              <p className="text-muted-foreground">No durable effect receipts are recorded.</p>
            ) : (
              claim.effects.map((effect) => (
                <article
                  className="space-y-1 rounded-md border bg-muted/20 p-2"
                  key={effect.effectId}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{effect.kind}</span>
                    <Badge variant={effect.status === "committed" ? "secondary" : "outline"}>
                      {formatState(effect.status)}
                    </Badge>
                    <span className="text-muted-foreground">{formatState(effect.gatePolicy)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {effect.bodyPreview.text}
                    {effect.bodyPreview.truncated ? "…" : ""}
                  </p>
                  <p className="break-all text-muted-foreground">
                    Effect <code className="select-all">{effect.effectId}</code> · request{" "}
                    <code className="select-all">{effect.requestSha256}</code>
                  </p>
                  {effect.providerReceipt ? (
                    <p className="break-all text-muted-foreground">
                      Provider receipt <code className="select-all">{effect.providerReceipt}</code>
                    </p>
                  ) : null}
                  {effect.failure ? (
                    <p className="text-destructive">{effect.failure.text}</p>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function AutomationIssueWorkspaceController({
  environmentId,
  ownerThreadId,
  automationRunId,
  issueId,
  issueTaskThreadId,
  availability,
  issueIdentifier,
  issueTitle,
  onOpenSymphony,
  onOpenDiff,
  onNativeActivityRefresh,
}: AutomationIssueWorkspaceProps) {
  const readStatus = useAtomCommand(readAutomationStatus, { reportFailure: false });
  const steerIssue = useAtomCommand(steerAutomationIssue, { reportFailure: false });
  const locator = useMemo<AutomationIssueWorkspaceLocator>(
    () => ({ ownerThreadId, automationRunId, issueId, issueTaskThreadId }),
    [automationRunId, issueId, issueTaskThreadId, ownerThreadId],
  );
  const [snapshot, setSnapshot] = useState<AutomationIssueWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSteering, setPendingSteering] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const statusRequestIdRef = useRef(0);
  const steeringRequestIdRef = useRef(0);

  const acceptRunResult = useCallback(
    (runResult: AutomationRunResult): boolean => {
      const exact = selectExactAutomationIssueSnapshot(runResult, locator);
      if (!exact) {
        setError(
          "The native response did not contain the exact persisted issue claim and task identity.",
        );
        return false;
      }
      setSnapshot(exact);
      setError(null);
      return true;
    },
    [locator],
  );

  const load = useCallback(
    (onSettled?: () => void) => {
      const requestId = beginAutomationIssueRequest(statusRequestIdRef);
      setLoading(true);
      setError(null);
      void readStatus({
        environmentId,
        input: exactAutomationStatusInput(locator),
      }).then((result) => {
        if (!isCurrentAutomationIssueRequest(statusRequestIdRef, requestId)) return;
        setLoading(false);
        if (result._tag === "Success") {
          acceptRunResult(result.value);
        } else if (!isAtomCommandInterrupted(result)) {
          setError(readableAutomationError(squashAtomCommandFailure(result), 1_024));
        }
        onSettled?.();
      });
    },
    [acceptRunResult, environmentId, locator, readStatus],
  );

  useEffect(() => {
    load();
    return () => {
      statusRequestIdRef.current += 1;
      steeringRequestIdRef.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => {
    load(onNativeActivityRefresh);
  }, [load, onNativeActivityRefresh]);

  const sendGuidance = useCallback(() => {
    const claim = snapshot?.issue.claim;
    const input = guidance.trim();
    if (!claim || claim.status !== "running" || !claim.issueTask?.threadId || !input) return;
    const requestId = beginAutomationIssueRequest(steeringRequestIdRef);
    setPendingSteering(true);
    setError(null);
    void steerIssue({
      environmentId,
      input: {
        threadId: ownerThreadId,
        runId: automationRunId,
        claimId: claim.claimId,
        input,
      },
    }).then((result) => {
      if (!isCurrentAutomationIssueRequest(steeringRequestIdRef, requestId)) return;
      setPendingSteering(false);
      if (result._tag === "Success") {
        if (acceptRunResult({ run: result.value.run })) setGuidance("");
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        setError(readableAutomationError(squashAtomCommandFailure(result), 1_024));
      }
    });
  }, [
    acceptRunResult,
    automationRunId,
    environmentId,
    guidance,
    ownerThreadId,
    snapshot,
    steerIssue,
  ]);

  const trackerUrl = automationIssueClaimUrl(snapshot?.issue.claim);
  const openTracker = useCallback(() => {
    if (!trackerUrl) return;
    void readLocalApi()
      ?.shell.openExternal(trackerUrl)
      .catch((cause) => setError(readableAutomationError(cause, 1_024)));
  }, [trackerUrl]);
  const runtimeState = deriveAutomationIssueWorkspaceRuntimeState({
    availability,
    loading,
    hasSnapshot: snapshot !== null,
    error,
  });

  return (
    <AutomationIssueWorkspacePresentation
      error={error}
      fallbackIdentifier={issueIdentifier ?? `Issue ${issueId}`}
      fallbackTitle={issueTitle}
      guidance={guidance}
      onGuidanceChange={setGuidance}
      onOpenDiff={onOpenDiff}
      onOpenSymphony={onOpenSymphony}
      onOpenTracker={openTracker}
      onRefresh={refresh}
      onSendGuidance={sendGuidance}
      pending={loading || pendingSteering}
      runtimeState={runtimeState}
      snapshot={snapshot}
    />
  );
}

export const AutomationIssueWorkspace = memo(AutomationIssueWorkspaceController);
