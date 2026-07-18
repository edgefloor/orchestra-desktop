import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  closeWorkspaceSurface,
  createWorkspaceSurfaceState,
  focusWorkspaceSurface,
  MAX_OPEN_WORKSPACE_SURFACES,
  openWorkspaceSurface,
  parentSymphonySurfaceForIssue,
  reconcileWorkspaceSurfaces,
  workspaceIssueSurfaceTitle,
  workspaceSurfaceKey,
  WORKSPACE_SURFACE_SCHEMA_VERSION,
  type WorkspaceSurface,
  type WorkspaceSurfaceState,
} from "./workspaceSurface";

const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("orchestra");
const threadId = ThreadId.make("task:root");

function taskSurface(index: number): WorkspaceSurface {
  return {
    schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
    kind: "task",
    environmentId,
    projectId,
    threadId: ThreadId.make(`task-${index}`),
  };
}

function openAll(surfaces: ReadonlyArray<WorkspaceSurface>): WorkspaceSurfaceState {
  return surfaces.reduce(openWorkspaceSurface, createWorkspaceSurfaceState());
}

const everySurfaceKind: ReadonlyArray<WorkspaceSurface> = [
  { schemaVersion: 2, kind: "project", environmentId, projectId },
  { schemaVersion: 2, kind: "task", environmentId, projectId, threadId },
  {
    schemaVersion: 2,
    kind: "child",
    environmentId,
    projectId,
    parentThreadId: threadId,
    agentThreadId: ThreadId.make("child"),
  },
  {
    schemaVersion: 2,
    kind: "workflowRun",
    environmentId,
    projectId,
    threadId,
    runId: "run",
  },
  {
    schemaVersion: 2,
    kind: "symphony",
    environmentId,
    projectId,
    threadId,
    automationRunId: "automation",
  },
  {
    schemaVersion: 2,
    kind: "issue",
    environmentId,
    projectId,
    threadId,
    automationRunId: "automation",
    issueId: "issue",
    issueTaskThreadId: ThreadId.make("issue-task"),
  },
  {
    schemaVersion: 2,
    kind: "evidence",
    environmentId,
    projectId,
    threadId,
    runId: "run",
    stepId: "step",
    evidenceId: "evidence",
  },
  { schemaVersion: 2, kind: "attention", environmentId, projectId, threadId },
  {
    schemaVersion: 2,
    kind: "preview",
    environmentId,
    projectId,
    threadId,
    previewId: "preview",
  },
  {
    schemaVersion: 2,
    kind: "files",
    environmentId,
    projectId,
    threadId,
    relativePath: "src/main.ts",
  },
  { schemaVersion: 2, kind: "diff", environmentId, projectId, threadId },
  {
    schemaVersion: 2,
    kind: "terminal",
    environmentId,
    projectId,
    threadId,
    terminalId: "terminal",
  },
];

describe("issue parent Symphony", () => {
  it("preserves the exact owner task and Automation Run identity", () => {
    const issue = everySurfaceKind.find(
      (surface): surface is Extract<WorkspaceSurface, { kind: "issue" }> =>
        surface.kind === "issue",
    )!;

    expect(parentSymphonySurfaceForIssue(issue)).toEqual({
      schemaVersion: 2,
      kind: "symphony",
      environmentId,
      projectId,
      threadId,
      automationRunId: "automation",
    });
  });
});

describe("workspace surface identity", () => {
  it("provides a distinct stable key for every closed-union kind", () => {
    const keys = everySurfaceKind.map(workspaceSurfaceKey);
    expect(new Set(keys)).toHaveLength(everySurfaceKind.length);
    expect(everySurfaceKind.map((surface) => surface.kind)).toEqual([
      "project",
      "task",
      "child",
      "workflowRun",
      "symphony",
      "issue",
      "evidence",
      "attention",
      "preview",
      "files",
      "diff",
      "terminal",
    ]);
    expect(keys).toEqual(everySurfaceKind.map(workspaceSurfaceKey));
  });

  it("scopes identities by environment and project without delimiter collisions", () => {
    const base = taskSurface(1);
    const differentEnvironment = {
      ...base,
      environmentId: EnvironmentId.make("local:orchestra"),
      projectId: ProjectId.make("project"),
    };
    const delimiterLookalike = {
      ...base,
      environmentId: EnvironmentId.make("local"),
      projectId: ProjectId.make("orchestra:project"),
    };
    expect(workspaceSurfaceKey(differentEnvironment)).not.toBe(
      workspaceSurfaceKey(delimiterLookalike),
    );
    expect(workspaceSurfaceKey(base)).not.toBe(
      workspaceSurfaceKey({ ...base, projectId: ProjectId.make("other") }),
    );
  });

  it("keeps one task-owned Symphony identity while distinguishing issue tasks", () => {
    const symphony = everySurfaceKind.find(
      (surface): surface is Extract<WorkspaceSurface, { kind: "symphony" }> =>
        surface.kind === "symphony",
    )!;
    expect(workspaceSurfaceKey({ ...symphony, automationRunId: null })).toBe(
      workspaceSurfaceKey({ ...symphony, automationRunId: "new-run" }),
    );

    const issue = everySurfaceKind.find(
      (surface): surface is Extract<WorkspaceSurface, { kind: "issue" }> =>
        surface.kind === "issue",
    )!;
    expect(
      workspaceSurfaceKey({ ...issue, issueTaskThreadId: ThreadId.make("other-issue-task") }),
    ).not.toBe(workspaceSurfaceKey(issue));
    expect(
      workspaceSurfaceKey({
        ...issue,
        issueIdentifier: "ORC-70",
        issueTitle: "Deliver the Symphony workspace",
      }),
    ).toBe(workspaceSurfaceKey(issue));
  });

  it("prefers the persisted issue identifier for tab presentation", () => {
    const issue = everySurfaceKind.find(
      (surface): surface is Extract<WorkspaceSurface, { kind: "issue" }> =>
        surface.kind === "issue",
    )!;

    expect(workspaceIssueSurfaceTitle({ ...issue, issueIdentifier: "ORC-70" })).toBe("ORC-70");
    expect(workspaceIssueSurfaceTitle(issue)).toBe("Issue issue");
  });

  it("includes the native step in Evidence identity for cold lazy restoration", () => {
    const evidence = everySurfaceKind.find(
      (surface): surface is Extract<WorkspaceSurface, { kind: "evidence" }> =>
        surface.kind === "evidence",
    )!;
    expect(workspaceSurfaceKey({ ...evidence, stepId: "other-step" })).not.toBe(
      workspaceSurfaceKey(evidence),
    );
  });
});

describe("workspace surface reducer", () => {
  it("opens and focuses a surface while deduplicating its stable identity", () => {
    const surface = taskSurface(1);
    const first = openWorkspaceSurface(createWorkspaceSurfaceState(), surface);
    const duplicate = openWorkspaceSurface(first, { ...surface });

    expect(duplicate.entries).toEqual([{ surface, availability: "available" }]);
    expect(duplicate.activeSurfaceKey).toBe(workspaceSurfaceKey(surface));
    expect(duplicate.focusOrder).toEqual([workspaceSurfaceKey(surface)]);
    expect(openWorkspaceSurface(duplicate, surface)).toBe(duplicate);
  });

  it("refreshes issue presentation metadata without opening a duplicate identity", () => {
    const issue = everySurfaceKind.find(
      (surface): surface is Extract<WorkspaceSurface, { kind: "issue" }> =>
        surface.kind === "issue",
    )!;
    const first = openWorkspaceSurface(createWorkspaceSurfaceState(), issue);
    const refreshed = openWorkspaceSurface(first, {
      ...issue,
      issueIdentifier: "ORC-70",
      issueTitle: "Deliver the Symphony workspace",
    });

    expect(refreshed.entries).toHaveLength(1);
    expect(refreshed.entries[0]?.surface).toMatchObject({
      issueIdentifier: "ORC-70",
      issueTitle: "Deliver the Symphony workspace",
    });
  });

  it("focuses without changing visible order and tracks LRU independently", () => {
    const surfaces = [taskSurface(1), taskSurface(2), taskSurface(3)];
    const state = openAll(surfaces);
    const focused = focusWorkspaceSurface(state, workspaceSurfaceKey(surfaces[0]!));

    expect(focused.entries.map((entry) => entry.surface)).toEqual(surfaces);
    expect(focused.focusOrder).toEqual([
      workspaceSurfaceKey(surfaces[1]!),
      workspaceSurfaceKey(surfaces[2]!),
      workspaceSurfaceKey(surfaces[0]!),
    ]);
    expect(focusWorkspaceSurface(focused, workspaceSurfaceKey(taskSurface(99)))).toBe(focused);
  });

  it("caps the global list at eight and evicts the least-recent inactive surface", () => {
    const initialSurfaces = Array.from({ length: MAX_OPEN_WORKSPACE_SURFACES }, (_, index) =>
      taskSurface(index),
    );
    const initial = openAll(initialSurfaces);
    const withOldestPromoted = focusWorkspaceSurface(
      initial,
      workspaceSurfaceKey(initialSurfaces[0]!),
    );
    const incoming = taskSurface(MAX_OPEN_WORKSPACE_SURFACES);
    const next = openWorkspaceSurface(withOldestPromoted, incoming);
    const keys = next.entries.map((entry) => workspaceSurfaceKey(entry.surface));

    expect(next.entries).toHaveLength(MAX_OPEN_WORKSPACE_SURFACES);
    expect(keys).toContain(workspaceSurfaceKey(initialSurfaces[0]!));
    expect(keys).not.toContain(workspaceSurfaceKey(initialSurfaces[1]!));
    expect(next.activeSurfaceKey).toBe(workspaceSurfaceKey(incoming));
  });

  it("closes an inactive surface without changing the active identity", () => {
    const surfaces = [taskSurface(1), taskSurface(2), taskSurface(3)];
    const state = openAll(surfaces);
    const next = closeWorkspaceSurface(state, workspaceSurfaceKey(surfaces[0]!));
    expect(next.activeSurfaceKey).toBe(workspaceSurfaceKey(surfaces[2]!));
    expect(next.entries.map((entry) => entry.surface)).toEqual(surfaces.slice(1));
  });

  it("selects the right neighbor, then left, when closing the active surface", () => {
    const surfaces = [taskSurface(1), taskSurface(2), taskSurface(3)];
    const middleActive = focusWorkspaceSurface(
      openAll(surfaces),
      workspaceSurfaceKey(surfaces[1]!),
    );
    const afterMiddle = closeWorkspaceSurface(middleActive, workspaceSurfaceKey(surfaces[1]!));
    expect(afterMiddle.activeSurfaceKey).toBe(workspaceSurfaceKey(surfaces[2]!));

    const afterRight = closeWorkspaceSurface(afterMiddle, workspaceSurfaceKey(surfaces[2]!));
    expect(afterRight.activeSurfaceKey).toBe(workspaceSurfaceKey(surfaces[0]!));

    const empty = closeWorkspaceSurface(afterRight, workspaceSurfaceKey(surfaces[0]!));
    expect(empty).toMatchObject({ entries: [], activeSurfaceKey: null, focusOrder: [] });
  });

  it("retains temporarily unavailable and unreported identities during reconciliation", () => {
    const surfaces = [taskSurface(1), taskSurface(2)];
    const unavailableKey = workspaceSurfaceKey(surfaces[0]!);
    const state = focusWorkspaceSurface(openAll(surfaces), unavailableKey);
    const next = reconcileWorkspaceSurfaces(state, {
      [unavailableKey]: "temporarilyUnavailable",
    });

    expect(next.entries).toEqual([
      { surface: surfaces[0], availability: "temporarilyUnavailable" },
      { surface: surfaces[1], availability: "available" },
    ]);
    expect(next.activeSurfaceKey).toBe(unavailableKey);
    expect(
      reconcileWorkspaceSurfaces(next, { [unavailableKey]: "available" }).entries[0]?.availability,
    ).toBe("available");
  });

  it("drops only explicitly removed identities and repairs active focus by proximity", () => {
    const surfaces = [taskSurface(1), taskSurface(2), taskSurface(3), taskSurface(4)];
    const state = focusWorkspaceSurface(openAll(surfaces), workspaceSurfaceKey(surfaces[1]!));
    const next = reconcileWorkspaceSurfaces(state, {
      [workspaceSurfaceKey(surfaces[1]!)]: "removed",
      [workspaceSurfaceKey(surfaces[2]!)]: "removed",
    });

    expect(next.entries.map((entry) => entry.surface)).toEqual([surfaces[0], surfaces[3]]);
    expect(next.activeSurfaceKey).toBe(workspaceSurfaceKey(surfaces[3]!));
    expect(next.focusOrder).not.toContain(workspaceSurfaceKey(surfaces[1]!));
    expect(next.focusOrder).not.toContain(workspaceSurfaceKey(surfaces[2]!));
  });

  it("returns the same state for unknown close and no-op reconciliation", () => {
    const state = openWorkspaceSurface(createWorkspaceSurfaceState(), taskSurface(1));
    expect(closeWorkspaceSurface(state, workspaceSurfaceKey(taskSurface(2)))).toBe(state);
    expect(reconcileWorkspaceSurfaces(state, {})).toBe(state);
  });
});
