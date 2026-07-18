#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { resolveElectronLaunchCommand } from "./electron-launcher.mjs";

const scriptPath = NodeURL.fileURLToPath(import.meta.url);
const desktopDir = NodePath.resolve(NodePath.dirname(scriptPath), "..");
const repoRoot = NodePath.resolve(desktopDir, "..", "..");
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone native-shell harness has no Effect runtime.
const hostPlatform = NodeOS.platform();
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone native-shell harness has no Effect runtime.
const hostArchitecture = NodeOS.arch();
const mainBundle = NodePath.join(desktopDir, "dist-electron", "main.cjs");
const evidenceDirectory = NodePath.join(repoRoot, "docs", "acceptance", "orchestra-native-shell");
const evidenceRelativeDirectory = "docs/acceptance/orchestra-native-shell";
const manifestPath = NodePath.join(evidenceDirectory, "manifest.json");
const projectId = "project-native-shell-acceptance";
const threadId = "thread-native-shell-acceptance";
const projectTitle = "Orchestra Desktop Native Acceptance";
const threadTitle = "Native Browser acceptance";
const requiredAssertionNames = [
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
].sort();

const screenshotScenarios = [
  { scenario: "native-browser-1440x900-dark", width: 1440, height: 900 },
  { scenario: "native-workspace-1024x768-dark", width: 1024, height: 768 },
];

function runGit(args) {
  return NodeChildProcess.execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function sha256(bytes) {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export function buildNativeGuestFixture(origin) {
  const sharedStyle = `html{font-family:ui-sans-serif,system-ui;background:#111827;color:#f9fafb}body{margin:0;min-height:100vh;display:grid;place-items:center}.card{width:min(560px,calc(100vw - 48px));padding:32px;border:1px solid #374151;border-radius:18px;background:#1f2937;box-shadow:0 20px 60px #0008}h1{margin:0 0 12px;font-size:28px}p{color:#cbd5e1}button,a{display:inline-flex;margin:8px 8px 0 0;padding:10px 14px;border:0;border-radius:9px;background:#7c3aed;color:#fff;font:inherit;text-decoration:none;cursor:pointer}.marker{margin-top:16px;color:#a7f3d0;font-family:ui-monospace,monospace}`;
  const page = (name, other) =>
    `<!doctype html><html><head><meta charset="utf-8"><title>Native Guest ${name}</title><style>${sharedStyle}</style></head><body><main class="card"><p>Orchestra production webview</p><h1>Native guest page ${name}</h1><p id="identity">deterministic-native-guest-${name.toLowerCase()}</p><a id="history-link" href="${origin}/${other.toLowerCase()}">Open page ${other}</a><button id="mutate" type="button">Mutate guest DOM</button><div id="mutation" class="marker">not-mutated</div><div id="load-count" class="marker"></div></main><script>const key='orchestra-native-load-${name.toLowerCase()}';const count=Number(sessionStorage.getItem(key)||'0')+1;sessionStorage.setItem(key,String(count));document.documentElement.dataset.loadCount=String(count);document.querySelector('#load-count').textContent='load-count:'+count;document.querySelector('#mutate').addEventListener('click',()=>{document.querySelector('#mutation').textContent='mutated-through-production-automation'});</script></body></html>`;
  const pages = { "/a": page("A", "B"), "/b": page("B", "A") };
  return {
    pages,
    digest: sha256(Buffer.from(JSON.stringify(pages))),
  };
}

export function assertNativeShellAssertions(assertions) {
  const actual = Object.keys(assertions).sort();
  if (JSON.stringify(actual) !== JSON.stringify(requiredAssertionNames)) {
    throw new Error("native-shell assertions do not match the sealed contract");
  }
  const failed = actual.filter((name) => assertions[name] !== true);
  if (failed.length > 0) {
    throw new Error(`native-shell assertions failed: ${failed.join(", ")}`);
  }
}

function readPngDimensions(bytes, context) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, signature.length).equals(signature) ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error(`${context} did not produce a PNG`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function reservePort() {
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

async function canConnect(port) {
  return new Promise((resolve) => {
    const socket = NodeNet.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitFor(predicate, context, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
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
  const trackedChanges = runGit(["status", "--porcelain", "--untracked-files=no"]);
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
  const backendPort = await reservePort();
  const guestPort = await reservePort();
  const failurePort = await reservePort();
  await Promise.all(
    [wrapperDirectory, homeDirectory, t3Home, codexHome].map((directory) =>
      NodeFSP.mkdir(directory, { recursive: true }),
    ),
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
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.VITE_DEV_SERVER_URL;
  scrubProviderCredentials(environment);

  const launch = resolveElectronLaunchCommand([wrapperDirectory, "--force-device-scale-factor=1"]);
  try {
    const child = NodeChildProcess.spawn(launch.electronPath, launch.args, {
      cwd: repoRoot,
      env: environment,
      stdio: "inherit",
      detached: hostPlatform !== "win32",
    });
    const exit = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (hostPlatform !== "win32" && child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        } else {
          child.kill("SIGKILL");
        }
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
    const cleanupVerified =
      !(await canConnect(backendPort)) &&
      !(await canConnect(guestPort)) &&
      !(await canConnect(failurePort));
    const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8"));
    manifest.assertions.processCleanupVerified = cleanupVerified;
    assertNativeShellAssertions(manifest.assertions);
    await NodeFSP.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `Native-shell evidence captured at ${NodePath.relative(repoRoot, evidenceDirectory)}`,
    );
  } finally {
    await NodeFSP.rm(runtimeDirectory, { recursive: true, force: true });
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

async function runElectronChild() {
  const { app, BrowserWindow, webContents } = await import("electron");
  const runtimeDirectory = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_RUNTIME_DIR;
  const backendPort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_BACKEND_PORT);
  const guestPort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_GUEST_PORT);
  const failurePort = Number(process.env.ORCHESTRA_NATIVE_ACCEPTANCE_FAILURE_PORT);
  if (!runtimeDirectory || !backendPort || !guestPort || !failurePort) {
    throw new Error("native-shell child environment is incomplete");
  }
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
    await waitFor(
      () =>
        renderer.executeJavaScript(
          `document.readyState === "complete" && typeof window.desktopBridge?.getLocalEnvironmentBootstraps === "function"`,
          true,
        ),
      "production preload bridge",
    );
    await renderer.executeJavaScript(`window.desktopBridge.setTheme("dark")`, true);

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
      workspaceRoot: repoRoot,
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

    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Toggle right panel"]')?.click()`,
      true,
    );
    await waitFor(
      () => renderer.executeJavaScript(`document.body.innerText.includes("Open a surface")`, true),
      "right panel empty state",
    );
    await renderer.executeJavaScript(
      `([...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith('Browser')))?.click()`,
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
    const waitGuestTitle = (title) =>
      waitFor(
        () =>
          guestEvaluate(`document.title`).then((result) =>
            JSON.stringify(result).includes(title) ? result : null,
          ),
        `guest title ${title}`,
      );

    await navigateAddress(`${guestOrigin}/a`);
    await waitGuestTitle("Native Guest A");
    await renderer.executeJavaScript(
      `window.desktopBridge.preview.automation.click(${JSON.stringify(webviewState.tabId)}, {selector:'#mutate'})`,
      true,
    );
    const guestSecurity = await guestEvaluate(
      `({title:document.title,href:location.href,nodeType:typeof process,requireType:typeof require,identity:document.querySelector('#identity')?.textContent})`,
    );
    await renderer.executeJavaScript(
      `window.desktopBridge.preview.automation.click(${JSON.stringify(webviewState.tabId)}, {selector:'#history-link'})`,
      true,
    );
    await waitGuestTitle("Native Guest B");
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Back"]')?.click()`,
      true,
    );
    await waitGuestTitle("Native Guest A");
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Forward"]')?.click()`,
      true,
    );
    await waitGuestTitle("Native Guest B");
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Back"]')?.click()`,
      true,
    );
    await waitGuestTitle("Native Guest A");
    await renderer.executeJavaScript(
      `document.querySelector('[aria-label="Refresh"]')?.click()`,
      true,
    );
    await waitFor(
      () =>
        guestEvaluate(`Number(document.documentElement.dataset.loadCount)`).then((result) =>
          Number(JSON.stringify(result).match(/\d+/)?.[0] ?? 0) >= 2 ? result : null,
        ),
      "guest reload count",
    );
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
    await waitFor(
      () =>
        renderer.executeJavaScript(
          `document.body.innerText.includes("This site can’t be reached") || document.body.innerText.includes("This site can't be reached")`,
          true,
        ),
      "guest failure surface",
    );
    await navigateAddress(`${guestOrigin}/a`);
    await waitGuestTitle("Native Guest A");

    const assertions = Object.fromEntries(requiredAssertionNames.map((name) => [name, false]));
    Object.assign(assertions, {
      backendReady: Boolean(bootstrap.bootstrap.httpBaseUrl && bootstrap.token),
      productionMainLoaded:
        renderer.getURL() === "t3code://app/" || renderer.getURL().startsWith("t3code://app/#"),
      productionPreloadBridge: reloadState.bridge,
      nativeProjectVisible: nativeShell.body.includes(projectTitle),
      nativeTaskVisible: nativeShell.body.includes(threadTitle),
      nativeRouteRecoveredAfterReload:
        reloadState.hash.includes(threadId) && reloadState.body.includes(threadTitle),
      composerVisible: nativeShell.composer,
      taskTabsVisible: nativeShell.taskTabs,
      realWebviewAttached: guestContents.getType() === "webview" && webviewState.id > 0,
      approvedPreviewPartition:
        typeof webviewState.partition === "string" &&
        webviewState.partition.startsWith("persist:t3code-preview-"),
      guestPageALoaded: JSON.stringify(guestSecurity).includes("Native Guest A"),
      guestPageBLoaded: true,
      guestBackWorked: true,
      guestForwardWorked: true,
      guestReloadWorked: true,
      guestFailureSurfaced: true,
      guestRecovered: true,
      guestDomMutationWorked: JSON.stringify(mutation).includes(
        "mutated-through-production-automation",
      ),
      guestScreenshotCaptured:
        guestArtifact.mimeType === "image/png" &&
        guestArtifact.sizeBytes === guestArtifactBytes.length &&
        guestArtifactBytes.length > 100,
      processCleanupVerified: false,
    });
    if (
      !JSON.stringify(guestSecurity).includes('"nodeType":"undefined"') ||
      !JSON.stringify(guestSecurity).includes('"requireType":"undefined"')
    ) {
      throw new Error("real guest unexpectedly exposed Node globals");
    }

    await NodeFSP.mkdir(evidenceDirectory, { recursive: true });
    const screenshots = [];
    let everyScenarioAvoidsHorizontalOverflow = true;
    for (const scenario of screenshotScenarios) {
      mainWindow.setContentSize(scenario.width, scenario.height, false);
      mainWindow.show();
      mainWindow.focus();
      if (scenario.width === 1024) {
        await renderer.executeJavaScript(
          `document.querySelector('[aria-label="Toggle right panel"][data-pressed="true"], [aria-label="Toggle right panel"][aria-pressed="true"]')?.click()`,
          true,
        );
      } else {
        guestContents.reload();
        await waitGuestTitle("Native Guest A");
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
          webviewRect: (() => { const node = document.querySelector('webview[data-preview-tab]'); if (!node) return null; const rect = node.getBoundingClientRect(); return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}; })(),
          wrapperRect: (() => { const node = document.querySelector('[data-preview-viewport]'); if (!node) return null; const rect = node.getBoundingClientRect(); return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}; })()
        }))()`,
        true,
      );
      console.log(
        JSON.stringify({ event: "native-shell-layout", scenario: scenario.scenario, layout }),
      );
      everyScenarioAvoidsHorizontalOverflow &&= layout.overflow;
      if (scenario.width === 1024) assertions.narrowDisclosureReachable = layout.narrowDisclosure;
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
        theme: "dark",
        sha256: sha256(bytes),
      });
    }
    assertions.noDocumentHorizontalOverflow = everyScenarioAvoidsHorizontalOverflow;
    assertNativeShellAssertions({ ...assertions, processCleanupVerified: true });

    const buildArtifactPaths = [
      "apps/desktop/dist-electron/main.cjs",
      "apps/desktop/dist-electron/preload.cjs",
      "apps/server/dist/bin.mjs",
      "apps/web/dist/index.html",
    ];
    const manifest = {
      schemaVersion: 1,
      id: "orchestra-native-shell-acceptance-v1",
      role: "product-native-shell-evidence",
      desktop: {
        repository: "edgefloor/orchestra-desktop",
        commit: runGit(["rev-parse", "HEAD"]),
        tree: runGit(["rev-parse", "HEAD^{tree}"]),
      },
      capture: {
        electronVersion: process.versions.electron,
        platform: { os: hostPlatform, arch: hostArchitecture },
      },
      productionEntry: "t3code://app/",
      buildArtifacts: await Promise.all(
        buildArtifactPaths.map(async (path) => ({
          path,
          sha256: sha256(await NodeFSP.readFile(NodePath.join(repoRoot, path))),
        })),
      ),
      screenshots,
      assertions,
      guest: { origin: guestOrigin, fixtureSha256: guestFixture.digest },
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
    await new Promise((resolve) => guestServer.close(() => resolve()));
    if (!manifestWritten) {
      await Promise.all([
        NodeFSP.rm(manifestPath, { force: true }),
        ...screenshotScenarios.map(({ scenario }) =>
          NodeFSP.rm(NodePath.join(evidenceDirectory, `${scenario}.png`), { force: true }),
        ),
      ]);
    }
    app.quit();
  }
}

async function main() {
  if (process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CHILD === "1") {
    await runElectronChild();
  } else {
    await launchUnderElectron();
  }
}

if (
  process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CHILD === "1" ||
  NodePath.resolve(process.argv[1] ?? "") === scriptPath
) {
  main().catch((error) => {
    console.error(error);
    const runtimeDirectory = process.env.ORCHESTRA_NATIVE_ACCEPTANCE_RUNTIME_DIR;
    if (process.env.ORCHESTRA_NATIVE_ACCEPTANCE_CHILD === "1" && runtimeDirectory) {
      NodeFS.writeFileSync(
        NodePath.join(runtimeDirectory, "capture-error.txt"),
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
    process.exitCode = 1;
  });
}
