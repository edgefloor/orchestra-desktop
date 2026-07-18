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
  ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
} from "./lib/orchestra-native-shell-contract.mjs";
import {
  readPngDimensions as readNativeShellPngDimensions,
  sha256,
} from "./lib/orchestra-evidence-primitives.mjs";

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
) as Readonly<
  Record<
    string,
    {
      readonly scenario: string;
      readonly width: number;
      readonly height: number;
      readonly theme: "dark" | "light";
      readonly drawerOpen: boolean;
    }
  >
>;

export const ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES = Object.freeze(
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map(({ scenario }) => scenario),
);

export async function verifyOrchestraNativeShell(
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
    [
      "schemaVersion",
      "id",
      "role",
      "desktop",
      "codex",
      "capture",
      "productionEntry",
      "buildArtifacts",
      "screenshots",
      "assertions",
      "guest",
      "runtime",
      "humanReview",
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
    ["repository", "commit", "tree", "binarySha256"],
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
    typedManifest.capture,
    ["electronVersion", "chromiumVersion", "platform"],
    "manifest.capture",
  );
  const capture = typedManifest.capture as Record<string, unknown>;
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
    ["rendererUrl", "appViewport", "guest", "rejectedAttachmentProbe", "navigation", "cleanup"],
    "manifest.runtime",
  );
  const runtime = typedManifest.runtime as Record<string, unknown>;
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
  if (cleanup.portsClosed !== true || cleanup.processGroupEmpty === false) {
    throw new Error("manifest.runtime.cleanup must prove listener and process-group cleanup");
  }

  requireFields(
    typedManifest.humanReview,
    ["status", "reviewedAt", "notes"],
    "manifest.humanReview",
  );
  const humanReview = typedManifest.humanReview as Record<string, unknown>;
  if (humanReview.status !== "observed") {
    throw new Error("manifest.humanReview.status must be observed");
  }
  if (
    typeof humanReview.reviewedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(humanReview.reviewedAt) ||
    !Number.isFinite(Date.parse(humanReview.reviewedAt)) ||
    new Date(humanReview.reviewedAt).toISOString() !== humanReview.reviewedAt
  ) {
    throw new Error("manifest.humanReview.reviewedAt must be an ISO timestamp");
  }
  if (typeof humanReview.notes !== "string" || humanReview.notes.trim().length === 0) {
    throw new Error("manifest.humanReview.notes must be non-empty");
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
