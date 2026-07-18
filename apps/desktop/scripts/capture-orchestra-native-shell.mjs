#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  assertNativeShellAssertions,
  buildNativeGuestFixture,
  canConnectToNativeShellPort,
  cleanupFailedNativeShellCapture,
  isNativeShellProcessGroupEmpty,
  makeNativeShellAssertion,
  ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY,
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  reserveNativeShellPort,
  shouldRunNativeShellElectronChild,
  terminateAndVerifyNativeShellResources,
} from "../../../scripts/lib/orchestra-native-shell-contract.mjs";
import {
  readPngDimensions,
  runGit,
  sha256,
} from "../../../scripts/lib/orchestra-evidence-primitives.mjs";
import {
  assertNativeDogfoodResponsesComplete,
  buildNativeDogfoodFixtures,
  matchNativeDogfoodResponsesRequest,
  NativeDogfoodContractError,
  ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT,
  ORCHESTRA_NATIVE_DOGFOOD_PARENT_PROMPT,
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
  const trackedChanges = runGit(repoRoot, ["status", "--porcelain", "--untracked-files=no"]);
  if (trackedChanges.length > 0 && process.env.ORCHESTRA_NATIVE_ACCEPTANCE_ALLOW_DIRTY !== "1") {
    throw new Error(
      "native-shell capture requires a clean tracked worktree; commit source changes first",
    );
  }

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
  if (!NodeFS.existsSync(dogfoodCodexPath)) {
    throw new Error(`native dogfood Codex binary is missing: ${dogfoodCodexPath}`);
  }
  if (runGit(dogfoodCodexRepository, ["status", "--porcelain"]).length > 0) {
    throw new Error(
      "native dogfood Codex repository must be clean so its binary identity is pinned",
    );
  }
  const dogfoodCodexIdentity = {
    repository: "edgefloor/orchestra-codex",
    commit: runGit(dogfoodCodexRepository, ["rev-parse", "HEAD"]),
    tree: runGit(dogfoodCodexRepository, ["rev-parse", "HEAD^{tree}"]),
    binarySha256: sha256(await NodeFSP.readFile(dogfoodCodexPath)),
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
  runGit(dogfoodRepository, ["init", "--initial-branch=main"]);
  runGit(dogfoodRepository, ["add", "."]);
  runGit(dogfoodRepository, [
    "-c",
    "user.name=Orchestra Acceptance",
    "-c",
    "user.email=acceptance@invalid.local",
    "commit",
    "-m",
    "Seed native dogfood repository",
  ]);
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
    ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_PATH: dogfoodCodexPath,
    ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_IDENTITY: JSON.stringify(dogfoodCodexIdentity),
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

    await new Promise((resolve) => setTimeout(resolve, 500));
    const portsClosed =
      !(await canConnectToNativeShellPort(backendPort)) &&
      !(await canConnectToNativeShellPort(guestPort)) &&
      !(await canConnectToNativeShellPort(failurePort)) &&
      !(await canConnectToNativeShellPort(responsesPort));
    const processGroupEmpty = child.pid
      ? isNativeShellProcessGroupEmpty(child.pid, hostPlatform)
      : false;
    const cleanupVerified = portsClosed && processGroupEmpty !== false;
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
    if (!failureCleanup.portsClosed || failureCleanup.processGroupEmpty === false) {
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
  const dogfoodCodexPath = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_PATH;
  const dogfoodCodexIdentityJson = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CODEX_IDENTITY;
  if (
    !runtimeDirectory ||
    !backendPort ||
    !guestPort ||
    !failurePort ||
    !responsesPort ||
    !dogfoodRepository ||
    !dogfoodCodexPath ||
    !dogfoodCodexIdentityJson
  ) {
    throw new Error("native-shell child environment is incomplete");
  }
  const dogfoodCodexIdentity = JSON.parse(dogfoodCodexIdentityJson);
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

  let responsesRequestCount = 0;
  let responsesContractFailure = null;
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
        const matched = matchNativeDogfoodResponsesRequest(responsesRequestCount, {
          method: request.method,
          pathname: url.pathname,
          contentEncoding: request.headers["content-encoding"],
          body: Buffer.concat(chunks),
        });
        responsesRequestCount += 1;
        response.writeHead(matched.statusCode, matched.headers);
        response.end(matched.body);
      } catch (error) {
        responsesContractFailure = error;
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
    await renderer.executeJavaScript(`window.desktopBridge.setTheme("dark")`, true);
    await renderer.executeJavaScript(
      `(() => { const probe = document.createElement('webview'); probe.id = 'orchestra-rejected-webview-probe'; probe.setAttribute('partition', ${JSON.stringify(rejectedProbePartition)}); probe.setAttribute('src', 'data:text/html,guard-probe'); probe.style.display = 'none'; document.body.append(probe); })()`,
      true,
    );
    rejectedAttachmentObservation = await waitFor(
      () => rejectedAttachmentObservation,
      "rejected production will-attach-webview probe",
    );
    await renderer.executeJavaScript(
      `document.querySelector('#orchestra-rejected-webview-probe')?.remove()`,
      true,
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

    const selectWorkspaceContext = async (tabSelector, sectionLabel, context) => {
      await renderer.executeJavaScript(
        `(() => {
          const tab = document.querySelector(${JSON.stringify(tabSelector)});
          if (!(tab instanceof HTMLElement)) throw new Error(${JSON.stringify(`${context} tab missing`)});
          tab.click();
        })()`,
        true,
      );
      return waitFor(
        () =>
          renderer.executeJavaScript(
            `(() => {
              const section = document.querySelector(${JSON.stringify(`[aria-label="${sectionLabel}"]`)});
              if (!(section instanceof HTMLElement)) return null;
              const text = section.innerText;
              return {
                label: section.getAttribute('aria-label'),
                text: text.slice(0, 4000),
                textTruncated: text.length > 4000,
                runLabels: [...section.querySelectorAll('section[aria-label^="Workflow run "]')]
                  .map((node) => node.getAttribute('aria-label'))
                  .filter(Boolean),
                expandedButtons: section.querySelectorAll('button[aria-expanded="true"]').length,
                collapsedButtons: section.querySelectorAll('button[aria-expanded="false"]').length,
              };
            })()`,
            true,
          ),
        context,
      );
    };

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

    await dispatchCommand(bootstrap.bootstrap.httpBaseUrl, bootstrap.token, {
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
    });
    await waitFor(
      () => {
        if (responsesContractFailure) throw responsesContractFailure;
        return responsesRequestCount >= 3;
      },
      "native dogfood waiting workflow",
      60_000,
    );
    const waitingWorkflow = await waitFor(
      () =>
        renderer
          .executeJavaScript(
            `(() => ({body:document.body.innerText, workflow:document.querySelector('#workspace-context-tab-workflow') !== null, attention:document.querySelector('#workspace-context-tab-attention') !== null}))()`,
            true,
          )
          .then((state) =>
            state.body.includes("Orchestra workflow") && state.workflow && state.attention
              ? state
              : null,
          ),
      "native workflow waiting projection",
      45_000,
    );
    const waitingWorkflowView = await waitFor(
      () =>
        selectWorkspaceContext(
          "#workspace-context-tab-workflow",
          "Task Workflow Runs",
          "rendered waiting Workflow view",
        ).then((state) =>
          state.runLabels.length === 1 && state.text.includes("Waiting") ? state : null,
        ),
      "rendered waiting native Run",
      45_000,
    );
    nativeDogfoodObservation.workflow.waiting = waitingWorkflowView;
    const waitingRunLabel = waitingWorkflowView.runLabels[0];
    const waitingRunId = waitingRunLabel.replace(/^Workflow run /, "");
    const waitingAttentionView = await waitFor(
      () =>
        selectWorkspaceContext(
          "#workspace-context-tab-attention",
          "Task attention",
          "rendered waiting Attention view",
        ).then((state) => (/approval/i.test(state.text) ? state : null)),
      "rendered approval attention state",
      45_000,
    );
    nativeDogfoodObservation.attention.waiting = waitingAttentionView;

    await dispatchCommand(bootstrap.bootstrap.httpBaseUrl, bootstrap.token, {
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
    });
    await waitFor(
      () => {
        if (responsesContractFailure) throw responsesContractFailure;
        return responsesRequestCount >= 5;
      },
      "native dogfood completed workflow",
      60_000,
    );
    assertNativeDogfoodResponsesComplete(responsesRequestCount);
    const completedWorkflow = await waitFor(
      () =>
        renderer
          .executeJavaScript(`document.body.innerText`, true)
          .then((body) =>
            body.includes(ORCHESTRA_NATIVE_DOGFOOD_FINAL_ASSISTANT_TEXT) ? body : null,
          ),
      "native workflow completed projection",
      45_000,
    );
    const completedWorkflowView = await waitFor(
      () =>
        selectWorkspaceContext(
          "#workspace-context-tab-workflow",
          "Task Workflow Runs",
          "rendered completed Workflow view",
        ).then((state) =>
          state.runLabels.length === 1 &&
          state.runLabels[0] === waitingRunLabel &&
          state.text.includes("Completed")
            ? state
            : null,
        ),
      "same rendered native Run after completion",
      45_000,
    );
    nativeDogfoodObservation.workflow.completed = completedWorkflowView;
    nativeDogfoodObservation.workflow.sameRun =
      completedWorkflowView.runLabels.length === 1 &&
      completedWorkflowView.runLabels[0] === waitingRunLabel;

    const workflowRunSelector = `[aria-label=${JSON.stringify(waitingRunLabel)}]`;
    await renderer.executeJavaScript(
      `(() => {
        const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
        const disclosure = run?.querySelector('button[aria-controls][aria-expanded="false"]');
        if (!(disclosure instanceof HTMLButtonElement)) {
          throw new Error('completed native Run disclosure missing');
        }
        disclosure.click();
      })()`,
      true,
    );
    await waitFor(
      () =>
        renderer.executeJavaScript(
          `(() => {
            const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
            return run instanceof HTMLElement &&
              run.innerText.includes('Revision') &&
              !run.innerText.includes('Loading bounded native run tree…');
          })()`,
          true,
        ),
      "bounded completed native Run tree",
      45_000,
    );
    for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
      const openedStep = await renderer.executeJavaScript(
        `(() => {
          const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
          if (!(run instanceof HTMLElement)) return false;
          const disclosure = [...run.querySelectorAll('button[aria-controls][aria-expanded="false"]')]
            .find((button) => button instanceof HTMLButtonElement);
          if (!(disclosure instanceof HTMLButtonElement)) return false;
          disclosure.click();
          return true;
        })()`,
        true,
      );
      if (!openedStep) break;
      await waitFor(
        () =>
          renderer.executeJavaScript(
            `(() => {
              const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
              return run instanceof HTMLElement &&
                !run.innerText.includes('Loading step outputs and evidence references…');
            })()`,
            true,
          ),
        `bounded native step detail ${stepIndex + 1}`,
        45_000,
      );
    }
    const evidenceBefore = await renderer.executeJavaScript(
      `(() => {
        const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
        if (!(run instanceof HTMLElement)) return null;
        const button = [...run.querySelectorAll('button[aria-expanded]:not([aria-controls])')]
          .find((candidate) => candidate instanceof HTMLButtonElement);
        const text = run.innerText;
        return {
          exposed: button instanceof HTMLButtonElement,
          buttonText: button?.textContent?.trim() ?? null,
          contentAbsentBeforeExpand:
            !text.includes('Plain-text preview') &&
            !text.includes('Loading authorized evidence…'),
          runText: text.slice(0, 4000),
          runTextTruncated: text.length > 4000,
        };
      })()`,
      true,
    );
    if (evidenceBefore?.exposed) {
      await renderer.executeJavaScript(
        `(() => {
          const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
          const button = run && [...run.querySelectorAll('button[aria-expanded]:not([aria-controls])')]
            .find((candidate) => candidate instanceof HTMLButtonElement);
          if (!(button instanceof HTMLButtonElement)) throw new Error('evidence disclosure disappeared');
          button.click();
        })()`,
        true,
      );
      const evidenceAfter = await waitFor(
        () =>
          renderer.executeJavaScript(
            `(() => {
              const run = document.querySelector(${JSON.stringify(workflowRunSelector)});
              const button = run && [...run.querySelectorAll('button[aria-expanded]:not([aria-controls])')]
                .find((candidate) => candidate instanceof HTMLButtonElement);
              if (!(run instanceof HTMLElement) || button?.getAttribute('aria-expanded') !== 'true') return null;
              const text = run.innerText;
              if (text.includes('Loading authorized evidence…')) return null;
              return {
                expanded: true,
                contentState: text.includes('Plain-text preview')
                  ? 'text'
                  : text.includes('Evidence integrity changed')
                    ? 'integrity_failure'
                    : text.includes('Evidence media type')
                      ? 'unsupported_media'
                      : text.includes('Empty evidence')
                        ? 'empty'
                        : text.includes('Evidence content too large')
                          ? 'content_too_large'
                          : text.includes('Evidence malformed')
                            ? 'malformed'
                            : text.includes('Evidence unavailable')
                              ? 'unavailable'
                              : 'rendered_other',
                runText: text.slice(0, 4000),
                runTextTruncated: text.length > 4000,
              };
            })()`,
            true,
          ),
        "authorized native evidence expansion",
        45_000,
      );
      nativeDogfoodObservation.evidence = {
        before: evidenceBefore,
        after: evidenceAfter,
      };
    } else {
      nativeDogfoodObservation.evidence = {
        before: evidenceBefore,
        after: null,
      };
    }

    const completedAttentionView = await waitFor(
      () =>
        selectWorkspaceContext(
          "#workspace-context-tab-attention",
          "Task attention",
          "rendered completed Attention view",
        ).then((state) =>
          state.text.includes("No items need intervention") &&
          state.text.includes(
            "approvals, gates, effects, reconciliation, and provider state are clear",
          )
            ? state
            : null,
        ),
      "rendered cleared attention state",
      45_000,
    );
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
      symphonyInspected = await waitFor(
        () =>
          renderer.executeJavaScript(
            `(() => {
              const root = document.querySelector(${JSON.stringify(`${symphonySelector} [aria-label="Automation root status"]`)});
              if (!(root instanceof HTMLElement)) return null;
              const text = root.innerText;
              const runId = [...root.querySelectorAll('code')]
                .map((node) => node.textContent?.trim() ?? '')
                .find((value) => value.startsWith('automation-')) ?? null;
              return runId === ${JSON.stringify(symphonyStarted.runId)} &&
                text.toLowerCase().includes('skipped')
                ? { runId, text: text.slice(0, 4000), textTruncated: text.length > 4000 }
                : null;
            })()`,
            true,
          ),
        "same Symphony root after native inspection",
        45_000,
      );
    }
    nativeDogfoodObservation.symphony = {
      validation: symphonyValidation,
      started: symphonyStarted,
      inspected: symphonyInspected,
      sameRootAfterInspect:
        symphonyInspected === null || symphonyInspected.runId === symphonyStarted.runId,
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
    const reloadWorkflowView = await waitFor(
      () =>
        selectWorkspaceContext(
          "#workspace-context-tab-workflow",
          "Task Workflow Runs",
          "Workflow view after renderer reload",
        ).then((state) =>
          state.runLabels.length === 1 &&
          state.runLabels[0] === waitingRunLabel &&
          state.text.includes("Completed")
            ? state
            : null,
        ),
      "same native Run after renderer reload",
      45_000,
    );
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Symphony automation"]')?.click()`,
      true,
    );
    const reloadSymphonyRoot = await waitFor(
      () =>
        renderer.executeJavaScript(
          `(() => {
            const root = document.querySelector('[aria-label="Symphony automation workspace"] [aria-label="Automation root status"]');
            if (!(root instanceof HTMLElement)) return null;
            const text = root.innerText;
            const runId = [...root.querySelectorAll('code')]
              .map((node) => node.textContent?.trim() ?? '')
              .find((value) => value.startsWith('automation-')) ?? null;
            return runId === ${JSON.stringify(symphonyStarted.runId)} && text.toLowerCase().includes('skipped')
              ? { runId, text: text.slice(0, 4000), textTruncated: text.length > 4000 }
              : null;
          })()`,
          true,
        ),
      "same Symphony root after renderer reload",
      45_000,
    );
    nativeDogfoodObservation.reload = {
      workflow: reloadWorkflowView,
      symphony: reloadSymphonyRoot,
      sameWorkflowRun: reloadWorkflowView.runLabels[0] === waitingRunLabel,
      sameSymphonyRoot: reloadSymphonyRoot.runId === symphonyStarted.runId,
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
    const stoppedThreadSession = await waitFor(
      async () => {
        const snapshot = await fetchThreadSnapshot(
          bootstrap.bootstrap.httpBaseUrl,
          bootstrap.token,
          threadId,
        );
        return snapshot?.thread?.session?.status === "stopped"
          ? boundedThreadSessionObservation(snapshot)
          : null;
      },
      "stopped provider session",
      45_000,
    );
    assertNativeDogfoodResponsesComplete(responsesRequestCount);

    await clickButtonByText(symphonySelector, "Inspect", "Symphony recovery after provider stop");
    const readyThreadSession = await waitFor(
      async () => {
        const snapshot = await fetchThreadSnapshot(
          bootstrap.bootstrap.httpBaseUrl,
          bootstrap.token,
          threadId,
        );
        return snapshot?.thread?.session?.status === "ready"
          ? boundedThreadSessionObservation(snapshot)
          : null;
      },
      "recovered provider session",
      45_000,
    );
    const restartSymphonyRoot = await waitFor(
      () =>
        renderer.executeJavaScript(
          `(() => {
            const root = document.querySelector('[aria-label="Symphony automation workspace"] [aria-label="Automation root status"]');
            if (!(root instanceof HTMLElement)) return null;
            const text = root.innerText;
            const runId = [...root.querySelectorAll('code')]
              .map((node) => node.textContent?.trim() ?? '')
              .find((value) => value.startsWith('automation-')) ?? null;
            return runId === ${JSON.stringify(symphonyStarted.runId)} &&
              text.toLowerCase().includes('skipped') &&
              text.includes('running')
              ? { runId, status: 'running', text: text.slice(0, 4000), textTruncated: text.length > 4000 }
              : null;
          })()`,
          true,
        ),
      "same Symphony root after provider restart",
      45_000,
    );
    const restartWorkflowView = await waitFor(
      () =>
        selectWorkspaceContext(
          "#workspace-context-tab-workflow",
          "Task Workflow Runs",
          "Workflow view after provider restart",
        ).then((state) =>
          state.runLabels.length === 1 &&
          state.runLabels[0] === waitingRunLabel &&
          state.text.includes("Completed")
            ? state
            : null,
        ),
      "same native Run after provider restart",
      45_000,
    );
    assertNativeDogfoodResponsesComplete(responsesRequestCount);
    nativeDogfoodObservation.restart = {
      stop: {
        command: {
          type: providerStopCommand.type,
          commandId: providerStopCommand.commandId,
          threadId: providerStopCommand.threadId,
        },
        receiptSequence: providerStopReceipt?.sequence ?? null,
        thread: stoppedThreadSession,
        responsesRequestCount,
      },
      recovery: {
        trigger: "Symphony Inspect / automation.status",
        thread: readyThreadSession,
        workflow: restartWorkflowView,
        symphony: restartSymphonyRoot,
        responsesRequestCount,
      },
      sameWorkflowRun: restartWorkflowView.runLabels[0] === `Workflow run ${waitingRunId}`,
      sameSymphonyRoot: restartSymphonyRoot.runId === symphonyStarted.runId,
      sameSymphonyStatus: restartSymphonyRoot.status === "running",
    };
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Close Symphony workspace"]')?.click()`,
      true,
    );

    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Toggle right panel"]')?.click()`,
      true,
    );
    await waitFor(
      () => renderer.executeJavaScript(`document.body.innerText.includes("Open a surface")`, true),
      "right panel empty state",
    );
    await renderer.executeJavaScript(
      `(() => {
        const heading = [...document.querySelectorAll('h3')]
          .find((node) => node.textContent?.trim() === 'Open a surface');
        const chooser = heading?.parentElement?.parentElement;
        const button = chooser && [...chooser.querySelectorAll('button')]
          .find((candidate) => [...candidate.querySelectorAll('span')]
            .some((span) => span.textContent?.trim() === 'Browser'));
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          throw new Error('right-panel Browser surface action missing');
        }
        button.click();
      })()`,
      true,
    );
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
        { requestCount: responsesRequestCount },
        responsesRequestCount === 5,
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
        nativeDogfoodObservation.workflow.sameRun === true &&
          nativeDogfoodObservation.workflow.waiting?.runLabels.length === 1 &&
          nativeDogfoodObservation.workflow.waiting.text.includes("Waiting") &&
          nativeDogfoodObservation.workflow.completed?.runLabels.length === 1 &&
          nativeDogfoodObservation.workflow.completed.text.includes("Completed"),
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
        nativeDogfoodObservation.evidence?.before?.exposed === true &&
          nativeDogfoodObservation.evidence.before.contentAbsentBeforeExpand === true &&
          nativeDogfoodObservation.evidence.after?.expanded === true &&
          nativeDogfoodObservation.evidence.after.contentState === "text",
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
          nativeDogfoodObservation.reload.sameSymphonyRoot === true,
      ),
      nativeDogfoodProviderRestartRecovered: makeNativeShellAssertion(
        nativeDogfoodObservation.restart,
        nativeDogfoodObservation.restart?.stop.thread.session?.status === "stopped" &&
          nativeDogfoodObservation.restart.stop.responsesRequestCount === 5 &&
          nativeDogfoodObservation.restart.recovery.thread.session?.status === "ready" &&
          nativeDogfoodObservation.restart.recovery.responsesRequestCount === 5 &&
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
      narrowDrawerObservations.length === 2 &&
        narrowDrawerObservations.every(({ opened }) => opened === true),
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
      capture: {
        electronVersion: process.versions.electron,
        chromiumVersion: process.versions.chrome,
        platform: { os: hostPlatform, arch: hostArchitecture },
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
          responsesRequestCount,
          waitingProjectionVisible: Boolean(waitingWorkflow),
          completedProjectionVisible: Boolean(completedWorkflow),
          ...nativeDogfoodObservation,
        },
        navigation,
        cleanup: { portsClosed: false, processGroupEmpty: false },
      },
      humanReview: {
        status: "pending",
        reviewedAt: new Date(0).toISOString(),
        notes: "Pending direct visual inspection of both real Electron screenshots.",
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
