import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  AutomationStartInput,
  AutomationSteeringReceipt,
  AutomationSteerIssueInput,
} from "./automation.ts";

const decodeAutomationStartInput = Schema.decodeUnknownSync(AutomationStartInput);
const decodeAutomationSteerIssueInput = Schema.decodeUnknownSync(AutomationSteerIssueInput);
const decodeAutomationSteeringReceipt = Schema.decodeUnknownSync(AutomationSteeringReceipt);

describe("production Automation operations", () => {
  it("accepts only the task and repository-relative profile path when starting", () => {
    expect(
      decodeAutomationStartInput({
        threadId: "task-60",
        profilePath: "WORKFLOW.md",
      }),
    ).toEqual({ threadId: "task-60", profilePath: "WORKFLOW.md" });

    expect(() =>
      decodeAutomationStartInput({
        threadId: "task-60",
        profilePath: "",
      }),
    ).toThrow();
  });

  it("requires a bounded claim target and non-empty steering instruction", () => {
    expect(
      decodeAutomationSteerIssueInput({
        threadId: "task-60",
        runId: "automation-root-60",
        claimId: "claim-60",
        input: "Re-run the focused provider tests.",
      }),
    ).toEqual({
      threadId: "task-60",
      runId: "automation-root-60",
      claimId: "claim-60",
      input: "Re-run the focused provider tests.",
    });

    expect(() =>
      decodeAutomationSteerIssueInput({
        threadId: "task-60",
        runId: "automation-root-60",
        claimId: "claim-60",
        input: " ",
      }),
    ).toThrow();
  });

  it("decodes the durable native steering receipt used for reload", () => {
    expect(
      decodeAutomationSteeringReceipt({
        sequence: 2,
        submittedAtMs: 1_768_435_260_000,
        initiatorThreadId: "task-60",
        targetThreadId: "child-60",
        authority: "automation-claim",
        inputSha256: "a".repeat(64),
        inputPreview: "Re-run focused tests.",
        status: "delivered",
        providerReceipt: "turn-60",
      }),
    ).toMatchObject({
      sequence: 2,
      status: "delivered",
      targetThreadId: "child-60",
      providerReceipt: "turn-60",
    });
  });
});
