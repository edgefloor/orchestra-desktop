import type { OrchestraReplayEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { WorkLogEntry } from "../../session-logic";
import { deriveWorkspaceWorkflowRuns } from "./WorkflowRunsView.logic";

function event(runId: string, sequence: number): OrchestraReplayEvent {
  return {
    schemaVersion: 1,
    eventId: `${runId}:${sequence}`,
    runId,
    sequence,
    revision: sequence,
    kind: sequence === 1 ? "invoked" : "resumed",
    projection: {
      schemaVersion: 1,
      runId,
      workflowSha256: "workflow-sha",
      parentThreadId: "parent-task",
      sourceRevision: "source-revision",
      status: "running",
      promotion: "pending",
      steps: [],
      nextAction: `Revision ${sequence}`,
    },
  };
}

function entry(value: OrchestraReplayEvent, createdAt: string): WorkLogEntry {
  return {
    id: value.eventId,
    createdAt,
    label: "Orchestra workflow",
    tone: "info",
    toolData: value,
  };
}

describe("deriveWorkspaceWorkflowRuns", () => {
  it("keeps the latest native event for each stable run identity", () => {
    const projection = deriveWorkspaceWorkflowRuns([
      entry(event("run-1", 1), "2026-07-17T00:00:01.000Z"),
      entry(event("run-2", 1), "2026-07-17T00:00:02.000Z"),
      entry(event("run-1", 2), "2026-07-17T00:00:03.000Z"),
    ]);

    expect(projection.items.map((item) => [item.event.runId, item.event.sequence])).toEqual([
      ["run-1", 2],
      ["run-2", 1],
    ]);
    expect(projection.omitted).toBe(0);
  });

  it("bounds the workspace projection and ignores non-Orchestra work", () => {
    const projection = deriveWorkspaceWorkflowRuns(
      [
        entry(event("run-1", 1), "2026-07-17T00:00:01.000Z"),
        {
          id: "tool",
          createdAt: "2026-07-17T00:00:03.000Z",
          label: "Shell",
          tone: "tool",
        },
        entry(event("run-2", 1), "2026-07-17T00:00:02.000Z"),
      ],
      1,
    );

    expect(projection.items.map((item) => item.event.runId)).toEqual(["run-2"]);
    expect(projection.omitted).toBe(1);
  });

  it("retains an older requested Run inside the bounded projection", () => {
    const projection = deriveWorkspaceWorkflowRuns(
      [
        entry(event("run-1", 1), "2026-07-17T00:00:01.000Z"),
        entry(event("run-2", 1), "2026-07-17T00:00:02.000Z"),
        entry(event("run-3", 1), "2026-07-17T00:00:03.000Z"),
      ],
      2,
      "run-1",
    );

    expect(projection.items.map((item) => item.event.runId)).toEqual(["run-3", "run-1"]);
    expect(projection.omitted).toBe(1);
  });
});
