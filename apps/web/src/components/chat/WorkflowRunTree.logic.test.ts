import {
  ThreadId,
  type OrchestraExecutionStepProjection,
  type OrchestraReplayEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  MAX_INITIAL_WORKFLOW_STEPS,
  MAX_INLINE_OUTPUT_CHARS,
  buildWorkflowTreeQuery,
  compactEvidenceReference,
  compactWorkflowStepSummary,
  formatBoundedOutputValue,
  evidenceErrorState,
  preserveWorkflowStepOrder,
  workflowDetailDisplayState,
  workflowRunDisplayState,
} from "./WorkflowRunTree.logic";

function replayEvent(stepCount = 9): OrchestraReplayEvent {
  return {
    schemaVersion: 1,
    eventId: "run-1:1",
    runId: "run-1",
    sequence: 1,
    revision: 1,
    kind: "recovered",
    projection: {
      schemaVersion: 1,
      runId: "run-1",
      workflowSha256: "workflow-sha",
      parentThreadId: "parent-provider-thread",
      sourceRevision: "source-revision",
      status: "running",
      promotion: "pending",
      steps: Array.from({ length: stepCount }, (_, index) => ({
        id: `step-${String(index).padStart(2, "0")}`,
        status: index === 8 ? ("failed" as const) : ("completed" as const),
        attempts: 1,
        rounds: 1,
        outputKeys: [],
        finalResponse: null,
        error: null,
      })),
      nextAction: "Inspect failed step",
    },
  };
}

describe("WorkflowRunTree logic", () => {
  it("keeps the initial native projection compact and prioritizes attention", () => {
    const summary = compactWorkflowStepSummary(replayEvent());

    expect(summary.total).toBe(9);
    expect(summary.items).toHaveLength(MAX_INITIAL_WORKFLOW_STEPS);
    expect(summary.items[0]).toEqual({ id: "step-08", status: "failed" });
    expect(summary.omitted).toBe(3);
  });

  it("preserves native order for lazily loaded steps", () => {
    const steps = ["zeta", "alpha", "middle"].map(
      (id) =>
        ({
          id,
          status: "running",
          attempts: 1,
          rounds: 1,
          outputCount: 0,
        }) satisfies OrchestraExecutionStepProjection,
    );

    expect(preserveWorkflowStepOrder(steps).map((step) => step.id)).toEqual([
      "zeta",
      "alpha",
      "middle",
    ]);
  });

  it("maps only native lifecycle evidence to recovery state", () => {
    expect(workflowRunDisplayState("running", "recovered")).toBe("recovering");
    expect(workflowRunDisplayState("running", "resumed")).toBe("running");
    expect(workflowRunDisplayState("waitingApproval")).toBe("waiting");
    expect(workflowRunDisplayState("pending")).toBe("queued");
    expect(workflowDetailDisplayState("running", "query unavailable")).toBe("unavailable");
  });

  it("builds bounded authorized selectors and bounds inline output rendering", () => {
    expect(
      buildWorkflowTreeQuery({
        threadId: ThreadId.make("parent-task"),
        runId: "run-1",
        selector: "outputs",
        stepId: "build",
      }),
    ).toEqual({
      threadId: "parent-task",
      runId: "run-1",
      selector: "outputs",
      stepId: "build",
      maxItems: 20,
      maxBytes: 65_536,
    });

    const rendered = formatBoundedOutputValue({ value: "x".repeat(1_000) });
    expect(rendered).toHaveLength(MAX_INLINE_OUTPUT_CHARS);
    expect(rendered?.endsWith("…")).toBe(true);
  });

  it("requests evidence bodies only by opaque identity and projects provenance and integrity", () => {
    expect(
      buildWorkflowTreeQuery({
        threadId: ThreadId.make("parent-task"),
        runId: "run-1",
        selector: "evidence_content",
        evidenceId: "evidence-id",
      }),
    ).toEqual({
      threadId: "parent-task",
      runId: "run-1",
      selector: "evidence_content",
      evidenceId: "evidence-id",
      maxItems: 20,
      maxBytes: 65_536,
    });
    expect(
      compactEvidenceReference({
        evidenceId: "1234567890abcdef",
        name: "build-1.json",
        kind: "check",
        provenance: "runtime_check",
        stepId: "build",
        bytes: 5,
        sha256: "abcdef0123456789deadbeef",
        availability: "available",
      }),
    ).toEqual({
      identity: "1234567890ab",
      provenance: "runtime check",
      integrity: "abcdef0123456789",
      availability: "available",
    });
  });

  it("maps native evidence failures without exposing paths", () => {
    expect(evidenceErrorState("query is not authorized for this task")).toBe("unauthorized");
    expect(evidenceErrorState("execution record was not found")).toBe("missing_or_expired");
    expect(evidenceErrorState("query identity is invalid")).toBe("malformed");
    expect(evidenceErrorState("transport closed")).toBe("unavailable");
  });
});
