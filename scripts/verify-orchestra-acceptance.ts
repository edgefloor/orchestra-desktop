#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off - Standalone repository verifier.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  readPngDimensions,
  requireEvidenceFile,
  requireExactArray,
  requireFields,
  requireGitObjectId,
  requireSha256,
  sha256,
  verifyDesktopSourceIdentity,
} from "./lib/orchestra-evidence-verifier.ts";

export { readPngDimensions };

const DEFAULT_ROOT = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_MANIFEST = "docs/acceptance/orchestra-workspace/manifest.json";
const ACCEPTANCE_DIRECTORY = "docs/acceptance/orchestra-workspace";
const REQUIRED_ACCEPTANCE_SOURCE_FILES = [
  "apps/desktop/scripts/capture-orchestra-acceptance.mjs",
  "apps/web/src/acceptance/BrowserPreviewAcceptanceSurface.tsx",
  "apps/web/src/acceptance/OrchestraWorkspaceAcceptanceFixture.tsx",
  "apps/web/src/components/chat/AutomationIssueTaskFrame.tsx",
  "apps/web/src/components/chat/AutomationIssueWorkspace.tsx",
  "apps/web/src/components/files/FilePreviewModeToggle.tsx",
  "scripts/verify-orchestra-acceptance.ts",
] as const;

interface ScenarioContract {
  readonly width: number;
  readonly height: number;
  readonly theme: "light" | "dark";
  readonly state:
    | "workspace"
    | "attention-sheet"
    | "symphony"
    | "symphony-activity"
    | "symphony-recovery"
    | "symphony-events"
    | "selected-issue"
    | "browser-preview"
    | "browser-preview-narrow"
    | "file-preview";
  readonly assertions: ReadonlyArray<string>;
}

const WORKSPACE_ASSERTIONS = [
  "activeTaskVisible",
  "composerVisible",
  "contextTabsReachable",
  "noDocumentHorizontalOverflow",
  "rootWidthMatchesViewport",
  "taskTabsReachable",
] as const;

export const ORCHESTRA_ACCEPTANCE_SCENARIOS = {
  "workspace-1024x768-light": {
    width: 1024,
    height: 768,
    theme: "light",
    state: "workspace",
    assertions: [...WORKSPACE_ASSERTIONS, "narrowLayoutActive"].sort(),
  },
  "workspace-1024x768-dark": {
    width: 1024,
    height: 768,
    theme: "dark",
    state: "workspace",
    assertions: [...WORKSPACE_ASSERTIONS, "narrowLayoutActive"].sort(),
  },
  "workspace-1440x900-light": {
    width: 1440,
    height: 900,
    theme: "light",
    state: "workspace",
    assertions: [...WORKSPACE_ASSERTIONS, "wideLayoutActive"].sort(),
  },
  "workspace-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "workspace",
    assertions: [...WORKSPACE_ASSERTIONS, "wideLayoutActive"].sort(),
  },
  "attention-sheet-1024x768-dark": {
    width: 1024,
    height: 768,
    theme: "dark",
    state: "attention-sheet",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "attentionItemsPresent",
      "attentionPanelVisible",
      "contextSheetLabelled",
      "contextSheetVisible",
      "narrowLayoutActive",
    ].sort(),
  },
  "symphony-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "symphonyTabsInteractive",
      "symphonyKeyboardNavigation",
      "symphonySelectionReconciles",
      "symphonyActionsWired",
      "wideLayoutActive",
    ].sort(),
  },
  "symphony-activity-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony-activity",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "wideLayoutActive",
    ].sort(),
  },
  "symphony-events-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony-events",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "wideLayoutActive",
    ].sort(),
  },
  "symphony-recovery-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony-recovery",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "symphonyRecoveryVisible",
      "symphonyRecoveryActionWired",
      "symphonyRecoveryLifecycleActionsWired",
      "symphonyEffectResolutionUnavailable",
      "symphonyStaleFeedbackVisible",
      "symphonyRecoverySelectedAtCapture",
      "symphonyRecoveryContentVisibleAtCapture",
      "wideLayoutActive",
    ].sort(),
  },
  "symphony-recovery-1024x768-dark": {
    width: 1024,
    height: 768,
    theme: "dark",
    state: "symphony-recovery",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "symphonyRecoveryVisible",
      "symphonyRecoveryActionWired",
      "symphonyRecoveryLifecycleActionsWired",
      "symphonyEffectResolutionUnavailable",
      "symphonyStaleFeedbackVisible",
      "symphonyRecoverySelectedAtCapture",
      "symphonyRecoveryContentVisibleAtCapture",
      "narrowLayoutActive",
    ].sort(),
  },
  "selected-issue-1024x768-dark": {
    width: 1024,
    height: 768,
    theme: "dark",
    state: "selected-issue",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "issueActivityRegionVisible",
      "narrowLayoutActive",
      "selectedIssueActionsNamedFocusable",
      "selectedIssueComposerReachable",
      "selectedIssueContextBounded",
      "selectedIssueContextScrollsInternally",
      "selectedIssueNavigationActionsWired",
      "selectedIssueOpenWired",
      "selectedIssueParentExact",
      "selectedIssueSteeringWired",
    ].sort(),
  },
  "browser-preview-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "browser-preview",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "browserPreviewVisible",
      "browserPreviewTablistVisible",
      "browserPreviewChromeVisible",
      "browserPreviewTaskAssociated",
      "browserPreviewResponsiveMode",
      "browserPreviewTabKeyboardNavigation",
      "browserPreviewAddressSubmissionWired",
      "browserPreviewNavigationWired",
      "browserPreviewAnnotationWired",
      "browserPreviewCaptureWired",
      "browserPreviewFailureRecoveryWired",
      "browserPreviewContentActionWired",
      "browserPreviewCloseReopenWired",
      "wideLayoutActive",
    ].sort(),
  },
  "browser-preview-1024x768-dark": {
    width: 1024,
    height: 768,
    theme: "dark",
    state: "browser-preview-narrow",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "browserPreviewVisible",
      "browserPreviewTablistVisible",
      "browserPreviewChromeVisible",
      "browserPreviewTaskAssociated",
      "browserPreviewResponsiveMode",
      "browserPreviewTabKeyboardNavigation",
      "browserPreviewAddressSubmissionWired",
      "browserPreviewNavigationWired",
      "browserPreviewAnnotationWired",
      "browserPreviewCaptureWired",
      "browserPreviewFailureRecoveryWired",
      "browserPreviewContentActionWired",
      "browserPreviewCloseReopenWired",
      "browserPreviewSheetCloseReopenWired",
      "narrowLayoutActive",
    ].sort(),
  },
  "file-preview-1440x900-dark": {
    width: 1440,
    height: 900,
    theme: "dark",
    state: "file-preview",
    assertions: [
      ...WORKSPACE_ASSERTIONS,
      "filePreviewVisible",
      "filePreviewActionVisible",
      "filePreviewTaskAssociated",
      "filePreviewResponsiveMode",
      "filePreviewContentActionWired",
      "wideLayoutActive",
    ].sort(),
  },
} as const satisfies Readonly<Record<string, ScenarioContract>>;

export const ORCHESTRA_ACCEPTANCE_SCENARIO_NAMES = Object.freeze(
  Object.keys(ORCHESTRA_ACCEPTANCE_SCENARIOS),
);

export async function verifyOrchestraAcceptance(
  options: {
    readonly rootDir?: string;
    readonly manifestPath?: string;
  } = {},
): Promise<void> {
  const rootDir = NodePath.resolve(options.rootDir ?? DEFAULT_ROOT);
  const manifestPath = NodePath.resolve(rootDir, options.manifestPath ?? DEFAULT_MANIFEST);
  const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8")) as unknown;

  requireFields(
    manifest,
    ["schemaVersion", "id", "role", "desktop", "capture", "screenshots"],
    "manifest",
  );
  const typedManifest = manifest as Record<string, unknown>;
  if (typedManifest.schemaVersion !== 1) throw new Error("manifest.schemaVersion must be 1");
  if (typedManifest.id !== "orchestra-workspace-acceptance-v1") {
    throw new Error("manifest.id must be orchestra-workspace-acceptance-v1");
  }
  if (typedManifest.role !== "product-acceptance-evidence") {
    throw new Error("manifest.role must be product-acceptance-evidence");
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
    requiredSourceFiles: REQUIRED_ACCEPTANCE_SOURCE_FILES,
  });

  requireFields(typedManifest.capture, ["electronVersion", "platform"], "manifest.capture");
  const capture = typedManifest.capture as Record<string, unknown>;
  if (
    typeof capture.electronVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(capture.electronVersion)
  ) {
    throw new Error("manifest.capture.electronVersion must be a semantic Electron version");
  }
  requireFields(capture.platform, ["os", "arch"], "manifest.capture.platform");
  const platform = capture.platform as Record<string, unknown>;
  if (!new Set(["darwin", "linux", "win32"]).has(String(platform.os))) {
    throw new Error("manifest.capture.platform.os must be darwin, linux, or win32");
  }
  if (!new Set(["arm64", "x64"]).has(String(platform.arch))) {
    throw new Error("manifest.capture.platform.arch must be arm64 or x64");
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
    ORCHESTRA_ACCEPTANCE_SCENARIO_NAMES,
    "manifest screenshot scenarios",
  );

  for (const rawScreenshot of typedManifest.screenshots) {
    requireFields(
      rawScreenshot,
      [
        "scenario",
        "file",
        "width",
        "height",
        "deviceScaleFactor",
        "theme",
        "state",
        "sha256",
        "assertions",
      ],
      "manifest.screenshot",
    );
    const screenshot = rawScreenshot as Record<string, unknown>;
    const scenarioName = screenshot.scenario;
    if (typeof scenarioName !== "string" || !(scenarioName in ORCHESTRA_ACCEPTANCE_SCENARIOS)) {
      throw new Error(`manifest screenshot scenario ${String(scenarioName)} is not approved`);
    }
    const contract =
      ORCHESTRA_ACCEPTANCE_SCENARIOS[scenarioName as keyof typeof ORCHESTRA_ACCEPTANCE_SCENARIOS];
    const context = `manifest.screenshots.${scenarioName}`;
    const expectedFile = `${ACCEPTANCE_DIRECTORY}/${scenarioName}.png`;
    if (screenshot.file !== expectedFile)
      throw new Error(`${context}.file must be ${expectedFile}`);
    if (screenshot.width !== contract.width || screenshot.height !== contract.height) {
      throw new Error(`${context} viewport metadata does not match the scenario`);
    }
    if (screenshot.deviceScaleFactor !== 1) {
      throw new Error(`${context}.deviceScaleFactor must be 1`);
    }
    if (screenshot.theme !== contract.theme || screenshot.state !== contract.state) {
      throw new Error(`${context} theme/state metadata does not match the scenario`);
    }
    requireSha256(screenshot.sha256, `${context}.sha256`);
    requireFields(screenshot.assertions, contract.assertions, `${context}.assertions`);
    const assertions = screenshot.assertions as Record<string, unknown>;
    for (const assertion of contract.assertions) {
      if (assertions[assertion] !== true) {
        throw new Error(`${context}.assertions.${assertion} must be true`);
      }
    }

    const image = await requireEvidenceFile(rootDir, expectedFile, `${context}.file`);
    if (sha256(image) !== screenshot.sha256) {
      throw new Error(`${context}.sha256 does not match the PNG bytes`);
    }
    const dimensions = readPngDimensions(image, scenarioName);
    if (dimensions.width !== contract.width || dimensions.height !== contract.height) {
      throw new Error(`${context} PNG dimensions do not match the scenario`);
    }
  }
}

const invokedPath = process.argv[1] ? NodePath.resolve(process.argv[1]) : null;
if (invokedPath && NodeURL.pathToFileURL(invokedPath).href === import.meta.url) {
  const manifestPath = process.argv[2];
  try {
    await verifyOrchestraAcceptance(manifestPath ? { manifestPath } : {});
    process.stdout.write("Orchestra workspace acceptance artifacts verified\n");
  } catch (error) {
    process.stderr.write(
      `Orchestra workspace acceptance verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
