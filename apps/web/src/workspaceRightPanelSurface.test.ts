import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { RightPanelSurface } from "./rightPanelStore";
import type { WorkspaceSurface } from "./workspaceSurface";
import {
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
  return { schemaVersion: 1, ...scope, ...details } as WorkspaceSurface;
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
        { schemaVersion: 1, ...scope, kind: "task" },
        surfaces,
      ),
    ).toBeNull();
  });
});
