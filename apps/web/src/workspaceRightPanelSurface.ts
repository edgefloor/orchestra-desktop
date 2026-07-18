import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import type { RightPanelSurface } from "./rightPanelStore";
import { WORKSPACE_SURFACE_SCHEMA_VERSION, type WorkspaceSurface } from "./workspaceSurface";

export interface WorkspaceRightPanelScope {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
}

export type WorkspaceRightPanelSurface = Extract<
  WorkspaceSurface,
  { kind: "preview" | "files" | "diff" | "terminal" }
>;

export interface RightPanelSurfaceActivation {
  readonly surfaceId: RightPanelSurface["id"];
}

/**
 * Projects a retained right-panel descriptor into workspace navigation identity.
 * Transient presentation state, such as file reveal requests and active terminal
 * splits, deliberately remains owned by the right-panel store.
 */
export function workspaceSurfaceForRightPanelSurface(
  scope: WorkspaceRightPanelScope,
  surface: RightPanelSurface,
): WorkspaceRightPanelSurface | null {
  const base = {
    schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
    environmentId: scope.environmentId,
    projectId: scope.projectId,
    threadId: scope.threadId,
  } as const;

  switch (surface.kind) {
    case "preview":
      return surface.resourceId === null
        ? null
        : { ...base, kind: "preview", previewId: surface.resourceId };
    case "files":
      return { ...base, kind: "files", relativePath: null };
    case "file":
      return { ...base, kind: "files", relativePath: surface.relativePath };
    case "diff":
      return { ...base, kind: "diff" };
    case "terminal":
      return { ...base, kind: "terminal", terminalId: surface.resourceId };
    case "plan":
      return null;
  }
}

/**
 * Resolves the retained right-panel descriptor required to activate a workspace
 * surface. Callers remain responsible for choosing the thread-scoped store and
 * invoking its explicit activation action.
 */
export function rightPanelActivationForWorkspaceSurface(
  workspaceSurface: WorkspaceSurface,
  rightPanelSurfaces: ReadonlyArray<RightPanelSurface>,
): RightPanelSurfaceActivation | null {
  const matchingSurface = rightPanelSurfaces.find((surface) => {
    switch (workspaceSurface.kind) {
      case "preview":
        return surface.kind === "preview" && surface.resourceId === workspaceSurface.previewId;
      case "files":
        return workspaceSurface.relativePath === null
          ? surface.kind === "files"
          : surface.kind === "file" && surface.relativePath === workspaceSurface.relativePath;
      case "diff":
        return surface.kind === "diff";
      case "terminal":
        return surface.kind === "terminal" && surface.resourceId === workspaceSurface.terminalId;
      default:
        return false;
    }
  });

  return matchingSurface ? { surfaceId: matchingSurface.id } : null;
}
