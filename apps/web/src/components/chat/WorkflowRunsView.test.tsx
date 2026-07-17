import { EnvironmentId, ThreadId, type OrchestraReplayEvent } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { WorkLogEntry } from "../../session-logic";
import { WorkflowRunsView } from "./WorkflowRunsView";

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

function entry(value: OrchestraReplayEvent): WorkLogEntry {
  return {
    id: value.eventId,
    createdAt: `2026-07-17T00:00:0${value.sequence}.000Z`,
    label: "Orchestra workflow",
    tone: "info",
    toolData: value,
  };
}

describe("WorkflowRunsView", () => {
  it("renders a bounded native Run summary without eager detail", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRunsView
        environmentId={EnvironmentId.make("local")}
        threadId={ThreadId.make("parent-task")}
        workLogEntries={[entry(event("run-1", 1)), entry(event("run-1", 2))]}
      />,
    );

    expect(markup).toContain('aria-label="Task Workflow Runs"');
    expect(markup).toContain("1 native Run");
    expect(markup).toContain("Revision 2");
    expect(markup).not.toContain("Revision 1");
    expect(markup).not.toContain("Recovery and decision history");
  });

  it("renders a truthful empty state", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRunsView
        environmentId={EnvironmentId.make("local")}
        threadId={ThreadId.make("parent-task")}
        workLogEntries={[]}
      />,
    );

    expect(markup).toContain("No Workflow Runs yet");
    expect(markup).toContain("Details remain unloaded until you expand a Run");
  });
});
