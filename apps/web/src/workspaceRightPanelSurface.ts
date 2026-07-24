import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import type { RightPanelSurface } from "./rightPanelStore";
import {
  workspaceSurfaceKey,
  WORKSPACE_SURFACE_SCHEMA_VERSION,
  type WorkspaceSurface,
  type WorkspaceSurfaceKey,
  type WorkspaceSurfaceState,
} from "./workspaceSurface";

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

export function isWorkspaceRightPanelSurface(
  surface: WorkspaceSurface,
): surface is WorkspaceRightPanelSurface {
  return (
    surface.kind === "preview" ||
    surface.kind === "files" ||
    surface.kind === "diff" ||
    surface.kind === "terminal"
  );
}

function workspaceSurfaceOwnerThreadId(surface: WorkspaceSurface): ThreadId | null {
  switch (surface.kind) {
    case "project":
      return null;
    case "child":
      return surface.parentThreadId;
    default:
      return surface.threadId;
  }
}

/**
 * Returns the most-recent task-owned workspace surface that was active before
 * the current right-panel surface. Hiding a panel must not silently replace an
 * Issue, Symphony, or other retained task context with the generic task view.
 */
export function workspaceSurfaceKeyAfterRightPanelClose(
  state: WorkspaceSurfaceState,
): WorkspaceSurfaceKey | null {
  const activeKey = state.activeSurfaceKey;
  if (activeKey === null) return null;
  const activeEntry = state.entries.find(
    (entry) => workspaceSurfaceKey(entry.surface) === activeKey,
  );
  if (!activeEntry || !isWorkspaceRightPanelSurface(activeEntry.surface)) return null;
  const activeSurface = activeEntry.surface;

  return (
    state.focusOrder.toReversed().find((candidateKey) => {
      if (candidateKey === activeKey) return false;
      const candidate = state.entries.find(
        (entry) => workspaceSurfaceKey(entry.surface) === candidateKey,
      );
      return (
        candidate !== undefined &&
        !isWorkspaceRightPanelSurface(candidate.surface) &&
        candidate.surface.environmentId === activeSurface.environmentId &&
        candidate.surface.projectId === activeSurface.projectId &&
        workspaceSurfaceOwnerThreadId(candidate.surface) === activeSurface.threadId
      );
    }) ?? null
  );
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
