import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

export const WORKSPACE_SURFACE_SCHEMA_VERSION = 1 as const;
export const MAX_OPEN_WORKSPACE_SURFACES = 8;

interface WorkspaceSurfaceScope {
  readonly schemaVersion: typeof WORKSPACE_SURFACE_SCHEMA_VERSION;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

export type WorkspaceSurface =
  | (WorkspaceSurfaceScope & {
      readonly kind: "project";
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "task";
      readonly threadId: ThreadId;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "child";
      readonly parentThreadId: ThreadId;
      readonly agentThreadId: ThreadId;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "workflowRun";
      readonly threadId: ThreadId;
      readonly runId: string;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "symphony";
      readonly threadId: ThreadId;
      readonly automationRunId: string | null;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "issue";
      readonly threadId: ThreadId;
      readonly automationRunId: string;
      readonly issueId: string;
      readonly issueTaskThreadId: ThreadId;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "evidence";
      readonly threadId: ThreadId;
      readonly runId: string;
      readonly evidenceId: string;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "attention";
      readonly threadId: ThreadId;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "preview";
      readonly threadId: ThreadId;
      readonly previewId: string;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "files";
      readonly threadId: ThreadId;
      readonly relativePath: string | null;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "diff";
      readonly threadId: ThreadId;
    })
  | (WorkspaceSurfaceScope & {
      readonly kind: "terminal";
      readonly threadId: ThreadId;
      readonly terminalId: string;
    });

export type WorkspaceSurfaceKey = string & { readonly __workspaceSurfaceKey: unique symbol };

export type WorkspaceSurfaceAvailability = "available" | "temporarilyUnavailable";
export type WorkspaceSurfaceReconciliationStatus = WorkspaceSurfaceAvailability | "removed";

export interface WorkspaceSurfaceEntry {
  readonly surface: WorkspaceSurface;
  readonly availability: WorkspaceSurfaceAvailability;
}

export interface WorkspaceSurfaceState {
  readonly schemaVersion: typeof WORKSPACE_SURFACE_SCHEMA_VERSION;
  readonly entries: ReadonlyArray<WorkspaceSurfaceEntry>;
  readonly activeSurfaceKey: WorkspaceSurfaceKey | null;
  /** Stable keys ordered from least to most recently focused. */
  readonly focusOrder: ReadonlyArray<WorkspaceSurfaceKey>;
}

export type WorkspaceSurfaceReconciliation = Readonly<
  Record<string, WorkspaceSurfaceReconciliationStatus>
>;

function unreachableSurface(surface: never): never {
  throw new Error(`Unsupported workspace surface: ${JSON.stringify(surface)}`);
}

export function workspaceSurfaceKey(surface: WorkspaceSurface): WorkspaceSurfaceKey {
  const scope = [surface.environmentId, surface.projectId] as const;
  let identity: ReadonlyArray<string | null>;
  switch (surface.kind) {
    case "project":
      identity = [];
      break;
    case "task":
      identity = [surface.threadId];
      break;
    case "child":
      identity = [surface.parentThreadId, surface.agentThreadId];
      break;
    case "workflowRun":
      identity = [surface.threadId, surface.runId];
      break;
    case "symphony":
      identity = [surface.threadId];
      break;
    case "issue":
      identity = [
        surface.threadId,
        surface.automationRunId,
        surface.issueId,
        surface.issueTaskThreadId,
      ];
      break;
    case "evidence":
      identity = [surface.threadId, surface.runId, surface.evidenceId];
      break;
    case "attention":
      identity = [surface.threadId];
      break;
    case "preview":
      identity = [surface.threadId, surface.previewId];
      break;
    case "files":
      identity = [surface.threadId, surface.relativePath];
      break;
    case "diff":
      identity = [surface.threadId];
      break;
    case "terminal":
      identity = [surface.threadId, surface.terminalId];
      break;
    default:
      return unreachableSurface(surface);
  }
  return JSON.stringify([
    "orchestra-workspace-surface",
    WORKSPACE_SURFACE_SCHEMA_VERSION,
    surface.kind,
    ...scope,
    ...identity,
  ]) as WorkspaceSurfaceKey;
}

export function createWorkspaceSurfaceState(): WorkspaceSurfaceState {
  return {
    schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
    entries: [],
    activeSurfaceKey: null,
    focusOrder: [],
  };
}

function promoteFocus(
  focusOrder: ReadonlyArray<WorkspaceSurfaceKey>,
  key: WorkspaceSurfaceKey,
): WorkspaceSurfaceKey[] {
  return [...focusOrder.filter((candidate) => candidate !== key), key];
}

function withoutKeys(
  focusOrder: ReadonlyArray<WorkspaceSurfaceKey>,
  removedKeys: ReadonlySet<WorkspaceSurfaceKey>,
): WorkspaceSurfaceKey[] {
  return focusOrder.filter((key) => !removedKeys.has(key));
}

export function openWorkspaceSurface(
  state: WorkspaceSurfaceState,
  surface: WorkspaceSurface,
): WorkspaceSurfaceState {
  const key = workspaceSurfaceKey(surface);
  const existingIndex = state.entries.findIndex(
    (entry) => workspaceSurfaceKey(entry.surface) === key,
  );
  if (
    existingIndex >= 0 &&
    state.entries[existingIndex]?.availability === "available" &&
    state.activeSurfaceKey === key &&
    state.focusOrder.at(-1) === key
  ) {
    return state;
  }
  let entries =
    existingIndex < 0
      ? [...state.entries, { surface, availability: "available" as const }]
      : state.entries.map((entry, index) =>
          index === existingIndex ? { surface, availability: "available" as const } : entry,
        );
  let focusOrder = promoteFocus(state.focusOrder, key);

  if (entries.length > MAX_OPEN_WORKSPACE_SURFACES) {
    const evictionKey = focusOrder.find((candidate) => candidate !== key);
    if (evictionKey) {
      entries = entries.filter((entry) => workspaceSurfaceKey(entry.surface) !== evictionKey);
      focusOrder = focusOrder.filter((candidate) => candidate !== evictionKey);
    }
  }

  return {
    schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
    entries,
    activeSurfaceKey: key,
    focusOrder,
  };
}

export function focusWorkspaceSurface(
  state: WorkspaceSurfaceState,
  key: WorkspaceSurfaceKey,
): WorkspaceSurfaceState {
  if (!state.entries.some((entry) => workspaceSurfaceKey(entry.surface) === key)) return state;
  const focusOrder = promoteFocus(state.focusOrder, key);
  if (
    state.activeSurfaceKey === key &&
    focusOrder.every((candidate, index) => candidate === state.focusOrder[index])
  ) {
    return state;
  }
  return { ...state, activeSurfaceKey: key, focusOrder };
}

export function closeWorkspaceSurface(
  state: WorkspaceSurfaceState,
  key: WorkspaceSurfaceKey,
): WorkspaceSurfaceState {
  const closingIndex = state.entries.findIndex(
    (entry) => workspaceSurfaceKey(entry.surface) === key,
  );
  if (closingIndex < 0) return state;

  const entries = state.entries.filter((entry) => workspaceSurfaceKey(entry.surface) !== key);
  const removedKeys = new Set([key]);
  let focusOrder = withoutKeys(state.focusOrder, removedKeys);
  let activeSurfaceKey = state.activeSurfaceKey;
  if (activeSurfaceKey === key) {
    const fallbackEntry = entries[closingIndex] ?? entries[closingIndex - 1] ?? null;
    activeSurfaceKey = fallbackEntry ? workspaceSurfaceKey(fallbackEntry.surface) : null;
    if (activeSurfaceKey) focusOrder = promoteFocus(focusOrder, activeSurfaceKey);
  }

  return { ...state, entries, activeSurfaceKey, focusOrder };
}

export function reconcileWorkspaceSurfaces(
  state: WorkspaceSurfaceState,
  reconciliation: WorkspaceSurfaceReconciliation,
): WorkspaceSurfaceState {
  const removedKeys = new Set<WorkspaceSurfaceKey>();
  let availabilityChanged = false;
  const entries = state.entries.flatMap<WorkspaceSurfaceEntry>((entry) => {
    const key = workspaceSurfaceKey(entry.surface);
    const status = reconciliation[key];
    if (status === "removed") {
      removedKeys.add(key);
      return [];
    }
    if (status === "available" || status === "temporarilyUnavailable") {
      if (status !== entry.availability) availabilityChanged = true;
      return [{ ...entry, availability: status }];
    }
    return [entry];
  });

  if (removedKeys.size === 0 && !availabilityChanged) return state;

  let focusOrder = withoutKeys(state.focusOrder, removedKeys);
  let activeSurfaceKey = state.activeSurfaceKey;
  if (activeSurfaceKey !== null && removedKeys.has(activeSurfaceKey)) {
    const previousActiveIndex = state.entries.findIndex(
      (entry) => workspaceSurfaceKey(entry.surface) === activeSurfaceKey,
    );
    const retainedKeys = new Set(entries.map((entry) => workspaceSurfaceKey(entry.surface)));
    const rightFallback = state.entries
      .slice(previousActiveIndex + 1)
      .find((entry) => retainedKeys.has(workspaceSurfaceKey(entry.surface)));
    const leftFallback = state.entries
      .slice(0, previousActiveIndex)
      .toReversed()
      .find((entry) => retainedKeys.has(workspaceSurfaceKey(entry.surface)));
    activeSurfaceKey = rightFallback
      ? workspaceSurfaceKey(rightFallback.surface)
      : leftFallback
        ? workspaceSurfaceKey(leftFallback.surface)
        : null;
    if (activeSurfaceKey) focusOrder = promoteFocus(focusOrder, activeSurfaceKey);
  }

  return { ...state, entries, activeSurfaceKey, focusOrder };
}
