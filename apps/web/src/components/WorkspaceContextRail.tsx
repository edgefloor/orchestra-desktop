import type { KeyboardEvent, ReactNode } from "react";
import { XIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { resolveWorkspaceTabNavigation } from "./workspaceTabNavigation";

export type WorkspaceContextRailView = "attention" | "subagents" | "workflow";

const VIEW_LABELS: Record<WorkspaceContextRailView, string> = {
  attention: "Attention",
  subagents: "Subagents",
  workflow: "Workflow",
};
const CONTEXT_VIEWS = ["subagents", "workflow", "attention"] as const;

interface WorkspaceTaskContextBarProps {
  readonly projectName: string | null;
  readonly workspaceRoot: string | null;
  readonly activeView: WorkspaceContextRailView | null;
  readonly onSelectView: (view: WorkspaceContextRailView) => void;
}

export function WorkspaceTaskContextBar({
  projectName,
  workspaceRoot,
  activeView,
  onSelectView,
}: WorkspaceTaskContextBarProps) {
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const targetIndex = resolveWorkspaceTabNavigation({
      currentIndex,
      key: event.key,
      tabCount: CONTEXT_VIEWS.length,
    });
    if (targetIndex === null) return;
    event.preventDefault();
    const targetView = CONTEXT_VIEWS[targetIndex];
    if (!targetView) return;
    onSelectView(targetView);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#workspace-context-tab-${targetView}`)
      ?.focus();
  };

  return (
    <div className="flex h-8 min-w-0 shrink-0 items-center gap-2 border-b border-border bg-background px-3 text-[11px] text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground/80">Worktree</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
        {workspaceRoot ?? projectName ?? "Current checkout"}
      </span>
      <div className="flex shrink-0 items-center gap-1" role="tablist" aria-label="Task context">
        {CONTEXT_VIEWS.map((view, index) => (
          <button
            key={view}
            type="button"
            id={`workspace-context-tab-${view}`}
            role="tab"
            aria-controls={`workspace-context-panel-${view}`}
            aria-selected={activeView === view}
            tabIndex={activeView === view || (activeView === null && index === 0) ? 0 : -1}
            className={cn(
              "min-h-6 rounded-md px-2 py-1 outline-hidden transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
              activeView === view && "bg-primary/12 text-primary",
            )}
            onClick={() => onSelectView(view)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {VIEW_LABELS[view]}
          </button>
        ))}
      </div>
    </div>
  );
}

interface WorkspaceContextRailProps {
  readonly activeView: WorkspaceContextRailView;
  readonly subagents: ReactNode;
  readonly workflow: ReactNode;
  readonly attention: ReactNode;
  readonly onClose: () => void;
  readonly variant?: "rail" | "sheet";
}

export function WorkspaceContextRail({
  activeView,
  subagents,
  workflow,
  attention,
  onClose,
  variant = "rail",
}: WorkspaceContextRailProps) {
  return (
    <aside
      aria-label="Task context"
      className={cn(
        "min-h-0 shrink-0 flex-col border-l border-border bg-sidebar",
        variant === "rail" ? "hidden w-72 min-[840px]:flex" : "flex h-full w-full",
      )}
      data-workspace-context-rail=""
      data-workspace-context-variant={variant}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold text-foreground">{VIEW_LABELS[activeView]}</span>
        <button
          type="button"
          aria-label="Close task context"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onClose}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div
        id={`workspace-context-panel-${activeView}`}
        role="tabpanel"
        aria-labelledby={`workspace-context-tab-${activeView}`}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {activeView === "subagents" ? subagents : activeView === "workflow" ? workflow : attention}
      </div>
    </aside>
  );
}
