import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import { describe, expect, it } from "vite-plus/test";

import {
  assertNativeShellAssertions,
  buildNativeGuestFixture,
  canConnectToNativeShellPort,
  cleanupFailedNativeShellCapture,
  createNativeShellRequestCountWaiter,
  isExactNativeDogfoodResponseCount,
  isNativeGitCheckEvidenceObservation,
  isNarrowDrawerOpenedObservation,
  isNativeEvidenceObservation,
  isNativeWorkflowLifecycleObservation,
  isUniqueNativeSymphonyInspection,
  makeNativeShellAssertion,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  reserveNativeShellPort,
  shouldRunNativeShellElectronChild,
  terminateAndVerifyNativeShellResources,
} from "../../../scripts/lib/orchestra-native-shell-contract.mjs";
import { sha256 } from "../../../scripts/lib/orchestra-evidence-primitives.mjs";

describe("native-shell acceptance capture contract", () => {
  it("builds deterministic history-distinct loopback guest pages", () => {
    const first = buildNativeGuestFixture("http://127.0.0.1:4173");
    const second = buildNativeGuestFixture("http://127.0.0.1:4173");

    expect(first).toEqual(second);
    expect(first.pages["/a"]).toContain("Native guest page A");
    expect(first.pages["/a"]).toContain("http://127.0.0.1:4173/b");
    expect(first.pages["/b"]).toContain("Native guest page B");
    expect(first.digest).toBe(sha256(Buffer.from(JSON.stringify(first.pages))));
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

    const evidence = {
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
