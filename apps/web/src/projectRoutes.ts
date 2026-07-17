import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ScopedProjectRef } from "@t3tools/contracts";

export function buildProjectRouteParams(ref: ScopedProjectRef): {
  environmentId: EnvironmentId;
  projectId: ProjectId;
} {
  return {
    environmentId: ref.environmentId,
    projectId: ref.projectId,
  };
}

export function resolveProjectRouteRef(
  params: Partial<Record<"environmentId" | "projectId", string | undefined>>,
): ScopedProjectRef | null {
  if (!params.environmentId || !params.projectId) return null;
  return scopeProjectRef(params.environmentId as EnvironmentId, params.projectId as ProjectId);
}
