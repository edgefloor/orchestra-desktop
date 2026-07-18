import type { AutomationIssueClaim, AutomationRunResult } from "@t3tools/contracts";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AutomationIssueWorkspacePresentationProps } from "./AutomationIssueWorkspace";

const testState = vi.hoisted(() => ({
  readStatus: vi.fn(),
  steerIssue: vi.fn(),
  openExternal: vi.fn(),
}));

const hooks = vi.hoisted(() => {
  let cursor = 0;
  let slots: unknown[] = [];
  let effects: Array<() => void | (() => void)> = [];

  const nextIndex = () => cursor++;

  return {
    beginRender() {
      cursor = 0;
    },
    reset() {
      cursor = 0;
      slots = [];
      effects = [];
    },
    runMountEffects() {
      const mounted = [...effects];
      effects = [];
      for (const effect of mounted) effect();
    },
    useCallback<T>(callback: T): T {
      nextIndex();
      return callback;
    },
    useEffect(effect: () => void | (() => void)) {
      nextIndex();
      effects.push(effect);
    },
    useMemo<T>(factory: () => T): T {
      nextIndex();
      return factory();
    },
    useMemoCache(size: number): unknown[] {
      const index = nextIndex();
      if (!(index in slots)) {
        slots[index] = Array.from({ length: size }, () => Symbol.for("react.memo_cache_sentinel"));
      }
      return slots[index] as unknown[];
    },
    useRef<T>(initialValue: T): { current: T } {
      const index = nextIndex();
      if (!(index in slots)) slots[index] = { current: initialValue };
      return slots[index] as { current: T };
    },
    useState<T>(initialValue: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
      const index = nextIndex();
      if (!(index in slots)) {
        slots[index] =
          typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
      }
      const setValue: Dispatch<SetStateAction<T>> = (nextValue) => {
        const previous = slots[index] as T;
        slots[index] =
          typeof nextValue === "function" ? (nextValue as (value: T) => T)(previous) : nextValue;
      };
      return [slots[index] as T, setValue];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: hooks.useCallback,
    useEffect: hooks.useEffect,
    useMemo: hooks.useMemo,
    useRef: hooks.useRef,
    useState: hooks.useState,
  };
});

vi.mock("react/compiler-runtime", () => ({ c: hooks.useMemoCache }));

vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  squashAtomCommandFailure: (result: { cause: unknown }) => result.cause,
}));

vi.mock("~/state/automation", () => ({
  readAutomationStatus: Symbol("readAutomationStatus"),
  steerAutomationIssue: Symbol("steerAutomationIssue"),
}));

vi.mock("~/state/use-atom-command", async () => {
  const automation = await import("~/state/automation");
  return {
    useAtomCommand: (command: unknown) =>
      command === automation.readAutomationStatus ? testState.readStatus : testState.steerIssue,
  };
});

vi.mock("~/localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: testState.openExternal } }),
}));

import {
  AutomationIssueWorkspaceController,
  type AutomationIssueWorkspaceProps,
} from "./AutomationIssueWorkspace";

const locatorProps: AutomationIssueWorkspaceProps = {
  environmentId: EnvironmentId.make("local"),
  ownerThreadId: ThreadId.make("symphony-task-42"),
  automationRunId: "automation-42",
  issueId: "linear-issue-42",
  issueTaskThreadId: ThreadId.make("issue-task-42"),
  availability: "available",
  issueIdentifier: "LIN-42",
  issueTitle: "Complete selected issue context",
  onOpenSymphony: vi.fn(),
  onOpenDiff: vi.fn(),
};

const exactClaim: AutomationIssueClaim = {
  claimId: "claim-42",
  issueId: "linear-issue-42",
  issueIdentifier: "LIN-42",
  issueTitle: { text: "Complete selected issue context", truncated: false },
  issueUrl: "https://linear.app/acme/issue/LIN-42/exact?view=full%2Fexact",
  trackerState: "In Progress",
  attempt: 2,
  workflowInvocations: 3,
  turnsInWindow: 4,
  continuationCount: 0,
  retryAttempt: 0,
  profileDigest: "profile-42",
  profileRevision: 1,
  status: "running",
  worktree: "/repo/.worktrees/lin-42",
  sourceRevision: "source-42",
  issueTask: { threadId: "issue-task-42", taskPath: "/root/lin_42" },
  effects: [
    {
      effectId: "effect-42",
      idempotencyKey: "idem-42",
      kind: "tracker.comment",
      status: "waiting_gate",
      gatePolicy: "ask_human",
      requestSha256: "request-42",
      bodyPreview: { text: "Post verified evidence", truncated: false },
    },
  ],
  hookReceipts: [],
  cleanup: { status: "retained", attempts: 0 },
  nextAction: { text: "Continue", truncated: false },
};

function runResult(claims: AutomationIssueClaim[] = [exactClaim]): AutomationRunResult {
  return {
    run: {
      schemaVersion: 1,
      runId: "automation-42",
      ownerThreadId: "symphony-task-42",
      sourceRevision: "source-42",
      profileDigest: "profile-42",
      profileRevision: 1,
      profileRevisionStatus: "active",
      profileDiagnostics: [],
      trackerProjectSlug: "orchestra",
      leaseEpoch: 3,
      revision: 8,
      status: "running",
      reconciliation: "complete",
      coordination: {
        cycle: 2,
        scanRevision: 4,
        intakeStatus: "ready",
        nextAction: { text: "Continue", truncated: false },
      },
      queueCounts: {
        queued: 0,
        running: 1,
        blocked: 0,
        waitingGate: 0,
        handoff: 0,
        terminal: 0,
      },
      claimsTotal: claims.length,
      claims,
      queuePreview: [],
      queuePreviewTruncated: false,
      nextAction: { text: "Continue", truncated: false },
    },
  };
}

function focusedClaimAtBoundedEdge(): AutomationRunResult {
  const decoys = Array.from(
    { length: 24 },
    (_, index): AutomationIssueClaim => ({
      ...exactClaim,
      claimId: `decoy-${index}`,
      issueId: `decoy-issue-${index}`,
      issueIdentifier: `DEC-${index}`,
      issueTitle: { text: `Decoy ${index}`, truncated: false },
      issueUrl: null,
      issueTask: { threadId: `decoy-task-${index}`, taskPath: `/root/decoy_${index}` },
    }),
  );
  return runResult([
    ...decoys,
    {
      ...exactClaim,
      latestSteeringReceipt: {
        sequence: 3,
        submittedAtMs: 102,
        initiatorThreadId: "symphony-task-42",
        targetThreadId: "issue-task-42",
        authority: "automation-claim-native-send-input-v1",
        inputSha256: "guidance-43",
        inputPreview: "Retry exact guidance",
        status: "delivered",
      },
    },
  ]);
}

type PresentationElement = ReactElement<AutomationIssueWorkspacePresentationProps>;

function renderController(
  props: AutomationIssueWorkspaceProps = locatorProps,
): PresentationElement {
  hooks.beginRender();
  return AutomationIssueWorkspaceController(props) as PresentationElement;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutomationIssueWorkspaceController", () => {
  beforeEach(() => {
    hooks.reset();
    testState.readStatus.mockReset();
    testState.steerIssue.mockReset();
    testState.openExternal.mockReset();
    testState.openExternal.mockResolvedValue(undefined);
    vi.mocked(locatorProps.onOpenSymphony).mockReset();
    vi.mocked(locatorProps.onOpenDiff).mockReset();
  });

  it("loads the exact identity and exercises parent, Diff, tracker, effects, and steering actions", async () => {
    testState.readStatus.mockResolvedValue({ _tag: "Success", value: runResult() });
    testState.steerIssue
      .mockResolvedValueOnce({ _tag: "Failure", cause: new Error("steering offline") })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: focusedClaimAtBoundedEdge(),
      });

    let presentation = renderController();
    expect(presentation.props.runtimeState).toBe("loading");
    hooks.runMountEffects();
    expect(testState.readStatus).toHaveBeenCalledWith({
      environmentId: "local",
      input: {
        threadId: "symphony-task-42",
        runId: "automation-42",
        focusedIssueId: "linear-issue-42",
      },
    });
    await flushPromises();

    presentation = renderController();
    expect(presentation.props.runtimeState).toBe("ready");
    expect(presentation.props.snapshot?.issue.claim?.effects[0]?.effectId).toBe("effect-42");
    presentation.props.onOpenSymphony();
    presentation.props.onOpenDiff();
    presentation.props.onOpenTracker();
    expect(locatorProps.onOpenSymphony).toHaveBeenCalledOnce();
    expect(locatorProps.onOpenDiff).toHaveBeenCalledOnce();
    expect(testState.openExternal).toHaveBeenCalledWith(
      "https://linear.app/acme/issue/LIN-42/exact?view=full%2Fexact",
    );

    presentation.props.onGuidanceChange("  Retry exact guidance  ");
    presentation = renderController();
    presentation.props.onSendGuidance();
    expect(testState.steerIssue).toHaveBeenCalledWith({
      environmentId: "local",
      input: {
        threadId: "symphony-task-42",
        runId: "automation-42",
        claimId: "claim-42",
        input: "Retry exact guidance",
      },
    });
    await flushPromises();

    presentation = renderController();
    expect(presentation.props.runtimeState).toBe("stale");
    expect(presentation.props.guidance).toBe("  Retry exact guidance  ");
    presentation.props.onSendGuidance();
    expect(testState.steerIssue).toHaveBeenNthCalledWith(2, {
      environmentId: "local",
      input: {
        threadId: "symphony-task-42",
        runId: "automation-42",
        claimId: "claim-42",
        input: "Retry exact guidance",
      },
    });
    await flushPromises();

    presentation = renderController();
    expect(presentation.props.guidance).toBe("");
    expect(presentation.props.snapshot?.issue.claim?.claimId).toBe("claim-42");
    expect(presentation.props.snapshot?.runResult.run.claims).toHaveLength(25);
  });

  it("retains exact identity through error, retry, stale, temporary, and reload recovery", async () => {
    testState.readStatus
      .mockResolvedValueOnce({ _tag: "Failure", cause: new Error("offline") })
      .mockResolvedValueOnce({ _tag: "Success", value: runResult() })
      .mockResolvedValueOnce({ _tag: "Failure", cause: new Error("offline again") });

    let presentation = renderController();
    hooks.runMountEffects();
    await flushPromises();
    presentation = renderController();
    expect(presentation.props.runtimeState).toBe("error");
    expect(presentation.props.error).toBe("offline");

    presentation.props.onRefresh();
    await flushPromises();
    presentation = renderController();
    expect(presentation.props.runtimeState).toBe("ready");
    expect(presentation.props.snapshot?.runResult.run.runId).toBe("automation-42");

    presentation.props.onRefresh();
    await flushPromises();
    presentation = renderController();
    expect(presentation.props.runtimeState).toBe("stale");
    expect(presentation.props.snapshot?.issue.issueId).toBe("linear-issue-42");

    presentation = renderController({ ...locatorProps, availability: "temporarilyUnavailable" });
    expect(presentation.props.runtimeState).toBe("temporarilyUnavailable");

    hooks.reset();
    testState.readStatus.mockResolvedValueOnce({ _tag: "Success", value: runResult() });
    presentation = renderController();
    hooks.runMountEffects();
    await flushPromises();
    presentation = renderController();
    expect(presentation.props.runtimeState).toBe("ready");
    expect(testState.readStatus).toHaveBeenLastCalledWith({
      environmentId: "local",
      input: expect.objectContaining({
        runId: "automation-42",
        focusedIssueId: "linear-issue-42",
      }),
    });
  });
});
