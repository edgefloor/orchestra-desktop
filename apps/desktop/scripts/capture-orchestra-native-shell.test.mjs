import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { buildMenuItems } from "../../web/src/components/GitActionsControl.logic.ts";

import {
  accumulateNativeShellAssistantMessage,
  NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS,
  NATIVE_SHELL_ASSISTANT_MAX_PENDING_MESSAGES,
  NATIVE_SHELL_ASSISTANT_MAX_TOTAL_CHARS,
  executeNativeShellRendererStep,
  prepareNativeShellGitFixture,
  withNativeShellEventTimeout,
} from "./capture-orchestra-native-shell.mjs";

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
  isNativeShellResourceCleanupComplete,
  isNativeShellTerminalSurfaceTitle,
  isUniqueNativeSymphonyInspection,
  makeNativeShellAssertion,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  reserveNativeShellPort,
  shouldRunNativeShellElectronChild,
  terminateAndVerifyNativeShellResources,
} from "../../../scripts/lib/orchestra-native-shell-contract.mjs";
import {
  isPinnedGitSubtreeIdentity,
  runGit,
  sha256,
} from "../../../scripts/lib/orchestra-evidence-primitives.mjs";

describe("native-shell acceptance capture contract", () => {
  it("attributes renderer script failures to a bounded native capture step", async () => {
    const renderer = {
      executeJavaScript: () => Promise.reject(new Error("Script failed to execute")),
      getURL: () => `t3code://app/${"x".repeat(300)}`,
    };

    await expect(
      executeNativeShellRendererStep(renderer, "window.fixture()", "attach guard probe"),
    ).rejects.toThrow(
      /^attach guard probe renderer script failed at .{1,256}: Script failed to execute$/,
    );
  });

  it("accepts assistant text only after typed deltas reach the matching terminal event", () => {
    const event = (messageId, text, streaming) => ({
      kind: "event",
      event: {
        sequence: streaming ? 2 : 3,
        type: "thread.message-sent",
        payload: { messageId, role: "assistant", text, streaming },
      },
    });
    let state = new Map();
    let output;

    [state, output] = accumulateNativeShellAssistantMessage(
      state,
      event("assistant:waiting", "Native workflow is waiting ", true),
      "Native workflow is waiting for approval.",
    );
    expect(output).toEqual([]);
    [state, output] = accumulateNativeShellAssistantMessage(
      state,
      event("assistant:other", "unrelated", false),
      "Native workflow is waiting for approval.",
    );
    expect(output).toEqual([]);
    [state, output] = accumulateNativeShellAssistantMessage(
      state,
      event("assistant:waiting", "for approval.", true),
      "Native workflow is waiting for approval.",
    );
    expect(output).toEqual([]);
    [state, output] = accumulateNativeShellAssistantMessage(
      state,
      event("assistant:waiting", "", false),
      "Native workflow is waiting for approval.",
    );

    expect(output).toHaveLength(1);
    expect(output[0]?.event.payload).toMatchObject({
      messageId: "assistant:waiting",
      streaming: false,
      text: "Native workflow is waiting for approval.",
    });
    expect(state.has("assistant:waiting")).toBe(false);
  });

  it("rejects extra assistant content and fails closed on bounded reconstruction limits", () => {
    const event = (messageId, text, streaming) => ({
      kind: "event",
      event: {
        sequence: 2,
        type: "thread.message-sent",
        payload: { messageId, role: "assistant", text, streaming },
      },
    });
    const expectedText = "Native workflow is waiting for approval.";
    let state = new Map();
    let output;

    [state] = accumulateNativeShellAssistantMessage(
      state,
      event("assistant:extra", `${expectedText} extra`, true),
      expectedText,
    );
    [state, output] = accumulateNativeShellAssistantMessage(
      state,
      event("assistant:extra", "", false),
      expectedText,
    );
    expect(output).toEqual([]);
    expect(state.has("assistant:extra")).toBe(false);

    expect(() =>
      accumulateNativeShellAssistantMessage(
        new Map(),
        event(
          "assistant:oversized",
          "x".repeat(NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS + 1),
          true,
        ),
        expectedText,
      ),
    ).toThrow(`exceeded ${NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS} characters`);

    state = new Map(
      Array.from({ length: NATIVE_SHELL_ASSISTANT_MAX_PENDING_MESSAGES }, (_, index) => [
        `assistant:pending:${index}`,
        "x",
      ]),
    );
    expect(() =>
      accumulateNativeShellAssistantMessage(
        state,
        event("assistant:pending:overflow", "x", true),
        expectedText,
      ),
    ).toThrow(`exceeded ${NATIVE_SHELL_ASSISTANT_MAX_PENDING_MESSAGES} pending messages`);

    state = new Map([
      ["assistant:total:a", "x".repeat(NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS)],
      ["assistant:total:b", "x".repeat(NATIVE_SHELL_ASSISTANT_MAX_MESSAGE_CHARS)],
    ]);
    expect(() =>
      accumulateNativeShellAssistantMessage(
        state,
        event("assistant:total:overflow", "x", true),
        expectedText,
      ),
    ).toThrow(`exceeded ${NATIVE_SHELL_ASSISTANT_MAX_TOTAL_CHARS} accumulated characters`);
  });

  it.effect("emits only the reconstructed terminal assistant event from the typed stream", () => {
    const event = (sequence, messageId, text, streaming) => ({
      kind: "event",
      event: {
        sequence,
        type: "thread.message-sent",
        payload: { messageId, role: "assistant", text, streaming },
      },
    });
    return Stream.make(
      event(2, "assistant:waiting", "Native workflow is waiting ", true),
      event(3, "assistant:other", "unrelated", false),
      event(4, "assistant:waiting", "for approval.", true),
      event(5, "assistant:waiting", "", false),
    ).pipe(
      Stream.mapAccum(
        () => new Map(),
        (state, item) =>
          accumulateNativeShellAssistantMessage(
            state,
            item,
            "Native workflow is waiting for approval.",
          ),
      ),
      Stream.runHead,
      Effect.map((result) => {
        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.event.sequence).toBe(5);
          expect(result.value.event.payload).toMatchObject({
            messageId: "assistant:waiting",
            streaming: false,
            text: "Native workflow is waiting for approval.",
          });
        }
      }),
    );
  });

  it("preserves typed websocket failures and names the event that timed out", async () => {
    const observations = Effect.gen(function* () {
      const timeoutError = yield* withNativeShellEventTimeout(
        Effect.never,
        "thread.message-sent fixture",
        "5 millis",
      ).pipe(Effect.flip);
      const streamError = yield* withNativeShellEventTimeout(
        Effect.fail(new Error("typed stream failed")),
        "thread.session-set fixture",
        "5 millis",
      ).pipe(Effect.flip);
      return { timeoutError, streamError };
    });
    // oxlint-disable-next-line t3code/no-manual-effect-runtime-in-tests -- Bun's Vitest shim does not advance @effect/vitest's clock for this standalone ESM harness test.
    const { timeoutError, streamError } = await Effect.runPromise(observations);

    expect(timeoutError).toBeInstanceOf(Error);
    expect(timeoutError.message).toBe("thread.message-sent fixture did not arrive within 5 millis");
    expect(streamError).toBeInstanceOf(Error);
    expect(streamError.message).toBe("typed stream failed");
  });

  it("resolves Product pins against the canonical crate subtree", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "native-shell-pins-"));
    try {
      NodeChildProcess.execFileSync("git", ["init", "--quiet"], { cwd: root });
      NodeChildProcess.execFileSync("git", ["config", "user.email", "native-shell@example.test"], {
        cwd: root,
      });
      NodeChildProcess.execFileSync("git", ["config", "user.name", "Native Shell Test"], {
        cwd: root,
      });
      await NodeFSP.mkdir(NodePath.join(root, "crates", "orchestra-core"), { recursive: true });
      await NodeFSP.writeFile(NodePath.join(root, "README.md"), "repository root\n");
      await NodeFSP.writeFile(
        NodePath.join(root, "crates", "orchestra-core", "Cargo.toml"),
        '[package]\nname = "orchestra-core"\nversion = "0.0.0"\n',
      );
      NodeChildProcess.execFileSync("git", ["add", "."], { cwd: root });
      NodeChildProcess.execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });

      const revision = runGit(root, ["rev-parse", "HEAD"]);
      const rootTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
      const subtreeTree = runGit(root, ["rev-parse", "HEAD:crates/orchestra-core"]);

      expect(rootTree).not.toBe(subtreeTree);
      expect(isPinnedGitSubtreeIdentity(root, revision, "crates/orchestra-core", subtreeTree)).toBe(
        true,
      );
      expect(isPinnedGitSubtreeIdentity(root, revision, "crates/orchestra-core", rootTree)).toBe(
        false,
      );
      expect(isPinnedGitSubtreeIdentity(root, revision, "missing", subtreeTree)).toBe(false);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("builds deterministic history-distinct loopback guest pages", () => {
    const first = buildNativeGuestFixture("http://127.0.0.1:4173");
    const second = buildNativeGuestFixture("http://127.0.0.1:4173");

    expect(first).toEqual(second);
    expect(first.pages["/a"]).toContain("Native guest page A");
    expect(first.pages["/a"]).toContain("http://127.0.0.1:4173/b");
    expect(first.pages["/b"]).toContain("Native guest page B");
    expect(first.digest).toBe(sha256(Buffer.from(JSON.stringify(first.pages))));
  });

  it("reads visible Evidence identity through its structured identity attribute", async () => {
    const captureSource = await NodeFSP.readFile(
      NodePath.join(NodePath.dirname(import.meta.filename), "capture-orchestra-native-shell.mjs"),
      "utf8",
    );
    expect(captureSource.match(/querySelector\('\[data-evidence-identity\]'\)/g)).toHaveLength(2);
    expect(captureSource).toContain("getAttribute('data-evidence-identity')");
    expect(captureSource).toContain("visibleIdentity?.textContent?.trim() === 'id '");
    expect(captureSource).not.toContain('aria-label="Evidence identity"');
  });

  it("opens the retained Git menu accessibly and reads only its visible structured items", async () => {
    const captureSource = await NodeFSP.readFile(
      NodePath.join(NodePath.dirname(import.meta.filename), "capture-orchestra-native-shell.mjs"),
      "utf8",
    );
    const probeStart = captureSource.indexOf("const retainedVcsMenu =");
    const probeEnd = captureSource.indexOf("retainedDesktopCapabilities.vcs =", probeStart);
    const probeSource = captureSource.slice(probeStart, probeEnd);
    expect(probeStart).toBeGreaterThanOrEqual(0);
    expect(probeEnd).toBeGreaterThan(probeStart);
    expect(probeSource).toContain("interactWithVisibleMenu(renderer");
    expect(probeSource).toContain('requiredLabels: ["Commit", "Push"]');
    expect(probeSource).not.toContain("executeJavaScript");
  });

  it("gives the isolated repository a local bare origin that exposes production Push", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "orchestra-native-git-"));
    const repository = NodePath.join(root, "repository");
    const remoteRepository = NodePath.join(root, "origin.git");
    try {
      await NodeFSP.mkdir(repository, { recursive: true });
      await NodeFSP.writeFile(NodePath.join(repository, "README.md"), "native fixture\n");
      const identity = prepareNativeShellGitFixture({ repository, remoteRepository });
      expect(identity).toEqual({
        name: "origin",
        transport: "local-bare",
        externalMutation: false,
      });
      expect(runGit(repository, ["remote", "get-url", "origin"])).toBe(remoteRepository);
      expect(runGit(remoteRepository, ["rev-parse", "--is-bare-repository"])).toBe("true");

      const hasPrimaryRemote = runGit(repository, ["remote"]).split("\n").includes("origin");
      const menuItems = buildMenuItems(
        {
          isRepo: true,
          hasPrimaryRemote,
          isDefaultRef: true,
          refName: "main",
          hasWorkingTreeChanges: false,
          workingTree: { files: [], insertions: 0, deletions: 0 },
          hasUpstream: false,
          aheadCount: 1,
          behindCount: 0,
          pr: null,
        },
        false,
        hasPrimaryRemote,
      );
      expect(menuItems.map(({ label }) => label)).toContain("Commit");
      expect(menuItems.map(({ label }) => label)).toContain("Push");
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("accepts a real positive terminal ordinal without assuming it is the first session", () => {
    expect(isNativeShellTerminalSurfaceTitle("Terminal 1")).toBe(true);
    expect(isNativeShellTerminalSurfaceTitle("Terminal 2")).toBe(true);
    expect(isNativeShellTerminalSurfaceTitle("Terminal 0")).toBe(false);
    expect(isNativeShellTerminalSurfaceTitle("term-2")).toBe(false);
  });

  it("selects panel surfaces only from the visible structured Base UI menu", async () => {
    const captureSource = await NodeFSP.readFile(
      NodePath.join(NodePath.dirname(import.meta.filename), "capture-orchestra-native-shell.mjs"),
      "utf8",
    );
    const helperStart = captureSource.indexOf("async function interactWithVisibleMenu");
    const helperEnd = captureSource.indexOf("async function observeDocumentText", helperStart);
    const helperSource = captureSource.slice(helperStart, helperEnd);
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(helperSource).toContain("getClientRects().length === 0");
    expect(helperSource).toContain("candidate.querySelectorAll('[data-slot=\"menu-item\"]')");
    expect(helperSource).toContain("key: 'ArrowDown'");
    expect(helperSource).toContain("popup.dispatchEvent(new KeyboardEvent('keydown'");
    expect(helperSource).toContain("closingPopup.isConnected");
    expect(helperSource).toContain("resolve(JSON.stringify(pendingResult))");
    expect(helperSource).toContain(".slice(0, 32)");
    expect(helperSource).toContain("label.slice(0, 160)");
    expect(helperSource).toContain("JSON.parse(serializedReceipt)");
    expect(helperSource).not.toContain(
      "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape'",
    );
    expect(helperSource).not.toContain("querySelectorAll('[role=\"menuitem\"]')");
    expect(captureSource.match(/interactWithVisibleMenu\(renderer/g)).toHaveLength(2);
    expect(captureSource).toContain("bounded tabs:");
    const addSurfaceStart = captureSource.indexOf("async function addRightPanelSurface");
    const addSurfaceEnd = captureSource.indexOf(
      "function boundedThreadSessionObservation",
      addSurfaceStart,
    );
    const addSurfaceSource = captureSource.slice(addSurfaceStart, addSurfaceEnd);
    expect(addSurfaceSource).toMatch(/trigger\.click\(\);\s*\}\)\(\)/);
    const observeSurfaceStart = captureSource.indexOf(
      "async function observeActiveRightPanelSurface",
    );
    const observeSurfaceEnd = captureSource.indexOf(
      "async function interactWithVisibleMenu",
      observeSurfaceStart,
    );
    const observeSurfaceSource = captureSource.slice(observeSurfaceStart, observeSurfaceEnd);
    expect(observeSurfaceSource).toContain(
      '[data-right-panel-tab-list] [role="tab"][aria-selected="true"]',
    );
    expect(observeSurfaceSource).toContain("active.getAttribute('aria-controls')");
    expect(observeSurfaceSource).toContain("document.getElementById(panelId)");
    expect(observeSurfaceSource).not.toContain(
      'document.querySelector(\'[role="tab"][aria-selected="true"]\')',
    );
    expect(captureSource).not.toContain("native-shell-retained-stage");
  });

  it("requires the exact all-true semantic assertion set", () => {
    expect(ORCHESTRA_NATIVE_SHELL_ASSERTIONS).toContain("nativeDogfoodProviderRestartRecovered");
    const assertions = Object.fromEntries(
      ORCHESTRA_NATIVE_SHELL_ASSERTIONS.map((name) => [
        name,
        makeNativeShellAssertion({ proof: name }, true),
      ]),
    );
    expect(() => assertNativeShellAssertions(assertions)).not.toThrow();
    expect(() =>
      assertNativeShellAssertions({
        ...assertions,
        guestRecovered: makeNativeShellAssertion("wrong page", false),
      }),
    ).toThrow("guestRecovered");
    const { guestRecovered: _removed, ...missing } = assertions;
    expect(() => assertNativeShellAssertions(missing)).toThrow("sealed contract");
  });

  it.each([
    {
      failure: "timeout",
      assertion: "nativeDogfoodResponsesExact",
      observed: { failure: "timeout", requestCount: 4 },
      evaluate: () => isExactNativeDogfoodResponseCount(4),
    },
    {
      failure: "duplicate Runs",
      assertion: "nativeWorkflowLifecycleRendered",
      observed: { runIds: ["run-cycle8", "run-cycle8-duplicate"] },
      evaluate: () =>
        isNativeWorkflowLifecycleObservation({
          sameRun: true,
          waiting: { runLabels: ["run-cycle8", "run-cycle8-duplicate"], text: "Waiting" },
          completed: { runLabels: ["run-cycle8"], text: "Completed" },
        }),
    },
    {
      failure: "missing evidence",
      assertion: "nativeEvidenceLazyExpanded",
      observed: { evidenceCount: 0 },
      evaluate: () =>
        isNativeEvidenceObservation({
          before: { exposed: true, contentAbsentBeforeExpand: true },
          after: { expanded: false, contentState: "absent" },
        }),
    },
    {
      failure: "drawer failure",
      assertion: "narrowDrawerOpened",
      observed: { opened: false, drawerOpen: false },
      evaluate: () => isNarrowDrawerOpenedObservation([{ opened: true }, { opened: false }]),
    },
  ])("fails closed for $failure", ({ assertion, observed, evaluate }) => {
    const assertions = Object.fromEntries(
      ORCHESTRA_NATIVE_SHELL_ASSERTIONS.map((name) => [
        name,
        makeNativeShellAssertion({ proof: name }, true),
      ]),
    );
    const passed = evaluate();
    expect(passed).toBe(false);
    assertions[assertion] = makeNativeShellAssertion(observed, passed);

    expect(() => assertNativeShellAssertions(assertions)).toThrow(assertion);
  });

  it("rejects a real production-shared request-count waiter timeout and contract failure", async () => {
    const timeoutWaiter = createNativeShellRequestCountWaiter();
    await expect(timeoutWaiter.waitFor(1, "timeout fixture", 5)).rejects.toThrow(
      "timeout fixture did not reach 1 Responses requests within 5ms",
    );

    const failedWaiter = createNativeShellRequestCountWaiter();
    const pending = failedWaiter.waitFor(1, "failure fixture", 1_000);
    failedWaiter.fail(new Error("sealed Responses contract failed"));
    await expect(pending).rejects.toThrow("sealed Responses contract failed");
  });

  it("requires a real unique Symphony inspection and exact git check Evidence", () => {
    const started = { runId: "automation-cycle8" };
    expect(isUniqueNativeSymphonyInspection(started, null)).toBe(false);
    expect(
      isUniqueNativeSymphonyInspection(started, {
        runId: "automation-cycle8",
        instanceCount: 1,
        totalRootCount: 1,
      }),
    ).toBe(true);
    expect(
      isUniqueNativeSymphonyInspection(started, {
        runId: "automation-cycle8",
        instanceCount: 2,
        totalRootCount: 2,
      }),
    ).toBe(false);

    const evidenceReference = {
      stepId: "verify-native-repository",
      evidenceName: "verify-native-repository-1.json",
      evidenceId: sha256(Buffer.from("checks/verify-native-repository-1.json")),
      displayedEvidenceIdPrefix: sha256(
        Buffer.from("checks/verify-native-repository-1.json"),
      ).slice(0, 12),
      kind: "check",
      provenance: "runtime_check",
      availability: "available",
      exposed: true,
      contentAbsentBeforeExpand: true,
    };
    expect(isNativeGitCheckEvidenceReferenceObservation(evidenceReference)).toBe(true);
    expect(
      isNativeGitCheckEvidenceReferenceObservation({
        ...evidenceReference,
        provenance: "provider",
      }),
    ).toBe(false);

    const evidence = {
      ...evidenceReference,
      expanded: true,
      contentState: "text",
      content: {
        argv: ["git", "rev-parse", "--is-inside-work-tree"],
        exit_code: 0,
        stdout: "true\n",
        stderr: "",
      },
    };
    expect(isNativeGitCheckEvidenceObservation(evidence)).toBe(true);
    expect(isNativeGitCheckEvidenceObservation({ ...evidence, evidenceId: "wrong" })).toBe(false);
    expect(
      isNativeGitCheckEvidenceObservation({
        ...evidence,
        content: { ...evidence.content, stdout: "false\n" },
      }),
    ).toBe(false);
  });

  it("requires affirmative process-group cleanup instead of accepting unknown", () => {
    expect(isNativeShellProcessGroupEmpty(1, "win32")).toBeNull();
    expect(
      isNativeShellResourceCleanupComplete({ portsClosed: true, processGroupEmpty: null }),
    ).toBe(false);
    expect(
      isNativeShellResourceCleanupComplete({ portsClosed: true, processGroupEmpty: false }),
    ).toBe(false);
    expect(
      isNativeShellResourceCleanupComplete({ portsClosed: true, processGroupEmpty: true }),
    ).toBe(true);
  });

  it("seals both themes and real narrow drawer scenarios", () => {
    expect(ORCHESTRA_NATIVE_SHELL_SCREENSHOTS).toEqual([
      {
        scenario: "native-browser-1440x900-dark",
        width: 1440,
        height: 900,
        theme: "dark",
        drawerOpen: false,
      },
      {
        scenario: "native-browser-1440x900-light",
        width: 1440,
        height: 900,
        theme: "light",
        drawerOpen: false,
      },
      {
        scenario: "native-workspace-1024x768-dark-drawer",
        width: 1024,
        height: 768,
        theme: "dark",
        drawerOpen: true,
      },
      {
        scenario: "native-workspace-1024x768-light-drawer",
        width: 1024,
        height: 768,
        theme: "light",
        drawerOpen: true,
      },
    ]);
  });

  it("enters Electron child mode only for the explicit acceptance capability", () => {
    expect(shouldRunNativeShellElectronChild({})).toBe(false);
    expect(
      shouldRunNativeShellElectronChild({
        ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "0",
      }),
    ).toBe(false);
    expect(
      shouldRunNativeShellElectronChild({
        ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1",
      }),
    ).toBe(true);
  });

  it("removes partial generated evidence and the isolated runtime after failure", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "native-shell-cleanup-"));
    const runtimeDirectory = NodePath.join(root, "runtime");
    const evidenceDirectory = NodePath.join(root, "evidence");
    await Promise.all([
      NodeFSP.mkdir(runtimeDirectory, { recursive: true }),
      NodeFSP.mkdir(evidenceDirectory, { recursive: true }),
    ]);
    await Promise.all([
      NodeFSP.writeFile(NodePath.join(runtimeDirectory, "owned.txt"), "owned"),
      NodeFSP.writeFile(NodePath.join(evidenceDirectory, "README.md"), "keep"),
      NodeFSP.writeFile(NodePath.join(evidenceDirectory, "manifest.json"), "partial"),
      ...ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map(({ scenario }) =>
        NodeFSP.writeFile(NodePath.join(evidenceDirectory, `${scenario}.png`), "partial"),
      ),
    ]);

    await cleanupFailedNativeShellCapture({
      runtimeDirectory,
      evidenceDirectory,
    });

    await expect(NodeFSP.stat(runtimeDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      NodeFSP.stat(NodePath.join(evidenceDirectory, "manifest.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await NodeFSP.readFile(NodePath.join(evidenceDirectory, "README.md"), "utf8")).toBe(
      "keep",
    );
    await NodeFSP.rm(root, { recursive: true, force: true });
  });

  it("terminates the owned process group and closes its listener after failure", async () => {
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone harness test has no Effect runtime.
    const platform = NodeOS.platform();
    if (platform === "win32") return;
    const port = await reserveNativeShellPort();
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Test launches the current Node binary as an owned disposable child.
    const child = NodeChildProcess.spawn(
      NodeProcess.execPath,
      [
        "-e",
        `require('node:net').createServer().listen(${port}, '127.0.0.1'); setInterval(() => {}, 1000);`,
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    let cleanup;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await canConnectToNativeShellPort(port)) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(await canConnectToNativeShellPort(port)).toBe(true);
    } finally {
      cleanup = await terminateAndVerifyNativeShellResources({
        ...(child.pid ? { pid: child.pid } : {}),
        ports: [port],
        platform,
      });
    }

    expect(cleanup).toEqual({
      terminationAttempted: true,
      portsClosed: true,
      processGroupEmpty: true,
    });
  });
});
