import { CircleSlash2Icon, PlusIcon, XIcon } from "lucide-react";
import { memo, useRef, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";
import {
  resolveWorkspaceTaskTabNavigation,
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

export interface WorkspaceTabDescriptor {
  readonly key: string;
  readonly title: string;
  readonly active: boolean;
  readonly status?: WorkspaceTaskTabStatus;
  readonly availability?: "available" | "temporarilyUnavailable";
  readonly onSelect: () => void;
  readonly onClose?: () => void;
}

interface WorkspaceTaskTabsProps {
  readonly tabs: ReadonlyArray<WorkspaceTabDescriptor>;
  readonly onNewTask: () => void;
}

export const WorkspaceTaskTabs = memo(function WorkspaceTaskTabs({
  tabs,
  onNewTask,
}: WorkspaceTaskTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const targetIndex = resolveWorkspaceTaskTabNavigation({
      currentIndex,
      key: event.key,
      taskCount: tabs.length,
    });
    if (targetIndex === null) return;
    const targetTab = tabs[targetIndex];
    if (!targetTab) return;
    event.preventDefault();
    targetTab.onSelect();
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
        {tabs.map((tab, index) => {
          const status = tab.status ? STATUS_PRESENTATION[tab.status] : null;
          const temporarilyUnavailable = tab.availability === "temporarilyUnavailable";
          return (
            <div
              key={tab.key}
              className={cn(
                "group relative flex w-36 shrink-0 items-stretch border-r border-border text-xs text-muted-foreground transition-[width,color,background-color] hover:bg-background hover:text-foreground",
                tab.active &&
                  "w-44 bg-background font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.active}
                tabIndex={tab.active ? 0 : -1}
                title={tab.title}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left outline-hidden focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={tab.onSelect}
                onKeyDown={(event) => {
                  if (event.key === "Delete" && tab.onClose) {
                    event.preventDefault();
                    tab.onClose();
                    return;
                  }
                  handleKeyDown(event, index);
                }}
              >
                {status ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={status.label}
                          role="img"
                          className="inline-flex size-3 shrink-0 items-center justify-center"
                        />
                      }
                    >
                      <span className={cn("size-1.5 rounded-full", status.className)} />
                    </TooltipTrigger>
                    <TooltipPopup side="bottom">{status.label}</TooltipPopup>
                  </Tooltip>
                ) : null}
                {temporarilyUnavailable ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label="Temporarily unavailable"
                          role="img"
                          className="inline-flex size-3 shrink-0 items-center justify-center text-muted-foreground"
                        />
                      }
                    >
                      <CircleSlash2Icon className="size-3" />
                    </TooltipTrigger>
                    <TooltipPopup side="bottom">Temporarily unavailable</TooltipPopup>
                  </Tooltip>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              </button>
              {tab.onClose ? (
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  className={cn(
                    "mr-1 flex min-w-6 shrink-0 items-center justify-center self-stretch rounded text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    tab.active
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  )}
                  onClick={tab.onClose}
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
