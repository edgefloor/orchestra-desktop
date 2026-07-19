#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off - Standalone repository verifier.
// @effect-diagnostics globalDate:off - Standalone verifier validates serialized ISO timestamps.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  requireEvidenceFile,
  requireExactArray,
  requireFields,
  requireGitObjectId,
  requireSha256,
  verifyDesktopSourceIdentity,
} from "./lib/orchestra-evidence-verifier.ts";

import {
  buildNativeGuestFixture,
  isExactNativeDogfoodResponseCount,
  isNarrowDrawerOpenedObservation,
  isNativeEvidenceObservation,
  isNativeGitCheckEvidenceReferenceObservation,
  isNativeGitCheckEvidenceObservation,
  isNativeShellResourceCleanupComplete,
  isNativeShellGitFixtureIdentity,
  isNativeShellTerminalSurfaceTitle,
  isNativeWorkflowLifecycleObservation,
  isUniqueNativeSymphonyInspection,
  type NativeShellScenario,
  ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
} from "./lib/orchestra-native-shell-contract.mjs";
import {
  readPngDimensions as readNativeShellPngDimensions,
  sha256,
} from "./lib/orchestra-evidence-primitives.mjs";
import {
  ORCHESTRA_NATIVE_DOGFOOD_AGENT_STEP_ID,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_NAME,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_MAX_CHARS,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_TEXT_MAX_CHARS,
  ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE,
  ORCHESTRA_NATIVE_DOGFOOD_TOTAL_REQUEST_COUNT,
} from "./lib/orchestra-native-dogfood-contract.mjs";

export {
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  readNativeShellPngDimensions,
};

const DEFAULT_ROOT = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_MANIFEST = "docs/acceptance/orchestra-native-shell/manifest.json";
const ACCEPTANCE_DIRECTORY = ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY;
const REQUIRED_NATIVE_SHELL_SOURCE_FILES = [
  "apps/desktop/scripts/capture-orchestra-native-shell.mjs",
  "scripts/lib/orchestra-evidence-verifier.ts",
  "scripts/lib/orchestra-evidence-primitives.mjs",
  "scripts/lib/orchestra-native-dogfood-contract.mjs",
  "scripts/lib/orchestra-native-shell-contract.mjs",
  "scripts/verify-orchestra-native-shell.ts",
] as const;

const screenshotsByName = Object.fromEntries(
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map((scenario) => [scenario.scenario, scenario]),
) as Readonly<Record<string, NativeShellScenario>>;

export const ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES = Object.freeze(
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map(({ scenario }) => scenario),
);

function record(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function tomlSection(source: string, section: string): string {
  const match = new RegExp(
    `^\\[${section.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\]\\s*$`,
    "m",
  ).exec(source);
  if (!match || match.index === undefined) {
    throw new Error(`manifest.product.pinsToml must contain [${section}]`);
  }
  const start = match.index + match[0].length;
  const nextSection = /^\s*\[[^\]]+\]\s*$/m.exec(source.slice(start));
  return source.slice(start, nextSection ? start + nextSection.index : source.length);
}

function quotedTomlValue(source: string, section: string, key: string): string {
  const body = tomlSection(source, section);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escapedKey}\\s*=\\s*"([^"]+)"\\s*$`, "m").exec(body);
  if (!match?.[1]) {
    throw new Error(`manifest.product.pinsToml must contain quoted ${section}.${key}`);
  }
  return match[1];
}

function requireNativeDogfoodObservation(value: unknown): Record<string, unknown> {
  requireFields(
    value,
    [
      "responsesRequestCount",
      "waitingProjectionVisible",
      "completedProjectionVisible",
      "workflow",
      "child",
      "attention",
      "evidence",
      "symphony",
      "reload",
      "restart",
      "selectedIssue",
    ],
    "manifest.runtime.nativeDogfood",
  );
  const dogfood = value as Record<string, unknown>;
  if (
    Number(dogfood.responsesRequestCount) !== ORCHESTRA_NATIVE_DOGFOOD_TOTAL_REQUEST_COUNT ||
    dogfood.waitingProjectionVisible !== true ||
    dogfood.completedProjectionVisible !== true
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood must contain the exact seven-request Product projection",
    );
  }
  try {
    if (!isNativeWorkflowLifecycleObservation(dogfood.workflow)) {
      throw new Error(
        "manifest.runtime.nativeDogfood.workflow is not the same waiting/completed Run",
      );
    }
  } catch {
    throw new Error(
      "manifest.runtime.nativeDogfood.workflow is not the same waiting/completed Run",
    );
  }

  const workflow = record(dogfood.workflow, "manifest.runtime.nativeDogfood.workflow");
  const completedWorkflow = record(
    workflow.completed,
    "manifest.runtime.nativeDogfood.workflow.completed",
  );
  const completedRunLabels = completedWorkflow.runLabels;
  if (!Array.isArray(completedRunLabels) || typeof completedRunLabels[0] !== "string") {
    throw new Error("manifest.runtime.nativeDogfood.workflow.completed must identify one Run");
  }
  const workflowRunLabel = completedRunLabels[0];

  const child = record(dogfood.child, "manifest.runtime.nativeDogfood.child");
  requireFields(
    child,
    [
      "stepId",
      "childText",
      "childTextTruncated",
      "outputName",
      "outputValue",
      "outputValueTruncated",
    ],
    "manifest.runtime.nativeDogfood.child",
  );
  const childText = stringField(child.childText, "manifest.runtime.nativeDogfood.child.childText");
  const childOutputValue = stringField(
    child.outputValue,
    "manifest.runtime.nativeDogfood.child.outputValue",
  );
  if (
    child.stepId !== ORCHESTRA_NATIVE_DOGFOOD_AGENT_STEP_ID ||
    !childText.startsWith("Child /root/") ||
    childText.length > ORCHESTRA_NATIVE_DOGFOOD_CHILD_TEXT_MAX_CHARS ||
    child.outputName !== ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_NAME ||
    childOutputValue !== JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHILD_FINDING) ||
    childOutputValue.length > ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_MAX_CHARS ||
    child.childTextTruncated !== false ||
    child.outputValueTruncated !== false
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.child must contain the genuine bounded native child projection",
    );
  }

  const attention = record(dogfood.attention, "manifest.runtime.nativeDogfood.attention");
  const waitingAttention = record(
    attention.waiting,
    "manifest.runtime.nativeDogfood.attention.waiting",
  );
  const completedAttention = record(
    attention.completed,
    "manifest.runtime.nativeDogfood.attention.completed",
  );
  if (
    !stringField(waitingAttention.text, "manifest.runtime.nativeDogfood.attention.waiting.text")
      .toLowerCase()
      .includes("approval") ||
    !stringField(
      completedAttention.text,
      "manifest.runtime.nativeDogfood.attention.completed.text",
    ).includes("No items need intervention")
  ) {
    throw new Error("manifest.runtime.nativeDogfood.attention must prove approval resolution");
  }

  try {
    if (!isNativeEvidenceObservation(dogfood.evidence)) {
      throw new Error("manifest.runtime.nativeDogfood.evidence must prove lazy text expansion");
    }
  } catch {
    throw new Error("manifest.runtime.nativeDogfood.evidence must prove lazy text expansion");
  }
  const evidence = record(dogfood.evidence, "manifest.runtime.nativeDogfood.evidence");
  const collapsedEvidence = record(
    evidence.before,
    "manifest.runtime.nativeDogfood.evidence.before",
  );
  if (!isNativeGitCheckEvidenceReferenceObservation(collapsedEvidence)) {
    throw new Error(
      "manifest.runtime.nativeDogfood.evidence.before must prove the exact collapsed verify-native-repository reference",
    );
  }
  const expandedEvidence = record(evidence.after, "manifest.runtime.nativeDogfood.evidence.after");
  if (!isNativeGitCheckEvidenceObservation(expandedEvidence)) {
    throw new Error(
      "manifest.runtime.nativeDogfood.evidence.after must prove the exact verify-native-repository check",
    );
  }
  const symphony = record(dogfood.symphony, "manifest.runtime.nativeDogfood.symphony");
  const symphonyValidation = record(
    symphony.validation,
    "manifest.runtime.nativeDogfood.symphony.validation",
  );
  const symphonyStarted = record(
    symphony.started,
    "manifest.runtime.nativeDogfood.symphony.started",
  );
  const symphonyRunId = stringField(
    symphonyStarted.runId,
    "manifest.runtime.nativeDogfood.symphony.started.runId",
  );
  const symphonyText = stringField(
    symphonyStarted.text,
    "manifest.runtime.nativeDogfood.symphony.started.text",
  ).toLowerCase();
  const symphonyInspected = record(
    symphony.inspected,
    "manifest.runtime.nativeDogfood.symphony.inspected",
  );
  if (
    symphonyValidation.valid !== true ||
    !stringField(
      symphonyValidation.text,
      "manifest.runtime.nativeDogfood.symphony.validation.text",
    ).includes("ORCHESTRA_NATIVE_DOGFOOD_LINEAR_API_KEY") ||
    !symphonyText.includes("running") ||
    !symphonyText.includes("skipped") ||
    symphonyStarted.issueRowCount !== 0 ||
    symphony.issueChildFabricated !== false ||
    symphony.sameRootAfterInspect !== true ||
    !isUniqueNativeSymphonyInspection(symphonyStarted, symphonyInspected)
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.symphony must prove one running skipped-intake Root with no Issue child",
    );
  }

  const reload = record(dogfood.reload, "manifest.runtime.nativeDogfood.reload");
  const reloadWorkflow = record(reload.workflow, "manifest.runtime.nativeDogfood.reload.workflow");
  const reloadSymphony = record(reload.symphony, "manifest.runtime.nativeDogfood.reload.symphony");
  const reloadRunLabels = reloadWorkflow.runLabels;
  if (
    reload.sameWorkflowRun !== true ||
    reload.sameSymphonyRoot !== true ||
    !Array.isArray(reloadRunLabels) ||
    reloadRunLabels.length !== 1 ||
    reloadRunLabels[0] !== workflowRunLabel ||
    reloadSymphony.runId !== symphonyRunId ||
    !isUniqueNativeSymphonyInspection(symphonyStarted, reloadSymphony) ||
    !isNativeGitCheckEvidenceObservation(reload.evidence)
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.reload must recover the same Run, Evidence, and Root",
    );
  }

  const restart = record(dogfood.restart, "manifest.runtime.nativeDogfood.restart");
  const stop = record(restart.stop, "manifest.runtime.nativeDogfood.restart.stop");
  const stoppedThread = record(stop.thread, "manifest.runtime.nativeDogfood.restart.stop.thread");
  const stoppedSession = record(
    stoppedThread.session,
    "manifest.runtime.nativeDogfood.restart.stop.thread.session",
  );
  const recovery = record(restart.recovery, "manifest.runtime.nativeDogfood.restart.recovery");
  const readyThread = record(
    recovery.thread,
    "manifest.runtime.nativeDogfood.restart.recovery.thread",
  );
  const readySession = record(
    readyThread.session,
    "manifest.runtime.nativeDogfood.restart.recovery.thread.session",
  );
  const typedSymphony = record(
    recovery.typedSymphonyStatus,
    "manifest.runtime.nativeDogfood.restart.recovery.typedSymphonyStatus",
  );
  const restartSymphony = record(
    recovery.symphony,
    "manifest.runtime.nativeDogfood.restart.recovery.symphony",
  );
  const restartWorkflow = record(
    recovery.workflow,
    "manifest.runtime.nativeDogfood.restart.recovery.workflow",
  );
  const restartRunLabels = restartWorkflow.runLabels;
  if (
    stoppedSession.status !== "stopped" ||
    !isExactNativeDogfoodResponseCount(Number(stop.responsesRequestCount)) ||
    readySession.status !== "ready" ||
    !isExactNativeDogfoodResponseCount(Number(recovery.responsesRequestCount)) ||
    typedSymphony.runId !== symphonyRunId ||
    typedSymphony.status !== "running" ||
    restartSymphony.runId !== symphonyRunId ||
    !isUniqueNativeSymphonyInspection(symphonyStarted, restartSymphony) ||
    !Array.isArray(restartRunLabels) ||
    restartRunLabels.length !== 1 ||
    restartRunLabels[0] !== workflowRunLabel ||
    !isNativeGitCheckEvidenceObservation(recovery.evidence) ||
    restart.sameWorkflowRun !== true ||
    restart.sameSymphonyRoot !== true ||
    restart.sameSymphonyStatus !== true
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.restart must recover the same Run, Evidence, and Root after a stopped/ready provider cycle",
    );
  }

  const selectedIssue = record(
    dogfood.selectedIssue,
    "manifest.runtime.nativeDogfood.selectedIssue",
  );
  const selectedInitial = record(
    selectedIssue.initial,
    "manifest.runtime.nativeDogfood.selectedIssue.initial",
  );
  const selectedSteering = record(
    selectedIssue.steeringReceipt,
    "manifest.runtime.nativeDogfood.selectedIssue.steeringReceipt",
  );
  const selectedDiff = record(
    selectedIssue.diff,
    "manifest.runtime.nativeDogfood.selectedIssue.diff",
  );
  const selectedParent = record(
    selectedIssue.parent,
    "manifest.runtime.nativeDogfood.selectedIssue.parent",
  );
  const selectedNavigation = record(
    selectedIssue.navigation,
    "manifest.runtime.nativeDogfood.selectedIssue.navigation",
  );
  if (selectedNavigation.routeExact !== true || selectedNavigation.surfaceExact !== true) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.navigation must prove the exact owner route and persisted provider-child surface",
    );
  }
  const selectedReload = record(
    selectedIssue.reload,
    "manifest.runtime.nativeDogfood.selectedIssue.reload",
  );
  const selectedReloadNavigation = record(
    selectedReload.navigation,
    "manifest.runtime.nativeDogfood.selectedIssue.reload.navigation",
  );
  const selectedReloadIdentity = record(
    selectedReload.identity,
    "manifest.runtime.nativeDogfood.selectedIssue.reload.identity",
  );
  const selectedRestart = record(
    selectedIssue.restart,
    "manifest.runtime.nativeDogfood.selectedIssue.restart",
  );
  const selectedRestartStop = record(
    selectedRestart.stop,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.stop",
  );
  const selectedRestartStoppedThread = record(
    selectedRestartStop.thread,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.stop.thread",
  );
  const selectedRestartStoppedSession = record(
    selectedRestartStoppedThread.session,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.stop.thread.session",
  );
  const selectedRestartRecovery = record(
    selectedRestart.recovery,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.recovery",
  );
  const selectedRestartReadyThread = record(
    selectedRestartRecovery.thread,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.recovery.thread",
  );
  const selectedRestartReadySession = record(
    selectedRestartReadyThread.session,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.recovery.thread.session",
  );
  const selectedRestartNavigation = record(
    selectedRestartRecovery.navigation,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.recovery.navigation",
  );
  const selectedRestartIdentity = record(
    selectedRestartRecovery.identity,
    "manifest.runtime.nativeDogfood.selectedIssue.restart.recovery.identity",
  );
  const exactSelectedIssueRecovery = (
    navigation: Record<string, unknown>,
    identity: Record<string, unknown>,
  ): boolean => {
    const surface = record(
      navigation.surface,
      "manifest.runtime.nativeDogfood.selectedIssue.recovery.navigation.surface",
    );
    const providerChild = record(
      identity.providerChild,
      "manifest.runtime.nativeDogfood.selectedIssue.recovery.identity.providerChild",
    );
    return (
      navigation.routeEnvironmentId === selectedIssue.environmentId &&
      navigation.routeOwnerThreadId === selectedIssue.ownerThreadId &&
      navigation.routeExact === true &&
      navigation.surfaceExact === true &&
      navigation.nativeActivityExact === true &&
      surface.environmentId === selectedIssue.environmentId &&
      surface.projectId === selectedIssue.projectId &&
      surface.threadId === selectedIssue.ownerThreadId &&
      surface.automationRunId === selectedIssue.runId &&
      surface.issueId === selectedIssue.issueId &&
      surface.issueTaskThreadId === selectedIssue.issueTaskThreadId &&
      identity.runId === selectedIssue.runId &&
      identity.claimCount === 1 &&
      identity.claimId === selectedIssue.claimId &&
      identity.issueId === selectedIssue.issueId &&
      identity.issueTaskThreadId === selectedIssue.issueTaskThreadId &&
      providerChild.parentTaskId === selectedIssue.ownerThreadId &&
      providerChild.agentThreadId === selectedIssue.issueTaskThreadId
    );
  };
  if (!exactSelectedIssueRecovery(selectedReloadNavigation, selectedReloadIdentity)) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.reload must recover the exact owner route, surface, Root, claim, Issue, and provider child",
    );
  }
  if (
    selectedRestartStoppedSession.status !== "stopped" ||
    selectedRestartReadySession.status !== "ready" ||
    Number(selectedRestart.responsesRequestCount) !==
      ORCHESTRA_NATIVE_DOGFOOD_TOTAL_REQUEST_COUNT ||
    !exactSelectedIssueRecovery(selectedRestartNavigation, selectedRestartIdentity)
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.restart must recover the exact owner route, surface, Root, claim, Issue, and provider child after a stopped/ready cycle",
    );
  }
  if (!Array.isArray(selectedInitial.namedActions)) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.initial.namedActions must be an array",
    );
  }
  requireExactArray(
    selectedInitial.namedActions.map(
      (entry) =>
        record(entry, "manifest.runtime.nativeDogfood.selectedIssue.initial.namedAction").name,
    ),
    ["Open Symphony", "Diff", "Open in Linear", "Refresh"],
    "manifest.runtime.nativeDogfood.selectedIssue.initial.namedActions",
    "selected-Issue navigation actions",
  );
  if (
    selectedInitial.namedActions.some((entry) => {
      const action = record(
        entry,
        "manifest.runtime.nativeDogfood.selectedIssue.initial.namedAction",
      );
      return (
        action.present !== true ||
        action.disabled !== false ||
        typeof action.tabIndex !== "number" ||
        !Number.isInteger(action.tabIndex) ||
        action.tabIndex < 0
      );
    })
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.initial.namedActions must prove four enabled focusable navigation actions",
    );
  }
  const selectedSendGuidance = record(
    selectedInitial.sendGuidance,
    "manifest.runtime.nativeDogfood.selectedIssue.initial.sendGuidance",
  );
  if (
    selectedSendGuidance.present !== true ||
    selectedSendGuidance.disabled !== true ||
    typeof selectedSendGuidance.tabIndex !== "number" ||
    !Number.isInteger(selectedSendGuidance.tabIndex) ||
    selectedSendGuidance.tabIndex < 0
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.initial.sendGuidance must prove an initially disabled focusable guidance action",
    );
  }
  if (
    selectedSteering.status !== "delivered" ||
    typeof selectedSteering.inputPreview !== "string" ||
    !selectedSteering.inputPreview.includes("native selected-Issue task")
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue.steeringReceipt must prove enabled guidance was delivered",
    );
  }
  const selectedExternalUrls = selectedIssue.externalUrls;
  if (
    selectedIssue.issueId !== ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.id ||
    selectedIssue.trackerUrl !== ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.url ||
    typeof selectedIssue.environmentId !== "string" ||
    typeof selectedIssue.projectId !== "string" ||
    typeof selectedIssue.runId !== "string" ||
    typeof selectedIssue.ownerThreadId !== "string" ||
    typeof selectedIssue.issueTaskThreadId !== "string" ||
    typeof selectedIssue.claimId !== "string" ||
    selectedInitial.parent !== true ||
    selectedInitial.activityRegion !== true ||
    selectedInitial.nativeActivityReady !== true ||
    selectedInitial.nativeActivityExact !== true ||
    selectedInitial.ownerComposerAbsent !== true ||
    selectedInitial.bounded !== true ||
    selectedInitial.rootOverflow !== true ||
    !Array.isArray(selectedExternalUrls) ||
    selectedExternalUrls.length !== 1 ||
    selectedExternalUrls[0] !== ORCHESTRA_NATIVE_DOGFOOD_SELECTED_ISSUE.url ||
    selectedDiff.title !== "Diff" ||
    selectedDiff.panelVisible !== true ||
    selectedParent.runId !== selectedIssue.runId ||
    selectedParent.instanceCount !== 1
  ) {
    throw new Error(
      "manifest.runtime.nativeDogfood.selectedIssue must prove the owner-hosted native child, Product actions, guidance, and 1024x768 layout",
    );
  }
  return dogfood;
}

export async function verifyOrchestraNativeShell(
  options: {
    readonly rootDir?: string;
    readonly manifestPath?: string;
    readonly productPinsPath?: string;
  } = {},
): Promise<void> {
  const rootDir = NodePath.resolve(options.rootDir ?? DEFAULT_ROOT);
  const manifestPath = NodePath.resolve(rootDir, options.manifestPath ?? DEFAULT_MANIFEST);
  const productPinsPath = NodePath.resolve(
    options.productPinsPath ?? NodePath.join(rootDir, "..", "orchestra", "product", "pins.toml"),
  );
  const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8")) as unknown;

  requireFields(
    manifest,
    [
      "schemaVersion",
      "id",
      "role",
      "desktop",
      "codex",
      "orchestraCore",
      "product",
      "capture",
      "productionEntry",
      "buildArtifacts",
      "screenshots",
      "assertions",
      "guest",
      "runtime",
      "agentReview",
    ],
    "manifest",
  );
  const typedManifest = manifest as Record<string, unknown>;
  if (typedManifest.schemaVersion !== 1) throw new Error("manifest.schemaVersion must be 1");
  if (typedManifest.id !== "orchestra-native-shell-acceptance-v1") {
    throw new Error("manifest.id must be orchestra-native-shell-acceptance-v1");
  }
  if (typedManifest.role !== "product-native-shell-evidence") {
    throw new Error("manifest.role must be product-native-shell-evidence");
  }

  requireFields(typedManifest.desktop, ["repository", "commit", "tree"], "manifest.desktop");
  const desktop = typedManifest.desktop as Record<string, unknown>;
  if (desktop.repository !== "edgefloor/orchestra-desktop") {
    throw new Error("manifest.desktop.repository must be edgefloor/orchestra-desktop");
  }
  requireGitObjectId(desktop.commit, "manifest.desktop.commit");
  requireGitObjectId(desktop.tree, "manifest.desktop.tree");
  await verifyDesktopSourceIdentity({
    rootDir,
    commit: desktop.commit,
    tree: desktop.tree,
    requiredSourceFiles: REQUIRED_NATIVE_SHELL_SOURCE_FILES,
  });

  requireFields(
    typedManifest.codex,
    ["repository", "commit", "tree", "binarySha256", "build"],
    "manifest.codex",
  );
  const codex = typedManifest.codex as Record<string, unknown>;
  if (codex.repository !== "edgefloor/orchestra-codex") {
    throw new Error("manifest.codex.repository must be edgefloor/orchestra-codex");
  }
  requireGitObjectId(codex.commit, "manifest.codex.commit");
  requireGitObjectId(codex.tree, "manifest.codex.tree");
  requireSha256(codex.binarySha256, "manifest.codex.binarySha256");
  requireFields(
    codex.build,
    ["tool", "arguments", "profile", "package", "binary"],
    "manifest.codex.build",
  );
  const codexBuild = codex.build as Record<string, unknown>;
  if (
    codexBuild.tool !== "cargo" ||
    codexBuild.profile !== "debug" ||
    codexBuild.package !== "codex-cli" ||
    codexBuild.binary !== "codex"
  ) {
    throw new Error("manifest.codex.build must identify the targeted Codex CLI build");
  }
  requireExactArray(
    codexBuild.arguments,
    ["build", "--manifest-path", "codex-rs/Cargo.toml", "-p", "codex-cli", "--bin", "codex"],
    "manifest.codex.build.arguments",
    "source-bound Codex build",
  );

  requireFields(
    typedManifest.orchestraCore,
    ["repository", "commit", "tree"],
    "manifest.orchestraCore",
  );
  const orchestraCore = typedManifest.orchestraCore as Record<string, unknown>;
  if (orchestraCore.repository !== "edgefloor/codex-orchestra") {
    throw new Error("manifest.orchestraCore.repository must be edgefloor/codex-orchestra");
  }
  requireGitObjectId(orchestraCore.commit, "manifest.orchestraCore.commit");
  requireGitObjectId(orchestraCore.tree, "manifest.orchestraCore.tree");

  requireFields(
    typedManifest.product,
    ["pinsToml", "pinsSha256", "manifestSha256", "releaseManifest"],
    "manifest.product",
  );
  const product = typedManifest.product as Record<string, unknown>;
  const pinsToml = stringField(product.pinsToml, "manifest.product.pinsToml");
  const trustedPinsToml = await NodeFSP.readFile(productPinsPath);
  if (!Buffer.from(pinsToml, "utf8").equals(trustedPinsToml)) {
    throw new Error(
      `manifest.product.pinsToml must exactly match trusted standalone Product pins at ${productPinsPath}`,
    );
  }
  requireSha256(product.pinsSha256, "manifest.product.pinsSha256");
  if (sha256(Buffer.from(pinsToml, "utf8")) !== product.pinsSha256) {
    throw new Error("manifest.product.pinsSha256 does not match manifest.product.pinsToml");
  }
  requireSha256(product.manifestSha256, "manifest.product.manifestSha256");
  requireFields(
    product.releaseManifest,
    [
      "schemaVersion",
      "productVersion",
      "minimumMacos",
      "target",
      "sources",
      "schemas",
      "evaluator",
      "capabilities",
      "limits",
      "artifacts",
      "manifestSha256",
    ],
    "manifest.product.releaseManifest",
  );
  const releaseManifest = product.releaseManifest as Record<string, unknown>;
  if (releaseManifest.schemaVersion !== 1) {
    throw new Error("manifest.product.releaseManifest.schemaVersion must be 1");
  }
  if (releaseManifest.manifestSha256 !== product.manifestSha256) {
    throw new Error("manifest.product.manifestSha256 must match the embedded Product manifest");
  }
  const unsignedReleaseManifest = {
    schemaVersion: releaseManifest.schemaVersion,
    productVersion: releaseManifest.productVersion,
    minimumMacos: releaseManifest.minimumMacos,
    target: releaseManifest.target,
    sources: releaseManifest.sources,
    schemas: releaseManifest.schemas,
    evaluator: releaseManifest.evaluator,
    capabilities: releaseManifest.capabilities,
    limits: releaseManifest.limits,
    artifacts: releaseManifest.artifacts,
  };
  if (sha256(Buffer.from(JSON.stringify(unsignedReleaseManifest))) !== product.manifestSha256) {
    throw new Error("manifest.product.manifestSha256 does not seal the Product manifest");
  }

  requireFields(
    releaseManifest.sources,
    [
      "agents",
      "bun",
      "bun_repository",
      "bun_version",
      "codex_upstream",
      "codex_upstream_repository",
      "codex_upstream_tree",
      "evaluator_lock_sha256",
      "evaluator_package_sha256",
      "evaluator_worker_source_sha256",
      "orchestra_codex",
      "orchestra_codex_repository",
      "orchestra_codex_tree",
      "orchestra_core_repository",
      "orchestra_core_revision",
      "orchestra_core_tree",
      "orchestra_desktop",
      "orchestra_desktop_repository",
      "orchestra_desktop_tree",
      "protocol_digest",
      "protocol_digest_algorithm",
      "protocol_file_count",
      "protocol_tree",
      "t3code_upstream",
      "t3code_upstream_repository",
      "t3code_upstream_tree",
      "zod",
      "zod_package_integrity",
      "zod_package_revision",
      "zod_package_shasum",
      "zod_repository",
      "zod_version",
    ],
    "manifest.product.releaseManifest.sources",
  );
  const sources = releaseManifest.sources as Record<string, unknown>;
  for (const field of [
    "agents",
    "bun",
    "codex_upstream",
    "codex_upstream_tree",
    "orchestra_codex",
    "orchestra_codex_tree",
    "orchestra_core_revision",
    "orchestra_core_tree",
    "orchestra_desktop",
    "orchestra_desktop_tree",
    "protocol_tree",
    "t3code_upstream",
    "t3code_upstream_tree",
    "zod",
    "zod_package_revision",
    "zod_package_shasum",
  ]) {
    requireGitObjectId(sources[field], `manifest.product.releaseManifest.sources.${field}`);
  }
  for (const field of [
    "evaluator_lock_sha256",
    "evaluator_package_sha256",
    "evaluator_worker_source_sha256",
    "protocol_digest",
  ]) {
    requireSha256(sources[field], `manifest.product.releaseManifest.sources.${field}`);
  }
  if (
    sources.orchestra_core_repository !== "https://github.com/edgefloor/codex-orchestra.git" ||
    sources.orchestra_codex_repository !== "https://github.com/edgefloor/orchestra-codex.git" ||
    sources.orchestra_desktop_repository !== "https://github.com/edgefloor/orchestra-desktop.git" ||
    sources.codex_upstream_repository !== "https://github.com/openai/codex.git" ||
    sources.t3code_upstream_repository !== "https://github.com/pingdotgg/t3code.git" ||
    sources.bun_repository !== "https://github.com/oven-sh/bun.git" ||
    sources.bun_version !== "1.3.14" ||
    sources.zod_repository !== "https://github.com/colinhacks/zod.git" ||
    sources.zod_version !== "4.4.3" ||
    sources.protocol_digest_algorithm !== "sha256-relative-path-nul-file-sha256-lf-v1" ||
    typeof sources.protocol_file_count !== "string" ||
    !/^[1-9]\d*$/.test(sources.protocol_file_count)
  ) {
    throw new Error(
      "manifest.product.releaseManifest.sources must seal core, Bun, Zod, and protocol identities",
    );
  }
  for (const [key, value] of Object.entries(sources)) {
    if (quotedTomlValue(pinsToml, "sources", key) !== value) {
      throw new Error(
        `manifest.product.pinsToml sources.${key} does not match the Product manifest`,
      );
    }
  }
  if (
    quotedTomlValue(pinsToml, "product", "version") !== releaseManifest.productVersion ||
    quotedTomlValue(pinsToml, "product", "minimum_macos") !== releaseManifest.minimumMacos
  ) {
    throw new Error(
      "manifest.product.pinsToml product identity does not match the Product manifest",
    );
  }
  if (
    sources.orchestra_core_revision !== orchestraCore.commit ||
    sources.orchestra_core_tree !== orchestraCore.tree ||
    sources.orchestra_codex !== codex.commit ||
    sources.orchestra_codex_tree !== codex.tree ||
    sources.orchestra_desktop !== desktop.commit ||
    sources.orchestra_desktop_tree !== desktop.tree
  ) {
    throw new Error(
      "manifest Product sources must exactly match the captured core, Codex, and Desktop tuple",
    );
  }

  requireFields(
    releaseManifest.schemas,
    ["protocol", "snapshot"],
    "manifest.product.releaseManifest.schemas",
  );
  const schemas = releaseManifest.schemas as Record<string, unknown>;
  requireFields(
    schemas.protocol,
    ["identity", "sha256"],
    "manifest.product.releaseManifest.schemas.protocol",
  );
  const protocolSchema = schemas.protocol as Record<string, unknown>;
  if (protocolSchema.identity !== "codex-app-server+orchestra-v1") {
    throw new Error(
      "manifest.product.releaseManifest.schemas.protocol.identity is not the sealed protocol",
    );
  }
  requireSha256(protocolSchema.sha256, "manifest.product.releaseManifest.schemas.protocol.sha256");
  const snapshotSchema = schemas.snapshot as Record<string, unknown>;
  requireFields(
    snapshotSchema,
    ["identity", "sha256"],
    "manifest.product.releaseManifest.schemas.snapshot",
  );
  requireSha256(snapshotSchema.sha256, "manifest.product.releaseManifest.schemas.snapshot.sha256");
  if (
    quotedTomlValue(pinsToml, "schemas", "protocol") !== protocolSchema.identity ||
    quotedTomlValue(pinsToml, "schemas", "snapshot") !== snapshotSchema.identity
  ) {
    throw new Error("manifest.product.pinsToml schemas do not match the Product manifest");
  }

  requireFields(
    releaseManifest.evaluator,
    ["revision", "adapterAbi", "canonicalizer", "issueFormat"],
    "manifest.product.releaseManifest.evaluator",
  );
  const evaluator = releaseManifest.evaluator as Record<string, unknown>;
  if (
    evaluator.revision !== "bun-1.3.14-zod-4.4.3-sealed-2" ||
    evaluator.adapterAbi !== "orchestra-evaluator-abi-v1" ||
    evaluator.canonicalizer !== "rfc8785-jcs-v1" ||
    evaluator.issueFormat !== "orchestra-validation-issues-v1"
  ) {
    throw new Error(
      "manifest.product.releaseManifest.evaluator is not the sealed evaluator identity",
    );
  }
  for (const [tomlKey, manifestKey] of [
    ["revision", "revision"],
    ["adapter_abi", "adapterAbi"],
    ["canonicalizer", "canonicalizer"],
    ["issue_format", "issueFormat"],
  ] as const) {
    if (quotedTomlValue(pinsToml, "evaluator", tomlKey) !== evaluator[manifestKey]) {
      throw new Error(
        `manifest.product.pinsToml evaluator.${tomlKey} does not match the Product manifest`,
      );
    }
  }

  if (!Array.isArray(releaseManifest.capabilities) || releaseManifest.capabilities.length === 0) {
    throw new Error("manifest.product.releaseManifest.capabilities must be non-empty");
  }
  if (releaseManifest.limits === null || typeof releaseManifest.limits !== "object") {
    throw new Error("manifest.product.releaseManifest.limits must be an object");
  }
  requireFields(
    releaseManifest.artifacts,
    [
      "codex-cli",
      "desktop-main",
      "desktop-preload",
      "desktop-renderer",
      "desktop-server",
      "orchestra-product",
      "orchestra-validate-worker",
    ],
    "manifest.product.releaseManifest.artifacts",
  );
  const productArtifacts = releaseManifest.artifacts as Record<string, unknown>;
  for (const [name, rawArtifact] of Object.entries(productArtifacts)) {
    requireFields(
      rawArtifact,
      ["bytes", "sha256"],
      `manifest.product.releaseManifest.artifacts.${name}`,
    );
    const artifact = rawArtifact as Record<string, unknown>;
    if (
      typeof artifact.bytes !== "number" ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 1
    ) {
      throw new Error(`manifest.product.releaseManifest.artifacts.${name}.bytes must be positive`);
    }
    requireSha256(artifact.sha256, `manifest.product.releaseManifest.artifacts.${name}.sha256`);
  }
  if ((productArtifacts["codex-cli"] as Record<string, unknown>).sha256 !== codex.binarySha256) {
    throw new Error("manifest.codex.binarySha256 must match the Product Codex executable");
  }

  requireFields(
    typedManifest.capture,
    ["electronVersion", "chromiumVersion", "platform", "sourceClean", "buildReceipts"],
    "manifest.capture",
  );
  const capture = typedManifest.capture as Record<string, unknown>;
  if (capture.sourceClean !== true) {
    throw new Error("manifest.capture.sourceClean must be true");
  }
  if (
    typeof capture.electronVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(capture.electronVersion)
  ) {
    throw new Error("manifest.capture.electronVersion must be a semantic Electron version");
  }
  if (
    typeof capture.chromiumVersion !== "string" ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(capture.chromiumVersion)
  ) {
    throw new Error("manifest.capture.chromiumVersion must be a four-part Chromium version");
  }
  requireFields(capture.platform, ["os", "arch"], "manifest.capture.platform");
  const platform = capture.platform as Record<string, unknown>;
  if (!new Set(["darwin", "linux", "win32"]).has(String(platform.os))) {
    throw new Error("manifest.capture.platform.os must be darwin, linux, or win32");
  }
  if (!new Set(["arm64", "x64"]).has(String(platform.arch))) {
    throw new Error("manifest.capture.platform.arch must be arm64 or x64");
  }
  requireFields(capture.buildReceipts, ["desktop", "evaluator"], "manifest.capture.buildReceipts");
  const buildReceipts = capture.buildReceipts as Record<string, unknown>;
  requireFields(
    buildReceipts.desktop,
    ["tool", "arguments", "sourceCommit", "sourceTree", "artifacts"],
    "manifest.capture.buildReceipts.desktop",
  );
  const desktopReceipt = buildReceipts.desktop as Record<string, unknown>;
  if (
    desktopReceipt.tool !== "bun" ||
    desktopReceipt.sourceCommit !== desktop.commit ||
    desktopReceipt.sourceTree !== desktop.tree
  ) {
    throw new Error("manifest.capture.buildReceipts.desktop must bind bun to the Desktop tuple");
  }
  requireExactArray(
    desktopReceipt.arguments,
    ["run", "build:desktop"],
    "manifest.capture.buildReceipts.desktop.arguments",
    "source-bound Desktop build",
  );
  if (!Array.isArray(desktopReceipt.artifacts)) {
    throw new Error("manifest.capture.buildReceipts.desktop.artifacts must be an array");
  }
  requireExactArray(
    desktopReceipt.artifacts.map((entry) =>
      entry !== null && typeof entry === "object" && "path" in entry
        ? (entry as { readonly path: unknown }).path
        : null,
    ),
    ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
    "manifest.capture.buildReceipts.desktop artifact paths",
    "source-bound Desktop build",
  );
  requireFields(
    buildReceipts.evaluator,
    ["tool", "arguments", "sourceCommit", "sourceTree", "artifact"],
    "manifest.capture.buildReceipts.evaluator",
  );
  const evaluatorReceipt = buildReceipts.evaluator as Record<string, unknown>;
  if (
    evaluatorReceipt.tool !== "scripts/evaluator-build.sh" ||
    evaluatorReceipt.sourceCommit !== orchestraCore.commit ||
    evaluatorReceipt.sourceTree !== orchestraCore.tree
  ) {
    throw new Error(
      "manifest.capture.buildReceipts.evaluator must bind evaluator-build.sh to the Orchestra core tuple",
    );
  }
  requireExactArray(
    evaluatorReceipt.arguments,
    ["target/orchestra-product/orchestra-validate-worker"],
    "manifest.capture.buildReceipts.evaluator.arguments",
    "source-bound evaluator build",
  );
  requireFields(
    evaluatorReceipt.artifact,
    ["path", "sha256"],
    "manifest.capture.buildReceipts.evaluator.artifact",
  );
  const evaluatorReceiptArtifact = evaluatorReceipt.artifact as Record<string, unknown>;
  if (
    evaluatorReceiptArtifact.path !== "target/orchestra-product/orchestra-validate-worker" ||
    evaluatorReceiptArtifact.sha256 !==
      (productArtifacts["orchestra-validate-worker"] as Record<string, unknown>).sha256
  ) {
    throw new Error(
      "manifest.capture.buildReceipts.evaluator artifact must match the Product evaluator executable",
    );
  }

  if (typedManifest.productionEntry !== "t3code://app/") {
    throw new Error("manifest.productionEntry must be t3code://app/");
  }

  if (!Array.isArray(typedManifest.buildArtifacts)) {
    throw new Error("manifest.buildArtifacts must be an array");
  }
  requireExactArray(
    typedManifest.buildArtifacts.map((entry) =>
      entry !== null && typeof entry === "object" && "path" in entry
        ? (entry as { readonly path: unknown }).path
        : null,
    ),
    ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
    "manifest build artifact paths",
    "native-shell evidence",
  );
  for (const [index, rawArtifact] of typedManifest.buildArtifacts.entries()) {
    requireFields(rawArtifact, ["path", "sha256"], "manifest.buildArtifact");
    const artifact = rawArtifact as Record<string, unknown>;
    const expectedPath = ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS[index]!;
    if (artifact.path !== expectedPath) {
      throw new Error(`manifest.buildArtifacts.${index}.path must be ${expectedPath}`);
    }
    requireSha256(artifact.sha256, `manifest.buildArtifacts.${index}.sha256`);
    const bytes = await requireEvidenceFile(
      rootDir,
      expectedPath,
      `manifest.buildArtifacts.${index}.path`,
    );
    if (sha256(bytes) !== artifact.sha256) {
      throw new Error(`manifest.buildArtifacts.${index}.sha256 does not match the artifact bytes`);
    }
  }
  const productArtifactByDesktopPath: Readonly<Record<string, string>> = {
    "apps/desktop/dist-electron/main.cjs": "desktop-main",
    "apps/desktop/dist-electron/preload.cjs": "desktop-preload",
    "apps/server/dist/bin.mjs": "desktop-server",
    "apps/web/dist/index.html": "desktop-renderer",
  };
  for (const rawArtifact of typedManifest.buildArtifacts) {
    const artifact = rawArtifact as Record<string, unknown>;
    const productArtifactName = productArtifactByDesktopPath[String(artifact.path)];
    const productArtifact = productArtifactName
      ? (productArtifacts[productArtifactName] as Record<string, unknown>)
      : undefined;
    if (!productArtifact || productArtifact.sha256 !== artifact.sha256) {
      throw new Error(
        `manifest Product ${String(productArtifactName)} executable does not match the captured Desktop artifact`,
      );
    }
  }
  for (const [index, rawReceiptArtifact] of desktopReceipt.artifacts.entries()) {
    requireFields(
      rawReceiptArtifact,
      ["path", "sha256"],
      "manifest.capture.buildReceipts.desktop.artifact",
    );
    const receiptArtifact = rawReceiptArtifact as Record<string, unknown>;
    const capturedArtifact = typedManifest.buildArtifacts[index] as Record<string, unknown>;
    if (
      receiptArtifact.path !== capturedArtifact.path ||
      receiptArtifact.sha256 !== capturedArtifact.sha256
    ) {
      throw new Error(
        `manifest.capture.buildReceipts.desktop artifact ${String(receiptArtifact.path)} does not match captured bytes`,
      );
    }
  }

  if (!Array.isArray(typedManifest.screenshots)) {
    throw new Error("manifest.screenshots must be an array");
  }
  requireExactArray(
    typedManifest.screenshots.map((entry) =>
      entry !== null && typeof entry === "object" && "scenario" in entry
        ? (entry as { readonly scenario: unknown }).scenario
        : null,
    ),
    ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES,
    "manifest screenshot scenarios",
    "native-shell evidence",
  );
  for (const rawScreenshot of typedManifest.screenshots) {
    requireFields(
      rawScreenshot,
      ["scenario", "file", "width", "height", "deviceScaleFactor", "theme", "layout", "sha256"],
      "manifest.screenshot",
    );
    const screenshot = rawScreenshot as Record<string, unknown>;
    const scenario = screenshot.scenario;
    if (typeof scenario !== "string" || !(scenario in screenshotsByName)) {
      throw new Error(`manifest screenshot scenario ${String(scenario)} is not approved`);
    }
    const contract = screenshotsByName[scenario]!;
    const context = `manifest.screenshots.${scenario}`;
    const expectedFile = `${ACCEPTANCE_DIRECTORY}/${scenario}.png`;
    if (screenshot.file !== expectedFile)
      throw new Error(`${context}.file must be ${expectedFile}`);
    if (screenshot.width !== contract.width || screenshot.height !== contract.height) {
      throw new Error(`${context} viewport metadata does not match the scenario`);
    }
    if (screenshot.deviceScaleFactor !== 1) {
      throw new Error(`${context}.deviceScaleFactor must be 1`);
    }
    if (screenshot.theme !== contract.theme) {
      throw new Error(`${context}.theme must be ${contract.theme}`);
    }
    requireFields(
      screenshot.layout,
      [
        "width",
        "height",
        "overflow",
        "browserVisible",
        "narrowDisclosure",
        "drawerOpen",
        "webviewRect",
        "wrapperRect",
      ],
      `${context}.layout`,
    );
    const layout = screenshot.layout as Record<string, unknown>;
    if (
      layout.width !== contract.width ||
      layout.height !== contract.height ||
      layout.overflow !== true ||
      layout.drawerOpen !== contract.drawerOpen
    ) {
      throw new Error(`${context}.layout must match the viewport without horizontal overflow`);
    }
    requireSha256(screenshot.sha256, `${context}.sha256`);
    const image = await requireEvidenceFile(rootDir, expectedFile, `${context}.file`);
    if (sha256(image) !== screenshot.sha256) {
      throw new Error(`${context}.sha256 does not match the PNG bytes`);
    }
    const dimensions = readNativeShellPngDimensions(image, scenario);
    if (dimensions.width !== contract.width || dimensions.height !== contract.height) {
      throw new Error(`${context} PNG dimensions do not match the scenario`);
    }
  }

  requireFields(typedManifest.assertions, ORCHESTRA_NATIVE_SHELL_ASSERTIONS, "manifest.assertions");
  const assertions = typedManifest.assertions as Record<string, unknown>;
  for (const assertion of ORCHESTRA_NATIVE_SHELL_ASSERTIONS) {
    requireFields(
      assertions[assertion],
      ["observed", "passed"],
      `manifest.assertions.${assertion}`,
    );
    if ((assertions[assertion] as Record<string, unknown>).passed !== true) {
      throw new Error(`manifest.assertions.${assertion}.passed must be true`);
    }
  }

  requireFields(typedManifest.guest, ["origin", "fixtureSha256"], "manifest.guest");
  const guest = typedManifest.guest as Record<string, unknown>;
  if (typeof guest.origin !== "string")
    throw new Error("manifest.guest.origin must be a URL origin");
  let guestOrigin: URL;
  try {
    guestOrigin = new URL(guest.origin);
  } catch {
    throw new Error("manifest.guest.origin must be a URL origin");
  }
  if (
    guestOrigin.origin !== guest.origin ||
    !new Set(["http:", "https:"]).has(guestOrigin.protocol)
  ) {
    throw new Error("manifest.guest.origin must be an HTTP(S) URL origin without a path");
  }
  requireSha256(guest.fixtureSha256, "manifest.guest.fixtureSha256");
  const expectedGuestFixture = buildNativeGuestFixture(guest.origin);
  if (guest.fixtureSha256 !== expectedGuestFixture.digest) {
    throw new Error("manifest.guest.fixtureSha256 does not match the deterministic guest payload");
  }

  requireFields(
    typedManifest.runtime,
    [
      "rendererUrl",
      "appViewport",
      "guest",
      "rejectedAttachmentProbe",
      "nativeDogfood",
      "navigation",
      "cleanup",
    ],
    "manifest.runtime",
  );
  const runtime = typedManifest.runtime as Record<string, unknown>;
  const nativeDogfood = requireNativeDogfoodObservation(runtime.nativeDogfood);
  if (typeof runtime.rendererUrl !== "string" || !runtime.rendererUrl.startsWith("t3code://app/")) {
    throw new Error("manifest.runtime.rendererUrl must use the production t3code://app/ entry");
  }
  requireFields(runtime.appViewport, ["width", "height"], "manifest.runtime.appViewport");
  requireFields(
    runtime.guest,
    ["webContentsId", "type", "url", "title", "partition", "viewport", "attachment"],
    "manifest.runtime.guest",
  );
  const runtimeGuest = runtime.guest as Record<string, unknown>;
  if (runtimeGuest.type !== "webview")
    throw new Error("manifest.runtime.guest.type must be webview");
  if (typeof runtimeGuest.url !== "string" || !runtimeGuest.url.startsWith(`${guest.origin}/`)) {
    throw new Error("manifest.runtime.guest.url must belong to the deterministic guest origin");
  }
  if (runtimeGuest.title !== "Native Guest A") {
    throw new Error("manifest.runtime.guest.title must record the recovered Native Guest A page");
  }
  if (
    typeof runtimeGuest.partition !== "string" ||
    !runtimeGuest.partition.startsWith("persist:t3code-preview-")
  ) {
    throw new Error("manifest.runtime.guest.partition must use the approved preview partition");
  }
  requireFields(runtimeGuest.viewport, ["width", "height"], "manifest.runtime.guest.viewport");
  requireFields(
    runtimeGuest.attachment,
    [
      "partition",
      "attachmentGuardAllowed",
      "sandbox",
      "contextIsolation",
      "nodeIntegration",
      "nodeIntegrationInSubFrames",
    ],
    "manifest.runtime.guest.attachment",
  );
  const attachment = runtimeGuest.attachment as Record<string, unknown>;
  if (
    attachment.partition !== runtimeGuest.partition ||
    attachment.attachmentGuardAllowed !== true ||
    attachment.sandbox !== true ||
    attachment.contextIsolation !== false ||
    attachment.nodeIntegration !== false ||
    attachment.nodeIntegrationInSubFrames !== false
  ) {
    throw new Error(
      "manifest.runtime.guest.attachment must record the effective guarded preferences",
    );
  }
  requireFields(
    runtime.rejectedAttachmentProbe,
    [
      "partition",
      "attachmentGuardAllowed",
      "sandbox",
      "contextIsolation",
      "nodeIntegration",
      "nodeIntegrationInSubFrames",
    ],
    "manifest.runtime.rejectedAttachmentProbe",
  );
  const rejectedProbe = runtime.rejectedAttachmentProbe as Record<string, unknown>;
  if (
    rejectedProbe.partition !== "persist:orchestra-native-shell-rejected" ||
    rejectedProbe.attachmentGuardAllowed !== false
  ) {
    throw new Error("manifest.runtime.rejectedAttachmentProbe must prove guard rejection");
  }
  if (!Array.isArray(runtime.navigation)) {
    throw new Error("manifest.runtime.navigation must be an array");
  }
  requireExactArray(
    runtime.navigation.map((entry) =>
      entry !== null && typeof entry === "object" && "action" in entry
        ? (entry as { readonly action: unknown }).action
        : null,
    ),
    [
      "navigate-page-a",
      "navigate-page-b",
      "back",
      "forward",
      "reload",
      "load-failure",
      "recover-page-a",
    ],
    "manifest runtime navigation actions",
    "native-shell evidence",
  );
  for (const entry of runtime.navigation) {
    requireFields(
      entry,
      ["action", "expected", "observed", "passed"],
      "manifest.runtime.navigation",
    );
    if ((entry as Record<string, unknown>).passed !== true) {
      throw new Error("manifest.runtime.navigation entries must pass");
    }
  }
  requireFields(runtime.cleanup, ["portsClosed", "processGroupEmpty"], "manifest.runtime.cleanup");
  const cleanup = runtime.cleanup as Record<string, unknown>;
  if (!isNativeShellResourceCleanupComplete(cleanup)) {
    throw new Error("manifest.runtime.cleanup must prove listener and process-group cleanup");
  }

  const assertionObservation = (name: string): unknown =>
    (assertions[name] as Record<string, unknown>).observed;
  const requireSameObservation = (name: string, expected: unknown): void => {
    if (JSON.stringify(assertionObservation(name)) !== JSON.stringify(expected)) {
      throw new Error(`manifest.assertions.${name} contradicts manifest.runtime.nativeDogfood`);
    }
  };
  requireSameObservation("nativeDogfoodResponsesExact", {
    requestCount: nativeDogfood.responsesRequestCount,
  });
  requireSameObservation("nativeChildProjected", nativeDogfood.child);
  requireSameObservation("nativeWorkflowLifecycleRendered", nativeDogfood.workflow);
  requireSameObservation("nativeAttentionResolved", nativeDogfood.attention);
  requireSameObservation("nativeEvidenceLazyExpanded", nativeDogfood.evidence);
  requireSameObservation("nativeSymphonySkippedIntake", nativeDogfood.symphony);
  requireSameObservation("nativeDogfoodIdentityRecovered", {
    workflow: nativeDogfood.workflow,
    symphony: nativeDogfood.symphony,
    reload: nativeDogfood.reload,
  });
  requireSameObservation("nativeDogfoodProviderRestartRecovered", nativeDogfood.restart);
  requireSameObservation("nativeSelectedIssueRendered", nativeDogfood.selectedIssue);
  requireSameObservation(
    "nativeSelectedIssueReloadRecovered",
    record(nativeDogfood.selectedIssue, "manifest.runtime.nativeDogfood.selectedIssue").reload,
  );
  requireSameObservation(
    "nativeSelectedIssueProviderRestartRecovered",
    record(nativeDogfood.selectedIssue, "manifest.runtime.nativeDogfood.selectedIssue").restart,
  );

  const narrowOpened = assertionObservation("narrowDrawerOpened");
  if (!isNarrowDrawerOpenedObservation(narrowOpened)) {
    throw new Error(
      "manifest.assertions.narrowDrawerOpened observed value contradicts passed:true",
    );
  }
  for (const [name, field] of [
    ["narrowDrawerClosed", "closed"],
    ["narrowDrawerFocusRestored", "focusRestored"],
  ] as const) {
    const observations = assertionObservation(name);
    if (
      !Array.isArray(observations) ||
      observations.length !== 2 ||
      !observations.every((observation) => record(observation, name)[field] === true)
    ) {
      throw new Error(`manifest.assertions.${name} observed value contradicts passed:true`);
    }
  }
  const retained = record(
    assertionObservation("retainedDesktopCapabilitiesProbed"),
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed",
  );
  const retainedWorkspace = record(
    retained.workspace,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.workspace",
  );
  const retainedContext = record(
    retained.context,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.context",
  );
  const retainedModel = record(
    retained.modelPicker,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.modelPicker",
  );
  const retainedSettings = record(
    retained.settings,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.settings",
  );
  const retainedVcs = record(
    retained.vcs,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.vcs",
  );
  const retainedSurfaces = record(
    retained.surfaces,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.surfaces",
  );
  const retainedTerminalSurface = record(
    retainedSurfaces.Terminal,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.surfaces.Terminal",
  );
  const retainedMutations = record(
    retained.mutations,
    "manifest.assertions.retainedDesktopCapabilitiesProbed.observed.mutations",
  );
  const contextTabs = retainedWorkspace.contextTabs;
  const vcsItems = retainedVcs.items;
  if (
    retainedWorkspace.projectVisible !== true ||
    retainedWorkspace.taskVisible !== true ||
    retainedWorkspace.localCheckoutVisible !== true ||
    !Array.isArray(contextTabs) ||
    !contextTabs.includes("Workflow") ||
    !contextTabs.includes("Attention") ||
    typeof retainedContext.workflowRunId !== "string" ||
    retainedContext.attentionResolved !== true ||
    !stringField(retainedModel.trigger, "retained model trigger") ||
    !stringField(retainedModel.text, "retained model text") ||
    !stringField(retainedSettings.hash, "retained settings hash").includes("/settings") ||
    retainedSettings.generalVisible !== true ||
    !Array.isArray(vcsItems) ||
    !vcsItems.some((item) =>
      stringField(record(item, "vcs item").label, "vcs label").includes("Commit"),
    ) ||
    !vcsItems.some((item) =>
      stringField(record(item, "vcs item").label, "vcs label").includes("Push"),
    ) ||
    !isNativeShellGitFixtureIdentity(retainedVcs.fixtureRemote) ||
    !["Files", "Browser", "Diff"].every((title) => {
      const surface = record(retainedSurfaces[title], `retained surface ${title}`);
      return surface.title === title && surface.panelVisible === true;
    }) ||
    !isNativeShellTerminalSurfaceTitle(retainedTerminalSurface.title) ||
    retainedTerminalSurface.panelVisible !== true ||
    retainedMutations.commit !== "unobserved" ||
    retainedMutations.push !== "unobserved"
  ) {
    throw new Error(
      "manifest.assertions.retainedDesktopCapabilitiesProbed observed value contradicts passed:true",
    );
  }

  requireFields(
    typedManifest.agentReview,
    ["status", "reviewedAt", "scenarios"],
    "manifest.agentReview",
  );
  const agentReview = typedManifest.agentReview as Record<string, unknown>;
  if (agentReview.status !== "observed") {
    throw new Error("manifest.agentReview.status must be observed");
  }
  if (
    typeof agentReview.reviewedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(agentReview.reviewedAt) ||
    !Number.isFinite(Date.parse(agentReview.reviewedAt)) ||
    new Date(agentReview.reviewedAt).toISOString() !== agentReview.reviewedAt
  ) {
    throw new Error("manifest.agentReview.reviewedAt must be an ISO timestamp");
  }
  if (!Array.isArray(agentReview.scenarios)) {
    throw new Error("manifest.agentReview.scenarios must be an array");
  }
  requireExactArray(
    agentReview.scenarios.map((entry) =>
      entry !== null && typeof entry === "object" && "scenario" in entry
        ? (entry as { readonly scenario: unknown }).scenario
        : null,
    ),
    ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES,
    "manifest.agentReview scenario order",
    "native-shell evidence",
  );
  for (const rawReview of agentReview.scenarios) {
    requireFields(
      rawReview,
      [
        "scenario",
        "clipping",
        "contrast",
        "layering",
        "drawerGeometry",
        "activeTaskContinuity",
        "nativeSurfaceLegibility",
        "notes",
      ],
      "manifest.agentReview.scenario",
    );
    const review = rawReview as Record<string, unknown>;
    const scenario = screenshotsByName[String(review.scenario)];
    if (!scenario) throw new Error("manifest.agentReview.scenario is not approved");
    for (const judgment of [
      "clipping",
      "contrast",
      "layering",
      "activeTaskContinuity",
      "nativeSurfaceLegibility",
    ]) {
      if (review[judgment] !== "pass") {
        throw new Error(`manifest.agentReview.${scenario.scenario}.${judgment} must be pass`);
      }
    }
    const expectedDrawerJudgment = scenario.drawerOpen ? "pass" : "not-applicable";
    if (review.drawerGeometry !== expectedDrawerJudgment) {
      throw new Error(
        `manifest.agentReview.${scenario.scenario}.drawerGeometry must be ${expectedDrawerJudgment}`,
      );
    }
    if (typeof review.notes !== "string" || review.notes.trim().length === 0) {
      throw new Error(`manifest.agentReview.${scenario.scenario}.notes must be non-empty`);
    }
  }
}

const invokedPath = process.argv[1] ? NodePath.resolve(process.argv[1]) : null;
if (invokedPath && NodeURL.pathToFileURL(invokedPath).href === import.meta.url) {
  const manifestPath = process.argv[2];
  try {
    await verifyOrchestraNativeShell(manifestPath ? { manifestPath } : {});
    process.stdout.write("Orchestra native-shell acceptance artifacts verified\n");
  } catch (error) {
    process.stderr.write(
      `Orchestra native-shell acceptance verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
