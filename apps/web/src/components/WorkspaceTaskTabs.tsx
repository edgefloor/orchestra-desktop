import { PlusIcon, XIcon } from "lucide-react";
import { memo, useMemo, useRef, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";
import {
  buildWorkspaceTaskTabs,
  resolveWorkspaceTaskTabNavigation,
  resolveWorkspaceTaskTabStatus,
  workspaceTaskTabKey,
  type WorkspaceTaskTabSource,
  type WorkspaceTaskTabStatus,
} from "./WorkspaceTaskTabs.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const STATUS_PRESENTATION: Record<
  WorkspaceTaskTabStatus,
  { readonly label: string; readonly className: string }
> = {
  attention: { label: "Needs attention", className: "bg-warning" },
  error: { label: "Failed", className: "bg-destructive" },
  idle: { label: "Idle", className: "bg-muted-foreground/45" },
  running: { label: "Running", className: "animate-status-pulse bg-success" },
};

interface WorkspaceTaskTabsProps {
  readonly tasks: ReadonlyArray<WorkspaceTaskTabSource>;
  readonly activeTaskKey: string | null;
  readonly projectOverview?: {
    readonly title: string;
    readonly active: boolean;
    readonly onSelect: () => void;
  };
  readonly onSelectTask: (task: WorkspaceTaskTabSource) => void;
  readonly onCloseTask?: (task: WorkspaceTaskTabSource) => void;
  readonly onNewTask: () => void;
}

export const WorkspaceTaskTabs = memo(function WorkspaceTaskTabs({
  tasks,
  activeTaskKey,
  projectOverview,
  onSelectTask,
  onCloseTask,
  onNewTask,
}: WorkspaceTaskTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const visibleTasks = useMemo(
    () => buildWorkspaceTaskTabs({ tasks, activeTaskKey }),
    [activeTaskKey, tasks],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const overviewOffset = projectOverview ? 1 : 0;
    const targetIndex = resolveWorkspaceTaskTabNavigation({
      currentIndex,
      key: event.key,
      taskCount: visibleTasks.length + overviewOffset,
    });
    if (targetIndex === null) return;
    if (projectOverview && targetIndex === 0) {
      event.preventDefault();
      projectOverview.onSelect();
      tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(0).focus();
      return;
    }
    const targetTask = visibleTasks[targetIndex - overviewOffset];
    if (!targetTask) return;
    event.preventDefault();
    onSelectTask(targetTask);
    tabListRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(targetIndex)
      .focus();
  };

  return (
    <nav
      aria-label="Project tasks"
      className="flex h-9 min-w-0 shrink-0 items-stretch border-b border-border bg-sidebar"
      data-workspace-task-tabs=""
    >
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Open tasks"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {projectOverview ? (
          <button
            type="button"
            role="tab"
            aria-selected={projectOverview.active}
            tabIndex={projectOverview.active ? 0 : -1}
            title={projectOverview.title}
            className={cn(
              "relative flex w-32 shrink-0 items-center border-r border-border px-3 text-left text-xs text-muted-foreground outline-hidden transition-[color,background-color] hover:bg-background hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              projectOverview.active &&
                "bg-background font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
            )}
            onClick={projectOverview.onSelect}
            onKeyDown={(event) => handleKeyDown(event, 0)}
          >
            <span className="truncate">{projectOverview.title}</span>
          </button>
        ) : null}
        {visibleTasks.map((task, index) => {
          const taskKey = workspaceTaskTabKey(task);
          const active = taskKey === activeTaskKey;
          const status = STATUS_PRESENTATION[resolveWorkspaceTaskTabStatus(task)];
          return (
            <div
              key={taskKey}
              className={cn(
                "group relative flex w-36 shrink-0 items-stretch border-r border-border text-xs text-muted-foreground transition-[width,color,background-color] hover:bg-background hover:text-foreground",
                active &&
                  "w-44 bg-background font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={task.title}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left outline-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onSelectTask(task)}
                onKeyDown={(event) => {
                  if (event.key === "Delete" && onCloseTask) {
                    event.preventDefault();
                    onCloseTask(task);
                    return;
                  }
                  handleKeyDown(event, index + (projectOverview ? 1 : 0));
                }}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        aria-label={status.label}
                        className="inline-flex size-3 shrink-0 items-center justify-center"
                      />
                    }
                  >
                    <span className={cn("size-1.5 rounded-full", status.className)} />
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">{status.label}</TooltipPopup>
                </Tooltip>
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
              </button>
              {onCloseTask ? (
                <button
                  type="button"
                  aria-label={`Close ${task.title}`}
                  className={cn(
                    "mr-1 flex w-5 shrink-0 items-center justify-center self-stretch rounded text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  )}
                  onClick={() => onCloseTask(task)}
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="New task"
              className="inline-flex w-9 shrink-0 items-center justify-center border-l border-border text-muted-foreground outline-hidden transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={onNewTask}
            />
          }
        >
          <PlusIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">New task</TooltipPopup>
      </Tooltip>
    </nav>
  );
});
