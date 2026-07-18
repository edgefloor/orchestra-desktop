// @effect-diagnostics nodeBuiltinImport:off - Contract tests generate isolated binary fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { minimalPng } from "./lib/orchestra-evidence-fixtures.ts";
import {
  buildNativeGuestFixture,
  makeNativeShellAssertion,
} from "./lib/orchestra-native-shell-contract.mjs";
import { sha256 } from "./lib/orchestra-evidence-primitives.mjs";
import {
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_MAX_CHARS,
  ORCHESTRA_NATIVE_DOGFOOD_CHILD_TEXT_MAX_CHARS,
} from "./lib/orchestra-native-dogfood-contract.mjs";

import {
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  readNativeShellPngDimensions,
  verifyOrchestraNativeShell as verifyOrchestraNativeShellImplementation,
} from "./verify-orchestra-native-shell.ts";

const temporaryRoots: string[] = [];
const acceptanceDirectory = "docs/acceptance/orchestra-native-shell";

function fixtureProductPinsPath(rootDir: string): string {
  return NodePath.join(rootDir, "product", "pins.toml");
}

function verifyOrchestraNativeShell(options: {
  readonly rootDir: string;
  readonly manifestPath?: string;
  readonly productPinsPath?: string;
}): Promise<void> {
  return verifyOrchestraNativeShellImplementation({
    ...options,
    productPinsPath: options.productPinsPath ?? fixtureProductPinsPath(options.rootDir),
  });
}

type MutableManifest = {
  schemaVersion: number;
  id: string;
  role: string;
  desktop: { repository: string; commit: string; tree: string };
  codex: {
    repository: string;
    commit: string;
    tree: string;
    binarySha256: string;
    build: {
      tool: string;
      arguments: string[];
      profile: string;
      package: string;
      binary: string;
    };
  };
  orchestraCore: { repository: string; commit: string; tree: string };
  product: {
    pinsToml: string;
    pinsSha256: string;
    manifestSha256: string;
    releaseManifest: Record<string, unknown>;
  };
  capture: {
    electronVersion: string;
    chromiumVersion: string;
    platform: { os: string; arch: string };
    sourceClean: boolean;
    buildReceipts: {
      desktop: {
        tool: string;
        arguments: string[];
        sourceCommit: string;
        sourceTree: string;
        artifacts: Array<{ path: string; sha256: string }>;
      };
      evaluator: {
        tool: string;
        arguments: string[];
        sourceCommit: string;
        sourceTree: string;
        artifact: { path: string; sha256: string };
      };
    };
  };
  productionEntry: string;
  buildArtifacts: Array<{ path: string; sha256: string }>;
  screenshots: Array<{
    scenario: string;
    file: string;
    width: number;
    height: number;
    deviceScaleFactor: number;
    theme: string;
    layout: {
      width: number;
      height: number;
      overflow: boolean;
      browserVisible: boolean;
      narrowDisclosure: boolean;
      drawerOpen: boolean;
      webviewRect: null;
      wrapperRect: null;
    };
    sha256: string;
  }>;
  assertions: Record<string, { observed: unknown; passed: boolean }>;
  guest: { origin: string; fixtureSha256: string };
  runtime: {
    rendererUrl: string;
    appViewport: { width: number; height: number };
    guest: {
      webContentsId: number;
      type: string;
      url: string;
      title: string;
      partition: string;
      viewport: { width: number; height: number };
      attachment: {
        partition: string;
        attachmentGuardAllowed: boolean;
        sandbox: boolean;
        contextIsolation: boolean;
        nodeIntegration: boolean;
        nodeIntegrationInSubFrames: boolean;
      };
    };
    rejectedAttachmentProbe: {
      partition: string;
      attachmentGuardAllowed: boolean;
      sandbox: boolean;
      contextIsolation: boolean;
      nodeIntegration: boolean;
      nodeIntegrationInSubFrames: boolean;
    };
    nativeDogfood: Record<string, unknown>;
    navigation: Array<{
      action: string;
      expected: unknown;
      observed: unknown;
      passed: boolean;
    }>;
    cleanup: { portsClosed: boolean; processGroupEmpty: boolean | null };
  };
  agentReview: {
    status: string;
    reviewedAt: string;
    scenarios: Array<{
      scenario: string;
      clipping: string;
      contrast: string;
      layering: string;
      drawerGeometry: string;
      activeTaskContinuity: string;
      nativeSurfaceLegibility: string;
      notes: string;
    }>;
  };
};

async function makeFixture(
  mutate?: (manifest: MutableManifest, rootDir: string) => void | Promise<void>,
): Promise<{ readonly rootDir: string; readonly manifest: MutableManifest }> {
  const rootDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "orchestra-native-shell-"));
  temporaryRoots.push(rootDir);
  await NodeFSP.mkdir(NodePath.join(rootDir, acceptanceDirectory), {
    recursive: true,
  });

  const buildArtifacts: MutableManifest["buildArtifacts"] = [];
  for (const path of ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS) {
    const bytes = Buffer.from(`native build artifact: ${path}`);
    await NodeFSP.mkdir(NodePath.dirname(NodePath.join(rootDir, path)), {
      recursive: true,
    });
    await NodeFSP.writeFile(NodePath.join(rootDir, path), bytes);
    buildArtifacts.push({ path, sha256: sha256(bytes) });
  }

  const screenshots: MutableManifest["screenshots"] = [];
  for (const contract of ORCHESTRA_NATIVE_SHELL_SCREENSHOTS) {
    const { scenario } = contract;
    const file = `${acceptanceDirectory}/${scenario}.png`;
    const image = minimalPng(contract.width, contract.height);
    await NodeFSP.writeFile(NodePath.join(rootDir, file), image);
    screenshots.push({
      scenario,
      file,
      width: contract.width,
      height: contract.height,
      deviceScaleFactor: 1,
      theme: contract.theme,
      layout: {
        width: contract.width,
        height: contract.height,
        overflow: true,
        browserVisible: true,
        narrowDisclosure: true,
        drawerOpen: contract.drawerOpen,
        webviewRect: null,
        wrapperRect: null,
      },
      sha256: sha256(image),
    });
  }

  const codexBinarySha256 = sha256(Buffer.from("source-bound codex-cli"));
  const productArtifacts = Object.fromEntries(
    [
      "codex-cli",
      "desktop-main",
      "desktop-preload",
      "desktop-renderer",
      "desktop-server",
      "orchestra-product",
      "orchestra-validate-worker",
    ].map((name) => [
      name,
      {
        bytes: name.length,
        sha256: name === "codex-cli" ? codexBinarySha256 : sha256(Buffer.from(name)),
      },
    ]),
  );
  for (const [index, productName] of [
    "desktop-main",
    "desktop-preload",
    "desktop-server",
    "desktop-renderer",
  ].entries()) {
    (productArtifacts[productName] as { sha256: string }).sha256 = buildArtifacts[index]!.sha256;
  }
  const unsignedReleaseManifest = {
    schemaVersion: 1,
    productVersion: "0.2.0-dev",
    minimumMacos: "13.0",
    target: "aarch64-apple-darwin",
    sources: {
      agents: "1".repeat(40),
      bun: "2".repeat(40),
      bun_repository: "https://github.com/oven-sh/bun.git",
      bun_version: "1.3.14",
      codex_upstream: "3".repeat(40),
      codex_upstream_repository: "https://github.com/openai/codex.git",
      codex_upstream_tree: "4".repeat(40),
      evaluator_lock_sha256: "5".repeat(64),
      evaluator_package_sha256: "6".repeat(64),
      evaluator_worker_source_sha256: "7".repeat(64),
      orchestra_codex: "7fddc000e0531657002ec4fac59f5edbabb4695b",
      orchestra_codex_repository: "https://github.com/edgefloor/orchestra-codex.git",
      orchestra_codex_tree: "b1306b462645553d975b21f872ddc4ca75310f20",
      orchestra_core_repository: "https://github.com/edgefloor/codex-orchestra.git",
      orchestra_core_revision: "ef4470f54f791c26dab1fec92edbbcc8cf47a9f6",
      orchestra_core_tree: "30f8c2ef452243f4a930623d5da635acffd35077",
      orchestra_desktop: "b3e6534f82c62e6d30fdbac0d0e7aa9aa7301750",
      orchestra_desktop_repository: "https://github.com/edgefloor/orchestra-desktop.git",
      orchestra_desktop_tree: "974192a2af184643d37df51ca70dea77d24decc9",
      protocol_digest: "8".repeat(64),
      protocol_digest_algorithm: "sha256-relative-path-nul-file-sha256-lf-v1",
      protocol_file_count: "709",
      protocol_tree: "9".repeat(40),
      t3code_upstream: "a".repeat(40),
      t3code_upstream_repository: "https://github.com/pingdotgg/t3code.git",
      t3code_upstream_tree: "b".repeat(40),
      zod: "c".repeat(40),
      zod_package_integrity: "sha512-fixture",
      zod_package_revision: "d".repeat(40),
      zod_package_shasum: "e".repeat(40),
      zod_repository: "https://github.com/colinhacks/zod.git",
      zod_version: "4.4.3",
    },
    schemas: {
      protocol: {
        identity: "codex-app-server+orchestra-v1",
        sha256: "f".repeat(64),
      },
      snapshot: {
        identity: "orchestra-task-snapshot-v1",
        sha256: "0".repeat(64),
      },
    },
    evaluator: {
      revision: "bun-1.3.14-zod-4.4.3-sealed-2",
      adapterAbi: "orchestra-evaluator-abi-v1",
      canonicalizer: "rfc8785-jcs-v1",
      issueFormat: "orchestra-validation-issues-v1",
    },
    capabilities: ["orchestra/query"],
    limits: { validation_wall_ms: 1_000 },
    artifacts: productArtifacts,
  };
  const productManifestSha256 = sha256(Buffer.from(JSON.stringify(unsignedReleaseManifest)));
  const pinsToml = [
    "[product]",
    `version = ${JSON.stringify(unsignedReleaseManifest.productVersion)}`,
    `minimum_macos = ${JSON.stringify(unsignedReleaseManifest.minimumMacos)}`,
    "",
    "[sources]",
    ...Object.entries(unsignedReleaseManifest.sources).map(
      ([key, value]) => `${key} = ${JSON.stringify(value)}`,
    ),
    "",
    "[schemas]",
    `protocol = ${JSON.stringify(unsignedReleaseManifest.schemas.protocol.identity)}`,
    `snapshot = ${JSON.stringify(unsignedReleaseManifest.schemas.snapshot.identity)}`,
    "",
    "[evaluator]",
    `revision = ${JSON.stringify(unsignedReleaseManifest.evaluator.revision)}`,
    `adapter_abi = ${JSON.stringify(unsignedReleaseManifest.evaluator.adapterAbi)}`,
    `canonicalizer = ${JSON.stringify(unsignedReleaseManifest.evaluator.canonicalizer)}`,
    `issue_format = ${JSON.stringify(unsignedReleaseManifest.evaluator.issueFormat)}`,
    "",
  ].join("\n");
  await NodeFSP.mkdir(NodePath.dirname(fixtureProductPinsPath(rootDir)), { recursive: true });
  await NodeFSP.writeFile(fixtureProductPinsPath(rootDir), pinsToml);
  const workflowWaiting = {
    label: "Task Workflow Runs",
    text: "Waiting",
    runLabels: ["Workflow run run-cycle8"],
    runStatuses: ["waiting"],
    expandedButtons: 0,
    collapsedButtons: 1,
  };
  const workflowCompleted = {
    label: "Task Workflow Runs",
    text: "Completed",
    runLabels: ["Workflow run run-cycle8"],
    runStatuses: ["completed"],
    expandedButtons: 1,
    collapsedButtons: 0,
  };
  const evidence = {
    before: {
      exposed: true,
      stepId: "verify-native-repository",
      evidenceName: "verify-native-repository-1.json",
      evidenceId: sha256(Buffer.from("checks/verify-native-repository-1.json")),
      displayedEvidenceIdPrefix: sha256(
        Buffer.from("checks/verify-native-repository-1.json"),
      ).slice(0, 12),
      kind: "check",
      provenance: "runtime_check",
      availability: "available",
      contentAbsentBeforeExpand: true,
    },
    after: {
      stepId: "verify-native-repository",
      evidenceName: "verify-native-repository-1.json",
      evidenceId: sha256(Buffer.from("checks/verify-native-repository-1.json")),
      displayedEvidenceIdPrefix: sha256(
        Buffer.from("checks/verify-native-repository-1.json"),
      ).slice(0, 12),
      kind: "check",
      provenance: "runtime_check",
      availability: "available",
      expanded: true,
      contentState: "text",
      content: {
        argv: ["git", "rev-parse", "--is-inside-work-tree"],
        exit_code: 0,
        stdout: "true\n",
        stderr: "",
      },
      runText: "Plain-text preview",
    },
  };
  const child = {
    stepId: "inspect-native-runtime",
    childText: "Child /root/child · child-thread",
    childTextTruncated: false,
    outputName: "finding",
    outputValue: '"deterministic native child"',
    outputValueTruncated: false,
  };
  const symphony = {
    validation: {
      valid: true,
      text: "ORCHESTRA_NATIVE_DOGFOOD_LINEAR_API_KEY is deliberately absent",
    },
    started: {
      runId: "automation-cycle8",
      text: "running with skipped intake",
      issueRowCount: 0,
    },
    inspected: { runId: "automation-cycle8", instanceCount: 1, totalRootCount: 1 },
    sameRootAfterInspect: true,
    issueChildFabricated: false,
  };
  const workflow = {
    waiting: workflowWaiting,
    completed: workflowCompleted,
    sameRun: true,
  };
  const attention = {
    waiting: { text: "Approval required" },
    completed: { text: "No items need intervention" },
  };
  const reload = {
    workflow: workflowCompleted,
    evidence: structuredClone(evidence.after),
    symphony: { runId: "automation-cycle8", instanceCount: 1, totalRootCount: 1 },
    sameWorkflowRun: true,
    sameSymphonyRoot: true,
  };
  const restart = {
    stop: {
      thread: { session: { status: "stopped" } },
      responsesRequestCount: 5,
    },
    recovery: {
      thread: { session: { status: "ready" } },
      typedSymphonyStatus: { runId: "automation-cycle8", status: "running" },
      symphony: { runId: "automation-cycle8", instanceCount: 1, totalRootCount: 1 },
      workflow: workflowCompleted,
      evidence: structuredClone(evidence.after),
      responsesRequestCount: 5,
    },
    sameWorkflowRun: true,
    sameSymphonyRoot: true,
    sameSymphonyStatus: true,
  };
  const nativeDogfood = {
    responsesRequestCount: 5,
    waitingProjectionVisible: true,
    completedProjectionVisible: true,
    workflow,
    child,
    attention,
    evidence,
    symphony,
    reload,
    restart,
  };
  const retainedDesktopCapabilities = {
    workspace: {
      projectVisible: true,
      taskVisible: true,
      localCheckoutVisible: true,
      contextTabs: ["Workflow", "Attention"],
    },
    context: { workflowRunId: "run-cycle8", attentionResolved: true },
    modelPicker: { trigger: "Codex gpt-5.4", text: "gpt-5.4" },
    settings: { hash: "#/settings", generalVisible: true },
    vcs: {
      items: [{ label: "Commit" }, { label: "Push" }],
      fixtureRemote: { name: "origin", transport: "local-bare", externalMutation: false },
    },
    surfaces: {
      ...Object.fromEntries(
        ["Files", "Browser", "Diff"].map((title) => [title, { title, panelVisible: true }]),
      ),
      Terminal: { title: "Terminal 2", panelVisible: true },
    },
    mutations: { commit: "unobserved", push: "unobserved" },
  };
  const assertions = Object.fromEntries(
    ORCHESTRA_NATIVE_SHELL_ASSERTIONS.map((assertion) => [
      assertion,
      makeNativeShellAssertion({ proof: assertion }, true),
    ]),
  );
  assertions.nativeDogfoodResponsesExact = makeNativeShellAssertion({ requestCount: 5 }, true);
  assertions.nativeChildProjected = makeNativeShellAssertion(child, true);
  assertions.nativeWorkflowLifecycleRendered = makeNativeShellAssertion(workflow, true);
  assertions.nativeAttentionResolved = makeNativeShellAssertion(attention, true);
  assertions.nativeEvidenceLazyExpanded = makeNativeShellAssertion(evidence, true);
  assertions.nativeSymphonySkippedIntake = makeNativeShellAssertion(symphony, true);
  assertions.nativeDogfoodIdentityRecovered = makeNativeShellAssertion(
    { workflow, symphony, reload },
    true,
  );
  assertions.nativeDogfoodProviderRestartRecovered = makeNativeShellAssertion(restart, true);
  const drawerObservations = [
    { opened: true, closed: true, focusRestored: true },
    { opened: true, closed: true, focusRestored: true },
  ];
  assertions.narrowDrawerOpened = makeNativeShellAssertion(drawerObservations, true);
  assertions.narrowDrawerClosed = makeNativeShellAssertion(drawerObservations, true);
  assertions.narrowDrawerFocusRestored = makeNativeShellAssertion(drawerObservations, true);
  assertions.retainedDesktopCapabilitiesProbed = makeNativeShellAssertion(
    retainedDesktopCapabilities,
    true,
  );

  const manifest: MutableManifest = {
    schemaVersion: 1,
    id: "orchestra-native-shell-acceptance-v1",
    role: "product-native-shell-evidence",
    desktop: {
      repository: "edgefloor/orchestra-desktop",
      commit: "b3e6534f82c62e6d30fdbac0d0e7aa9aa7301750",
      tree: "974192a2af184643d37df51ca70dea77d24decc9",
    },
    codex: {
      repository: "edgefloor/orchestra-codex",
      commit: "7fddc000e0531657002ec4fac59f5edbabb4695b",
      tree: "b1306b462645553d975b21f872ddc4ca75310f20",
      binarySha256: codexBinarySha256,
      build: {
        tool: "cargo",
        arguments: [
          "build",
          "--manifest-path",
          "codex-rs/Cargo.toml",
          "-p",
          "codex-cli",
          "--bin",
          "codex",
        ],
        profile: "debug",
        package: "codex-cli",
        binary: "codex",
      },
    },
    orchestraCore: {
      repository: "edgefloor/codex-orchestra",
      commit: "ef4470f54f791c26dab1fec92edbbcc8cf47a9f6",
      tree: "30f8c2ef452243f4a930623d5da635acffd35077",
    },
    product: {
      pinsToml,
      pinsSha256: sha256(Buffer.from(pinsToml)),
      manifestSha256: productManifestSha256,
      releaseManifest: {
        ...unsignedReleaseManifest,
        manifestSha256: productManifestSha256,
      },
    },
    capture: {
      electronVersion: "41.5.0",
      chromiumVersion: "142.0.7444.235",
      platform: { os: "darwin", arch: "arm64" },
      sourceClean: true,
      buildReceipts: {
        desktop: {
          tool: "bun",
          arguments: ["run", "build:desktop"],
          sourceCommit: "b3e6534f82c62e6d30fdbac0d0e7aa9aa7301750",
          sourceTree: "974192a2af184643d37df51ca70dea77d24decc9",
          artifacts: buildArtifacts.map((artifact) => ({ ...artifact })),
        },
        evaluator: {
          tool: "scripts/evaluator-build.sh",
          arguments: ["target/orchestra-product/orchestra-validate-worker"],
          sourceCommit: "ef4470f54f791c26dab1fec92edbbcc8cf47a9f6",
          sourceTree: "30f8c2ef452243f4a930623d5da635acffd35077",
          artifact: {
            path: "target/orchestra-product/orchestra-validate-worker",
            sha256: (productArtifacts["orchestra-validate-worker"] as { sha256: string }).sha256,
          },
        },
      },
    },
    productionEntry: "t3code://app/",
    buildArtifacts,
    screenshots,
    assertions,
    guest: {
      origin: "http://127.0.0.1:43123",
      fixtureSha256: buildNativeGuestFixture("http://127.0.0.1:43123").digest,
    },
    runtime: {
      rendererUrl: "t3code://app/#/project/thread",
      appViewport: { width: 1024, height: 768 },
      guest: {
        webContentsId: 2,
        type: "webview",
        url: "http://127.0.0.1:43123/a",
        title: "Native Guest A",
        partition: "persist:t3code-preview-fixture",
        viewport: { width: 539, height: 808 },
        attachment: {
          partition: "persist:t3code-preview-fixture",
          attachmentGuardAllowed: true,
          sandbox: true,
          contextIsolation: false,
          nodeIntegration: false,
          nodeIntegrationInSubFrames: false,
        },
      },
      rejectedAttachmentProbe: {
        partition: "persist:orchestra-native-shell-rejected",
        attachmentGuardAllowed: false,
        sandbox: false,
        contextIsolation: false,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
      },
      nativeDogfood,
      navigation: [
        "navigate-page-a",
        "navigate-page-b",
        "back",
        "forward",
        "reload",
        "load-failure",
        "recover-page-a",
      ].map((action) => ({
        action,
        expected: action,
        observed: action,
        passed: true,
      })),
      cleanup: { portsClosed: true, processGroupEmpty: true },
    },
    agentReview: {
      status: "observed",
      reviewedAt: "2026-07-18T12:34:56.000Z",
      scenarios: ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map((scenario) => ({
        scenario: scenario.scenario,
        clipping: "pass",
        contrast: "pass",
        layering: "pass",
        drawerGeometry: scenario.drawerOpen ? "pass" : "not-applicable",
        activeTaskContinuity: "pass",
        nativeSurfaceLegibility: "pass",
        notes: `${scenario.scenario} inspected directly by the review agent.`,
      })),
    },
  };
  await mutate?.(manifest, rootDir);
  await NodeFSP.writeFile(
    NodePath.join(rootDir, acceptanceDirectory, "manifest.json"),
    JSON.stringify(manifest),
  );
  return { rootDir, manifest };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true, force: true })),
  );
});

describe("Orchestra native-shell evidence verifier", () => {
  it("accepts the exact production shell and real guest evidence contract", async () => {
    const { rootDir } = await makeFixture();

    await expect(verifyOrchestraNativeShell({ rootDir })).resolves.toBeUndefined();
  });

  it("requires the four production artifacts in sealed order and checks their bytes", async () => {
    const reordered = await makeFixture((manifest) => {
      manifest.buildArtifacts.reverse();
    });
    await expect(verifyOrchestraNativeShell({ rootDir: reordered.rootDir })).rejects.toThrow(
      "manifest build artifact paths must exactly match the native-shell evidence contract",
    );

    const corrupted = await makeFixture(async (_manifest, rootDir) => {
      await NodeFSP.writeFile(
        NodePath.join(rootDir, ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS[0]!),
        "corrupted",
      );
    });
    await expect(verifyOrchestraNativeShell({ rootDir: corrupted.rootDir })).rejects.toThrow(
      "sha256 does not match the artifact bytes",
    );
  });

  it("requires exactly the ordered wide and narrow dark/light screenshots", async () => {
    expect(ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES).toEqual([
      "native-browser-1440x900-dark",
      "native-browser-1440x900-light",
      "native-workspace-1024x768-dark-drawer",
      "native-workspace-1024x768-light-drawer",
    ]);
    const { rootDir } = await makeFixture((manifest) => {
      manifest.screenshots.reverse();
    });

    await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(
      "manifest screenshot scenarios must exactly match the native-shell evidence contract",
    );
  });

  it("reads PNG dimensions and digests from the captured files", async () => {
    const wrongDimensions = await makeFixture(async (manifest, rootDir) => {
      const screenshot = manifest.screenshots[0]!;
      const replacement = minimalPng(1, 1);
      await NodeFSP.writeFile(NodePath.join(rootDir, screenshot.file), replacement);
      screenshot.sha256 = sha256(replacement);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: wrongDimensions.rootDir })).rejects.toThrow(
      "PNG dimensions do not match the scenario",
    );

    const wrongDigest = await makeFixture((manifest) => {
      manifest.screenshots[0]!.sha256 = "f".repeat(64);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: wrongDigest.rootDir })).rejects.toThrow(
      "sha256 does not match the PNG bytes",
    );
  });

  it("requires every sealed native and guest assertion to be true", async () => {
    const { rootDir } = await makeFixture((manifest) => {
      manifest.assertions.realWebviewAttached = makeNativeShellAssertion("missing", false);
    });

    await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(
      "manifest.assertions.realWebviewAttached.passed must be true",
    );
  });

  it("requires production entry, guest identity, and observed agent review", async () => {
    const invalidCases: Array<{
      readonly mutate: (manifest: MutableManifest) => void;
      readonly message: string;
    }> = [
      {
        mutate: (manifest) => {
          manifest.productionEntry = "http://localhost:5173";
        },
        message: "manifest.productionEntry must be t3code://app/",
      },
      {
        mutate: (manifest) => {
          manifest.guest.origin = "http://127.0.0.1:43123/page-a";
        },
        message: "manifest.guest.origin must be an HTTP(S) URL origin without a path",
      },
      {
        mutate: (manifest) => {
          manifest.guest.fixtureSha256 = "f".repeat(64);
        },
        message: "manifest.guest.fixtureSha256 does not match the deterministic guest payload",
      },
      {
        mutate: (manifest) => {
          manifest.agentReview.status = "pending";
        },
        message: "manifest.agentReview.status must be observed",
      },
      {
        mutate: (manifest) => {
          manifest.agentReview.scenarios[0]!.notes = " ";
        },
        message: "manifest.agentReview.native-browser-1440x900-dark.notes must be non-empty",
      },
      {
        mutate: (manifest) => {
          manifest.agentReview.scenarios[0]!.contrast = "pending";
        },
        message: "manifest.agentReview.native-browser-1440x900-dark.contrast must be pass",
      },
      {
        mutate: (manifest) => {
          manifest.agentReview.reviewedAt = "0";
        },
        message: "manifest.agentReview.reviewedAt must be an ISO timestamp",
      },
    ];

    for (const invalidCase of invalidCases) {
      const { rootDir } = await makeFixture(invalidCase.mutate);
      await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("requires observed guarded guest preferences, navigation, and full cleanup", async () => {
    const invalidCases: Array<{
      readonly mutate: (manifest: MutableManifest) => void;
      readonly message: string;
    }> = [
      {
        mutate: (manifest) => {
          manifest.runtime.guest.attachment.sandbox = false;
        },
        message: "manifest.runtime.guest.attachment must record the effective guarded preferences",
      },
      {
        mutate: (manifest) => {
          manifest.runtime.rejectedAttachmentProbe.attachmentGuardAllowed = true;
        },
        message: "manifest.runtime.rejectedAttachmentProbe must prove guard rejection",
      },
      {
        mutate: (manifest) => {
          manifest.runtime.navigation[2]!.passed = false;
        },
        message: "manifest.runtime.navigation entries must pass",
      },
      {
        mutate: (manifest) => {
          manifest.runtime.cleanup.processGroupEmpty = false;
        },
        message: "manifest.runtime.cleanup must prove listener and process-group cleanup",
      },
      {
        mutate: (manifest) => {
          manifest.runtime.cleanup.processGroupEmpty = null;
        },
        message: "manifest.runtime.cleanup must prove listener and process-group cleanup",
      },
    ];

    for (const invalidCase of invalidCases) {
      const { rootDir } = await makeFixture(invalidCase.mutate);
      await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("requires valid desktop Git identities and native capture metadata", async () => {
    const invalidCases: Array<{
      readonly mutate: (manifest: MutableManifest) => void;
      readonly message: string;
    }> = [
      {
        mutate: (manifest) => {
          manifest.desktop.commit = "not-a-commit";
        },
        message: "manifest.desktop.commit must be a lowercase 40-character Git object ID",
      },
      {
        mutate: (manifest) => {
          manifest.capture.electronVersion = "latest";
        },
        message: "manifest.capture.electronVersion must be a semantic Electron version",
      },
      {
        mutate: (manifest) => {
          manifest.capture.platform.os = "browser";
        },
        message: "manifest.capture.platform.os must be darwin, linux, or win32",
      },
      {
        mutate: (manifest) => {
          manifest.capture.sourceClean = false;
        },
        message: "manifest.capture.sourceClean must be true",
      },
    ];

    for (const invalidCase of invalidCases) {
      const { rootDir } = await makeFixture(invalidCase.mutate);
      await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("requires the source-bound Codex receipt and exact Product source tuple", async () => {
    const invalidBuild = await makeFixture((manifest) => {
      manifest.codex.build.arguments.pop();
    });
    await expect(verifyOrchestraNativeShell({ rootDir: invalidBuild.rootDir })).rejects.toThrow(
      "manifest.codex.build.arguments must exactly match the source-bound Codex build contract",
    );

    const mismatchedTuple = await makeFixture((manifest) => {
      manifest.codex.commit = "a".repeat(40);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: mismatchedTuple.rootDir })).rejects.toThrow(
      "manifest Product sources must exactly match the captured core, Codex, and Desktop tuple",
    );

    const mismatchedExecutable = await makeFixture((manifest) => {
      manifest.codex.binarySha256 = "f".repeat(64);
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: mismatchedExecutable.rootDir }),
    ).rejects.toThrow("manifest.codex.binarySha256 must match the Product Codex executable");
  });

  it("recomputes canonical Product pins and rejects pinned-identity contradictions", async () => {
    const wrongDigest = await makeFixture((manifest) => {
      manifest.product.pinsSha256 = "f".repeat(64);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: wrongDigest.rootDir })).rejects.toThrow(
      "manifest.product.pinsSha256 does not match manifest.product.pinsToml",
    );

    const substitutedPins = await makeFixture((manifest) => {
      manifest.product.pinsToml = manifest.product.pinsToml.replace(
        "https://github.com/oven-sh/bun.git",
        "https://example.invalid/bun.git",
      );
      manifest.product.pinsSha256 = sha256(Buffer.from(manifest.product.pinsToml));
      const releaseManifest = manifest.product.releaseManifest;
      const sources = releaseManifest.sources as Record<string, unknown>;
      sources.bun_repository = "https://example.invalid/bun.git";
      const { manifestSha256: _previousDigest, ...unsignedReleaseManifest } = releaseManifest;
      const replacementDigest = sha256(Buffer.from(JSON.stringify(unsignedReleaseManifest)));
      releaseManifest.manifestSha256 = replacementDigest;
      manifest.product.manifestSha256 = replacementDigest;
    });
    await expect(verifyOrchestraNativeShell({ rootDir: substitutedPins.rootDir })).rejects.toThrow(
      "manifest.product.pinsToml must exactly match trusted standalone Product pins",
    );
  });

  it("requires source-bound Desktop and evaluator build receipts", async () => {
    const wrongDesktopCommand = await makeFixture((manifest) => {
      manifest.capture.buildReceipts.desktop.arguments = ["run", "build"];
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: wrongDesktopCommand.rootDir }),
    ).rejects.toThrow(
      "manifest.capture.buildReceipts.desktop.arguments must exactly match the source-bound Desktop build contract",
    );

    const wrongEvaluator = await makeFixture((manifest) => {
      manifest.capture.buildReceipts.evaluator.artifact.sha256 = "f".repeat(64);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: wrongEvaluator.rootDir })).rejects.toThrow(
      "manifest.capture.buildReceipts.evaluator artifact must match the Product evaluator executable",
    );
  });

  it("rejects semantic contradictions even when passed remains true", async () => {
    const falseWorkflow = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      (dogfood.workflow as Record<string, unknown>).sameRun = false;
    });
    await expect(verifyOrchestraNativeShell({ rootDir: falseWorkflow.rootDir })).rejects.toThrow(
      "manifest.runtime.nativeDogfood.workflow is not the same waiting/completed Run",
    );

    const falseDrawer = await makeFixture((manifest) => {
      manifest.assertions.narrowDrawerOpened = makeNativeShellAssertion(
        [{ opened: true }, { opened: false }],
        true,
      );
    });
    await expect(verifyOrchestraNativeShell({ rootDir: falseDrawer.rootDir })).rejects.toThrow(
      "manifest.assertions.narrowDrawerOpened observed value contradicts passed:true",
    );

    const falseRetainedProbe = await makeFixture((manifest) => {
      const observed = manifest.assertions.retainedDesktopCapabilitiesProbed!.observed as Record<
        string,
        unknown
      >;
      (observed.workspace as Record<string, unknown>).localCheckoutVisible = false;
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: falseRetainedProbe.rootDir }),
    ).rejects.toThrow(
      "manifest.assertions.retainedDesktopCapabilitiesProbed observed value contradicts passed:true",
    );

    const externalRetainedRemote = await makeFixture((manifest) => {
      const observed = manifest.assertions.retainedDesktopCapabilitiesProbed!.observed as Record<
        string,
        unknown
      >;
      const vcs = observed.vcs as Record<string, unknown>;
      (vcs.fixtureRemote as Record<string, unknown>).externalMutation = true;
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: externalRetainedRemote.rootDir }),
    ).rejects.toThrow(
      "manifest.assertions.retainedDesktopCapabilitiesProbed observed value contradicts passed:true",
    );

    const invalidTerminalOrdinal = await makeFixture((manifest) => {
      const observed = manifest.assertions.retainedDesktopCapabilitiesProbed!.observed as Record<
        string,
        unknown
      >;
      const surfaces = observed.surfaces as Record<string, unknown>;
      (surfaces.Terminal as Record<string, unknown>).title = "Terminal 0";
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: invalidTerminalOrdinal.rootDir }),
    ).rejects.toThrow(
      "manifest.assertions.retainedDesktopCapabilitiesProbed observed value contradicts passed:true",
    );
  });

  it("requires the exact git check Evidence initially and after reload and restart", async () => {
    for (const [field, value] of [
      ["evidenceId", "f".repeat(64)],
      ["stepId", "wrong-step"],
      ["provenance", "fabricated"],
    ] as const) {
      const wrongReference = await makeFixture((manifest) => {
        const dogfood = manifest.runtime.nativeDogfood;
        const evidence = dogfood.evidence as { before: Record<string, unknown> };
        evidence.before[field] = value;
        manifest.assertions.nativeEvidenceLazyExpanded!.observed = evidence;
      });
      await expect(verifyOrchestraNativeShell({ rootDir: wrongReference.rootDir })).rejects.toThrow(
        "manifest.runtime.nativeDogfood.evidence.before must prove the exact collapsed verify-native-repository reference",
      );
    }

    const wrongInitialEvidence = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      const evidence = dogfood.evidence as { after: Record<string, unknown> };
      evidence.after.evidenceId = "f".repeat(64);
      manifest.assertions.nativeEvidenceLazyExpanded!.observed = evidence;
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: wrongInitialEvidence.rootDir }),
    ).rejects.toThrow(
      "manifest.runtime.nativeDogfood.evidence.after must prove the exact verify-native-repository check",
    );

    const wrongReloadEvidence = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      const reload = dogfood.reload as { evidence: { content: Record<string, unknown> } };
      reload.evidence.content.stdout = "false\n";
      manifest.assertions.nativeDogfoodIdentityRecovered!.observed = {
        workflow: dogfood.workflow,
        symphony: dogfood.symphony,
        reload,
      };
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: wrongReloadEvidence.rootDir }),
    ).rejects.toThrow(
      "manifest.runtime.nativeDogfood.reload must recover the same Run, Evidence, and Root",
    );

    const wrongRestartEvidence = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      const restart = dogfood.restart as {
        recovery: { evidence: { content: Record<string, unknown> } };
      };
      restart.recovery.evidence.content.exit_code = 1;
      manifest.assertions.nativeDogfoodProviderRestartRecovered!.observed = restart;
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: wrongRestartEvidence.rootDir }),
    ).rejects.toThrow(
      "manifest.runtime.nativeDogfood.restart must recover the same Run, Evidence, and Root after a stopped/ready provider cycle",
    );
  });

  it("requires the exact bounded native child projection", async () => {
    const wrongChild = await makeFixture((manifest) => {
      const child = manifest.runtime.nativeDogfood.child as Record<string, unknown>;
      child.outputValue = '"fabricated deterministic native child suffix"';
      manifest.assertions.nativeChildProjected!.observed = child;
    });

    await expect(verifyOrchestraNativeShell({ rootDir: wrongChild.rootDir })).rejects.toThrow(
      "manifest.runtime.nativeDogfood.child must contain the genuine bounded native child projection",
    );

    const oversizedChild = await makeFixture((manifest) => {
      const child = manifest.runtime.nativeDogfood.child as Record<string, unknown>;
      child.childText = `Child /root/${"x".repeat(ORCHESTRA_NATIVE_DOGFOOD_CHILD_TEXT_MAX_CHARS)}`;
      child.childTextTruncated = false;
      manifest.assertions.nativeChildProjected!.observed = child;
    });
    await expect(verifyOrchestraNativeShell({ rootDir: oversizedChild.rootDir })).rejects.toThrow(
      "manifest.runtime.nativeDogfood.child must contain the genuine bounded native child projection",
    );

    const oversizedOutput = await makeFixture((manifest) => {
      const child = manifest.runtime.nativeDogfood.child as Record<string, unknown>;
      child.outputValue = `${JSON.stringify("deterministic native child")}${"x".repeat(
        ORCHESTRA_NATIVE_DOGFOOD_CHILD_OUTPUT_MAX_CHARS,
      )}`;
      child.outputValueTruncated = false;
      manifest.assertions.nativeChildProjected!.observed = child;
    });
    await expect(verifyOrchestraNativeShell({ rootDir: oversizedOutput.rootDir })).rejects.toThrow(
      "manifest.runtime.nativeDogfood.child must contain the genuine bounded native child projection",
    );
  });

  it("rejects duplicate Symphony Roots initially and after reload and restart", async () => {
    const duplicateInitialRoot = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      const symphony = dogfood.symphony as { inspected: Record<string, unknown> };
      symphony.inspected.totalRootCount = 2;
      manifest.assertions.nativeSymphonySkippedIntake!.observed = symphony;
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: duplicateInitialRoot.rootDir }),
    ).rejects.toThrow(
      "manifest.runtime.nativeDogfood.symphony must prove one running skipped-intake Root with no Issue child",
    );

    const duplicateReloadRoot = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      const reload = dogfood.reload as { symphony: Record<string, unknown> };
      reload.symphony.instanceCount = 2;
      manifest.assertions.nativeDogfoodIdentityRecovered!.observed = {
        workflow: dogfood.workflow,
        symphony: dogfood.symphony,
        reload,
      };
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: duplicateReloadRoot.rootDir }),
    ).rejects.toThrow(
      "manifest.runtime.nativeDogfood.reload must recover the same Run, Evidence, and Root",
    );

    const duplicateRestartRoot = await makeFixture((manifest) => {
      const dogfood = manifest.runtime.nativeDogfood;
      const restart = dogfood.restart as {
        recovery: { symphony: Record<string, unknown> };
      };
      restart.recovery.symphony.totalRootCount = 2;
      manifest.assertions.nativeDogfoodProviderRestartRecovered!.observed = restart;
    });
    await expect(
      verifyOrchestraNativeShell({ rootDir: duplicateRestartRoot.rootDir }),
    ).rejects.toThrow(
      "manifest.runtime.nativeDogfood.restart must recover the same Run, Evidence, and Root after a stopped/ready provider cycle",
    );
  });

  it("rejects a desktop tree that does not belong to the resolved source commit", async () => {
    const { rootDir, manifest } = await makeFixture();
    const git = (args: ReadonlyArray<string>): string =>
      NodeChildProcess.execFileSync("git", args, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();

    git(["init"]);
    git(["add", "."]);
    git([
      "-c",
      "user.name=Orchestra Acceptance",
      "-c",
      "user.email=acceptance@example.invalid",
      "commit",
      "-m",
      "native shell fixture",
    ]);
    manifest.desktop.commit = git(["rev-parse", "HEAD"]);
    manifest.desktop.tree = "f".repeat(40);
    await NodeFSP.writeFile(
      NodePath.join(rootDir, acceptanceDirectory, "manifest.json"),
      JSON.stringify(manifest),
    );

    await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(
      "manifest.desktop.tree does not match manifest.desktop.commit",
    );
  });
});

describe("readNativeShellPngDimensions", () => {
  it("rejects non-PNG bytes", () => {
    expect(() => readNativeShellPngDimensions(Buffer.from("not a png"), "fixture")).toThrow(
      "fixture must be a PNG image",
    );
  });
});
