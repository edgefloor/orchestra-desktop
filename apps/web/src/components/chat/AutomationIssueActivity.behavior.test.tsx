import { EnvironmentId, ThreadId, type NativeSubagentDetail } from "@t3tools/contracts";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AutomationIssueActivityPresentationProps } from "./AutomationIssueActivity";

const testState = vi.hoisted(() => ({ readDetail: vi.fn() }));
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
    useRef: hooks.useRef,
    useState: hooks.useState,
  };
});

vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  squashAtomCommandFailure: (result: { cause: unknown }) => result.cause,
}));
vi.mock("~/state/nativeSubagents", () => ({
  readNativeSubagent: Symbol("readNativeSubagent"),
}));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => testState.readDetail,
}));

import {
  AutomationIssueActivityController,
  type AutomationIssueActivityProps,
} from "./AutomationIssueActivity";

const props: AutomationIssueActivityProps = {
  environmentId: EnvironmentId.make("local"),
  ownerThreadId: ThreadId.make("automation-owner"),
  agentThreadId: "provider-issue-task",
};
const detail: NativeSubagentDetail = {
  parentTaskId: props.ownerThreadId,
  agentThreadId: props.agentThreadId,
  status: "running",
  nickname: "ORC-70",
  role: "Issue task",
  preview: "Exact native activity",
  updatedAt: "2026-07-19T04:00:00.000Z",
  items: [],
  truncated: false,
};

type PresentationElement = ReactElement<AutomationIssueActivityPresentationProps>;

function renderController(): PresentationElement {
  hooks.beginRender();
  return AutomationIssueActivityController(props) as PresentationElement;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutomationIssueActivityController", () => {
  beforeEach(() => {
    hooks.reset();
    testState.readDetail.mockReset();
  });

  it("reads the exact provider child through its owner and rejects mismatched identity", async () => {
    testState.readDetail
      .mockResolvedValueOnce({ _tag: "Success", value: detail })
      .mockResolvedValueOnce({
        _tag: "Success",
        value: { ...detail, agentThreadId: "different-child" },
      });

    let presentation = renderController();
    hooks.runMountEffects();
    expect(testState.readDetail).toHaveBeenCalledWith({
      environmentId: "local",
      input: { threadId: "automation-owner", agentThreadId: "provider-issue-task" },
    });
    await flushPromises();
    presentation = renderController();
    expect(presentation.props.detail).toEqual(detail);

    presentation.props.onRetry();
    await flushPromises();
    presentation = renderController();
    expect(presentation.props.detail).toEqual(detail);
    expect(presentation.props.error).toContain("did not match the exact persisted Issue task");
  });

  it("retains exact activity when a retry fails", async () => {
    testState.readDetail
      .mockResolvedValueOnce({ _tag: "Success", value: detail })
      .mockResolvedValueOnce({ _tag: "Failure", cause: new Error("native read unavailable") });

    let presentation = renderController();
    hooks.runMountEffects();
    await flushPromises();
    presentation = renderController();
    presentation.props.onRetry();
    await flushPromises();
    presentation = renderController();

    expect(presentation.props.detail).toEqual(detail);
    expect(presentation.props.error).toBe("native read unavailable");
  });
});
