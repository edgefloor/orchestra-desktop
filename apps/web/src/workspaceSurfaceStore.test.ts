import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  workspaceSurfaceKey,
  WORKSPACE_SURFACE_SCHEMA_VERSION,
  type WorkspaceSurface,
} from "./workspaceSurface";
import {
  normalizePersistedWorkspaceSurfaceState,
  useWorkspaceSurfaceStore,
} from "./workspaceSurfaceStore";

const surface: WorkspaceSurface = {
  schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
  kind: "attention",
  environmentId: EnvironmentId.make("local"),
  projectId: ProjectId.make("orchestra"),
  threadId: ThreadId.make("task"),
};

beforeEach(() => {
  useWorkspaceSurfaceStore.getState().resetSurfaces();
});

describe("workspace surface store", () => {
  it("drops the pre-step workspace schema instead of guessing lazy query scope", () => {
    expect(
      normalizePersistedWorkspaceSurfaceState({
        schemaVersion: 1,
        entries: [{ surface: { ...surface, schemaVersion: 1 } }],
      }),
    ).toEqual({
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      entries: [],
      activeSurfaceKey: null,
      focusOrder: [],
    });
  });

  it("drops v2 issue surfaces that cannot prove the provider-native Automation owner", () => {
    expect(
      normalizePersistedWorkspaceSurfaceState({
        schemaVersion: 2,
        entries: [
          {
            surface: {
              schemaVersion: 2,
              kind: "issue",
              environmentId: "local",
              projectId: "orchestra",
              threadId: "host-task",
              automationRunId: "automation-70",
              issueId: "issue-70",
              issueTaskThreadId: "issue-task-70",
            },
            availability: "available",
          },
        ],
      }),
    ).toEqual({
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      entries: [],
      activeSurfaceKey: null,
      focusOrder: [],
    });
  });

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
        schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
        entries: [
          { surface, availability: "temporarilyUnavailable" },
          { surface: { ...surface, kind: "unknown" }, availability: "available" },
        ],
        activeSurfaceKey: "missing",
        focusOrder: ["missing", key, key],
        executionAuthority: { invented: true },
      }),
    ).toEqual({
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      entries: [{ surface, availability: "temporarilyUnavailable" }],
      activeSurfaceKey: null,
      focusOrder: [key],
    });
  });

  it("hydrates backward-compatible bounded issue presentation metadata", () => {
    const issueSurface: WorkspaceSurface = {
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      kind: "issue",
      environmentId: EnvironmentId.make("local"),
      projectId: ProjectId.make("orchestra"),
      threadId: ThreadId.make("symphony-task"),
      automationOwnerThreadId: "provider-symphony-task",
      automationRunId: "automation-70",
      issueId: "issue-70",
      issueTaskThreadId: ThreadId.make("issue-task-70"),
      issueIdentifier: "ORC-70",
      issueTitle: "Deliver the Symphony workspace",
    };
    const legacyIssueSurface = {
      ...issueSurface,
      issueId: "issue-69",
      issueTaskThreadId: ThreadId.make("issue-task-69"),
      issueIdentifier: undefined,
      issueTitle: undefined,
    };
    const invalidIssueSurface = {
      ...issueSurface,
      issueId: "issue-oversized",
      issueTaskThreadId: ThreadId.make("issue-task-oversized"),
      issueTitle: "x".repeat(4_098),
    };

    const normalized = normalizePersistedWorkspaceSurfaceState({
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      entries: [
        { surface: issueSurface, availability: "available" },
        { surface: legacyIssueSurface, availability: "available" },
        { surface: invalidIssueSurface, availability: "available" },
      ],
    });

    expect(normalized.entries.map((entry) => entry.surface)).toEqual([
      issueSurface,
      legacyIssueSurface,
    ]);
  });
});
