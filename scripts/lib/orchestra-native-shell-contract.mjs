import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

export const ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY = "docs/acceptance/orchestra-native-shell";

export const ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS = Object.freeze([
  "apps/desktop/dist-electron/main.cjs",
  "apps/desktop/dist-electron/preload.cjs",
  "apps/server/dist/bin.mjs",
  "apps/web/dist/index.html",
]);

export const ORCHESTRA_NATIVE_SHELL_ASSERTIONS = Object.freeze(
  [
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
    "attachmentGuardAllowed",
    "guestSandboxEnabled",
    "guestContextIsolationDisabled",
    "guestNodeIntegrationDisabled",
    "guestNodeIntegrationInSubFramesDisabled",
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
  ].sort(),
);

export const ORCHESTRA_NATIVE_SHELL_SCREENSHOTS = Object.freeze([
  Object.freeze({ scenario: "native-browser-1440x900-dark", width: 1440, height: 900 }),
  Object.freeze({ scenario: "native-workspace-1024x768-dark", width: 1024, height: 768 }),
]);

export function sha256(bytes) {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export function buildNativeGuestFixture(origin) {
  const sharedStyle = `html{font-family:ui-sans-serif,system-ui;background:#111827;color:#f9fafb}body{margin:0;min-height:100vh;display:grid;place-items:center}.card{width:min(560px,calc(100vw - 48px));padding:32px;border:1px solid #374151;border-radius:18px;background:#1f2937;box-shadow:0 20px 60px #0008}h1{margin:0 0 12px;font-size:28px}p{color:#cbd5e1}button,a{display:inline-flex;margin:8px 8px 0 0;padding:10px 14px;border:0;border-radius:9px;background:#7c3aed;color:#fff;font:inherit;text-decoration:none;cursor:pointer}.marker{margin-top:16px;color:#a7f3d0;font-family:ui-monospace,monospace}`;
  const page = (name, other) =>
    `<!doctype html><html><head><meta charset="utf-8"><title>Native Guest ${name}</title><style>${sharedStyle}</style></head><body><main class="card"><p>Orchestra production webview</p><h1>Native guest page ${name}</h1><p id="identity">deterministic-native-guest-${name.toLowerCase()}</p><a id="history-link" href="${origin}/${other.toLowerCase()}">Open page ${other}</a><button id="mutate" type="button">Mutate guest DOM</button><div id="mutation" class="marker">not-mutated</div><div id="load-count" class="marker"></div></main><script>const key='orchestra-native-load-${name.toLowerCase()}';const count=Number(sessionStorage.getItem(key)||'0')+1;sessionStorage.setItem(key,String(count));document.documentElement.dataset.loadCount=String(count);document.querySelector('#load-count').textContent='load-count:'+count;document.querySelector('#mutate').addEventListener('click',()=>{document.querySelector('#mutation').textContent='mutated-through-production-automation'});</script></body></html>`;
  const pages = { "/a": page("A", "B"), "/b": page("B", "A") };
  return { pages, digest: sha256(Buffer.from(JSON.stringify(pages))) };
}

export function makeNativeShellAssertion(observed, passed = Boolean(observed)) {
  return { observed, passed };
}

export function assertNativeShellAssertions(assertions) {
  const actual = Object.keys(assertions).sort();
  if (JSON.stringify(actual) !== JSON.stringify(ORCHESTRA_NATIVE_SHELL_ASSERTIONS)) {
    throw new Error("native-shell assertions do not match the sealed contract");
  }
  const failed = actual.filter((name) => {
    const assertion = assertions[name];
    return (
      assertion === null ||
      typeof assertion !== "object" ||
      Array.isArray(assertion) ||
      Object.keys(assertion).sort().join(",") !== "observed,passed" ||
      assertion.passed !== true
    );
  });
  if (failed.length > 0) {
    throw new Error(`native-shell assertions failed: ${failed.join(", ")}`);
  }
}

export function readNativeShellPngDimensions(bytes, context = "image") {
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

export function shouldRunNativeShellElectronChild(environment) {
  return environment.ORCHESTRA_NATIVE_ACCEPTANCE_CHILD === "1";
}

export function isNativeShellProcessGroupEmpty(pid, platform) {
  if (platform === "win32") return null;
  try {
    // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone harness probes its owned child process group.
    NodeProcess.kill(-pid, 0);
    return false;
  } catch (error) {
    return error !== null && typeof error === "object" && error.code === "ESRCH";
  }
}

export async function cleanupFailedNativeShellCapture({
  runtimeDirectory,
  evidenceDirectory,
  removeRuntime = true,
}) {
  await Promise.all([
    ...(removeRuntime ? [NodeFSP.rm(runtimeDirectory, { recursive: true, force: true })] : []),
    NodeFSP.rm(NodePath.join(evidenceDirectory, "manifest.json"), { force: true }),
    ...ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map(({ scenario }) =>
      NodeFSP.rm(NodePath.join(evidenceDirectory, `${scenario}.png`), { force: true }),
    ),
  ]);
}
