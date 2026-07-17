import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import {
  closeWorkspaceSurface,
  createWorkspaceSurfaceState,
  focusWorkspaceSurface,
  openWorkspaceSurface,
  reconcileWorkspaceSurfaces,
  workspaceSurfaceKey,
  WORKSPACE_SURFACE_SCHEMA_VERSION,
  type WorkspaceSurface,
  type WorkspaceSurfaceKey,
  type WorkspaceSurfaceReconciliation,
  type WorkspaceSurfaceState,
} from "./workspaceSurface";

const WORKSPACE_SURFACE_STORAGE_KEY = "orchestra:workspace-surfaces:v1";

interface WorkspaceSurfaceStore extends WorkspaceSurfaceState {
  openSurface: (surface: WorkspaceSurface) => void;
  focusSurface: (key: WorkspaceSurfaceKey) => void;
  closeSurface: (key: WorkspaceSurfaceKey) => void;
  reconcileSurfaces: (reconciliation: WorkspaceSurfaceReconciliation) => void;
  resetSurfaces: () => void;
}

const initialState = createWorkspaceSurfaceState();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkspaceSurface(value: unknown): value is WorkspaceSurface {
  if (
    !isRecord(value) ||
    value.schemaVersion !== WORKSPACE_SURFACE_SCHEMA_VERSION ||
    typeof value.environmentId !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.kind !== "string"
  ) {
    return false;
  }
  const stringFields = (...fields: string[]) =>
    fields.every((field) => typeof value[field] === "string");
  switch (value.kind) {
    case "project":
      return true;
    case "task":
    case "attention":
    case "diff":
      return stringFields("threadId");
    case "child":
      return stringFields("parentThreadId", "agentThreadId");
    case "workflowRun":
      return stringFields("threadId", "runId");
    case "symphony":
      return (
        stringFields("threadId") &&
        (value.automationRunId === null || typeof value.automationRunId === "string")
      );
    case "issue":
      return stringFields("threadId", "automationRunId", "issueId", "issueTaskThreadId");
    case "evidence":
      return stringFields("threadId", "runId", "evidenceId");
    case "preview":
      return stringFields("threadId", "previewId");
    case "files":
      return (
        stringFields("threadId") &&
        (value.relativePath === null || typeof value.relativePath === "string")
      );
    case "terminal":
      return stringFields("threadId", "terminalId");
    default:
      return false;
  }
}

export function normalizePersistedWorkspaceSurfaceState(persisted: unknown): WorkspaceSurfaceState {
  if (!isRecord(persisted) || !Array.isArray(persisted.entries)) return initialState;
  let normalized = createWorkspaceSurfaceState();
  const availabilityByKey = new Map<WorkspaceSurfaceKey, "available" | "temporarilyUnavailable">();
  for (const candidate of persisted.entries) {
    if (!isRecord(candidate) || !isWorkspaceSurface(candidate.surface)) continue;
    normalized = openWorkspaceSurface(normalized, candidate.surface);
    availabilityByKey.set(
      workspaceSurfaceKey(candidate.surface),
      candidate.availability === "temporarilyUnavailable" ? "temporarilyUnavailable" : "available",
    );
  }
  const keys = normalized.entries.map((entry) => workspaceSurfaceKey(entry.surface));
  const keySet = new Set(keys);
  const persistedFocusOrder = Array.isArray(persisted.focusOrder)
    ? persisted.focusOrder.filter(
        (key): key is WorkspaceSurfaceKey =>
          typeof key === "string" && keySet.has(key as WorkspaceSurfaceKey),
      )
    : [];
  const focusOrder = [
    ...new Set([
      ...persistedFocusOrder,
      ...keys.filter((key) => !persistedFocusOrder.includes(key)),
    ]),
  ];
  const activeSurfaceKey =
    typeof persisted.activeSurfaceKey === "string" &&
    keySet.has(persisted.activeSurfaceKey as WorkspaceSurfaceKey)
      ? (persisted.activeSurfaceKey as WorkspaceSurfaceKey)
      : null;
  return {
    ...normalized,
    entries: normalized.entries.map((entry) => ({
      ...entry,
      availability: availabilityByKey.get(workspaceSurfaceKey(entry.surface)) ?? "available",
    })),
    activeSurfaceKey,
    focusOrder,
  };
}

export const useWorkspaceSurfaceStore = create<WorkspaceSurfaceStore>()(
  persist(
    (set) => ({
      ...initialState,
      openSurface: (surface) => set((state) => openWorkspaceSurface(state, surface)),
      focusSurface: (key) => set((state) => focusWorkspaceSurface(state, key)),
      closeSurface: (key) => set((state) => closeWorkspaceSurface(state, key)),
      reconcileSurfaces: (reconciliation) =>
        set((state) => reconcileWorkspaceSurfaces(state, reconciliation)),
      resetSurfaces: () => set(createWorkspaceSurfaceState()),
    }),
    {
      name: WORKSPACE_SURFACE_STORAGE_KEY,
      version: WORKSPACE_SURFACE_SCHEMA_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      merge: (persisted, current) => ({
        ...current,
        ...normalizePersistedWorkspaceSurfaceState(persisted),
      }),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        entries: state.entries,
        activeSurfaceKey: state.activeSurfaceKey,
        focusOrder: state.focusOrder,
      }),
    },
  ),
);
