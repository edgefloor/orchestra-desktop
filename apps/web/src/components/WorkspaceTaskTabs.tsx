import { PlusIcon } from "lucide-react";
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
  readonly onSelectTask: (task: WorkspaceTaskTabSource) => void;
  readonly onNewTask: () => void;
}

export const WorkspaceTaskTabs = memo(function WorkspaceTaskTabs({
  tasks,
  activeTaskKey,
  onSelectTask,
  onNewTask,
}: WorkspaceTaskTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const visibleTasks = useMemo(
    () => buildWorkspaceTaskTabs({ tasks, activeTaskKey }),
    [activeTaskKey, tasks],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const targetIndex = resolveWorkspaceTaskTabNavigation({
      currentIndex,
      key: event.key,
      taskCount: visibleTasks.length,
    });
    if (targetIndex === null) return;
    const targetTask = visibleTasks[targetIndex];
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
        {visibleTasks.map((task, index) => {
          const taskKey = workspaceTaskTabKey(task);
          const active = taskKey === activeTaskKey;
          const status = STATUS_PRESENTATION[resolveWorkspaceTaskTabStatus(task)];
          return (
            <button
              key={taskKey}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={task.title}
              className={cn(
                "group relative flex w-36 shrink-0 items-center gap-2 border-r border-border px-3 text-left text-xs text-muted-foreground outline-hidden transition-[width,color,background-color] hover:bg-background hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active &&
                  "w-44 bg-background font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
              )}
              onClick={() => onSelectTask(task)}
              onKeyDown={(event) => handleKeyDown(event, index)}
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
