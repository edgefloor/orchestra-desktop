import { EnvironmentId, ThreadId, type OrchestraReplayEvent } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  EvidenceIdentity,
  findRequestedEvidenceReference,
  OrchestraLifecycleEntry,
  readOrchestraReplayEvent,
  type WorkflowEvidenceObservationState,
  workflowEvidenceObservationAttributes,
} from "./OrchestraLifecycleEntry";
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
    expect(markup).toContain('data-workflow-run-status="recovering"');
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
    expect(lifecycleSource).toContain("data-evidence-identity");
    expect(lifecycleSource).toContain("data-workflow-run-disclosure");
    expect(lifecycleSource).toContain("data-workflow-step-id");
    expect(lifecycleSource).toContain("data-workflow-step-disclosure");
    expect(lifecycleSource).toContain("data-workflow-child-task-path");
    expect(lifecycleSource).toContain("data-workflow-child-thread-id");
    expect(lifecycleSource).toContain("data-workflow-output-name");
    expect(lifecycleSource).toContain("data-workflow-output-value");
    expect(lifecycleSource).toContain("data-workflow-evidence-name");
    expect(lifecycleSource).toContain("data-workflow-evidence-disclosure");
    expect(lifecycleSource).toContain("data-workflow-evidence-content-state");
    expect(lifecycleSource).toContain("data-workflow-evidence-preview");
  });

  it("renders the actual Evidence identity for sighted and assistive readers", () => {
    const markup = renderToStaticMarkup(<EvidenceIdentity identity="baa13f55437f" />);

    expect(markup).toContain('data-evidence-identity="baa13f55437f"');
    expect(markup).toContain("Evidence identity: baa13f55437f");
    expect(markup).toContain('aria-hidden="true">id baa13f55437f');
    expect(markup).not.toContain("aria-label=");
  });

  it("renders canonical evidence metadata in the structural observation boundary", () => {
    type ExpectedObservationState =
      | "collapsed"
      | "loading"
      | "error"
      | "pending"
      | "text"
      | "empty"
      | "content_too_large"
      | "malformed"
      | "integrity_failure"
      | "unsupported_media";
    type ExactObservationState = [WorkflowEvidenceObservationState] extends [
      ExpectedObservationState,
    ]
      ? [ExpectedObservationState] extends [WorkflowEvidenceObservationState]
        ? true
        : false
      : false;
    const observationStateIsExhaustive: ExactObservationState = true;
    const markup = renderToStaticMarkup(
      <div
        {...workflowEvidenceObservationAttributes(
          {
            evidenceId: "evidence-2",
            name: "Verification",
            kind: "check",
            provenance: "runtime_check",
            bytes: 42,
            sha256: "sha-2",
            availability: "content_too_large",
          },
          "collapsed",
        )}
      />,
    );

    expect(observationStateIsExhaustive).toBe(true);
    expect(markup).toContain('data-workflow-evidence-provenance="runtime_check"');
    expect(markup).toContain('data-workflow-evidence-availability="content_too_large"');
    expect(markup).not.toContain('data-workflow-evidence-provenance="runtime check"');
    expect(markup).not.toContain('data-workflow-evidence-availability="content too large"');
  });

  it("emits workspace descriptors only while opening run and evidence disclosures", () => {
    expect(lifecycleSource).toContain("if (next) onOpenRun?.(event.runId)");
    expect(lifecycleSource).toContain(
      "if (willExpand) onOpenEvidence?.(event.runId, stepId, item.evidenceId)",
    );
  });

  it("finds an exact Evidence reference only after a lazy step query exposes it", () => {
    const reference = {
      evidenceId: "evidence-2",
      name: "Verification",
      kind: "check" as const,
      provenance: "runtime_check" as const,
      stepId: "step-2",
      bytes: 42,
      sha256: "sha-2",
      availability: "available" as const,
    };

    expect(findRequestedEvidenceReference({}, "evidence-2")).toBeNull();
    expect(
      findRequestedEvidenceReference({ "step-1": [], "step-2": [reference] }, "evidence-2"),
    ).toEqual({ stepId: "step-2", item: reference });
  });

  it("restores requested disclosures without invoking user-open callbacks", () => {
    expect(lifecycleSource).toContain("restoredRunRequestRef");
    expect(lifecycleSource).toContain("restoredEvidenceRequestRef");
    expect(lifecycleSource).toContain('void load("evidence", requestedEvidenceStepId)');
    expect(lifecycleSource).toContain('void Promise.all([load("run"), load("steps")])');
    expect(lifecycleSource).toContain(
      'void load("evidence_content", undefined, requestedEvidenceId)',
    );
  });
});
