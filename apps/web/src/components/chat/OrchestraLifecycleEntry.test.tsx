import { EnvironmentId, ThreadId, type OrchestraReplayEvent } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { OrchestraLifecycleEntry, readOrchestraReplayEvent } from "./OrchestraLifecycleEntry";
import lifecycleSource from "./OrchestraLifecycleEntry.tsx?raw";

function event(): OrchestraReplayEvent {
  return {
    schemaVersion: 1,
    eventId: "run-1:4",
    runId: "run-1",
    sequence: 4,
    revision: 4,
    kind: "recovered",
    projection: {
      schemaVersion: 1,
      runId: "run-1",
      workflowSha256: "workflow-sha",
      parentThreadId: "parent-provider-thread",
      sourceRevision: "source-revision",
      status: "running",
      promotion: "pending",
      steps: Array.from({ length: 9 }, (_, index) => ({
        id: `step-${index}`,
        status: index === 2 ? ("waitingApproval" as const) : ("completed" as const),
        attempts: 1,
        rounds: 1,
        outputKeys: [],
        finalResponse: index === 0 ? "hidden until inspection" : null,
        error: null,
      })),
      nextAction: "Resume after approval",
    },
  };
}

describe("OrchestraLifecycleEntry", () => {
  it("renders a compact native digest without eager step detail", () => {
    const markup = renderToStaticMarkup(
      <OrchestraLifecycleEntry
        environmentId={EnvironmentId.make("local")}
        threadId={ThreadId.make("parent-task")}
        event={event()}
      />,
    );

    expect(markup).toContain('aria-label="Workflow run run-1"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/aria-controls="[^"]+-run-details"/);
    expect(markup).not.toContain('role="tree"');
    expect(markup).not.toContain('role="treeitem"');
    expect(markup).toContain("Recovering");
    expect(markup).toContain("8/9 steps");
    expect(markup).toContain("+3");
    expect(markup).not.toContain("hidden until inspection");
    expect(markup).not.toContain("Recovery and decision history");
  });

  it("accepts only a valid native replay event", () => {
    expect(readOrchestraReplayEvent(event())?.runId).toBe("run-1");
    expect(readOrchestraReplayEvent({ runId: "fixture-only" })).toBeNull();
  });

  it("keeps compact disclosures operable and reports asynchronous detail failures", () => {
    expect(lifecycleSource).toContain("min-h-6 w-full");
    expect(lifecycleSource).toContain("pointer-coarse:min-h-11");
    expect(lifecycleSource).toContain('role="alert"');
  });

  it("emits workspace descriptors only while opening run and evidence disclosures", () => {
    expect(lifecycleSource).toContain("if (next) onOpenRun?.(event.runId)");
    expect(lifecycleSource).toContain(
      "if (willExpand) onOpenEvidence?.(event.runId, item.evidenceId)",
    );
  });
});
