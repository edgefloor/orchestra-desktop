import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { workspaceSurfaceKey, type WorkspaceSurface } from "./workspaceSurface";
import {
  normalizePersistedWorkspaceSurfaceState,
  useWorkspaceSurfaceStore,
} from "./workspaceSurfaceStore";

const surface: WorkspaceSurface = {
  schemaVersion: 1,
  kind: "attention",
  environmentId: EnvironmentId.make("local"),
  projectId: ProjectId.make("orchestra"),
  threadId: ThreadId.make("task"),
};

beforeEach(() => {
  useWorkspaceSurfaceStore.getState().resetSurfaces();
});

describe("workspace surface store", () => {
  it("wraps the pure open, focus, close, and reconcile transitions", () => {
    const store = useWorkspaceSurfaceStore.getState();
    const key = workspaceSurfaceKey(surface);

    store.openSurface(surface);
    expect(useWorkspaceSurfaceStore.getState()).toMatchObject({
      activeSurfaceKey: key,
      entries: [{ surface, availability: "available" }],
    });

    useWorkspaceSurfaceStore.getState().reconcileSurfaces({
      [key]: "temporarilyUnavailable",
    });
    expect(useWorkspaceSurfaceStore.getState().entries[0]?.availability).toBe(
      "temporarilyUnavailable",
    );

    useWorkspaceSurfaceStore.getState().closeSurface(key);
    expect(useWorkspaceSurfaceStore.getState()).toMatchObject({
      activeSurfaceKey: null,
      entries: [],
      focusOrder: [],
    });
  });

  it("hydrates only valid bounded presentation identities and repairs stale pointers", () => {
    const key = workspaceSurfaceKey(surface);
    expect(
      normalizePersistedWorkspaceSurfaceState({
        schemaVersion: 1,
        entries: [
          { surface, availability: "temporarilyUnavailable" },
          { surface: { ...surface, kind: "unknown" }, availability: "available" },
        ],
        activeSurfaceKey: "missing",
        focusOrder: ["missing", key, key],
        executionAuthority: { invented: true },
      }),
    ).toEqual({
      schemaVersion: 1,
      entries: [{ surface, availability: "temporarilyUnavailable" }],
      activeSurfaceKey: null,
      focusOrder: [key],
    });
  });
});
