import type { EnvironmentId, NativeSubagentDetail, ThreadId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { readNativeSubagent } from "~/state/nativeSubagents";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { readableAutomationError } from "./AutomationError.logic";
import {
  exactNativeIssueActivityInput,
  isExactNativeIssueActivityDetail,
} from "./AutomationIssueActivity.logic";

export interface AutomationIssueActivityProps {
  readonly environmentId: EnvironmentId;
  readonly ownerThreadId: ThreadId;
  readonly agentThreadId: string;
}

export interface AutomationIssueActivityPresentationProps {
  readonly agentThreadId: string;
  readonly detail: NativeSubagentDetail | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
}

export function AutomationIssueActivityPresentation({
  agentThreadId,
  detail,
  loading,
  error,
  onRetry,
}: AutomationIssueActivityPresentationProps) {
  const retainedAfterFailure = detail !== null && error !== null;
  return (
    <div
      aria-label="Native Issue task activity"
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3 sm:px-6"
      data-automation-issue-native-activity={
        retainedAfterFailure
          ? "stale"
          : detail
            ? loading
              ? "refreshing"
              : "ready"
            : loading
              ? "loading"
              : error
                ? "error"
                : "empty"
      }
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Native child <code className="select-all">{agentThreadId}</code>
          </span>
          {detail ? <Badge variant="outline">{detail.status}</Badge> : null}
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner /> Loading exact native Issue activity…
          </p>
        ) : null}
        {error ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 p-3" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            {retainedAfterFailure ? (
              <p className="text-xs text-muted-foreground">
                Showing stale native activity retained from the last successful exact read.
              </p>
            ) : null}
            <Button onClick={onRetry} size="sm" variant="outline">
              Retry Issue activity
            </Button>
          </div>
        ) : null}
        {detail ? (
          <>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-sm font-medium">{detail.preview}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Updated {detail.updatedAt}
                {detail.role ? ` · ${detail.role}` : ""}
              </p>
            </div>
            <div className="space-y-2">
              {detail.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No native Issue activity is available yet.
                </p>
              ) : (
                detail.items.map((item) => (
                  <article className="rounded-lg border bg-background p-3" key={item.id}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.type}</span>
                      {item.status ? <Badge variant="outline">{item.status}</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm">{item.summary}</p>
                  </article>
                ))
              )}
            </div>
            {detail.truncated ? (
              <p className="text-xs text-muted-foreground">
                Earlier activity remains in the native Issue task and was not loaded.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AutomationIssueActivityController({
  environmentId,
  ownerThreadId,
  agentThreadId,
}: AutomationIssueActivityProps) {
  const readDetail = useAtomCommand(readNativeSubagent, { reportFailure: false });
  const [detail, setDetail] = useState<NativeSubagentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setLoading(true);
    setError(null);
    void readDetail({
      environmentId,
      input: exactNativeIssueActivityInput(ownerThreadId, agentThreadId),
    }).then((result) => {
      if (requestIdRef.current !== requestId) return;
      setLoading(false);
      if (result._tag === "Success") {
        if (!isExactNativeIssueActivityDetail(result.value, ownerThreadId, agentThreadId)) {
          setError("The native child response did not match the exact persisted Issue task.");
          return;
        }
        setDetail(result.value);
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        setError(readableAutomationError(squashAtomCommandFailure(result), 1_024));
      }
    });
  }, [agentThreadId, environmentId, ownerThreadId, readDetail]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const exactDetail =
    detail && isExactNativeIssueActivityDetail(detail, ownerThreadId, agentThreadId)
      ? detail
      : null;

  return (
    <AutomationIssueActivityPresentation
      agentThreadId={agentThreadId}
      detail={exactDetail}
      error={error}
      loading={loading}
      onRetry={load}
    />
  );
}

export const AutomationIssueActivity = memo(AutomationIssueActivityController);
