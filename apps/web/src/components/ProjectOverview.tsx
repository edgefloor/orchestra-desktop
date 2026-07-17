import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { AlertCircleIcon, ListTodoIcon, PlusIcon, WorkflowIcon, ZapIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { cn } from "~/lib/utils";
import {
  workspaceSurfaceKey,
  WORKSPACE_SURFACE_SCHEMA_VERSION,
  type WorkspaceSurface,
} from "~/workspaceSurface";
import { useWorkspaceSurfaceStore } from "~/workspaceSurfaceStore";

import { Button } from "./ui/button";
import { deriveProjectOverviewSummary } from "./ProjectOverview.logic";
import { WorkspaceTaskTabs } from "./WorkspaceTaskTabs";
import {
  resolveWorkspaceTaskTabStatus,
  type WorkspaceTaskTabStatus,
} from "./WorkspaceTaskTabs.logic";

interface ProjectOverviewProps {
  readonly project: EnvironmentProject;
  readonly tasks: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectTask: (task: EnvironmentThreadShell) => void;
  readonly onNewTask: () => void;
}

const STATUS_LABELS: Record<WorkspaceTaskTabStatus, string> = {
  attention: "Needs attention",
  error: "Failed",
  idle: "Idle",
  running: "Running",
};

function SummaryCard(props: {
  icon: typeof ListTodoIcon;
  label: string;
  value: string;
  detail: string;
}) {
  const Icon = props.icon;
  return (
    <section className="rounded-xl border border-border bg-card/35 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {props.label}
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-foreground">{props.value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{props.detail}</p>
    </section>
  );
}

export function ProjectOverview({ project, tasks, onSelectTask, onNewTask }: ProjectOverviewProps) {
  const summary = deriveProjectOverviewSummary(tasks);
  const projectSurface = useMemo<WorkspaceSurface>(
    () => ({
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      kind: "project",
      environmentId: project.environmentId,
      projectId: project.id,
    }),
    [project.environmentId, project.id],
  );
  const workspaceEntries = useWorkspaceSurfaceStore((state) => state.entries);
  const activeSurfaceKey = useWorkspaceSurfaceStore((state) => state.activeSurfaceKey);
  const projectEntries = useMemo(
    () =>
      workspaceEntries.filter(
        (entry) =>
          entry.surface.environmentId === project.environmentId &&
          entry.surface.projectId === project.id &&
          (entry.surface.kind === "project" || entry.surface.kind === "task"),
      ),
    [project.environmentId, project.id, workspaceEntries],
  );

  useEffect(() => {
    useWorkspaceSurfaceStore.getState().openSurface(projectSurface);
  }, [projectSurface]);

  useEffect(() => {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    useWorkspaceSurfaceStore.getState().reconcileSurfaces(
      Object.fromEntries(
        projectEntries.flatMap((entry) => {
          if (entry.surface.kind !== "task") return [];
          const task = taskById.get(entry.surface.threadId);
          return [
            [
              workspaceSurfaceKey(entry.surface),
              !task || task.archivedAt ? "removed" : "available",
            ],
          ];
        }),
      ),
    );
  }, [projectEntries, tasks]);

  const tabs = useMemo(
    () =>
      projectEntries.flatMap((entry) => {
        const key = workspaceSurfaceKey(entry.surface);
        if (entry.surface.kind === "project") {
          return [
            {
              key,
              title: "Overview",
              active: key === activeSurfaceKey,
              onSelect: () => useWorkspaceSurfaceStore.getState().focusSurface(key),
            },
          ];
        }
        if (entry.surface.kind !== "task") return [];
        const taskSurface = entry.surface;
        const task = tasks.find((candidate) => candidate.id === taskSurface.threadId);
        if (!task) return [];
        return [
          {
            key,
            title: task.title,
            active: key === activeSurfaceKey,
            status: resolveWorkspaceTaskTabStatus(task),
            onSelect: () => {
              useWorkspaceSurfaceStore.getState().focusSurface(key);
              onSelectTask(task);
            },
            onClose: () => useWorkspaceSurfaceStore.getState().closeSurface(key),
          },
        ];
      }),
    [activeSurfaceKey, onSelectTask, projectEntries, tasks],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTaskTabs tabs={tabs} onNewTask={onNewTask} />
      <header className="workspace-topbar border-b border-border px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">{project.title}</h1>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {project.workspaceRoot}
            </p>
          </div>
          <Button size="sm" onClick={onNewTask}>
            <PlusIcon className="size-3.5" />
            New task
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-2 min-[1040px]:grid-cols-4">
            <SummaryCard
              icon={ListTodoIcon}
              label="Tasks"
              value={String(summary.activeTasks)}
              detail={`${summary.runningTasks} running · ${summary.omittedTasks} omitted from the bounded list`}
            />
            <SummaryCard
              icon={AlertCircleIcon}
              label="Attention"
              value={String(summary.attentionTasks)}
              detail="Native approvals, user input, and actionable plans"
            />
            <SummaryCard
              icon={WorkflowIcon}
              label="Workflow"
              value="Task-owned"
              detail="Open a task to inspect bounded Runs and Evidence"
            />
            <SummaryCard
              icon={ZapIcon}
              label="Symphony"
              value="Automation"
              detail="Runs inside its visible owning task, never a detached loop"
            />
          </div>

          <section aria-labelledby="project-recent-tasks">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 id="project-recent-tasks" className="text-sm font-semibold text-foreground">
                  Recent tasks
                </h2>
                <p className="text-xs text-muted-foreground">
                  Showing up to {summary.recentTasks.length} native tasks
                  {summary.omittedTasks > 0 ? ` · ${summary.omittedTasks} more` : ""}
                </p>
              </div>
            </div>

            {summary.recentTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm font-medium text-foreground">No tasks in this project yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a native task when there is work to do.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card/20">
                {summary.recentTasks.map((task) => {
                  const status = resolveWorkspaceTaskTabStatus(task);
                  return (
                    <button
                      key={`${task.environmentId}:${task.id}`}
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left outline-hidden last:border-b-0 hover:bg-accent/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => onSelectTask(task)}
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          status === "running" && "bg-success",
                          status === "attention" && "bg-warning",
                          status === "error" && "bg-destructive",
                          status === "idle" && "bg-muted-foreground/45",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {task.title}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {STATUS_LABELS[status]}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
