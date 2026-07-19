import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import { sha256 } from "./orchestra-evidence-primitives.mjs";
import {
  ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME,
  ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH,
  ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID,
  ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT,
} from "./orchestra-native-dogfood-contract.mjs";

export const ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY = "docs/acceptance/orchestra-native-shell";

export const ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY = Object.freeze({
  name: "origin",
  transport: "local-bare",
  externalMutation: false,
});

export const ORCHESTRA_NATIVE_SHELL_TERMINAL_TITLE_PATTERN = "^Terminal [1-9][0-9]*$";

export function isNativeShellGitFixtureIdentity(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 3 &&
    value.name === ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY.name &&
    value.transport === ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY.transport &&
    value.externalMutation === ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY.externalMutation
  );
}

export function isNativeShellTerminalSurfaceTitle(value) {
  return (
    typeof value === "string" &&
    new RegExp(ORCHESTRA_NATIVE_SHELL_TERMINAL_TITLE_PATTERN).test(value)
  );
}

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
    "currentCodexForkRecorded",
    "nativeDogfoodResponsesExact",
    "nativeChildProjected",
    "nativeWorkflowLifecycleRendered",
    "nativeAttentionResolved",
    "nativeEvidenceLazyExpanded",
    "nativeSymphonySkippedIntake",
    "nativeDogfoodIdentityRecovered",
    "nativeDogfoodProviderRestartRecovered",
    "nativeSelectedIssueRendered",
    "nativeSelectedIssueFocusedStatus",
    "nativeSelectedIssueSteeringDelivered",
    "nativeSelectedIssueTrackerBoundary",
    "nativeSelectedIssueParentNavigation",
    "nativeSelectedIssueDiffSurface",
    "nativeSelectedIssueNativeActivity",
    "nativeSelectedIssueBoundedScroll",
    "nativeSelectedIssueRootNoOverflow",
    "retainedDesktopCapabilitiesProbed",
    "composerVisible",
    "taskTabsVisible",
    "realWebviewAttached",
    "approvedPreviewPartition",
    "attachmentGuardAllowed",
    "attachmentGuardRejectedInvalidPartition",
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
    "themeMatrixCaptured",
    "noDocumentHorizontalOverflow",
    "narrowDisclosureReachable",
    "narrowDrawerOpened",
    "narrowDrawerClosed",
    "narrowDrawerFocusRestored",
    "narrowDiffSurfaceVisible",
    "narrowTaskComposerReachable",
    "processCleanupVerified",
  ].sort(),
);

export const ORCHESTRA_NATIVE_SHELL_SCREENSHOTS = Object.freeze([
  Object.freeze({
    scenario: "native-selected-issue-1024x768-dark",
    width: 1024,
    height: 768,
    theme: "dark",
    selectedIssue: true,
    drawerOpen: false,
  }),
  Object.freeze({
    scenario: "native-browser-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    drawerOpen: false,
  }),
  Object.freeze({
    scenario: "native-browser-1440x900-light",
    width: 1440,
    height: 900,
    theme: "light",
    drawerOpen: false,
  }),
  Object.freeze({
    scenario: "native-workspace-1024x768-dark-drawer",
    width: 1024,
    height: 768,
    theme: "dark",
    drawerOpen: true,
  }),
  Object.freeze({
    scenario: "native-workspace-1024x768-light-drawer",
    width: 1024,
    height: 768,
    theme: "light",
    drawerOpen: true,
  }),
]);

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

export function isExactNativeDogfoodResponseCount(requestCount) {
  return requestCount === ORCHESTRA_NATIVE_DOGFOOD_REQUEST_COUNT;
}

export function createNativeShellRequestCountWaiter() {
  let count = 0;
  let failure = null;
  const waiters = new Set();

  const settle = () => {
    for (const waiter of waiters) {
      if (failure) {
        waiters.delete(waiter);
        clearTimeout(waiter.timeout);
        waiter.reject(failure);
      } else if (count >= waiter.target) {
        waiters.delete(waiter);
        clearTimeout(waiter.timeout);
        waiter.resolve(count);
      }
    }
  };

  return Object.freeze({
    get count() {
      return count;
    },
    increment() {
      count += 1;
      settle();
      return count;
    },
    fail(error) {
      failure = error instanceof Error ? error : new Error(String(error));
      settle();
    },
    waitFor(target, context, timeoutMs = 60_000) {
      return new Promise((resolve, reject) => {
        if (failure) {
          reject(failure);
          return;
        }
        if (count >= target) {
          resolve(count);
          return;
        }
        const waiter = {
          target,
          resolve,
          reject,
          timeout: setTimeout(() => {
            waiters.delete(waiter);
            reject(
              new Error(
                `${context} did not reach ${target} Responses requests within ${timeoutMs}ms`,
              ),
            );
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
  });
}

export function isNativeWorkflowLifecycleObservation(observation) {
  return (
    observation?.sameRun === true &&
    observation.waiting?.runLabels.length === 1 &&
    observation.waiting.runStatuses.length === 1 &&
    observation.waiting.runStatuses[0] === "waiting" &&
    observation.completed?.runLabels.length === 1 &&
    observation.completed.runStatuses.length === 1 &&
    observation.completed.runStatuses[0] === "completed"
  );
}

export function isNativeEvidenceObservation(observation) {
  return (
    observation?.before?.exposed === true &&
    observation.before.contentAbsentBeforeExpand === true &&
    observation.after?.expanded === true &&
    observation.after.contentState === "text"
  );
}

function isNativeGitCheckEvidenceIdentityObservation(observation) {
  const expectedEvidenceId = sha256(
    Buffer.from(ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_RELATIVE_PATH),
  );
  return (
    observation?.stepId === ORCHESTRA_NATIVE_DOGFOOD_CHECK_STEP_ID &&
    observation.evidenceName === ORCHESTRA_NATIVE_DOGFOOD_CHECK_EVIDENCE_NAME &&
    observation.evidenceId === expectedEvidenceId &&
    observation.displayedEvidenceIdPrefix === expectedEvidenceId.slice(0, 12) &&
    observation.kind === "check" &&
    observation.provenance === "runtime_check" &&
    observation.availability === "available"
  );
}

export function isNativeGitCheckEvidenceReferenceObservation(observation) {
  return (
    isNativeGitCheckEvidenceIdentityObservation(observation) &&
    observation.exposed === true &&
    observation.contentAbsentBeforeExpand === true
  );
}

export function isNativeGitCheckEvidenceObservation(observation) {
  return (
    isNativeGitCheckEvidenceIdentityObservation(observation) &&
    observation.expanded === true &&
    observation.contentState === "text" &&
    Array.isArray(observation.content?.argv) &&
    JSON.stringify(observation.content.argv) ===
      JSON.stringify(["git", "rev-parse", "--is-inside-work-tree"]) &&
    observation.content.exit_code === 0 &&
    observation.content.stdout?.trim() === "true" &&
    observation.content.stderr === ""
  );
}

export function isUniqueNativeSymphonyInspection(started, inspected) {
  return (
    typeof started?.runId === "string" &&
    inspected?.runId === started.runId &&
    inspected.instanceCount === 1 &&
    inspected.totalRootCount === 1
  );
}

export function isNarrowDrawerOpenedObservation(observations) {
  return (
    Array.isArray(observations) &&
    observations.length === 2 &&
    observations.every(({ opened }) => opened === true)
  );
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

export function isNativeShellResourceCleanupComplete(observation) {
  return observation?.portsClosed === true && observation.processGroupEmpty === true;
}

export async function reserveNativeShellPort() {
  const server = NodeNet.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve loopback port");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export async function canConnectToNativeShellPort(port) {
  return new Promise((resolve) => {
    const socket = NodeNet.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function terminateAndVerifyNativeShellResources({
  pid,
  ports,
  platform,
  timeoutMs = 5_000,
}) {
  let terminationAttempted = false;
  if (typeof pid === "number" && pid > 0) {
    const processTarget = platform === "win32" ? pid : -pid;
    if (isNativeShellProcessGroupEmpty(pid, platform) !== true) {
      terminationAttempted = true;
      try {
        // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone harness terminates only its owned child process group.
        NodeProcess.kill(processTarget, "SIGKILL");
      } catch (error) {
        if (!(error !== null && typeof error === "object" && error.code === "ESRCH")) throw error;
      }
    }
  }

  const deadline = Date.now() + timeoutMs;
  let processGroupEmpty =
    typeof pid === "number" && pid > 0 ? isNativeShellProcessGroupEmpty(pid, platform) : true;
  let portsClosed = false;
  while (Date.now() < deadline) {
    portsClosed = (await Promise.all(ports.map(canConnectToNativeShellPort))).every(
      (connected) => !connected,
    );
    processGroupEmpty =
      typeof pid === "number" && pid > 0 ? isNativeShellProcessGroupEmpty(pid, platform) : true;
    if (isNativeShellResourceCleanupComplete({ portsClosed, processGroupEmpty })) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { terminationAttempted, portsClosed, processGroupEmpty };
}

export async function cleanupFailedNativeShellCapture({
  runtimeDirectory,
  evidenceDirectory,
  removeRuntime = true,
}) {
  await Promise.all([
    ...(removeRuntime ? [NodeFSP.rm(runtimeDirectory, { recursive: true, force: true })] : []),
    NodeFSP.rm(NodePath.join(evidenceDirectory, "manifest.json"), {
      force: true,
    }),
    ...ORCHESTRA_NATIVE_SHELL_SCREENSHOTS.map(({ scenario }) =>
      NodeFSP.rm(NodePath.join(evidenceDirectory, `${scenario}.png`), {
        force: true,
      }),
    ),
  ]);
}
