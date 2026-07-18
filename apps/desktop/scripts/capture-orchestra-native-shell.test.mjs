import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  assertNativeShellAssertions,
  buildNativeGuestFixture,
  cleanupFailedNativeShellCapture,
  makeNativeShellAssertion,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  sha256,
  shouldRunNativeShellElectronChild,
} from "../../../scripts/lib/orchestra-native-shell-contract.mjs";

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
});
