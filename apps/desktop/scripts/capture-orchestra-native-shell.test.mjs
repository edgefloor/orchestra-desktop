import { describe, expect, it } from "vite-plus/test";

import {
  assertNativeShellAssertions,
  buildNativeGuestFixture,
  sha256,
} from "./capture-orchestra-native-shell.mjs";

const assertionNames = [
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
];

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
    const assertions = Object.fromEntries(assertionNames.map((name) => [name, true]));
    expect(() => assertNativeShellAssertions(assertions)).not.toThrow();
    expect(() => assertNativeShellAssertions({ ...assertions, guestRecovered: false })).toThrow(
      "guestRecovered",
    );
    const { guestRecovered: _removed, ...missing } = assertions;
    expect(() => assertNativeShellAssertions(missing)).toThrow("sealed contract");
  });
});
