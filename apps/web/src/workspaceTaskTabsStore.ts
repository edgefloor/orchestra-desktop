import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

const STORAGE_KEY = "orchestra:workspace-task-tabs:v1";
const MAX_CLOSED_TASK_KEYS = 64;

interface WorkspaceTaskTabsStore {
  readonly closedTaskKeysByProject: Record<string, string[]>;
  closeTask: (projectKey: string, taskKey: string) => void;
  reopenTask: (projectKey: string, taskKey: string) => void;
  reconcileProject: (projectKey: string, validTaskKeys: ReadonlyArray<string>) => void;
}

function updateProjectKeys(
  current: Record<string, string[]>,
  projectKey: string,
  nextKeys: string[],
): Record<string, string[]> {
  if (nextKeys.length === 0) {
    if (!(projectKey in current)) return current;
    const { [projectKey]: _removed, ...rest } = current;
    return rest;
  }
  const previous = current[projectKey] ?? [];
  if (
    previous.length === nextKeys.length &&
    previous.every((taskKey, index) => taskKey === nextKeys[index])
  ) {
    return current;
  }
  return { ...current, [projectKey]: nextKeys };
}

export const useWorkspaceTaskTabsStore = create<WorkspaceTaskTabsStore>()(
  persist(
    (set) => ({
      closedTaskKeysByProject: {},
      closeTask: (projectKey, taskKey) =>
        set((state) => {
          const previous = state.closedTaskKeysByProject[projectKey] ?? [];
          const next = [...previous.filter((key) => key !== taskKey), taskKey].slice(
            -MAX_CLOSED_TASK_KEYS,
          );
          return {
            closedTaskKeysByProject: updateProjectKeys(
              state.closedTaskKeysByProject,
              projectKey,
              next,
            ),
          };
        }),
      reopenTask: (projectKey, taskKey) =>
        set((state) => ({
          closedTaskKeysByProject: updateProjectKeys(
            state.closedTaskKeysByProject,
            projectKey,
            (state.closedTaskKeysByProject[projectKey] ?? []).filter((key) => key !== taskKey),
          ),
        })),
      reconcileProject: (projectKey, validTaskKeys) =>
        set((state) => {
          const valid = new Set(validTaskKeys);
          return {
            closedTaskKeysByProject: updateProjectKeys(
              state.closedTaskKeysByProject,
              projectKey,
              (state.closedTaskKeysByProject[projectKey] ?? []).filter((key) => valid.has(key)),
            ),
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ closedTaskKeysByProject: state.closedTaskKeysByProject }),
    },
  ),
);
