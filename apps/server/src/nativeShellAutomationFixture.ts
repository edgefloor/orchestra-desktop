import {
  AutomationIssue,
  type AutomationRunInput,
  type AutomationStartInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const NATIVE_SHELL_SELECTED_ISSUE_PROFILE_PATH =
  ".codex/orchestra/native-shell-selected-issue/WORKFLOW.md";
export const NATIVE_SHELL_SELECTED_ISSUE_ENV = "ORCHESTRA_NATIVE_ACCEPTANCE_SELECTED_ISSUE_FIXTURE";

export function resolveNativeShellAutomationFixture(
  input: AutomationStartInput,
  environment: Readonly<Record<string, string | undefined>>,
): AutomationRunInput | null {
  if (input.profilePath !== NATIVE_SHELL_SELECTED_ISSUE_PROFILE_PATH) return null;
  if (environment.ORCHESTRA_NATIVE_ACCEPTANCE_CHILD !== "1") {
    throw new Error("native selected-Issue fixture path is acceptance-child only");
  }
  const encodedIssue = environment[NATIVE_SHELL_SELECTED_ISSUE_ENV];
  if (!encodedIssue) throw new Error("native selected-Issue fixture payload is missing");
  const fixtureIssue = Schema.decodeUnknownSync(AutomationIssue)(JSON.parse(encodedIssue));
  return {
    threadId: input.threadId,
    profilePath: input.profilePath,
    fixtureIssue,
    attempt: 1,
  };
}
