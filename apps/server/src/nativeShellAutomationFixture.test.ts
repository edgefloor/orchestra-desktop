import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  NATIVE_SHELL_SELECTED_ISSUE_ENV,
  NATIVE_SHELL_SELECTED_ISSUE_PROFILE_PATH,
  resolveNativeShellAutomationFixture,
} from "./nativeShellAutomationFixture.ts";

const startInput = {
  threadId: ThreadId.make("native-owner"),
  profilePath: NATIVE_SHELL_SELECTED_ISSUE_PROFILE_PATH,
};
const issue = {
  id: "issue-orc-70",
  identifier: "ORC-70",
  title: "Complete the Symphony workspace",
  state: "Todo",
  url: "https://linear.app/demystify/issue/ORC-70/complete-the-symphony-workspace",
  labels: ["orchestra-native-dogfood"],
  blockedBy: [],
};

describe("native-shell selected Issue fixture", () => {
  it("is disabled for ordinary profile paths", () => {
    expect(
      resolveNativeShellAutomationFixture(
        { ...startInput, profilePath: "WORKFLOW.md" },
        { ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1" },
      ),
    ).toBeNull();
  });

  it("requires both the acceptance child and exact schema-valid payload", () => {
    expect(() => resolveNativeShellAutomationFixture(startInput, {})).toThrow(
      "acceptance-child only",
    );
    expect(() =>
      resolveNativeShellAutomationFixture(startInput, {
        ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1",
      }),
    ).toThrow("payload is missing");
    expect(() =>
      resolveNativeShellAutomationFixture(startInput, {
        ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1",
        [NATIVE_SHELL_SELECTED_ISSUE_ENV]: JSON.stringify({ ...issue, labels: "invalid" }),
      }),
    ).toThrow();
  });

  it("projects the exact issue through the existing runFixture input", () => {
    expect(
      resolveNativeShellAutomationFixture(startInput, {
        ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1",
        [NATIVE_SHELL_SELECTED_ISSUE_ENV]: JSON.stringify(issue),
      }),
    ).toEqual({ ...startInput, fixtureIssue: issue, attempt: 1 });
  });
});
