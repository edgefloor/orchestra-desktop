#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { makeWsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import { ORCHESTRATION_WS_METHODS, WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";

import {
  assertNativeShellAssertions,
  buildNativeGuestFixture,
  canConnectToNativeShellPort,
  cleanupFailedNativeShellCapture,
  createNativeShellRequestCountWaiter,
  isExactNativeDogfoodResponseCount,
  isNativeGitCheckEvidenceReferenceObservation,
  isNativeGitCheckEvidenceObservation,
  isNarrowDrawerOpenedObservation,
  isNativeEvidenceObservation,
  isNativeWorkflowLifecycleObservation,
  isNativeShellProcessGroupEmpty,
  isNativeShellGitFixtureIdentity,
  isNativeShellResourceCleanupComplete,
  isNativeShellTerminalSurfaceTitle,
  isUniqueNativeSymphonyInspection,
  makeNativeShellAssertion,
  ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  ORCHESTRA_NATIVE_SHELL_TERMINAL_TITLE_PATTERN,
  reserveNativeShellPort,
  shouldRunNativeShellElectronChild,
  terminateAndVerifyNativeShellResources,
} from "../../../scripts/lib/orchestra-native-shell-contract.mjs";
import {
  isPinnedGitSubtreeIdentity,
  readPngDimensions,
  runGit,
  sha256,
} from "../../../scripts/lib/orchestra-evidence-primitives.mjs";
import {
  assertNativeDogfoodResponsesComplete,
  buildNativeDogfoodFixtures,
  matchNativeDogfoodResponsesRequest,
  NativeDogfoodContractError,
  ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME,
  ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH,
  ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID,
  ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT,
  ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT,
  ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT,
  ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT,
} from "../../../scripts/lib/orchestra-native-dogfood-contract.mjs";
import { resolveElectronLaunchCommand } from "./electron-launcher.mjs";

const scriptPath = NodeURL.fileURLToPath(import.meta.url);
const desktopDir = NodePath.resolve(NodePath.dirname(scriptPath), "..");
const repoRoot = NodePath.resolve(desktopDir, "..", "..");
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone native-shell harness has no Effect runtime.
const hostPlatform = NodeOS.platform();
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone native-shell harness has no Effect runtime.
const hostArchitecture = NodeOS.arch();
const mainBundle = NodePath.join(desktopDir, "dist-electron", "main.cjs");
const evidenceDirectory = NodePath.join(repoRoot, ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY);
const evidenceRelativeDirectory = ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY;
const manifestPath = NodePath.join(evidenceDirectory, "manifest.json");
const projectId = "project-native-shell-acceptance";
const threadId = "thread-native-shell-acceptance";
const projectTitle = "Orchestra Desktop Native Acceptance";
const threadTitle = "Native Browser acceptance";
const rejectedProbePartition = "persist:orchestra-native-shell-rejected";
const requiredAssertionNames = ORCHESTRA_NATIVE_SHELL_ASSERTIONS;
const screenshotScenarios = ORCHESTRA_NATIVE_SHELL_SCREENSHOTS;

function runChecked(command, args, options = {}) {
  return NodeChildProcess.execFileSync(command, args, {
    ...options,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

export function prepareNativeShellGitFixture({ repository, remoteRepository }) {
  runChecked("git", ["init", "--bare", "--initial-branch=main", remoteRepository], {
    cwd: NodePath.dirname(remoteRepository),
  });
  runGit(repository, ["init", "--initial-branch=main"]);
  runGit(repository, ["add", "."]);
  runGit(repository, [
    "-c",
    "user.name=Orchestra Acceptance",
    "-c",
    "user.email=acceptance@invalid.local",
    "commit",
    "-m",
    "Seed native dogfood repository",
  ]);
  runGit(repository, ["remote", "add", "origin", remoteRepository]);

  const configuredRemote = runGit(repository, ["remote", "get-url", "origin"]);
  const remoteIsBare = runGit(remoteRepository, ["rev-parse", "--is-bare-repository"]);
  if (
    NodePath.resolve(configuredRemote) !== NodePath.resolve(remoteRepository) ||
    remoteIsBare !== "true"
  ) {
    throw new Error("native-shell Git fixture must use its isolated local bare origin");
  }
  return ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY;
}

function cleanCargoEnvironment() {
  const environment = { ...process.env };
  delete environment.CARGO_TARGET_DIR;
  return environment;
}

function rustHostTarget() {
  const verboseVersion = runChecked("rustc", ["-vV"]);
  const host = verboseVersion
    .split("\n")
    .find((line) => line.startsWith("host: "))
    ?.slice("host: ".length)
    .trim();
  if (!host) throw new Error("rustc -vV did not report a host target");
  return host;
}

async function prepareNativeProductIdentity({
  runtimeDirectory,
  dogfoodCodexRepository,
  dogfoodCodexPath,
}) {
  if (runGit(dogfoodCodexRepository, ["status", "--porcelain"]).length > 0) {
    throw new Error("native dogfood Codex repository must be clean before its source-bound build");
  }
  const expectedCodexPath = NodePath.join(
    dogfoodCodexRepository,
    "codex-rs",
    "target",
    "debug",
    "codex",
  );
  if (NodePath.resolve(dogfoodCodexPath) !== NodePath.resolve(expectedCodexPath)) {
    throw new Error(
      `native dogfood Codex path must be the source-bound debug output: ${expectedCodexPath}`,
    );
  }
  const codexBuildCommand = [
    "build",
    "--manifest-path",
    "codex-rs/Cargo.toml",
    "-p",
    "codex-cli",
    "--bin",
    "codex",
  ];
  runChecked("cargo", codexBuildCommand, {
    cwd: dogfoodCodexRepository,
    env: cleanCargoEnvironment(),
    stdio: "inherit",
  });
  if (!NodeFS.existsSync(dogfoodCodexPath)) {
    throw new Error(`source-bound native dogfood Codex build is missing: ${dogfoodCodexPath}`);
  }
  if (runGit(dogfoodCodexRepository, ["status", "--porcelain"]).length > 0) {
    throw new Error("native dogfood Codex build changed its clean source checkout");
  }
  const dogfoodCodexIdentity = {
    repository: "edgefloor/orchestra-codex",
    commit: runGit(dogfoodCodexRepository, ["rev-parse", "HEAD"]),
    tree: runGit(dogfoodCodexRepository, ["rev-parse", "HEAD^{tree}"]),
    binarySha256: sha256(await NodeFSP.readFile(dogfoodCodexPath)),
    build: {
      tool: "cargo",
      arguments: codexBuildCommand,
      profile: "debug",
      package: "codex-cli",
      binary: "codex",
    },
  };

  const orchestraRepository =
    process.env.ORCHESTRA_NATIVE_DOGFOOD_CORE_REPOSITORY?.trim() ||
    NodePath.resolve(repoRoot, "..", "orchestra");
  if (runGit(orchestraRepository, ["status", "--porcelain", "--untracked-files=no"]).length > 0) {
    throw new Error("native dogfood Orchestra core repository must have no tracked changes");
  }
  const productPinsPath = NodePath.join(orchestraRepository, "product", "pins.toml");
  const pinsToml = await NodeFSP.readFile(productPinsPath, "utf8");
  const orchestraCoreCommit = pinsToml.match(/^orchestra_core_revision = "([0-9a-f]{40})"$/m)?.[1];
  const orchestraCoreTree = pinsToml.match(/^orchestra_core_tree = "([0-9a-f]{40})"$/m)?.[1];
  if (
    !orchestraCoreCommit ||
    !orchestraCoreTree ||
    !isPinnedGitSubtreeIdentity(
      orchestraRepository,
      orchestraCoreCommit,
      "crates/orchestra-core",
      orchestraCoreTree,
    )
  ) {
    throw new Error("Product-pinned Orchestra core identity does not resolve in the core fork");
  }
  const pinnedOrchestraRepository = NodePath.join(runtimeDirectory, "orchestra-core-source");
  runGit(orchestraRepository, [
    "worktree",
    "add",
    "--detach",
    pinnedOrchestraRepository,
    orchestraCoreCommit,
  ]);
  try {
    const orchestraProductBuildCommand = [
      "build",
      "--manifest-path",
      NodePath.join(pinnedOrchestraRepository, "Cargo.toml"),
      "-p",
      "codex-orchestra-product",
    ];
    runChecked("cargo", orchestraProductBuildCommand, {
      cwd: pinnedOrchestraRepository,
      env: cleanCargoEnvironment(),
      stdio: "inherit",
    });
    const orchestraProductPath = NodePath.join(
      pinnedOrchestraRepository,
      "target",
      "debug",
      "orchestra-product",
    );
    const orchestraEvaluatorPath = NodePath.join(
      pinnedOrchestraRepository,
      "target",
      "orchestra-product",
      "orchestra-validate-worker",
    );
    const evaluatorBuildScript = NodePath.join(
      pinnedOrchestraRepository,
      "scripts",
      "evaluator-build.sh",
    );
    runChecked(evaluatorBuildScript, [orchestraEvaluatorPath], {
      cwd: pinnedOrchestraRepository,
      stdio: "inherit",
    });
    for (const executable of [orchestraProductPath, orchestraEvaluatorPath]) {
      if (!NodeFS.existsSync(executable)) {
        throw new Error(`native dogfood Product executable is missing: ${executable}`);
      }
    }
    runChecked(orchestraProductPath, ["doctor", "--root", orchestraRepository], {
      cwd: orchestraRepository,
      stdio: "inherit",
    });

    const productManifestPath = NodePath.join(runtimeDirectory, "release-manifest.json");
    const productArtifacts = [
      ["codex-cli", dogfoodCodexPath],
      ["orchestra-product", orchestraProductPath],
      ["orchestra-validate-worker", orchestraEvaluatorPath],
      ["desktop-main", mainBundle],
      ["desktop-preload", NodePath.join(desktopDir, "dist-electron", "preload.cjs")],
      ["desktop-server", NodePath.join(repoRoot, "apps", "server", "dist", "bin.mjs")],
      ["desktop-renderer", NodePath.join(repoRoot, "apps", "web", "dist", "index.html")],
    ];
    runChecked(
      orchestraProductPath,
      [
        "manifest",
        "--root",
        orchestraRepository,
        "--target",
        rustHostTarget(),
        "--output",
        productManifestPath,
        ...productArtifacts.flatMap(([name, path]) => ["--artifact", `${name}=${path}`]),
      ],
      { cwd: orchestraRepository, stdio: "inherit" },
    );
    runChecked(orchestraProductPath, ["verify-manifest", "--manifest", productManifestPath], {
      cwd: orchestraRepository,
      stdio: "inherit",
    });
    const releaseManifest = JSON.parse(await NodeFSP.readFile(productManifestPath, "utf8"));
    if (releaseManifest.artifacts?.["codex-cli"]?.sha256 !== dogfoodCodexIdentity.binarySha256) {
      throw new Error("Product manifest Codex artifact does not match the source-bound binary");
    }
    const desktopCommit = runGit(repoRoot, ["rev-parse", "HEAD"]);
    const desktopTree = runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]);
    if (
      releaseManifest.sources?.orchestra_codex !== dogfoodCodexIdentity.commit ||
      releaseManifest.sources?.orchestra_codex_tree !== dogfoodCodexIdentity.tree ||
      releaseManifest.sources?.orchestra_desktop !== desktopCommit ||
      releaseManifest.sources?.orchestra_desktop_tree !== desktopTree
    ) {
      throw new Error(
        "Product manifest sources do not match the source-bound Codex and Desktop tuple",
      );
    }
    if (
      releaseManifest.sources?.orchestra_core_revision !== orchestraCoreCommit ||
      releaseManifest.sources?.orchestra_core_tree !== orchestraCoreTree
    ) {
      throw new Error(
        "Product manifest Orchestra core identity does not match the pinned build worktree",
      );
    }
    return {
      dogfoodCodexIdentity,
      orchestraCoreIdentity: {
        repository: "edgefloor/codex-orchestra",
        commit: orchestraCoreCommit,
        tree: orchestraCoreTree,
      },
      productIdentity: {
        pinsToml,
        pinsSha256: sha256(Buffer.from(pinsToml)),
        manifestSha256: releaseManifest.manifestSha256,
        releaseManifest,
      },
      evaluatorBuildReceipt: {
        tool: "scripts/evaluator-build.sh",
        arguments: ["target/orchestra-product/orchestra-validate-worker"],
        sourceCommit: orchestraCoreCommit,
        sourceTree: orchestraCoreTree,
        artifact: {
          path: "target/orchestra-product/orchestra-validate-worker",
          sha256: sha256(await NodeFSP.readFile(orchestraEvaluatorPath)),
        },
      },
    };
  } finally {
    runGit(orchestraRepository, ["worktree", "remove", "--force", pinnedOrchestraRepository]);
  }
}

async function waitFor(predicate, context, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      if (error instanceof NativeDogfoodContractError) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`${context} did not become ready within ${timeoutMs}ms`, {
    cause: lastError ?? undefined,
  });
}

export async function executeNativeShellRendererStep(renderer, source, context) {
  try {
    return await renderer.executeJavaScript(source, true);
  } catch (error) {
    const bound = (value, maxChars) => {
      const normalized = String(value);
      return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}…`;
    };
    const boundedContext = bound(context, 160);
    const rendererUrl = bound(renderer.getURL(), 256);
    const message = bound(error instanceof Error ? error.message : error, 512);
    throw new Error(`${boundedContext} renderer script failed at ${rendererUrl}: ${message}`);
  }
}

function scrubProviderCredentials(environment) {
  for (const key of Object.keys(environment)) {
    if (
      /(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|REFRESH[_-]?TOKEN)$/i.test(key) ||
      ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN", "GH_TOKEN"].includes(key)
    ) {
      delete environment[key];
    }
  }
}

async function launchUnderElectron() {
  const sourceChanges = runGit(repoRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
    `:(exclude)${evidenceRelativeDirectory}`,
    `:(exclude)${evidenceRelativeDirectory}/**`,
  ]);
  const sourceClean = sourceChanges.length === 0;
  if (!sourceClean && process.env.ORCHESTRA_NATIVE_ACCEPTANCE_ALLOW_DIRTY !== "1") {
    throw new Error(
      "native-shell capture requires a clean tracked worktree; commit source changes first",
    );
  }

  const desktopBuildCommand = ["run", "build:desktop"];
  runChecked("bun", desktopBuildCommand, { cwd: repoRoot, stdio: "inherit" });

  for (const required of [
    mainBundle,
    NodePath.join(desktopDir, "dist-electron", "preload.cjs"),
    NodePath.join(repoRoot, "apps", "server", "dist", "bin.mjs"),
    NodePath.join(repoRoot, "apps", "web", "dist", "index.html"),
  ]) {
    if (!NodeFS.existsSync(required))
      throw new Error(`missing production build artifact: ${required}`);
  }

  const runtimeDirectory = await NodeFSP.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "orchestra-native-shell-"),
  );
  const wrapperDirectory = NodePath.join(runtimeDirectory, "wrapper");
  const homeDirectory = NodePath.join(runtimeDirectory, "home");
  const t3Home = NodePath.join(runtimeDirectory, "t3");
  const codexHome = NodePath.join(runtimeDirectory, "codex");
  const backendPort = await reserveNativeShellPort();
  const guestPort = await reserveNativeShellPort();
  const failurePort = await reserveNativeShellPort();
  const responsesPort = await reserveNativeShellPort();
  const dogfoodRepository = NodePath.join(runtimeDirectory, "repository");
  const dogfoodRemoteRepository = NodePath.join(runtimeDirectory, "origin.git");
  const defaultCodexRepository = NodePath.resolve(repoRoot, "..", "orchestra-codex");
  const defaultCodexPath = NodePath.resolve(
    defaultCodexRepository,
    "codex-rs",
    "target",
    "debug",
    "codex",
  );
  const dogfoodCodexRepository =
    process.env.ORCHESTRA_NATIVE_DOGFOOD_CODEX_REPOSITORY?.trim() || defaultCodexRepository;
  const dogfoodCodexPath =
    process.env.ORCHESTRA_NATIVE_DOGFOOD_CODEX_PATH?.trim() || defaultCodexPath;
  const { dogfoodCodexIdentity, orchestraCoreIdentity, productIdentity, evaluatorBuildReceipt } =
    await prepareNativeProductIdentity({
      runtimeDirectory,
      dogfoodCodexRepository,
      dogfoodCodexPath,
    });
  const desktopBuildReceipt = {
    tool: "bun",
    arguments: desktopBuildCommand,
    sourceCommit: runGit(repoRoot, ["rev-parse", "HEAD"]),
    sourceTree: runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]),
    artifacts: await Promise.all(
      ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS.map(async (path) => ({
        path,
        sha256: sha256(await NodeFSP.readFile(NodePath.join(repoRoot, path))),
      })),
    ),
  };
  const dogfoodFixtures = buildNativeDogfoodFixtures(`http://127.0.0.1:${responsesPort}`);
  await Promise.all(
    [wrapperDirectory, homeDirectory, t3Home, codexHome, dogfoodRepository].map((directory) =>
      NodeFSP.mkdir(directory, { recursive: true }),
    ),
  );
  await Promise.all([
    ...Object.entries(dogfoodFixtures.repositoryFiles).map(([relativePath, contents]) =>
      NodeFSP.writeFile(NodePath.join(dogfoodRepository, relativePath), contents),
    ),
    ...Object.entries(dogfoodFixtures.codexHomeFiles).map(([relativePath, contents]) =>
      NodeFSP.writeFile(NodePath.join(codexHome, relativePath), contents),
    ),
  ]);
  const gitFixtureIdentity = prepareNativeShellGitFixture({
    repository: dogfoodRepository,
    remoteRepository: dogfoodRemoteRepository,
  });
  const settingsDirectory = NodePath.join(t3Home, "userdata");
  await NodeFSP.mkdir(settingsDirectory, { recursive: true });
  await NodeFSP.writeFile(
    NodePath.join(settingsDirectory, "settings.json"),
    `${JSON.stringify({
      providers: {
        codex: {
          enabled: true,
          binaryPath: dogfoodCodexPath,
          homePath: codexHome,
        },
      },
    })}\n`,
  );
  await NodeFSP.writeFile(
    NodePath.join(wrapperDirectory, "package.json"),
    `${JSON.stringify({
      name: "orchestra-native-shell-acceptance",
      version: "1.0.0",
      private: true,
      type: "module",
      main: "main.mjs",
    })}\n`,
  );
  await NodeFSP.writeFile(
    NodePath.join(wrapperDirectory, "main.mjs"),
    `import ${JSON.stringify(NodeURL.pathToFileURL(scriptPath).href)};\n`,
  );

  const environment = {
    ...process.env,
    HOME: homeDirectory,
    XDG_CONFIG_HOME: NodePath.join(runtimeDirectory, "xdg"),
    T3CODE_HOME: t3Home,
    CODEX_HOME: codexHome,
    T3CODE_PORT: String(backendPort),
    T3CODE_DISABLE_AUTO_UPDATE: "1",
    ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1",
    ORCHESTRA_NATIVE_ACCEPTANCE_RUNTIME_DIR: runtimeDirectory,
    ORCHESTRA_NATIVE_ACCEPTANCE_BACKEND_PORT: String(backendPort),
    ORCHESTRA_NATIVE_ACCEPTANCE_GUEST_PORT: String(guestPort),
    ORCHESTRA_NATIVE_ACCEPTANCE_FAILURE_PORT: String(failurePort),
    ORCHESTRA_NATIVE_ACCEPTANCE_RESPONSES_PORT: String(responsesPort),
    ORCHESTRA_NATIVE_ACCEPTANCE_REPOSITORY: dogfoodRepository,
    ORCHESTRA_NATIVE_ACCEPTANCE_GIT_FIXTURE_IDENTITY: JSON.stringify(gitFixtureIdentity),
    ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_PATH: dogfoodCodexPath,
    ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_IDENTITY: JSON.stringify(dogfoodCodexIdentity),
    ORCHESTRA_NATIVE_ACCEPTANCE_CORE_IDENTITY: JSON.stringify(orchestraCoreIdentity),
    ORCHESTRA_NATIVE_ACCEPTANCE_PRODUCT_IDENTITY: JSON.stringify(productIdentity),
    ORCHESTRA_NATIVE_ACCEPTANCE_SOURCE_CLEAN: sourceClean ? "1" : "0",
    ORCHESTRA_NATIVE_ACCEPTANCE_BUILD_RECEIPTS: JSON.stringify({
      desktop: desktopBuildReceipt,
      evaluator: evaluatorBuildReceipt,
    }),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.VITE_DEV_SERVER_URL;
  scrubProviderCredentials(environment);

  const launch = resolveElectronLaunchCommand([wrapperDirectory, "--force-device-scale-factor=1"]);
  let captureCompleted = false;
  let child = null;
  try {
    child = NodeChildProcess.spawn(launch.electronPath, launch.args, {
      cwd: repoRoot,
      env: environment,
      stdio: "inherit",
      detached: hostPlatform !== "win32",
    });
    const exit = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("native-shell Electron capture timed out after 180 seconds"));
      }, 180_000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    });
    const childErrorPath = NodePath.join(runtimeDirectory, "capture-error.txt");
    if (NodeFS.existsSync(childErrorPath)) {
      throw new Error(await NodeFSP.readFile(childErrorPath, "utf8"));
    }
    if (exit.code !== 0) {
      throw new Error(
        `native-shell Electron capture exited with ${exit.signal ?? `status ${exit.code}`}`,
      );
    }
    if (!sourceClean) {
      throw new Error(
        "ORCHESTRA_NATIVE_ACCEPTANCE_ALLOW_DIRTY is diagnostic-only; dirty captures cannot become verifiable evidence",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const portsClosed =
      !(await canConnectToNativeShellPort(backendPort)) &&
      !(await canConnectToNativeShellPort(guestPort)) &&
      !(await canConnectToNativeShellPort(failurePort)) &&
      !(await canConnectToNativeShellPort(responsesPort));
    const processGroupEmpty = child.pid
      ? isNativeShellProcessGroupEmpty(child.pid, hostPlatform)
      : false;
    const cleanupVerified = isNativeShellResourceCleanupComplete({
      portsClosed,
      processGroupEmpty,
    });
    const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8"));
    manifest.runtime.cleanup = { portsClosed, processGroupEmpty };
    manifest.assertions.processCleanupVerified = makeNativeShellAssertion(
      manifest.runtime.cleanup,
      cleanupVerified,
    );
    assertNativeShellAssertions(manifest.assertions);
    await NodeFSP.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    captureCompleted = true;
    console.log(
      `Native-shell evidence captured at ${NodePath.relative(repoRoot, evidenceDirectory)}`,
    );
  } catch (error) {
    const failureCleanup = await terminateAndVerifyNativeShellResources({
      ...(child?.pid ? { pid: child.pid } : {}),
      ports: [backendPort, guestPort, failurePort, responsesPort],
      platform: hostPlatform,
    });
    if (!isNativeShellResourceCleanupComplete(failureCleanup)) {
      throw new Error(
        `native-shell capture failed and cleanup remained incomplete: ${JSON.stringify(failureCleanup)}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (captureCompleted) {
      await NodeFSP.rm(runtimeDirectory, { recursive: true, force: true });
    } else {
      await cleanupFailedNativeShellCapture({
        runtimeDirectory,
        evidenceDirectory,
      });
    }
  }
}

async function dispatchCommand(baseUrl, token, command) {
  const response = await fetch(new URL("/api/orchestration/dispatch", baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`dispatch ${command.type} failed (${response.status}): ${body}`);
  }
  return body.length > 0 ? JSON.parse(body) : null;
}

async function fetchThreadSnapshot(baseUrl, token, targetThreadId) {
  const response = await fetch(
    new URL(`/api/orchestration/threads/${encodeURIComponent(targetThreadId)}`, baseUrl),
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`thread snapshot failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return JSON.parse(body);
}

async function issueNativeShellWebSocketTicket(baseUrl, token) {
  const response = await fetch(new URL("/api/auth/websocket-ticket", baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`websocket ticket failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return JSON.parse(body).ticket;
}

async function runWithNativeShellRpcClient(baseUrl, token, useClient) {
  const ticket = await issueNativeShellWebSocketTicket(baseUrl, token);
  const webSocketUrl = new URL("/ws", baseUrl);
  webSocketUrl.protocol = webSocketUrl.protocol === "https:" ? "wss:" : "ws:";
  webSocketUrl.searchParams.set("wsTicket", ticket);
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const socketLayer = Socket.layerWebSocket(webSocketUrl.toString()).pipe(
          Layer.provide(Socket.layerWebSocketConstructorGlobal),
        );
        const protocolLayer = Layer.effect(
          RpcClient.Protocol,
          RpcClient.makeProtocolSocket({
            retryTransientErrors: false,
            retryPolicy: Schedule.recurs(0),
          }),
        ).pipe(Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)));
        const protocolContext = yield* Layer.build(protocolLayer);
        const client = yield* makeWsRpcProtocolClient.pipe(Effect.provide(protocolContext));
        return yield* useClient(client);
      }),
    ),
  );
}

export function withNativeShellEventTimeout(effect, context, duration = "45 seconds") {
  return effect.pipe(
    Effect.timeoutOrElse({
      duration,
      orElse: () => Effect.fail(new Error(`${context} did not arrive within ${duration}`)),
    }),
  );
}

export const NATIVE_SHELL_ASSISTANT_MAX_PENDING_MESSAGES = 16;
export const NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS = 24_000;
export const NATIVE_SHELL_ASSISTANT_MAX_TOTAL_CHARS = 48_000;

export function accumulateNativeShellAssistantMessage(textByMessageId, item, expectedText) {
  const event = item.kind === "event" ? item.event : null;
  if (event?.type !== "thread.message-sent" || event.payload.role !== "assistant") {
    return [textByMessageId, []];
  }

  const nextTextByMessageId = new Map(textByMessageId);
  const existingText = nextTextByMessageId.get(event.payload.messageId) ?? "";
  const accumulatedText = `${existingText}${event.payload.text}`;
  if (accumulatedText.length > NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS) {
    throw new Error(
      `typed assistant message ${event.payload.messageId} exceeded ${NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS} characters`,
    );
  }
  if (event.payload.streaming) {
    if (
      !nextTextByMessageId.has(event.payload.messageId) &&
      nextTextByMessageId.size >= NATIVE_SHELL_ASSISTANT_MAX_PENDING_MESSAGES
    ) {
      throw new Error(
        `typed assistant stream exceeded ${NATIVE_SHELL_ASSISTANT_MAX_PENDING_MESSAGES} pending messages`,
      );
    }
    const retainedCharacterCount = [...nextTextByMessageId.values()].reduce(
      (total, text) => total + text.length,
      0,
    );
    const nextCharacterCount =
      retainedCharacterCount - existingText.length + accumulatedText.length;
    if (nextCharacterCount > NATIVE_SHELL_ASSISTANT_MAX_TOTAL_CHARS) {
      throw new Error(
        `typed assistant stream exceeded ${NATIVE_SHELL_ASSISTANT_MAX_TOTAL_CHARS} accumulated characters`,
      );
    }
    nextTextByMessageId.set(event.payload.messageId, accumulatedText);
    return [nextTextByMessageId, []];
  }

  nextTextByMessageId.delete(event.payload.messageId);
  if (accumulatedText !== expectedText) {
    return [nextTextByMessageId, []];
  }
  return [
    nextTextByMessageId,
    [
      {
        ...item,
        event: {
          ...event,
          payload: { ...event.payload, text: accumulatedText },
        },
      },
    ],
  ];
}

async function awaitNativeShellSessionEvent({ baseUrl, token, threadId, afterSequence, status }) {
  return runWithNativeShellRpcClient(baseUrl, token, (client) =>
    withNativeShellEventTimeout(
      client[ORCHESTRATION_WS_METHODS.subscribeThread]({
        threadId,
        afterSequence,
      }).pipe(
        Stream.filter(
          (item) =>
            item.kind === "event" &&
            item.event.type === "thread.session-set" &&
            item.event.payload.session.status === status,
        ),
        Stream.runHead,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new Error(`thread session stream ended before ${status}`)),
            onSome: Effect.succeed,
          }),
        ),
      ),
      `thread.session-set status ${status}`,
    ),
  );
}

async function awaitNativeShellAssistantMessageEvent({
  baseUrl,
  token,
  threadId,
  afterSequence,
  text,
}) {
  return runWithNativeShellRpcClient(baseUrl, token, (client) =>
    withNativeShellEventTimeout(
      client[ORCHESTRATION_WS_METHODS.subscribeThread]({
        threadId,
        afterSequence,
      }).pipe(
        Stream.mapAccum(
          () => new Map(),
          (textByMessageId, item) =>
            accumulateNativeShellAssistantMessage(textByMessageId, item, text),
        ),
        Stream.runHead,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new Error(`thread message stream ended before ${text}`)),
            onSome: Effect.succeed,
          }),
        ),
      ),
      `thread.message-sent assistant text ${JSON.stringify(text)}`,
    ),
  );
}

async function readNativeShellAutomationStatus({ baseUrl, token, threadId, runId }) {
  return runWithNativeShellRpcClient(baseUrl, token, (client) =>
    client[WS_METHODS.automationStatus]({ threadId, runId }),
  );
}

async function observeSymphonyRoot(renderer, runId, context) {
  return renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(${JSON.stringify(`${context} did not render within 45000ms`)}));
      }, 45000);
      const inspect = () => {
        const roots = [...document.querySelectorAll('[aria-label="Symphony automation workspace"] [aria-label="Automation root status"]')];
        const matching = roots.filter((root) => [...root.querySelectorAll('code')]
          .some((node) => node.textContent?.trim() === ${JSON.stringify(runId)}));
        const root = matching[0];
        if (!(root instanceof HTMLElement)) return null;
        const text = root.innerText;
        if (!text.toLowerCase().includes('skipped') || !text.includes('running')) return null;
        return {
          runId: ${JSON.stringify(runId)},
          status: 'running',
          instanceCount: matching.length,
          totalRootCount: roots.length,
          text: text.slice(0, 4000),
          textTruncated: text.length > 4000,
        };
      };
      const complete = () => {
        const result = inspect();
        if (!result) return;
        window.clearTimeout(deadline);
        observer.disconnect();
        resolve(result);
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      complete();
    })`,
    true,
  );
}

async function observeNativeGitCheckEvidenceReference(renderer, workflowRunSelector, context) {
  return renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(${JSON.stringify(`${context} did not render within 45000ms`)}));
      }, 45000);
      const complete = () => {
        const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
        if (!(run instanceof HTMLElement)) return;
        const runDisclosure = run.querySelector(':scope > div > button[aria-controls]');
        if (runDisclosure instanceof HTMLButtonElement) {
          if (runDisclosure.getAttribute('aria-expanded') === 'false') {
            runDisclosure.click();
            return;
          }
        }
        if (run.innerText.includes('Loading bounded native run tree…')) return;
        const stepButton = [...run.querySelectorAll('button[aria-controls]')]
          .find((button) => button.textContent?.includes(${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID)}));
        if (!(stepButton instanceof HTMLButtonElement)) return;
        if (stepButton.getAttribute('aria-expanded') === 'false') {
          stepButton.click();
          return;
        }
        const step = stepButton.parentElement;
        if (!(step instanceof HTMLElement) || step.innerText.includes('Loading step outputs and evidence references…')) return;
        const evidenceButton = [...step.querySelectorAll('button[aria-expanded]:not([aria-controls])')]
          .find((button) => button.textContent?.includes(${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME)}));
        if (!(evidenceButton instanceof HTMLButtonElement)) return;
        const evidence = evidenceButton.parentElement;
        if (!(evidence instanceof HTMLElement)) return;
        const text = evidence.innerText;
        const labels = [...evidenceButton.querySelectorAll(':scope > span')]
          .map((span) => span.textContent?.trim() ?? '');
        const identityElement = evidence.querySelector('[data-evidence-identity]');
        const identityAttribute = identityElement instanceof HTMLElement
          ? identityElement.getAttribute('data-evidence-identity')?.match(/^[0-9a-f]{12}$/)?.[0] ?? null
          : null;
        const visibleIdentity = identityElement?.querySelector('[aria-hidden="true"]');
        const identityPrefix = identityAttribute && visibleIdentity?.textContent?.trim() === 'id ' + identityAttribute
          ? identityAttribute
          : null;
        window.clearTimeout(deadline);
        observer.disconnect();
        resolve({
          exposed: true,
          stepId: ${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID)},
          evidenceName: ${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME)},
          evidenceId: ${JSON.stringify(sha256(Buffer.from(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH)))},
          displayedEvidenceIdPrefix: identityPrefix,
          kind: labels.at(-3) ?? null,
          provenance: labels.at(-2)?.replaceAll(' ', '_') ?? null,
          availability: labels.at(-1) ?? null,
          contentAbsentBeforeExpand: evidenceButton.getAttribute('aria-expanded') === 'false' && !text.includes('Plain-text preview'),
          runText: run.innerText.slice(0, 4000),
          runTextTruncated: run.innerText.length > 4000,
        });
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
      complete();
    })`,
    true,
  );
}

async function observeExpandedWorkflowEvidence(renderer, workflowRunSelector, context) {
  return renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(${JSON.stringify(`${context} did not render within 45000ms`)}));
      }, 45000);
      const complete = () => {
        const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
        if (!(run instanceof HTMLElement)) return;
        const runDisclosure = run.querySelector(':scope > div > button[aria-controls]');
        if (runDisclosure instanceof HTMLButtonElement && runDisclosure.getAttribute('aria-expanded') === 'false') {
          runDisclosure.click();
          return;
        }
        if (run.innerText.includes('Loading bounded native run tree…')) return;
        const stepButton = [...run.querySelectorAll('button[aria-controls]')]
          .find((button) => button.textContent?.includes(${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID)}));
        if (!(stepButton instanceof HTMLButtonElement)) return;
        if (stepButton.getAttribute('aria-expanded') === 'false') {
          stepButton.click();
          return;
        }
        const step = stepButton.parentElement;
        if (!(step instanceof HTMLElement) || step.innerText.includes('Loading step outputs and evidence references…')) return;
        const evidenceButton = [...step.querySelectorAll('button[aria-expanded]:not([aria-controls])')]
          .find((button) => button.textContent?.includes(${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME)}));
        if (!(evidenceButton instanceof HTMLButtonElement)) return;
        if (evidenceButton.getAttribute('aria-expanded') === 'false') {
          evidenceButton.click();
          return;
        }
        const evidence = evidenceButton.parentElement;
        if (!(evidence instanceof HTMLElement) || evidence.innerText.includes('Loading authorized evidence…')) return;
        const preview = evidence.querySelector('pre');
        if (!(preview instanceof HTMLElement) || !evidence.innerText.includes('Plain-text preview')) return;
        let content;
        try {
          content = JSON.parse(preview.textContent ?? '');
        } catch {
          content = null;
        }
        const text = evidence.innerText;
        const labels = [...evidenceButton.querySelectorAll(':scope > span')]
          .map((span) => span.textContent?.trim() ?? '');
        const identityElement = evidence.querySelector('[data-evidence-identity]');
        const identityAttribute = identityElement instanceof HTMLElement
          ? identityElement.getAttribute('data-evidence-identity')?.match(/^[0-9a-f]{12}$/)?.[0] ?? null
          : null;
        const visibleIdentity = identityElement?.querySelector('[aria-hidden="true"]');
        const identityPrefix = identityAttribute && visibleIdentity?.textContent?.trim() === 'id ' + identityAttribute
          ? identityAttribute
          : null;
        window.clearTimeout(deadline);
        observer.disconnect();
        resolve({
          expanded: true,
          contentState: 'text',
          stepId: ${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID)},
          evidenceName: ${JSON.stringify(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME)},
          evidenceId: ${JSON.stringify(sha256(Buffer.from(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH)))},
          displayedEvidenceIdPrefix: identityPrefix,
          expectedEvidenceId: ${JSON.stringify(sha256(Buffer.from(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH)))},
          kind: labels.at(-3) ?? null,
          provenance: labels.at(-2)?.replaceAll(' ', '_') ?? null,
          availability: labels.at(-1) ?? null,
          content,
          runText: run.innerText.slice(0, 4000),
          runTextTruncated: run.innerText.length > 4000,
        });
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
      complete();
    })`,
    true,
  );
}

async function observeActiveRightPanelSurface(renderer, expectedTitle, context) {
  const titleExpectation =
    typeof expectedTitle === "string" ? { exact: expectedTitle } : expectedTitle;
  return renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const titleExpectation = ${JSON.stringify(titleExpectation)};
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        const tabs = [...document.querySelectorAll('[data-right-panel-tab-list] [role="tab"]')]
          .slice(0, 12)
          .map((tab) => ({
            title: (tab.textContent?.trim() ?? '').slice(0, 120),
            selected: tab.getAttribute('aria-selected'),
          }));
        reject(new Error(
          ${JSON.stringify(`${context} did not render within 45000ms; bounded tabs: `)} +
          JSON.stringify(tabs)
        ));
      }, 45000);
      const complete = () => {
        const active = document.querySelector(
          '[data-right-panel-tab-list] [role="tab"][aria-selected="true"]'
        );
        if (!(active instanceof HTMLElement)) return;
        const title = active.textContent?.trim() ?? '';
        const titleMatches = typeof titleExpectation.exact === 'string'
          ? title === titleExpectation.exact
          : new RegExp(titleExpectation.pattern).test(title);
        if (!titleMatches) return;
        const panelId = active.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        if (!(panel instanceof HTMLElement) || panel.getClientRects().length === 0) return;
        window.clearTimeout(deadline);
        observer.disconnect();
        resolve({ title, panelVisible: true });
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
      complete();
    })`,
    true,
  );
}

async function interactWithVisibleMenu(
  renderer,
  { triggerSelector, requiredLabels, selectLabel = null, context },
) {
  const serializedReceipt = await renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const requiredLabels = ${JSON.stringify(requiredLabels)};
      const selectLabel = ${JSON.stringify(selectLabel)};
      const trigger = document.querySelector(${JSON.stringify(triggerSelector)});
      if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
        reject(new Error(${JSON.stringify(`${context} trigger missing`)}));
        return;
      }
      let closingPopup = null;
      let pendingResult = null;
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(${JSON.stringify(`${context} menu did not open and settle within 45000ms`)}));
      }, 45000);
      const complete = () => {
        if (closingPopup instanceof HTMLElement) {
          if (closingPopup.isConnected && closingPopup.getClientRects().length > 0) return;
          window.clearTimeout(deadline);
          observer.disconnect();
          resolve(JSON.stringify(pendingResult));
          return;
        }
        const popup = [...document.querySelectorAll('[data-slot="menu-popup"]')]
          .find((candidate) => {
            if (!(candidate instanceof HTMLElement) || candidate.getClientRects().length === 0) {
              return false;
            }
            const labels = [...candidate.querySelectorAll('[data-slot="menu-item"]')]
              .map((item) => item.textContent?.trim() ?? '');
            return requiredLabels.every((label) => labels.includes(label));
          });
        if (!(popup instanceof HTMLElement)) return;
        const items = [...popup.querySelectorAll('[data-slot="menu-item"]')]
          .map((item) => ({
            element: item,
            label: item.textContent?.trim() ?? '',
            disabled: item.matches('[data-disabled], [aria-disabled="true"]'),
          }))
          .filter(({ label }) => label.length > 0);
        const selected = selectLabel === null
          ? null
          : items.find(({ label }) => label === selectLabel);
        if (selectLabel !== null && (!selected || selected.disabled)) return;
        closingPopup = popup;
        pendingResult = {
          popupVisible: true,
          items: items
            .slice(0, 32)
            .map(({ label, disabled }) => ({ label: label.slice(0, 160), disabled })),
          selectedLabel: selected?.label.slice(0, 160) ?? null,
        };
        if (selected) {
          selected.element.click();
        } else {
          popup.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }));
        }
        complete();
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }));
      complete();
    })`,
    true,
  );
  if (typeof serializedReceipt !== "string") {
    throw new Error(`${context} menu returned a non-serialized receipt`);
  }
  return JSON.parse(serializedReceipt);
}

async function observeDocumentText(renderer, requiredTexts, context) {
  return renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const required = ${JSON.stringify(requiredTexts)};
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(${JSON.stringify(`${context} did not render within 45000ms`)}));
      }, 45000);
      const complete = () => {
        const body = document.body.innerText;
        if (!required.every((text) => body.includes(text))) return;
        window.clearTimeout(deadline);
        observer.disconnect();
        resolve(body);
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      complete();
    })`,
    true,
  );
}

async function observeWorkspaceContext(
  renderer,
  { tabSelector, sectionLabel, requiredTexts, expectedRunLabels, expectedRunCount, context },
) {
  return renderer.executeJavaScript(
    `new Promise((resolve, reject) => {
      const required = ${JSON.stringify(requiredTexts)}.map((text) => text.toLowerCase());
      const expectedLabels = ${JSON.stringify(expectedRunLabels)};
      let clicked = false;
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(${JSON.stringify(`${context} did not render within 45000ms`)}));
      }, 45000);
      const complete = () => {
        const tab = document.querySelector(${JSON.stringify(tabSelector)});
        if (!(tab instanceof HTMLElement)) return;
        if (!clicked && tab.getAttribute('aria-selected') !== 'true') {
          clicked = true;
          tab.click();
          return;
        }
        const section = document.querySelector(${JSON.stringify(`[aria-label="${sectionLabel}"]`)});
        if (!(section instanceof HTMLElement)) return;
        const text = section.innerText;
        if (!required.every((value) => text.toLowerCase().includes(value))) return;
        const runLabels = [...section.querySelectorAll('section[aria-label^="Workflow run "]')]
          .map((node) => node.getAttribute('aria-label'))
          .filter(Boolean);
        if (${JSON.stringify(expectedRunCount)} !== null && runLabels.length !== ${JSON.stringify(expectedRunCount)}) return;
        if (expectedLabels !== null && JSON.stringify(runLabels) !== JSON.stringify(expectedLabels)) return;
        window.clearTimeout(deadline);
        observer.disconnect();
        resolve({
          label: section.getAttribute('aria-label'),
          text: text.slice(0, 4000),
          textTruncated: text.length > 4000,
          runLabels,
          expandedButtons: section.querySelectorAll('button[aria-expanded="true"]').length,
          collapsedButtons: section.querySelectorAll('button[aria-expanded="false"]').length,
        });
      };
      const observer = new MutationObserver(complete);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
      complete();
    })`,
    true,
  );
}

async function addRightPanelSurface(
  renderer,
  label,
  { emptyState = false, expectedTitle = label } = {},
) {
  if (emptyState) {
    await renderer.executeJavaScript(
      `(() => {
        const trigger = (() => {
        const heading = [...document.querySelectorAll('h3')]
          .find((node) => node.textContent?.trim() === 'Open a surface');
        const chooser = heading?.parentElement?.parentElement;
        return chooser && [...chooser.querySelectorAll('button')]
          .find((candidate) => [...candidate.querySelectorAll('span')]
            .some((span) => span.textContent?.trim() === ${JSON.stringify(label)}));
        })();
        if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
          throw new Error(${JSON.stringify(`${label} surface trigger missing`)});
        }
        trigger.click();
      })()`,
      true,
    );
  } else {
    await interactWithVisibleMenu(renderer, {
      triggerSelector: '[aria-label="Add panel surface"]',
      requiredLabels: [label],
      selectLabel: label,
      context: `${label} surface`,
    });
  }
  return observeActiveRightPanelSurface(renderer, expectedTitle, `active ${label} surface`);
}

function boundedThreadSessionObservation(snapshot) {
  const session = snapshot?.thread?.session ?? null;
  return {
    snapshotSequence: snapshot?.snapshotSequence ?? null,
    session:
      session === null
        ? null
        : {
            status: session.status ?? null,
            providerName: session.providerName ?? null,
            providerInstanceId: session.providerInstanceId ?? null,
            runtimeMode: session.runtimeMode ?? null,
            activeTurnId: session.activeTurnId ?? null,
            hasLastError: typeof session.lastError === "string" && session.lastError.length > 0,
            updatedAt: session.updatedAt ?? null,
          },
  };
}

async function runElectronChild() {
  const { app, BrowserWindow, webContents } = await import("electron");
  const runtimeDirectory = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_RUNTIME_DIR;
  const backendPort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_BACKEND_PORT);
  const guestPort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_GUEST_PORT);
  const failurePort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_FAILURE_PORT);
  const responsesPort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_RESPONSES_PORT);
  const dogfoodRepository = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_REPOSITORY;
  const gitFixtureIdentityJson = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_GIT_FIXTURE_IDENTITY;
  const dogfoodCodexPath = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_PATH;
  const dogfoodCodexIdentityJson = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_IDENTITY;
  const orchestraCoreIdentityJson = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CORE_IDENTITY;
  const productIdentityJson = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_PRODUCT_IDENTITY;
  const sourceClean = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_SOURCE_CLEAN === "1";
  const buildReceiptsJson = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_BUILD_RECEIPTS;
  if (
    !runtimeDirectory ||
    !backendPort ||
    !guestPort ||
    !failurePort ||
    !responsesPort ||
    !dogfoodRepository ||
    !gitFixtureIdentityJson ||
    !dogfoodCodexPath ||
    !dogfoodCodexIdentityJson ||
    !orchestraCoreIdentityJson ||
    !productIdentityJson ||
    !buildReceiptsJson
  ) {
    throw new Error("native-shell child environment is incomplete");
  }
  const dogfoodCodexIdentity = JSON.parse(dogfoodCodexIdentityJson);
  const gitFixtureIdentity = JSON.parse(gitFixtureIdentityJson);
  const orchestraCoreIdentity = JSON.parse(orchestraCoreIdentityJson);
  const productIdentity = JSON.parse(productIdentityJson);
  const buildReceipts = JSON.parse(buildReceiptsJson);
  app.setPath("userData", NodePath.join(runtimeDirectory, "electron-user-data"));

  const guestOrigin = `http://127.0.0.1:${guestPort}`;
  const guestFixture = buildNativeGuestFixture(guestOrigin);
  const guestServer = NodeHttp.createServer((request, response) => {
    const path = new URL(request.url ?? "/", guestOrigin).pathname;
    const html = guestFixture.pages[path];
    if (!html) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    guestServer.once("error", reject);
    guestServer.listen(guestPort, "127.0.0.1", resolve);
  });

  const responsesRequestCounter = createNativeShellRequestCountWaiter();
  const responsesServer = NodeHttp.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${responsesPort}`);
    if (request.method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [] }));
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const matched = matchNativeDogfoodResponsesRequest(responsesRequestCounter.count, {
          method: request.method,
          pathname: url.pathname,
          contentEncoding: request.headers["content-encoding"],
          body: Buffer.concat(chunks),
        });
        responsesRequestCounter.increment();
        response.writeHead(matched.statusCode, matched.headers);
        response.end(matched.body);
      } catch (error) {
        responsesRequestCounter.fail(error);
        response.writeHead(error instanceof NativeDogfoodContractError ? error.statusCode : 500, {
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
  });
  await new Promise((resolve, reject) => {
    responsesServer.once("error", reject);
    responsesServer.listen(responsesPort, "127.0.0.1", resolve);
  });

  let manifestWritten = false;
  try {
    await import(NodeURL.pathToFileURL(mainBundle).href);
    const mainWindow = await waitFor(
      () =>
        BrowserWindow.getAllWindows().find(
          (candidate) =>
            !candidate.isDestroyed() && candidate.webContents.getURL() === "t3code://app/",
        ) ?? null,
      "production main window",
      45_000,
    );
    mainWindow.show();
    mainWindow.focus();
    const renderer = mainWindow.webContents;
    let attachmentObservation = null;
    let rejectedAttachmentObservation = null;
    renderer.on("will-attach-webview", (event, webPreferences, params) => {
      const observation = {
        partition: params.partition ?? null,
        attachmentGuardAllowed: event.defaultPrevented !== true,
        sandbox: webPreferences.sandbox === true,
        contextIsolation: webPreferences.contextIsolation === true,
        nodeIntegration: webPreferences.nodeIntegration === true,
        nodeIntegrationInSubFrames: webPreferences.nodeIntegrationInSubFrames === true,
      };
      if (params.partition === rejectedProbePartition) {
        rejectedAttachmentObservation = observation;
      } else {
        attachmentObservation = observation;
      }
    });
    await waitFor(
      () =>
        renderer.executeJavaScript(
          `document.readyState === "complete" && typeof window.desktopBridge?.getLocalEnvironmentBootstraps === "function"`,
          true,
        ),
      "production preload bridge",
    );
    await executeNativeShellRendererStep(
      renderer,
      `window.desktopBridge.setTheme("dark")`,
      "set native capture theme",
    );
    await executeNativeShellRendererStep(
      renderer,
      `(() => { const probe = document.createElement('webview'); probe.id = 'orchestra-rejected-webview-probe'; probe.setAttribute('partition', ${JSON.stringify(rejectedProbePartition)}); probe.setAttribute('src', 'data:text/html,guard-probe'); probe.style.display = 'none'; document.body.append(probe); })()`,
      "attach rejected webview guard probe",
    );
    rejectedAttachmentObservation = await waitFor(
      () => rejectedAttachmentObservation,
      "rejected production will-attach-webview probe",
    );
    await executeNativeShellRendererStep(
      renderer,
      `document.querySelector('#orchestra-rejected-webview-probe')?.remove()`,
      "remove rejected webview guard probe",
    );

    const bootstrap = await waitFor(
      async () => {
        const result = await renderer.executeJavaScript(
          `Promise.all([window.desktopBridge.getLocalEnvironmentBootstraps(), window.desktopBridge.getLocalEnvironmentBearerToken()]).then(([bootstraps, token]) => ({ bootstrap: bootstraps.find((entry) => entry.id === "primary") ?? bootstraps[0] ?? null, token }))`,
          true,
        );
        return result.bootstrap?.httpBaseUrl && result.token ? result : null;
      },
      "authenticated primary backend",
      45_000,
    );
    const now = new Date().toISOString();
    await dispatchCommand(bootstrap.bootstrap.httpBaseUrl, bootstrap.token, {
      type: "project.create",
      commandId: "cmd-native-project-create",
      projectId,
      title: projectTitle,
      workspaceRoot: dogfoodRepository,
      defaultModelSelection: { instanceId: "codex", model: "gpt-5.4" },
      createdAt: now,
    });
    await dispatchCommand(bootstrap.bootstrap.httpBaseUrl, bootstrap.token, {
      type: "thread.create",
      commandId: "cmd-native-thread-create",
      threadId,
      projectId,
      title: threadTitle,
      modelSelection: { instanceId: "codex", model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: now,
    });

    await waitFor(
      () =>
        renderer.executeJavaScript(
          `document.querySelector(${JSON.stringify(`[data-testid="thread-row-${threadId}"]`)}) !== null`,
          true,
        ),
      "native thread sidebar row",
    );
    await renderer.executeJavaScript(
      `document.querySelector(${JSON.stringify(`[data-testid="thread-row-${threadId}"]`)})?.click()`,
      true,
    );
    let nativeShell;
    try {
      nativeShell = await waitFor(
        () =>
          renderer
            .executeJavaScript(
              `(() => ({
            body: document.body.innerText,
            taskTabs: document.querySelector('[aria-label="Project tasks"]') !== null,
            composer: document.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"]') !== null
          }))()`,
              true,
            )
            .then((state) =>
              state.body.includes(projectTitle) &&
              state.body.includes(threadTitle) &&
              state.taskTabs &&
              state.composer
                ? state
                : null,
            ),
        "native project and task route",
      );
    } catch (error) {
      const diagnostic = await renderer.executeJavaScript(
        `({url:location.href,body:document.body.innerText,html:document.body.innerHTML.slice(0,4000)})`,
        true,
      );
      console.error("native route diagnostic", JSON.stringify(diagnostic));
      throw error;
    }

    const clickButtonByText = async (scopeSelector, label, context) => {
      const clicked = await waitFor(
        () =>
          renderer.executeJavaScript(
            `(() => {
              const scope = document.querySelector(${JSON.stringify(scopeSelector)});
              if (!(scope instanceof HTMLElement)) return false;
              const button = [...scope.querySelectorAll('button')].find(
                (candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)}
              );
              if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
              button.click();
              return true;
            })()`,
            true,
          ),
        `${context} button`,
        45_000,
      );
      if (!clicked) throw new Error(`${context}: enabled ${label} button missing`);
    };

    const nativeDogfoodObservation = {
      workflow: { waiting: null, completed: null, sameRun: false },
      attention: { waiting: null, completed: null },
      evidence: null,
      symphony: null,
      reload: null,
      restart: null,
    };

    const waitingTurnReceipt = await dispatchCommand(
      bootstrap.bootstrap.httpBaseUrl,
      bootstrap.token,
      {
        type: "thread.turn.start",
        commandId: "cmd-native-dogfood-turn-start",
        threadId,
        message: {
          messageId: "msg-native-dogfood-turn-start",
          role: "user",
          text: ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT,
          attachments: [],
        },
        modelSelection: { instanceId: "codex", model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    );
    if (!Number.isInteger(waitingTurnReceipt?.sequence)) {
      throw new Error("native dogfood waiting turn did not return a typed receipt sequence");
    }
    await responsesRequestCounter.waitFor(3, "native dogfood waiting workflow");
    const waitingAssistantEvent = await awaitNativeShellAssistantMessageEvent({
      baseUrl: bootstrap.bootstrap.httpBaseUrl,
      token: bootstrap.token,
      threadId,
      afterSequence: waitingTurnReceipt.sequence,
      text: "Native workflow is waiting for approval.",
    });
    const waitingWorkflow = await observeDocumentText(
      renderer,
      ["Orchestra workflow"],
      "native workflow waiting projection",
    );
    const waitingWorkflowView = await observeWorkspaceContext(renderer, {
      tabSelector: "#workspace-context-tab-workflow",
      sectionLabel: "Task Workflow Runs",
      requiredTexts: ["Waiting"],
      expectedRunLabels: null,
      expectedRunCount: 1,
      context: "rendered waiting native Run",
    });
    nativeDogfoodObservation.workflow.waiting = waitingWorkflowView;
    nativeDogfoodObservation.workflow.waitingEventSequence = waitingAssistantEvent.event.sequence;
    const waitingRunLabel = waitingWorkflowView.runLabels[0];
    const waitingRunId = waitingRunLabel.replace(/^Workflow run /, "");
    const waitingAttentionView = await observeWorkspaceContext(renderer, {
      tabSelector: "#workspace-context-tab-attention",
      sectionLabel: "Task attention",
      requiredTexts: ["approval"],
      expectedRunLabels: null,
      expectedRunCount: 0,
      context: "rendered approval attention state",
    });
    nativeDogfoodObservation.attention.waiting = waitingAttentionView;

    const completedTurnReceipt = await dispatchCommand(
      bootstrap.bootstrap.httpBaseUrl,
      bootstrap.token,
      {
        type: "thread.turn.start",
        commandId: "cmd-native-dogfood-resume",
        threadId,
        message: {
          messageId: "msg-native-dogfood-resume",
          role: "user",
          text: ORCHESTRA_NATIVE_DOGFOOD_RESUME_PROMPT,
          attachments: [],
        },
        modelSelection: { instanceId: "codex", model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    );
    if (!Number.isInteger(completedTurnReceipt?.sequence)) {
      throw new Error("native dogfood completed turn did not return a typed receipt sequence");
    }
    await responsesRequestCounter.waitFor(
      ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT,
      "native dogfood completed workflow",
    );
    assertNativeDogfoodResponsesComplete(responsesRequestCounter.count);
    const completedAssistantEvent = await awaitNativeShellAssistantMessageEvent({
      baseUrl: bootstrap.bootstrap.httpBaseUrl,
      token: bootstrap.token,
      threadId,
      afterSequence: completedTurnReceipt.sequence,
      text: ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT,
    });
    const completedWorkflow = await observeDocumentText(
      renderer,
      [ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT],
      "native workflow completed projection",
    );
    const completedWorkflowView = await observeWorkspaceContext(renderer, {
      tabSelector: "#workspace-context-tab-workflow",
      sectionLabel: "Task Workflow Runs",
      requiredTexts: ["Completed"],
      expectedRunLabels: [waitingRunLabel],
      expectedRunCount: 1,
      context: "same rendered native Run after completion",
    });
    nativeDogfoodObservation.workflow.completed = completedWorkflowView;
    nativeDogfoodObservation.workflow.completedEventSequence =
      completedAssistantEvent.event.sequence;
    nativeDogfoodObservation.workflow.sameRun =
      completedWorkflowView.runLabels.length === 1 &&
      completedWorkflowView.runLabels[0] === waitingRunLabel;

    const workflowRunSelector = `[aria-label=${JSON.stringify(waitingRunLabel)}]`;
    const evidenceBefore = await observeNativeGitCheckEvidenceReference(
      renderer,
      workflowRunSelector,
      "native git check Evidence reference",
    );
    if (!isNativeGitCheckEvidenceReferenceObservation(evidenceBefore)) {
      throw new Error(
        `native workflow returned the wrong collapsed git check Evidence: ${JSON.stringify(evidenceBefore)}`,
      );
    }
    const evidenceAfter = await observeExpandedWorkflowEvidence(
      renderer,
      workflowRunSelector,
      "authorized native git check Evidence expansion",
    );
    if (!isNativeGitCheckEvidenceObservation(evidenceAfter)) {
      throw new Error(
        `native workflow returned the wrong git check Evidence: ${JSON.stringify(evidenceAfter)}`,
      );
    }
    nativeDogfoodObservation.evidence = { before: evidenceBefore, after: evidenceAfter };

    const completedAttentionView = await observeWorkspaceContext(renderer, {
      tabSelector: "#workspace-context-tab-attention",
      sectionLabel: "Task attention",
      requiredTexts: [
        "No items need intervention",
        "approvals, gates, effects, reconciliation, and provider state are clear",
      ],
      expectedRunLabels: null,
      expectedRunCount: 0,
      context: "rendered cleared attention state",
    });
    nativeDogfoodObservation.attention.completed = completedAttentionView;

    await renderer.executeJavaScript(
      `(() => {
        const button = document.querySelector('[aria-label="Symphony automation"]');
        if (!(button instanceof HTMLButtonElement)) throw new Error('Symphony automation opener missing');
        button.click();
      })()`,
      true,
    );
    const symphonySelector = '[aria-label="Symphony automation workspace"]';
    await waitFor(
      () =>
        renderer.executeJavaScript(
          `document.querySelector(${JSON.stringify(symphonySelector)}) !== null`,
          true,
        ),
      "production Symphony workspace",
    );
    await clickButtonByText(symphonySelector, "Validate and preview", "Symphony validation");
    const symphonyValidationResult = await waitFor(
      () =>
        renderer.executeJavaScript(
          `(() => {
            const workspace = document.querySelector(${JSON.stringify(symphonySelector)});
            if (!(workspace instanceof HTMLElement)) return null;
            const text = workspace.innerText;
            const valid = text.includes('Profile is valid');
            const invalid = text.includes('Profile needs changes') || workspace.querySelector('[role="alert"]') !== null;
            return valid || invalid
              ? { valid, profilePath: document.querySelector('#automation-profile-path')?.value ?? null, text: text.slice(0, 4000), textTruncated: text.length > 4000 }
              : null;
          })()`,
          true,
        ),
      "production Symphony profile validation",
      45_000,
    );
    if (!symphonyValidationResult.valid) {
      throw new Error(
        `production Symphony profile validation failed: ${JSON.stringify(symphonyValidationResult)}`,
      );
    }
    const symphonyValidation = symphonyValidationResult;
    await clickButtonByText(symphonySelector, "Start automation", "Symphony start");
    const missingCredential = buildNativeDogfoodFixtures(
      `http://127.0.0.1:${responsesPort}`,
    ).missingCredentialEnvironmentVariable;
    const symphonyStartResult = await waitFor(
      () =>
        renderer.executeJavaScript(
          `(() => {
            const workspace = document.querySelector(${JSON.stringify(symphonySelector)});
            const root = workspace?.querySelector('[aria-label="Automation root status"]');
            if (!(workspace instanceof HTMLElement)) return null;
            const alert = workspace.querySelector('[role="alert"]');
            if (!(root instanceof HTMLElement) && !(alert instanceof HTMLElement)) return null;
            const rootText = root instanceof HTMLElement ? root.innerText : '';
            const workspaceText = workspace.innerText;
            const runId = root instanceof HTMLElement ? [...root.querySelectorAll('code')]
              .map((node) => node.textContent?.trim() ?? '')
              .find((value) => value.startsWith('automation-')) ?? null : null;
            return {
              alert: alert instanceof HTMLElement ? alert.innerText.slice(0, 2000) : null,
              issueRowCount: workspace.querySelectorAll('tbody tr').length,
              runId,
              text: rootText.slice(0, 4000),
              textTruncated: rootText.length > 4000,
              workspaceText: workspaceText.slice(0, 4000),
            };
          })()`,
          true,
        ),
      "production Symphony start result",
      60_000,
    );
    if (!symphonyStartResult.runId) {
      throw new Error(`production Symphony start failed: ${JSON.stringify(symphonyStartResult)}`);
    }
    const symphonyStarted = symphonyStartResult;
    if (
      !symphonyStarted.text.toLowerCase().includes("skipped") ||
      !symphonyValidation.text.includes(missingCredential)
    ) {
      throw new Error(
        `Symphony root did not prove skipped missing-credential intake: ${JSON.stringify({
          validation: symphonyValidation,
          root: symphonyStarted,
        })}`,
      );
    }
    const inspectAvailable = await renderer.executeJavaScript(
      `(() => {
        const workspace = document.querySelector(${JSON.stringify(symphonySelector)});
        return workspace instanceof HTMLElement && [...workspace.querySelectorAll('button')]
          .some((button) => button.textContent?.trim() === 'Inspect' && !button.disabled);
      })()`,
      true,
    );
    let symphonyInspected = null;
    if (inspectAvailable) {
      await clickButtonByText(symphonySelector, "Inspect", "Symphony root inspection");
      symphonyInspected = await observeSymphonyRoot(
        renderer,
        symphonyStarted.runId,
        "same Symphony root after native inspection",
      );
    }
    nativeDogfoodObservation.symphony = {
      validation: symphonyValidation,
      started: symphonyStarted,
      inspected: symphonyInspected,
      sameRootAfterInspect: isUniqueNativeSymphonyInspection(symphonyStarted, symphonyInspected),
      issueChildFabricated: symphonyStarted.issueRowCount !== 0,
    };
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Close Symphony workspace"]')?.click()`,
      true,
    );

    renderer.reload();
    await new Promise((resolve) => renderer.once("did-finish-load", resolve));
    const reloadState = await waitFor(
      () =>
        renderer
          .executeJavaScript(
            `(() => ({body: document.body.innerText, hash: window.location.hash, bridge: typeof window.desktopBridge?.preview?.navigate === "function"}))()`,
            true,
          )
          .then((state) =>
            state.body.includes(projectTitle) && state.body.includes(threadTitle) ? state : null,
          ),
      "native route after renderer reload",
    );
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Dismiss notification"]')?.click()`,
      true,
    );
    const reloadWorkflowView = await observeWorkspaceContext(renderer, {
      tabSelector: "#workspace-context-tab-workflow",
      sectionLabel: "Task Workflow Runs",
      requiredTexts: ["Completed"],
      expectedRunLabels: [waitingRunLabel],
      expectedRunCount: 1,
      context: "same native Run after renderer reload",
    });
    const reloadEvidence = await observeExpandedWorkflowEvidence(
      renderer,
      workflowRunSelector,
      "expanded native Evidence after renderer reload",
    );
    if (!isNativeGitCheckEvidenceObservation(reloadEvidence)) {
      throw new Error(
        `renderer reload returned the wrong git check Evidence: ${JSON.stringify(reloadEvidence)}`,
      );
    }
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Symphony automation"]')?.click()`,
      true,
    );
    const reloadSymphonyRoot = await observeSymphonyRoot(
      renderer,
      symphonyStarted.runId,
      "same Symphony root after renderer reload",
    );
    nativeDogfoodObservation.reload = {
      workflow: reloadWorkflowView,
      evidence: reloadEvidence,
      symphony: reloadSymphonyRoot,
      sameWorkflowRun: reloadWorkflowView.runLabels[0] === waitingRunLabel,
      sameSymphonyRoot:
        reloadSymphonyRoot.runId === symphonyStarted.runId &&
        reloadSymphonyRoot.instanceCount === 1 &&
        reloadSymphonyRoot.totalRootCount === 1,
    };

    const providerStopCommand = {
      type: "thread.session.stop",
      commandId: "cmd-native-provider-restart-stop",
      threadId,
      createdAt: new Date().toISOString(),
    };
    const providerStopReceipt = await dispatchCommand(
      bootstrap.bootstrap.httpBaseUrl,
      bootstrap.token,
      providerStopCommand,
    );
    if (!Number.isInteger(providerStopReceipt?.sequence)) {
      throw new Error("provider stop did not return a typed receipt sequence");
    }
    const stoppedSessionEvent = await awaitNativeShellSessionEvent({
      baseUrl: bootstrap.bootstrap.httpBaseUrl,
      token: bootstrap.token,
      threadId,
      afterSequence: providerStopReceipt.sequence,
      status: "stopped",
    });
    const stoppedThreadSnapshot = await fetchThreadSnapshot(
      bootstrap.bootstrap.httpBaseUrl,
      bootstrap.token,
      threadId,
    );
    const stoppedThreadSession = boundedThreadSessionObservation(stoppedThreadSnapshot);
    if (stoppedThreadSession.session?.status !== "stopped") {
      throw new Error("typed stopped event did not agree with the bounded thread snapshot");
    }
    assertNativeDogfoodResponsesComplete(responsesRequestCounter.count);

    await clickButtonByText(symphonySelector, "Inspect", "Symphony recovery after provider stop");
    const readySessionEvent = await awaitNativeShellSessionEvent({
      baseUrl: bootstrap.bootstrap.httpBaseUrl,
      token: bootstrap.token,
      threadId,
      afterSequence: stoppedSessionEvent.event.sequence,
      status: "ready",
    });
    const readyThreadSnapshot = await fetchThreadSnapshot(
      bootstrap.bootstrap.httpBaseUrl,
      bootstrap.token,
      threadId,
    );
    const readyThreadSession = boundedThreadSessionObservation(readyThreadSnapshot);
    if (readyThreadSession.session?.status !== "ready") {
      throw new Error("typed ready event did not agree with the bounded thread snapshot");
    }
    const typedSymphonyStatus = await readNativeShellAutomationStatus({
      baseUrl: bootstrap.bootstrap.httpBaseUrl,
      token: bootstrap.token,
      threadId,
      runId: symphonyStarted.runId,
    });
    if (
      typedSymphonyStatus.run?.runId !== symphonyStarted.runId ||
      typedSymphonyStatus.run.status !== "running"
    ) {
      throw new Error(
        `typed Symphony recovery returned the wrong root: ${JSON.stringify(typedSymphonyStatus)}`,
      );
    }
    const restartSymphonyRoot = await observeSymphonyRoot(
      renderer,
      symphonyStarted.runId,
      "same Symphony root after provider restart",
    );
    const restartWorkflowView = await observeWorkspaceContext(renderer, {
      tabSelector: "#workspace-context-tab-workflow",
      sectionLabel: "Task Workflow Runs",
      requiredTexts: ["Completed"],
      expectedRunLabels: [waitingRunLabel],
      expectedRunCount: 1,
      context: "same native Run after provider restart",
    });
    const restartEvidence = await observeExpandedWorkflowEvidence(
      renderer,
      workflowRunSelector,
      "expanded native Evidence after provider restart",
    );
    if (!isNativeGitCheckEvidenceObservation(restartEvidence)) {
      throw new Error(
        `provider restart returned the wrong git check Evidence: ${JSON.stringify(restartEvidence)}`,
      );
    }
    assertNativeDogfoodResponsesComplete(responsesRequestCounter.count);
    nativeDogfoodObservation.restart = {
      stop: {
        command: {
          type: providerStopCommand.type,
          commandId: providerStopCommand.commandId,
          threadId: providerStopCommand.threadId,
        },
        receiptSequence: providerStopReceipt?.sequence ?? null,
        sessionEventSequence: stoppedSessionEvent.event.sequence,
        thread: stoppedThreadSession,
        responsesRequestCount: responsesRequestCounter.count,
      },
      recovery: {
        trigger: "Symphony Inspect / automation.status",
        sessionEventSequence: readySessionEvent.event.sequence,
        thread: readyThreadSession,
        typedSymphonyStatus: {
          runId: typedSymphonyStatus.run.runId,
          status: typedSymphonyStatus.run.status,
        },
        workflow: restartWorkflowView,
        evidence: restartEvidence,
        symphony: restartSymphonyRoot,
        responsesRequestCount: responsesRequestCounter.count,
      },
      sameWorkflowRun: restartWorkflowView.runLabels[0] === `Workflow run ${waitingRunId}`,
      sameSymphonyRoot:
        restartSymphonyRoot.runId === symphonyStarted.runId &&
        restartSymphonyRoot.instanceCount === 1 &&
        restartSymphonyRoot.totalRootCount === 1,
      sameSymphonyStatus: restartSymphonyRoot.status === "running",
    };
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Close Symphony workspace"]')?.click()`,
      true,
    );

    const retainedDesktopCapabilities = {
      workspace: await renderer.executeJavaScript(
        `(() => {
          const body = document.body.innerText;
          const branchControl = [...document.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Local checkout'));
          return {
            projectVisible: body.includes(${JSON.stringify(projectTitle)}),
            taskVisible: body.includes(${JSON.stringify(threadTitle)}),
            localCheckoutVisible: body.includes('Local checkout'),
            branchControl: branchControl?.textContent?.trim() ?? null,
            contextTabs: ['Workflow', 'Attention'].filter((label) =>
              [...document.querySelectorAll('[role="tab"]')]
                .some((tab) => tab.textContent?.trim() === label)),
          };
        })()`,
        true,
      ),
      context: {
        workflowRunId: waitingRunId,
        attentionResolved:
          nativeDogfoodObservation.attention.completed?.text.includes(
            "No items need intervention",
          ) === true,
      },
      modelPicker: null,
      settings: null,
      vcs: null,
      surfaces: {},
      mutations: { commit: "unobserved", push: "unobserved" },
    };

    retainedDesktopCapabilities.modelPicker = await renderer.executeJavaScript(
      `new Promise((resolve, reject) => {
        const trigger = document.querySelector('[data-chat-provider-model-picker="true"]');
        if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
          reject(new Error('model picker trigger missing'));
          return;
        }
        const deadline = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('model picker content did not render within 45000ms'));
        }, 45000);
        const complete = () => {
          const content = document.querySelector('[data-model-picker-content]');
          if (!(content instanceof HTMLElement)) return;
          window.clearTimeout(deadline);
          observer.disconnect();
          const text = content.innerText;
          resolve({ trigger: trigger.textContent?.trim() ?? '', text: text.slice(0, 2000) });
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        };
        const observer = new MutationObserver(complete);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        trigger.click();
        complete();
      })`,
      true,
    );

    retainedDesktopCapabilities.settings = await renderer.executeJavaScript(
      `new Promise((resolve, reject) => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.trim() === 'Settings');
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          reject(new Error('Settings navigation button missing'));
          return;
        }
        const deadline = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('Settings route did not render within 45000ms'));
        }, 45000);
        const complete = () => {
          if (!location.hash.includes('/settings') || !document.body.innerText.includes('General')) return;
          window.clearTimeout(deadline);
          observer.disconnect();
          resolve({ hash: location.hash, generalVisible: true });
        };
        const observer = new MutationObserver(complete);
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        button.click();
        complete();
      })`,
      true,
    );
    await renderer.executeJavaScript(
      `new Promise((resolve, reject) => {
        const deadline = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('task route did not recover after Settings within 45000ms'));
        }, 45000);
        const complete = () => {
          if (!location.hash.includes(${JSON.stringify(threadId)}) || !document.body.innerText.includes(${JSON.stringify(threadTitle)})) return;
          window.clearTimeout(deadline);
          observer.disconnect();
          resolve(true);
        };
        const observer = new MutationObserver(complete);
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        history.back();
        complete();
      })`,
      true,
    );

    const retainedVcsMenu = await interactWithVisibleMenu(renderer, {
      triggerSelector: '[aria-label="Git action options"]',
      requiredLabels: ["Commit", "Push"],
      context: "Git action",
    });
    retainedDesktopCapabilities.vcs = {
      ...retainedVcsMenu,
      fixtureRemote: gitFixtureIdentity,
    };
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Toggle right panel"]')?.click()`,
      true,
    );
    await waitFor(
      () => renderer.executeJavaScript(`document.body.innerText.includes("Open a surface")`, true),
      "right panel empty state",
    );
    retainedDesktopCapabilities.surfaces.Files = await addRightPanelSurface(renderer, "Files", {
      emptyState: true,
    });
    retainedDesktopCapabilities.surfaces.Terminal = await addRightPanelSurface(
      renderer,
      "Terminal",
      {
        expectedTitle: { pattern: ORCHESTRA_NATIVE_SHELL_TERMINAL_TITLE_PATTERN },
      },
    );
    retainedDesktopCapabilities.surfaces.Browser = await addRightPanelSurface(renderer, "Browser");
    const webviewState = await waitFor(
      () =>
        renderer
          .executeJavaScript(
            `(() => { const guest = document.querySelector('webview[data-preview-tab]'); if (!guest) return null; let id = 0; try { id = guest.getWebContentsId(); } catch {} return { id, tabId: guest.getAttribute('data-preview-tab'), partition: guest.getAttribute('partition') }; })()`,
            true,
          )
          .then((state) => (state?.id > 0 && state.tabId ? state : null)),
      "real preview webview",
    );
    const guestContents = webContents.fromId(webviewState.id);
    if (!guestContents || guestContents.getType() !== "webview") {
      throw new Error("preview guest did not resolve to an Electron webview webContents");
    }
    attachmentObservation = await waitFor(
      () => attachmentObservation,
      "production will-attach-webview observation",
    );

    const navigateAddress = async (url) => {
      await renderer.executeJavaScript(
        `(() => { const input = document.querySelector('[data-preview-url-input]'); if (!(input instanceof HTMLInputElement)) throw new Error('preview URL input missing'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter.call(input, ${JSON.stringify(url)}); input.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:'x'})); input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true})); })()`,
        true,
      );
    };
    const guestEvaluate = (expression) =>
      renderer.executeJavaScript(
        `window.desktopBridge.preview.automation.evaluate(${JSON.stringify(webviewState.tabId)}, {expression:${JSON.stringify(expression)}})`,
        true,
      );
    const guestSnapshotExpression = `({
      title: document.title,
      href: location.href,
      heading: document.querySelector('h1')?.textContent ?? null,
      identity: document.querySelector('#identity')?.textContent ?? null,
      mutation: document.querySelector('#mutation')?.textContent ?? null,
      loadCount: Number(document.documentElement.dataset.loadCount ?? 0),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      nodeType: typeof process,
      requireType: typeof require
    })`;
    const waitGuestPage = ({ title, heading, identity }) =>
      waitFor(
        () =>
          guestEvaluate(guestSnapshotExpression).then((result) =>
            result.title === title && result.heading === heading && result.identity === identity
              ? result
              : null,
          ),
        `guest page ${title}`,
      );
    const pageAContract = {
      title: "Native Guest A",
      heading: "Native guest page A",
      identity: "deterministic-native-guest-a",
    };
    const pageBContract = {
      title: "Native Guest B",
      heading: "Native guest page B",
      identity: "deterministic-native-guest-b",
    };
    const navigation = [];

    await navigateAddress(`${guestOrigin}/a`);
    const pageA = await waitGuestPage(pageAContract);
    navigation.push({
      action: "navigate-page-a",
      expected: pageAContract,
      observed: pageA,
      passed: true,
    });
    await renderer.executeJavaScript(
      `window.desktopBridge.preview.automation.click(${JSON.stringify(webviewState.tabId)}, {selector:'#mutate'})`,
      true,
    );
    const guestSecurity = await guestEvaluate(guestSnapshotExpression);
    await renderer.executeJavaScript(
      `window.desktopBridge.preview.automation.click(${JSON.stringify(webviewState.tabId)}, {selector:'#history-link'})`,
      true,
    );
    const pageB = await waitGuestPage(pageBContract);
    navigation.push({
      action: "navigate-page-b",
      expected: pageBContract,
      observed: pageB,
      passed: true,
    });
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Back"]')?.click()`,
      true,
    );
    const backToA = await waitGuestPage(pageAContract);
    navigation.push({
      action: "back",
      expected: pageAContract,
      observed: backToA,
      passed: true,
    });
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Forward"]')?.click()`,
      true,
    );
    const forwardToB = await waitGuestPage(pageBContract);
    navigation.push({
      action: "forward",
      expected: pageBContract,
      observed: forwardToB,
      passed: true,
    });
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Back"]')?.click()`,
      true,
    );
    await waitGuestPage(pageAContract);
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Refresh"]')?.click()`,
      true,
    );
    const reloadedA = await waitFor(
      () =>
        guestEvaluate(guestSnapshotExpression).then((result) =>
          result.title === pageAContract.title && result.loadCount >= 2 ? result : null,
        ),
      "guest reload count",
    );
    navigation.push({
      action: "reload",
      expected: { ...pageAContract, minimumLoadCount: 2 },
      observed: reloadedA,
      passed: true,
    });
    await renderer.executeJavaScript(
      `window.desktopBridge.preview.automation.click(${JSON.stringify(webviewState.tabId)}, {selector:'#mutate'})`,
      true,
    );
    const mutation = await guestEvaluate(`document.querySelector('#mutation')?.textContent`);
    const guestArtifact = await renderer.executeJavaScript(
      `window.desktopBridge.preview.captureScreenshot(${JSON.stringify(webviewState.tabId)})`,
      true,
    );
    const guestArtifactBytes = await NodeFSP.readFile(guestArtifact.path);

    await navigateAddress(`http://127.0.0.1:${failurePort}/unreachable`);
    const failureSurfaceVisible = await waitFor(
      () =>
        renderer.executeJavaScript(
          `document.body.innerText.includes("This site can’t be reached") || document.body.innerText.includes("This site can't be reached")`,
          true,
        ),
      "guest failure surface",
    );
    const failureObservation = {
      requestedUrl: `http://127.0.0.1:${failurePort}/unreachable`,
      guestUrl: guestContents.getURL(),
      rendererFailureVisible: failureSurfaceVisible,
    };
    navigation.push({
      action: "load-failure",
      expected: { rendererFailureVisible: true },
      observed: failureObservation,
      passed: true,
    });
    await navigateAddress(`${guestOrigin}/a`);
    const recoveredA = await waitGuestPage(pageAContract);
    navigation.push({
      action: "recover-page-a",
      expected: pageAContract,
      observed: recoveredA,
      passed: true,
    });

    const assertions = Object.fromEntries(
      requiredAssertionNames.map((name) => [name, makeNativeShellAssertion(null, false)]),
    );
    Object.assign(assertions, {
      backendReady: makeNativeShellAssertion(bootstrap.bootstrap.httpBaseUrl),
      productionMainLoaded: makeNativeShellAssertion(
        renderer.getURL(),
        renderer.getURL() === "t3code://app/" || renderer.getURL().startsWith("t3code://app/#"),
      ),
      productionPreloadBridge: makeNativeShellAssertion(reloadState.bridge),
      nativeProjectVisible: makeNativeShellAssertion(
        projectTitle,
        nativeShell.body.includes(projectTitle),
      ),
      nativeTaskVisible: makeNativeShellAssertion(
        threadTitle,
        nativeShell.body.includes(threadTitle),
      ),
      nativeRouteRecoveredAfterReload: makeNativeShellAssertion(
        {
          hash: reloadState.hash,
          titleVisible: reloadState.body.includes(threadTitle),
        },
        reloadState.hash.includes(threadId) && reloadState.body.includes(threadTitle),
      ),
      nativeDogfoodResponsesExact: makeNativeShellAssertion(
        { requestCount: responsesRequestCounter.count },
        isExactNativeDogfoodResponseCount(responsesRequestCounter.count),
      ),
      currentCodexForkRecorded: makeNativeShellAssertion(
        dogfoodCodexIdentity,
        dogfoodCodexIdentity.repository === "edgefloor/orchestra-codex" &&
          /^[0-9a-f]{40}$/.test(dogfoodCodexIdentity.commit) &&
          /^[0-9a-f]{40}$/.test(dogfoodCodexIdentity.tree) &&
          /^[0-9a-f]{64}$/.test(dogfoodCodexIdentity.binarySha256),
      ),
      nativeChildProjected: makeNativeShellAssertion(
        nativeDogfoodObservation.evidence?.after,
        nativeDogfoodObservation.evidence?.after?.runText.includes("Child /root/") === true &&
          nativeDogfoodObservation.evidence.after.runText.includes("deterministic native child"),
      ),
      nativeWorkflowLifecycleRendered: makeNativeShellAssertion(
        nativeDogfoodObservation.workflow,
        isNativeWorkflowLifecycleObservation(nativeDogfoodObservation.workflow),
      ),
      nativeAttentionResolved: makeNativeShellAssertion(
        nativeDogfoodObservation.attention,
        nativeDogfoodObservation.attention.waiting?.text.includes("approval") === true &&
          nativeDogfoodObservation.attention.completed?.text.includes(
            "No items need intervention",
          ) === true,
      ),
      nativeEvidenceLazyExpanded: makeNativeShellAssertion(
        nativeDogfoodObservation.evidence,
        isNativeGitCheckEvidenceReferenceObservation(nativeDogfoodObservation.evidence?.before) &&
          isNativeEvidenceObservation(nativeDogfoodObservation.evidence) &&
          isNativeGitCheckEvidenceObservation(nativeDogfoodObservation.evidence?.after),
      ),
      nativeSymphonySkippedIntake: makeNativeShellAssertion(
        nativeDogfoodObservation.symphony,
        nativeDogfoodObservation.symphony?.validation?.valid === true &&
          nativeDogfoodObservation.symphony.validation.text.includes(missingCredential) &&
          nativeDogfoodObservation.symphony.started?.text.includes("running") &&
          nativeDogfoodObservation.symphony.started.text.toLowerCase().includes("skipped") &&
          nativeDogfoodObservation.symphony.started.issueRowCount === 0 &&
          nativeDogfoodObservation.symphony.issueChildFabricated === false,
      ),
      nativeDogfoodIdentityRecovered: makeNativeShellAssertion(
        {
          workflow: nativeDogfoodObservation.workflow,
          symphony: nativeDogfoodObservation.symphony,
          reload: nativeDogfoodObservation.reload,
        },
        nativeDogfoodObservation.symphony?.sameRootAfterInspect === true &&
          nativeDogfoodObservation.reload?.sameWorkflowRun === true &&
          nativeDogfoodObservation.reload.sameSymphonyRoot === true &&
          isNativeGitCheckEvidenceObservation(nativeDogfoodObservation.reload.evidence),
      ),
      nativeDogfoodProviderRestartRecovered: makeNativeShellAssertion(
        nativeDogfoodObservation.restart,
        nativeDogfoodObservation.restart?.stop.thread.session?.status === "stopped" &&
          isExactNativeDogfoodResponseCount(
            nativeDogfoodObservation.restart.stop.responsesRequestCount,
          ) &&
          nativeDogfoodObservation.restart.recovery.thread.session?.status === "ready" &&
          isExactNativeDogfoodResponseCount(
            nativeDogfoodObservation.restart.recovery.responsesRequestCount,
          ) &&
          nativeDogfoodObservation.restart.recovery.typedSymphonyStatus?.runId ===
            nativeDogfoodObservation.restart.recovery.symphony.runId &&
          nativeDogfoodObservation.restart.recovery.typedSymphonyStatus.status === "running" &&
          isNativeGitCheckEvidenceObservation(nativeDogfoodObservation.restart.recovery.evidence) &&
          nativeDogfoodObservation.restart.sameWorkflowRun === true &&
          nativeDogfoodObservation.restart.sameSymphonyRoot === true &&
          nativeDogfoodObservation.restart.sameSymphonyStatus === true,
      ),
      composerVisible: makeNativeShellAssertion(nativeShell.composer),
      taskTabsVisible: makeNativeShellAssertion(nativeShell.taskTabs),
      realWebviewAttached: makeNativeShellAssertion(
        { type: guestContents.getType(), webContentsId: webviewState.id },
        guestContents.getType() === "webview" && webviewState.id > 0,
      ),
      approvedPreviewPartition: makeNativeShellAssertion(
        webviewState.partition,
        typeof webviewState.partition === "string" &&
          webviewState.partition.startsWith("persist:t3code-preview-"),
      ),
      attachmentGuardAllowed: makeNativeShellAssertion(
        attachmentObservation,
        attachmentObservation.attachmentGuardAllowed === true &&
          attachmentObservation.partition === webviewState.partition,
      ),
      attachmentGuardRejectedInvalidPartition: makeNativeShellAssertion(
        rejectedAttachmentObservation,
        rejectedAttachmentObservation.attachmentGuardAllowed === false &&
          rejectedAttachmentObservation.partition === rejectedProbePartition,
      ),
      guestSandboxEnabled: makeNativeShellAssertion(
        attachmentObservation.sandbox,
        attachmentObservation.sandbox === true,
      ),
      guestContextIsolationDisabled: makeNativeShellAssertion(
        attachmentObservation.contextIsolation,
        attachmentObservation.contextIsolation === false,
      ),
      guestNodeIntegrationDisabled: makeNativeShellAssertion(
        attachmentObservation.nodeIntegration,
        attachmentObservation.nodeIntegration === false,
      ),
      guestNodeIntegrationInSubFramesDisabled: makeNativeShellAssertion(
        attachmentObservation.nodeIntegrationInSubFrames,
        attachmentObservation.nodeIntegrationInSubFrames === false,
      ),
      guestPageALoaded: makeNativeShellAssertion(pageA, pageA.href === `${guestOrigin}/a`),
      guestPageBLoaded: makeNativeShellAssertion(pageB, pageB.href === `${guestOrigin}/b`),
      guestBackWorked: makeNativeShellAssertion(backToA, backToA.href === `${guestOrigin}/a`),
      guestForwardWorked: makeNativeShellAssertion(
        forwardToB,
        forwardToB.href === `${guestOrigin}/b`,
      ),
      guestReloadWorked: makeNativeShellAssertion(reloadedA, reloadedA.loadCount >= 2),
      guestFailureSurfaced: makeNativeShellAssertion(
        failureObservation,
        failureSurfaceVisible === true,
      ),
      guestRecovered: makeNativeShellAssertion(recoveredA, recoveredA.href === `${guestOrigin}/a`),
      guestDomMutationWorked: makeNativeShellAssertion(
        mutation,
        mutation === "mutated-through-production-automation",
      ),
      guestScreenshotCaptured: makeNativeShellAssertion(
        {
          mimeType: guestArtifact.mimeType,
          declaredSizeBytes: guestArtifact.sizeBytes,
          observedSizeBytes: guestArtifactBytes.length,
        },
        guestArtifact.mimeType === "image/png" &&
          guestArtifact.sizeBytes === guestArtifactBytes.length &&
          guestArtifactBytes.length > 100,
      ),
      processCleanupVerified: makeNativeShellAssertion({ status: "pending-parent-check" }, false),
    });
    if (guestSecurity.nodeType !== "undefined" || guestSecurity.requireType !== "undefined") {
      throw new Error("real guest unexpectedly exposed Node globals");
    }

    await NodeFSP.mkdir(evidenceDirectory, { recursive: true });
    const screenshots = [];
    let everyScenarioAvoidsHorizontalOverflow = true;
    const narrowDrawerObservations = [];
    let narrowSurfaceActivated = false;
    for (const scenario of screenshotScenarios) {
      mainWindow.setContentSize(scenario.width, scenario.height, false);
      mainWindow.show();
      mainWindow.focus();
      await waitFor(
        () =>
          renderer.executeJavaScript(
            `window.innerWidth === ${scenario.width} && window.innerHeight === ${scenario.height}`,
            true,
          ),
        `viewport ${scenario.width}x${scenario.height}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      await renderer.executeJavaScript(
        `window.desktopBridge.setTheme(${JSON.stringify(scenario.theme)})`,
        true,
      );
      if (scenario.drawerOpen) {
        if (!narrowSurfaceActivated) {
          await renderer.executeJavaScript(
            `(() => {
              const button = document.querySelector('[aria-label="Add panel surface"]');
              if (!(button instanceof HTMLButtonElement)) {
                throw new Error('add panel surface button missing');
              }
              button.click();
            })()`,
            true,
          );
          await waitFor(
            () =>
              renderer.executeJavaScript(
                `(() => {
                  const item = [...document.querySelectorAll('[role="menuitem"]')]
                    .find((candidate) => candidate.textContent?.trim() === 'Diff');
                  if (!(item instanceof HTMLElement)) return false;
                  item.click();
                  return true;
                })()`,
                true,
              ),
            "narrow Diff surface action",
          );
          await waitFor(
            () =>
              renderer.executeJavaScript(
                `(() => {
                  const active = document.querySelector('[role="tab"][aria-selected="true"]');
                  return active?.textContent?.trim() === 'Diff';
                })()`,
                true,
              ),
            "active narrow Diff surface",
          );
          narrowSurfaceActivated = true;
        }
        const drawerCycle = await renderer.executeJavaScript(
          `(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const toggleNode = () => document.querySelector('[aria-label="Toggle right panel"]');
            const toggle = toggleNode();
            if (!(toggle instanceof HTMLElement) || toggle.hasAttribute('disabled')) {
              throw new Error('enabled right-panel toggle missing');
            }
            const dialog = () => document.querySelector('[data-slot="sheet-popup"][role="dialog"]');
            const dialogOpen = () => {
              const node = dialog();
              if (!(node instanceof HTMLElement)) return false;
              const rect = node.getBoundingClientRect();
              return rect.right > 0 && rect.left < window.innerWidth && rect.width > 0;
            };
            const waitForState = async (expected) => {
              for (let attempt = 0; attempt < 20; attempt += 1) {
                if (dialogOpen() === expected) return true;
                await delay(50);
              }
              return false;
            };
            const trace = [];
            const record = (stage) => trace.push({stage, open:dialogOpen(), ariaPressed:toggle.getAttribute('aria-pressed'), dataPressed:toggle.getAttribute('data-pressed'), activeLabel:document.activeElement?.getAttribute?.('aria-label') ?? null});
            record('initial');
            if (!dialogOpen()) toggle.click();
            let initiallyOpened = await waitForState(true);
            record('first-open-attempt');
            if (!initiallyOpened) {
              toggle.click();
              initiallyOpened = await waitForState(true);
              record('second-open-attempt');
            }
            const escape = new KeyboardEvent('keydown', {key:'Escape',code:'Escape',bubbles:true,cancelable:true});
            (document.activeElement ?? dialog() ?? document).dispatchEvent(escape);
            if (dialogOpen()) document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
            await waitForState(false);
            if (dialogOpen()) toggle.click();
            await waitForState(false);
            const closed = !dialogOpen();
            await delay(100);
            const reopenedToggle = toggleNode();
            const focusRestored =
              reopenedToggle instanceof HTMLElement && document.activeElement === reopenedToggle;
            record('closed');
            if (!(reopenedToggle instanceof HTMLElement)) {
              throw new Error('right-panel toggle did not remount after drawer close');
            }
            reopenedToggle.click();
            const reopened = await waitForState(true);
            record('reopened');
            const opened = initiallyOpened && reopened && dialogOpen();
            return {
              opened,
              closed,
              focusRestored,
              activeSurface: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? null,
              composerReachable: document.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"]') !== null,
              taskVisible: document.body.innerText.includes(${JSON.stringify(threadTitle)})
              ,trace
            };
          })()`,
          true,
        );
        const guestBeforeRepaint = await waitGuestPage(pageAContract);
        guestContents.reload();
        const guestAfterRepaint = await waitFor(
          () =>
            guestEvaluate(guestSnapshotExpression).then((result) =>
              result.title === pageAContract.title &&
              result.heading === pageAContract.heading &&
              result.identity === pageAContract.identity &&
              result.loadCount > guestBeforeRepaint.loadCount
                ? result
                : null,
            ),
          `repainted guest after ${scenario.scenario} drawer cycle`,
        );
        drawerCycle.guestRepaint = {
          beforeLoadCount: guestBeforeRepaint.loadCount,
          afterLoadCount: guestAfterRepaint.loadCount,
          advanced: guestAfterRepaint.loadCount > guestBeforeRepaint.loadCount,
        };
        narrowDrawerObservations.push({
          scenario: scenario.scenario,
          ...drawerCycle,
        });
        console.log(
          JSON.stringify({
            event: "native-shell-narrow-drawer",
            scenario: scenario.scenario,
            drawerCycle,
          }),
        );
        guestContents.invalidate();
      } else if (scenario.width === 1024) {
        await renderer.executeJavaScript(
          `document.querySelector('[aria-label="Toggle right panel"][data-pressed="true"], [aria-label="Toggle right panel"][aria-pressed="true"]')?.click()`,
          true,
        );
      } else {
        guestContents.reload();
        await waitGuestPage(pageAContract);
        guestContents.invalidate();
      }
      await renderer.executeJavaScript(
        `document.querySelector('[aria-label="Dismiss notification"]')?.click()`,
        true,
      );
      renderer.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const layout = await renderer.executeJavaScript(
        `(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
          overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          browserVisible: document.querySelector('webview[data-preview-tab]') !== null,
          narrowDisclosure: window.innerWidth > 1100 || document.querySelector('[aria-label="Toggle right panel"]:not([disabled])') !== null,
          drawerOpen: (() => { const node = document.querySelector('[data-slot="sheet-popup"][role="dialog"]'); if (!(node instanceof HTMLElement)) return false; const rect = node.getBoundingClientRect(); return rect.right > 0 && rect.left < window.innerWidth && rect.width > 0; })(),
          webviewRect: (() => { const node = document.querySelector('webview[data-preview-tab]'); if (!node) return null; const rect = node.getBoundingClientRect(); return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}; })(),
          wrapperRect: (() => { const node = document.querySelector('[data-preview-viewport]'); if (!node) return null; const rect = node.getBoundingClientRect(); return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}; })()
        }))()`,
        true,
      );
      console.log(
        JSON.stringify({
          event: "native-shell-layout",
          scenario: scenario.scenario,
          layout,
        }),
      );
      everyScenarioAvoidsHorizontalOverflow &&= layout.overflow;
      if (scenario.width === 1024) {
        assertions.narrowDisclosureReachable = makeNativeShellAssertion(
          layout,
          layout.narrowDisclosure === true,
        );
      }
      const image = await mainWindow.webContents.capturePage();
      const bytes = image.toPNG();
      const dimensions = readPngDimensions(bytes, scenario.scenario);
      if (dimensions.width !== scenario.width || dimensions.height !== scenario.height) {
        throw new Error(
          `${scenario.scenario} produced ${dimensions.width}x${dimensions.height}, expected ${scenario.width}x${scenario.height}`,
        );
      }
      const relativeFile = `${evidenceRelativeDirectory}/${scenario.scenario}.png`;
      await NodeFSP.writeFile(NodePath.join(repoRoot, relativeFile), bytes);
      screenshots.push({
        scenario: scenario.scenario,
        file: relativeFile,
        width: scenario.width,
        height: scenario.height,
        deviceScaleFactor: 1,
        theme: scenario.theme,
        layout,
        sha256: sha256(bytes),
      });
    }
    assertions.noDocumentHorizontalOverflow = makeNativeShellAssertion(
      screenshots.map(({ scenario, layout }) => ({
        scenario,
        overflow: layout.overflow,
      })),
      everyScenarioAvoidsHorizontalOverflow,
    );
    assertions.themeMatrixCaptured = makeNativeShellAssertion(
      screenshots.map(({ scenario, theme }) => ({ scenario, theme })),
      new Set(screenshots.map(({ theme }) => theme)).size === 2 && screenshots.length === 4,
    );
    assertions.narrowDrawerOpened = makeNativeShellAssertion(
      narrowDrawerObservations,
      isNarrowDrawerOpenedObservation(narrowDrawerObservations),
    );
    assertions.narrowDrawerClosed = makeNativeShellAssertion(
      narrowDrawerObservations,
      narrowDrawerObservations.length === 2 &&
        narrowDrawerObservations.every(({ closed }) => closed === true),
    );
    assertions.narrowDrawerFocusRestored = makeNativeShellAssertion(
      narrowDrawerObservations,
      narrowDrawerObservations.length === 2 &&
        narrowDrawerObservations.every(({ focusRestored }) => focusRestored === true),
    );
    assertions.narrowDiffSurfaceVisible = makeNativeShellAssertion(
      narrowDrawerObservations,
      narrowDrawerObservations.length === 2 &&
        narrowDrawerObservations.every(({ activeSurface }) => activeSurface === "Diff"),
    );
    assertions.narrowTaskComposerReachable = makeNativeShellAssertion(
      narrowDrawerObservations,
      narrowDrawerObservations.length === 2 &&
        narrowDrawerObservations.every(
          ({ composerReachable, taskVisible }) =>
            composerReachable === true && taskVisible === true,
        ),
    );
    retainedDesktopCapabilities.surfaces.Diff = {
      title: "Diff",
      panelVisible:
        narrowDrawerObservations.length === 2 &&
        narrowDrawerObservations.every(({ activeSurface }) => activeSurface === "Diff"),
    };
    assertions.retainedDesktopCapabilitiesProbed = makeNativeShellAssertion(
      retainedDesktopCapabilities,
      retainedDesktopCapabilities.workspace.projectVisible === true &&
        retainedDesktopCapabilities.workspace.taskVisible === true &&
        retainedDesktopCapabilities.workspace.localCheckoutVisible === true &&
        retainedDesktopCapabilities.workspace.contextTabs.includes("Workflow") &&
        retainedDesktopCapabilities.workspace.contextTabs.includes("Attention") &&
        retainedDesktopCapabilities.context.workflowRunId === waitingRunId &&
        retainedDesktopCapabilities.context.attentionResolved === true &&
        retainedDesktopCapabilities.modelPicker?.trigger.length > 0 &&
        retainedDesktopCapabilities.modelPicker.text.length > 0 &&
        retainedDesktopCapabilities.settings?.hash.includes("/settings") === true &&
        retainedDesktopCapabilities.settings.generalVisible === true &&
        retainedDesktopCapabilities.vcs?.items.some(({ label }) => label.includes("Commit")) ===
          true &&
        retainedDesktopCapabilities.vcs.items.some(({ label }) => label.includes("Push")) ===
          true &&
        isNativeShellGitFixtureIdentity(retainedDesktopCapabilities.vcs.fixtureRemote) &&
        ["Files", "Browser", "Diff"].every(
          (title) =>
            retainedDesktopCapabilities.surfaces[title]?.title === title &&
            retainedDesktopCapabilities.surfaces[title]?.panelVisible === true,
        ) &&
        isNativeShellTerminalSurfaceTitle(retainedDesktopCapabilities.surfaces.Terminal?.title) &&
        retainedDesktopCapabilities.surfaces.Terminal.panelVisible === true &&
        retainedDesktopCapabilities.mutations.commit === "unobserved" &&
        retainedDesktopCapabilities.mutations.push === "unobserved",
    );
    assertNativeShellAssertions({
      ...assertions,
      processCleanupVerified: makeNativeShellAssertion({ status: "parent-check-pending" }, true),
    });

    const manifest = {
      schemaVersion: 1,
      id: "orchestra-native-shell-acceptance-v1",
      role: "product-native-shell-evidence",
      desktop: {
        repository: "edgefloor/orchestra-desktop",
        commit: runGit(repoRoot, ["rev-parse", "HEAD"]),
        tree: runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]),
      },
      codex: dogfoodCodexIdentity,
      orchestraCore: orchestraCoreIdentity,
      product: productIdentity,
      capture: {
        electronVersion: process.versions.electron,
        chromiumVersion: process.versions.chrome,
        platform: { os: hostPlatform, arch: hostArchitecture },
        sourceClean,
        buildReceipts,
      },
      productionEntry: "t3code://app/",
      buildArtifacts: await Promise.all(
        ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS.map(async (path) => ({
          path,
          sha256: sha256(await NodeFSP.readFile(NodePath.join(repoRoot, path))),
        })),
      ),
      screenshots,
      assertions,
      guest: { origin: guestOrigin, fixtureSha256: guestFixture.digest },
      runtime: {
        rendererUrl: renderer.getURL(),
        appViewport: await renderer.executeJavaScript(
          `({ width: window.innerWidth, height: window.innerHeight })`,
          true,
        ),
        guest: {
          webContentsId: webviewState.id,
          type: guestContents.getType(),
          url: guestContents.getURL(),
          title: guestContents.getTitle(),
          partition: webviewState.partition,
          viewport: recoveredA.viewport,
          attachment: attachmentObservation,
        },
        rejectedAttachmentProbe: rejectedAttachmentObservation,
        nativeDogfood: {
          responsesRequestCount: responsesRequestCounter.count,
          waitingProjectionVisible: Boolean(waitingWorkflow),
          completedProjectionVisible: Boolean(completedWorkflow),
          ...nativeDogfoodObservation,
        },
        navigation,
        cleanup: { portsClosed: false, processGroupEmpty: false },
      },
      agentReview: {
        status: "pending",
        reviewedAt: new Date(0).toISOString(),
        scenarios: screenshotScenarios.map(({ scenario }) => ({
          scenario,
          clipping: "pending",
          contrast: "pending",
          layering: "pending",
          drawerGeometry: "pending",
          activeTaskContinuity: "pending",
          nativeSurfaceLegibility: "pending",
          notes: "Pending agent visual inspection.",
        })),
      },
    };
    await NodeFSP.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    manifestWritten = true;
    console.log(
      JSON.stringify({
        event: "native-shell-capture-complete",
        rendererUrl: renderer.getURL(),
        guestWebContentsId: webviewState.id,
        guestPartition: webviewState.partition,
        guestSecurity,
        guestArtifact,
      }),
    );
  } finally {
    await Promise.all([
      new Promise((resolve) => guestServer.close(() => resolve())),
      new Promise((resolve) => responsesServer.close(() => resolve())),
    ]);
    if (!manifestWritten) {
      await cleanupFailedNativeShellCapture({
        runtimeDirectory,
        evidenceDirectory,
        removeRuntime: false,
      });
    }
    app.quit();
  }
}

async function main() {
  if (shouldRunNativeShellElectronChild(process.env)) {
    await runElectronChild();
  } else {
    await launchUnderElectron();
  }
}

if (
  shouldRunNativeShellElectronChild(process.env) ||
  NodePath.resolve(process.argv[1] ?? "") === scriptPath
) {
  main().catch((error) => {
    console.error(error);
    const runtimeDirectory = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_RUNTIME_DIR;
    if (shouldRunNativeShellElectronChild(process.env) && runtimeDirectory) {
      NodeFS.writeFileSync(
        NodePath.join(runtimeDirectory, "capture-error.txt"),
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
    process.exitCode = 1;
  });
}
