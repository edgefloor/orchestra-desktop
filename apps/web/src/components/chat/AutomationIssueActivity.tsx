import type { EnvironmentId, NativeSubagentDetail, ThreadId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { readNativeSubagent } from "~/state/nativeSubagents";
import { useAtomCommand } from "~/state/use-atom-command";
import { readableAutomationError } from "./AutomationError.logic";
import {
  exactNativeIssueActivityInput,
  isExactNativeIssueActivityDetail,
  projectAutomationIssueActivityPresentation,
} from "./AutomationIssueActivity.logic";
import { NativeActivityPanel } from "./NativeActivityPanel";

export interface AutomationIssueActivityProps {
  readonly environmentId: EnvironmentId;
  readonly connectionReady?: boolean;
  readonly ownerThreadId: ThreadId;
  readonly agentThreadId: string;
  readonly refreshGeneration?: number;
}

export interface AutomationIssueActivityPresentationProps {
  readonly agentThreadId: string;
  readonly detail: NativeSubagentDetail | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: (() => void) | undefined;
}

export function AutomationIssueActivityPresentation({
  agentThreadId,
  detail,
  loading,
  error,
  onRetry,
}: AutomationIssueActivityPresentationProps) {
  const presentation = projectAutomationIssueActivityPresentation({
    agentThreadId,
    detail,
    error,
    loading,
  });
  return (
    <div
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3 sm:px-6"
      data-automation-issue-native-activity={presentation.state}
    >
      <NativeActivityPanel
        className="mx-auto max-w-3xl"
        onRetry={onRetry}
        presentation={presentation}
      />
    </div>
  );
}

export function AutomationIssueActivityController({
  environmentId,
  connectionReady = true,
  ownerThreadId,
  agentThreadId,
  refreshGeneration = 0,
}: AutomationIssueActivityProps) {
  const readDetail = useAtomCommand(readNativeSubagent, { reportFailure: false });
  const [detail, setDetail] = useState<NativeSubagentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    if (!connectionReady) return;
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
  }, [agentThreadId, connectionReady, environmentId, ownerThreadId, readDetail]);

  useEffect(() => {
    if (!connectionReady) {
      requestIdRef.current += 1;
      return;
    }
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [connectionReady, load, refreshGeneration]);

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
      onRetry={connectionReady ? load : undefined}
    />
  );
}

export const AutomationIssueActivity = memo(AutomationIssueActivityController);
