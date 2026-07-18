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
    expect(shouldRunNativeShellElectronChild({ ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "0" })).toBe(
      false,
    );
    expect(shouldRunNativeShellElectronChild({ ORCHESTRA_NATIVE_ACCEPTANCE_CHILD: "1" })).toBe(
      true,
    );
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

    await cleanupFailedNativeShellCapture({ runtimeDirectory, evidenceDirectory });

    await expect(NodeFSP.stat(runtimeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
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
