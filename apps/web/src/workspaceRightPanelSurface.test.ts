import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { RightPanelSurface } from "./rightPanelStore";
import {
  createWorkspaceSurfaceState,
  openWorkspaceSurface,
  workspaceSurfaceKey,
  WORKSPACE_SURFACE_SCHEMA_VERSION,
  type WorkspaceSurface,
} from "./workspaceSurface";
import {
  workspaceSurfaceKeyAfterRightPanelClose,
  rightPanelActivationForWorkspaceSurface,
  workspaceSurfaceForRightPanelSurface,
  type WorkspaceRightPanelScope,
} from "./workspaceRightPanelSurface";

const scope: WorkspaceRightPanelScope = {
  environmentId: EnvironmentId.make("local"),
  projectId: ProjectId.make("orchestra"),
  threadId: ThreadId.make("task:root"),
};

const surfaces: ReadonlyArray<RightPanelSurface> = [
  { id: "browser:new", kind: "preview", resourceId: null },
  { id: "browser:preview-1", kind: "preview", resourceId: "preview-1" },
  { id: "files", kind: "files" },
  {
    id: "file:src/main.ts",
    kind: "file",
    relativePath: "src/main.ts",
    revealLine: 42,
    revealRequestId: 9,
  },
  { id: "diff", kind: "diff" },
  {
    id: "terminal:terminal-surface",
    kind: "terminal",
    resourceId: "terminal-surface",
    terminalIds: ["terminal-surface", "active-inner-terminal"],
    activeTerminalId: "active-inner-terminal",
    splitDirection: "vertical",
  },
  { id: "plan", kind: "plan" },
];

function expectedSurface(
  details:
    | { kind: "preview"; previewId: string }
    | { kind: "files"; relativePath: string | null }
    | { kind: "diff" }
    | { kind: "terminal"; terminalId: string },
): WorkspaceSurface {
  return {
    schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
    ...scope,
    ...details,
  } as WorkspaceSurface;
}

describe("workspace right-panel surface projection", () => {
  it("maps durable tenant identities and omits placeholders and plan", () => {
    expect(surfaces.map((surface) => workspaceSurfaceForRightPanelSurface(scope, surface))).toEqual(
      [
        null,
        expectedSurface({ kind: "preview", previewId: "preview-1" }),
        expectedSurface({ kind: "files", relativePath: null }),
        expectedSurface({ kind: "files", relativePath: "src/main.ts" }),
        expectedSurface({ kind: "diff" }),
        expectedSurface({ kind: "terminal", terminalId: "terminal-surface" }),
        null,
      ],
    );
  });

  it("keeps reveal requests and terminal split selection out of workspace identity", () => {
    const file = surfaces[3]!;
    const terminal = surfaces[5]!;

    expect(
      workspaceSurfaceForRightPanelSurface(scope, {
        ...file,
        revealLine: 87,
        revealRequestId: 10,
      } as RightPanelSurface),
    ).toEqual(expectedSurface({ kind: "files", relativePath: "src/main.ts" }));
    expect(workspaceSurfaceForRightPanelSurface(scope, terminal)).toEqual(
      expectedSurface({ kind: "terminal", terminalId: "terminal-surface" }),
    );
  });
});

describe("right-panel activation lookup", () => {
  it.each([
    [expectedSurface({ kind: "preview", previewId: "preview-1" }), "browser:preview-1"],
    [expectedSurface({ kind: "files", relativePath: null }), "files"],
    [expectedSurface({ kind: "files", relativePath: "src/main.ts" }), "file:src/main.ts"],
    [expectedSurface({ kind: "diff" }), "diff"],
    [
      expectedSurface({ kind: "terminal", terminalId: "terminal-surface" }),
      "terminal:terminal-surface",
    ],
  ] as const)("finds the retained tenant descriptor for %s", (workspaceSurface, surfaceId) => {
    expect(rightPanelActivationForWorkspaceSurface(workspaceSurface, surfaces)).toEqual({
      surfaceId,
    });
  });

  it("returns null for absent, placeholder, and non-right-panel workspace surfaces", () => {
    expect(
      rightPanelActivationForWorkspaceSurface(
        expectedSurface({ kind: "preview", previewId: "missing" }),
        surfaces,
      ),
    ).toBeNull();
    expect(
      rightPanelActivationForWorkspaceSurface(expectedSurface({ kind: "preview", previewId: "" }), [
        surfaces[0]!,
      ]),
    ).toBeNull();
    expect(
      rightPanelActivationForWorkspaceSurface(
        { schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION, ...scope, kind: "task" },
        surfaces,
      ),
    ).toBeNull();
  });
});

describe("right-panel close workspace restoration", () => {
  it("restores the most-recent task-owned Issue instead of promoting the generic task", () => {
    const diff = expectedSurface({ kind: "diff" });
    const ownerTask: WorkspaceSurface = {
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      ...scope,
      kind: "task",
    };
    const issue: WorkspaceSurface = {
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      ...scope,
      kind: "issue",
      automationOwnerThreadId: "provider-native-root",
      automationRunId: "automation-70",
      issueId: "issue-70",
      issueTaskThreadId: ThreadId.make("issue-task-70"),
    };
    const state = [ownerTask, issue, diff].reduce(
      openWorkspaceSurface,
      createWorkspaceSurfaceState(),
    );

    expect(workspaceSurfaceKeyAfterRightPanelClose(state)).toBe(workspaceSurfaceKey(issue));
  });

  it("does not cross task ownership or restore another right-panel surface", () => {
    const otherTaskIssue: WorkspaceSurface = {
      schemaVersion: WORKSPACE_SURFACE_SCHEMA_VERSION,
      kind: "issue",
      environmentId: scope.environmentId,
      projectId: scope.projectId,
      threadId: ThreadId.make("other-task"),
      automationOwnerThreadId: "other-provider-root",
      automationRunId: "automation-other",
      issueId: "issue-other",
      issueTaskThreadId: ThreadId.make("issue-task-other"),
    };
    const state = [
      otherTaskIssue,
      expectedSurface({ kind: "files", relativePath: null }),
      expectedSurface({ kind: "diff" }),
    ].reduce(openWorkspaceSurface, createWorkspaceSurfaceState());

    expect(workspaceSurfaceKeyAfterRightPanelClose(state)).toBeNull();
  });
});
