import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import type { NativeActivityPresentation } from "./NativeActivityPanel.logic";

export interface NativeActivityPanelProps {
  readonly className?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly presentation: NativeActivityPresentation;
}

export function NativeActivityPanel({
  className,
  onRetry,
  presentation,
}: NativeActivityPanelProps) {
  const {
    accessibleLabel,
    emptyMessage,
    failure,
    identity,
    loadingMessage,
    overview,
    records,
    state,
    truncationMessage,
  } = presentation;

  return (
    <section
      aria-label={accessibleLabel}
      className={cn("space-y-3", className)}
      data-native-activity-state={state}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {identity.label} <code className="select-all">{identity.value}</code>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {identity.status ? <Badge variant="outline">{identity.status}</Badge> : null}
          <Badge variant="secondary">
            {records.length} {records.length === 1 ? "item" : "items"}
          </Badge>
        </div>
      </header>

      {state === "loading" || state === "refreshing" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> {loadingMessage ?? "Loading native activity…"}
        </p>
      ) : null}

      {failure ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 p-3" role="alert">
          <p className="text-sm text-destructive">{failure.message}</p>
          {failure.retainedMessage ? (
            <p className="text-xs text-muted-foreground">{failure.retainedMessage}</p>
          ) : null}
          {onRetry ? (
            <Button onClick={onRetry} size="sm" variant="outline">
              {failure.retryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {overview ? (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">{overview.summary}</p>
          {overview.metadata ? (
            <p className="mt-1 text-xs text-muted-foreground">{overview.metadata}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        {records.length === 0 && state !== "loading" && state !== "error" ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          records.map((record) => (
            <article
              className="grid gap-1 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              key={record.id}
            >
              <div className="min-w-0">
                {record.kind || record.status ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {record.kind ? <span>{record.kind}</span> : null}
                    {record.status ? (
                      <Badge variant="outline">{record.status.replace("_", " ")}</Badge>
                    ) : null}
                  </div>
                ) : null}
                <p className={cn("text-sm", record.kind || record.status ? "mt-1" : "font-medium")}>
                  {record.summary}
                </p>
                {record.detail ? (
                  <p className="mt-1 text-xs text-muted-foreground">{record.detail}</p>
                ) : null}
              </div>
              {record.occurredAt ? (
                <time className="text-xs text-muted-foreground">{record.occurredAt}</time>
              ) : null}
            </article>
          ))
        )}
      </div>

      {truncationMessage ? <p className="text-xs text-amber-600">{truncationMessage}</p> : null}
    </section>
  );
}
