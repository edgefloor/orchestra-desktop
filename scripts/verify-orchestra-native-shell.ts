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
    ["pinsSha256", "manifestSha256", "releaseManifest"],
    "manifest.product",
  );
  const product = typedManifest.product as Record<string, unknown>;
  requireSha256(product.pinsSha256, "manifest.product.pinsSha256");
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
    typedManifest.agentReview,
    ["status", "reviewedAt", "notes"],
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
  if (typeof agentReview.notes !== "string" || agentReview.notes.trim().length === 0) {
    throw new Error("manifest.agentReview.notes must be non-empty");
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
