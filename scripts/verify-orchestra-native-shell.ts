#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off - Standalone repository verifier.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const DEFAULT_ROOT = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_MANIFEST = "docs/acceptance/orchestra-native-shell/manifest.json";
const ACCEPTANCE_DIRECTORY = "docs/acceptance/orchestra-native-shell";

export const ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS = [
  "apps/desktop/dist-electron/main.cjs",
  "apps/desktop/dist-electron/preload.cjs",
  "apps/server/dist/bin.mjs",
  "apps/web/dist/index.html",
] as const;

export const ORCHESTRA_NATIVE_SHELL_ASSERTIONS = [
  "backendReady",
  "productionMainLoaded",
  "productionPreloadBridge",
  "nativeProjectVisible",
  "nativeTaskVisible",
  "nativeRouteRecoveredAfterReload",
  "composerVisible",
  "taskTabsVisible",
  "realWebviewAttached",
  "approvedPreviewPartition",
  "guestPageALoaded",
  "guestPageBLoaded",
  "guestBackWorked",
  "guestForwardWorked",
  "guestReloadWorked",
  "guestFailureSurfaced",
  "guestRecovered",
  "guestDomMutationWorked",
  "guestScreenshotCaptured",
  "noDocumentHorizontalOverflow",
  "narrowDisclosureReachable",
  "processCleanupVerified",
] as const;

export const ORCHESTRA_NATIVE_SHELL_SCREENSHOTS = {
  "native-browser-1440x900-dark": { width: 1440, height: 900 },
  "native-workspace-1024x768-dark": { width: 1024, height: 768 },
} as const;

export const ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES = Object.freeze(
  Object.keys(ORCHESTRA_NATIVE_SHELL_SCREENSHOTS),
);

function requireFields(value: unknown, expected: ReadonlyArray<string>, context: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${context} fields must be ${wanted.join(", ")}`);
  }
}

function requireExactArray(
  actual: unknown,
  expected: ReadonlyArray<unknown>,
  context: string,
): void {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${context} must exactly match the native-shell evidence contract`);
  }
}

function requireGitObjectId(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${context} must be a lowercase 40-character Git object ID`);
  }
}

function requireSha256(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${context} must be a lowercase SHA-256 digest`);
  }
}

function requireSafeRelativePath(value: unknown, context: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    NodePath.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${context} must be a safe repository-relative path`);
  }
}

function sha256(bytes: Uint8Array): string {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

function runGit(rootDir: string, args: ReadonlyArray<string>): string {
  return NodeChildProcess.execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function verifyDesktopSourceIdentity(
  rootDir: string,
  commit: string,
  tree: string,
): Promise<void> {
  try {
    await NodeFSP.stat(NodePath.join(rootDir, ".git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  try {
    runGit(rootDir, ["rev-parse", "--verify", `${commit}^{commit}`]);
  } catch {
    throw new Error("manifest.desktop.commit does not resolve to a commit in this repository");
  }

  let resolvedTree: string;
  try {
    resolvedTree = runGit(rootDir, ["rev-parse", `${commit}^{tree}`]);
  } catch {
    throw new Error("manifest.desktop.commit tree could not be resolved in this repository");
  }
  if (resolvedTree !== tree) {
    throw new Error("manifest.desktop.tree does not match manifest.desktop.commit");
  }

  try {
    runGit(rootDir, ["merge-base", "--is-ancestor", commit, "HEAD"]);
  } catch {
    throw new Error("manifest.desktop.commit must be an ancestor of repository HEAD");
  }
}

export function readNativeShellPngDimensions(
  bytes: Buffer,
  context = "image",
): { readonly width: number; readonly height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new Error(`${context} must be a PNG image`);
  }
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${context} must begin with a 13-byte PNG IHDR chunk`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`${context} must have positive PNG dimensions`);
  }
  return { width, height };
}

async function requireFile(
  rootDir: string,
  relativePath: string,
  context: string,
): Promise<Buffer> {
  requireSafeRelativePath(relativePath, context);
  const absolutePath = NodePath.resolve(rootDir, relativePath);
  const relativeToRoot = NodePath.relative(rootDir, absolutePath);
  if (relativeToRoot.startsWith("..") || NodePath.isAbsolute(relativeToRoot)) {
    throw new Error(`${context} escapes the repository root`);
  }
  const stat = await NodeFSP.stat(absolutePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${context} requires a non-empty file at ${relativePath}`);
  }
  return NodeFSP.readFile(absolutePath);
}

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
      "capture",
      "productionEntry",
      "buildArtifacts",
      "screenshots",
      "assertions",
      "guest",
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
  await verifyDesktopSourceIdentity(rootDir, desktop.commit, desktop.tree);

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
  );
  for (const [index, rawArtifact] of typedManifest.buildArtifacts.entries()) {
    requireFields(rawArtifact, ["path", "sha256"], "manifest.buildArtifact");
    const artifact = rawArtifact as Record<string, unknown>;
    const expectedPath = ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS[index]!;
    if (artifact.path !== expectedPath) {
      throw new Error(`manifest.buildArtifacts.${index}.path must be ${expectedPath}`);
    }
    requireSha256(artifact.sha256, `manifest.buildArtifacts.${index}.sha256`);
    const bytes = await requireFile(rootDir, expectedPath, `manifest.buildArtifacts.${index}.path`);
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
  );
  for (const rawScreenshot of typedManifest.screenshots) {
    requireFields(
      rawScreenshot,
      ["scenario", "file", "width", "height", "deviceScaleFactor", "theme", "sha256"],
      "manifest.screenshot",
    );
    const screenshot = rawScreenshot as Record<string, unknown>;
    const scenario = screenshot.scenario;
    if (typeof scenario !== "string" || !(scenario in ORCHESTRA_NATIVE_SHELL_SCREENSHOTS)) {
      throw new Error(`manifest screenshot scenario ${String(scenario)} is not approved`);
    }
    const contract =
      ORCHESTRA_NATIVE_SHELL_SCREENSHOTS[
        scenario as keyof typeof ORCHESTRA_NATIVE_SHELL_SCREENSHOTS
      ];
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
    if (screenshot.theme !== "dark") throw new Error(`${context}.theme must be dark`);
    requireSha256(screenshot.sha256, `${context}.sha256`);
    const image = await requireFile(rootDir, expectedFile, `${context}.file`);
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
    if (assertions[assertion] !== true) {
      throw new Error(`manifest.assertions.${assertion} must be true`);
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
