import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ProjectOverview } from "../components/ProjectOverview";
import { SidebarInset } from "../components/ui/sidebar";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { resolveProjectRouteRef } from "../projectRoutes";
import { useEnvironmentQuery } from "../state/query";
import { useProject, useThreadShellsForProjectRefs } from "../state/entities";
import { environmentShell } from "../state/shell";
import { buildThreadRouteParams } from "../threadRoutes";

function ProjectOverviewRouteView() {
  const navigate = useNavigate();
  const projectRef = Route.useParams({ select: resolveProjectRouteRef });
  const project = useProject(projectRef);
  const tasks = useThreadShellsForProjectRefs(projectRef ? [projectRef] : []);
  const shell = useEnvironmentQuery(
    projectRef === null ? null : environmentShell.stateAtom(projectRef.environmentId),
  );
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const handleNewThread = useNewThreadHandler();

  useEffect(() => {
    if (!projectRef || !bootstrapComplete || project) return;
    void navigate({ to: "/", replace: true });
  }, [bootstrapComplete, navigate, project, projectRef]);

  if (!projectRef || !bootstrapComplete || !project) return null;

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ProjectOverview
        project={project}
        tasks={tasks}
        onSelectTask={(task) => {
          const taskRef = scopeThreadRef(task.environmentId, task.id);
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(taskRef),
          });
        }}
        onNewTask={() => handleNewThread(projectRef)}
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/project/$environmentId/$projectId")({
  component: ProjectOverviewRouteView,
});
