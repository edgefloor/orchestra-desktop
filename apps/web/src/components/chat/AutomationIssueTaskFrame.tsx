import type { PropsWithChildren, ReactNode } from "react";

interface AutomationIssueTaskFrameProps extends PropsWithChildren {
  readonly issueActive: boolean;
  readonly activity: ReactNode;
  readonly composer: ReactNode;
}

export function AutomationIssueTaskFrame({
  issueActive,
  activity,
  composer,
  children,
}: AutomationIssueTaskFrameProps) {
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-automation-issue-layout={
        issueActive ? "bounded-context-with-retained-composer" : undefined
      }
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {issueActive ? (
          <div
            aria-label="Issue activity"
            className="shrink-0 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:px-6"
            data-automation-issue-activity=""
          >
            Issue activity
          </div>
        ) : null}
        {activity}
      </div>
      {composer}
      {children}
    </div>
  );
}
