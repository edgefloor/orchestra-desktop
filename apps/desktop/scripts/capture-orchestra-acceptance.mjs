#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { resolveElectronLaunchCommand } from "./electron-launcher.mjs";

const scriptPath = NodeURL.fileURLToPath(import.meta.url);
const desktopDir = NodePath.resolve(NodePath.dirname(scriptPath), "..");
const repoRoot = NodePath.resolve(desktopDir, "..", "..");
const acceptanceHtml = NodePath.join(repoRoot, "apps", "web", "dist-acceptance", "acceptance.html");
const acceptanceParent = NodePath.join(repoRoot, "docs", "acceptance");
const acceptanceDir = NodePath.join(acceptanceParent, "orchestra-workspace");
const acceptanceRelativeDir = "docs/acceptance/orchestra-workspace";

const workspaceAssertions = [
  "activeTaskVisible",
  "composerVisible",
  "contextTabsReachable",
  "noDocumentHorizontalOverflow",
  "rootWidthMatchesViewport",
  "taskTabsReachable",
];

const scenarios = [
  {
    scenario: "workspace-1024x768-light",
    width: 1024,
    height: 768,
    theme: "light",
    state: "workspace",
    assertions: [...workspaceAssertions, "narrowLayoutActive"].sort(),
  },
  {
    scenario: "workspace-1024x768-dark",
    width: 1024,
    height: 768,
    theme: "dark",
    state: "workspace",
    assertions: [...workspaceAssertions, "narrowLayoutActive"].sort(),
  },
  {
    scenario: "workspace-1440x900-light",
    width: 1440,
    height: 900,
    theme: "light",
    state: "workspace",
    assertions: [...workspaceAssertions, "wideLayoutActive"].sort(),
  },
  {
    scenario: "workspace-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    state: "workspace",
    assertions: [...workspaceAssertions, "wideLayoutActive"].sort(),
  },
  {
    scenario: "attention-sheet-1024x768-dark",
    width: 1024,
    height: 768,
    theme: "dark",
    state: "attention-sheet",
    assertions: [
      ...workspaceAssertions,
      "attentionItemsPresent",
      "attentionPanelVisible",
      "contextSheetLabelled",
      "contextSheetVisible",
      "narrowLayoutActive",
    ].sort(),
  },
  {
    scenario: "symphony-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony",
    assertions: [
      ...workspaceAssertions,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "symphonyTabsInteractive",
      "symphonyKeyboardNavigation",
      "symphonySelectionReconciles",
      "symphonyActionsWired",
      "wideLayoutActive",
    ].sort(),
  },
  {
    scenario: "symphony-activity-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony-activity",
    assertions: [
      ...workspaceAssertions,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "wideLayoutActive",
    ].sort(),
  },
  {
    scenario: "symphony-events-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    state: "symphony-events",
    assertions: [
      ...workspaceAssertions,
      "symphonyHeightBounded",
      "symphonyScrollsInternally",
      "symphonyWorkspaceVisible",
      "wideLayoutActive",
    ].sort(),
  },
  {
    scenario: "browser-preview-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    state: "browser-preview",
    assertions: [
      ...workspaceAssertions,
      "browserPreviewVisible",
      "browserPreviewTablistVisible",
      "browserPreviewChromeVisible",
      "browserPreviewTaskAssociated",
      "browserPreviewResponsiveMode",
      "browserPreviewTabKeyboardNavigation",
      "browserPreviewAddressSubmissionWired",
      "browserPreviewNavigationWired",
      "browserPreviewAnnotationWired",
      "browserPreviewCaptureWired",
      "browserPreviewFailureRecoveryWired",
      "browserPreviewContentActionWired",
      "browserPreviewCloseReopenWired",
      "wideLayoutActive",
    ].sort(),
  },
  {
    scenario: "browser-preview-1024x768-dark",
    width: 1024,
    height: 768,
    theme: "dark",
    state: "browser-preview-narrow",
    assertions: [
      ...workspaceAssertions,
      "browserPreviewVisible",
      "browserPreviewTablistVisible",
      "browserPreviewChromeVisible",
      "browserPreviewTaskAssociated",
      "browserPreviewResponsiveMode",
      "browserPreviewTabKeyboardNavigation",
      "browserPreviewAddressSubmissionWired",
      "browserPreviewNavigationWired",
      "browserPreviewAnnotationWired",
      "browserPreviewCaptureWired",
      "browserPreviewFailureRecoveryWired",
      "browserPreviewContentActionWired",
      "browserPreviewCloseReopenWired",
      "browserPreviewSheetCloseReopenWired",
      "narrowLayoutActive",
    ].sort(),
  },
  {
    scenario: "file-preview-1440x900-dark",
    width: 1440,
    height: 900,
    theme: "dark",
    state: "file-preview",
    assertions: [
      ...workspaceAssertions,
      "filePreviewVisible",
      "filePreviewActionVisible",
      "filePreviewTaskAssociated",
      "filePreviewResponsiveMode",
      "filePreviewContentActionWired",
      "wideLayoutActive",
    ].sort(),
  },
];

function runGit(args) {
  return NodeChildProcess.execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function sha256(bytes) {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

function readPngDimensions(bytes, context) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, pngSignature.length).equals(pngSignature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error(`${context} did not produce a valid PNG`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function launchUnderElectron() {
  const appDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "orchestra-capture-app-"));
  try {
    NodeFS.writeFileSync(
      NodePath.join(appDir, "package.json"),
      `${JSON.stringify({
        name: "orchestra-acceptance-capture",
        version: "1.0.0",
        private: true,
        type: "module",
        main: "main.mjs",
      })}\n`,
    );
    NodeFS.writeFileSync(
      NodePath.join(appDir, "main.mjs"),
      `import ${JSON.stringify(NodeURL.pathToFileURL(scriptPath).href)};\n`,
    );

    const launch = resolveElectronLaunchCommand([
      appDir,
      "--electron-child",
      "--force-device-scale-factor=1",
    ]);
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;

    const child = NodeChildProcess.spawnSync(launch.electronPath, launch.args, {
      cwd: repoRoot,
      env: environment,
      stdio: "inherit",
      timeout: 180_000,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) {
      throw new Error(
        `Electron acceptance capture exited with status ${child.status ?? "unknown"}`,
      );
    }
  } finally {
    NodeFS.rmSync(appDir, { recursive: true, force: true });
  }
}

async function waitForAcceptanceReady(webContents, scenario) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await webContents.executeJavaScript(
      `(() => ({
        ready: document.documentElement.dataset.acceptanceReady === "true",
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
        symphonyHeight: document.querySelector("[data-automation-workspace]")?.getBoundingClientRect().height ?? null,
        assertions: window.__ORCHESTRA_ACCEPTANCE__ ?? null
      }))()`,
      true,
    );
    if (state.ready) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${scenario.scenario} did not set data-acceptance-ready within 30 seconds`);
}

async function probeSymphonyInteractions(webContents) {
  return webContents.executeJavaScript(
    `(async () => {
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tab = (view) => document.querySelector('#automation-view-tab-' + view);
      const buttonWithText = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith(text));
      const issues = tab('issues');
      issues?.focus();
      issues?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      const activitySelected = tab('activity')?.getAttribute('aria-selected') === 'true';
      const activityFocused = document.activeElement === tab('activity');
      tab('activity')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      const eventsSelected = tab('events')?.getAttribute('aria-selected') === 'true';
      const eventsFocused = document.activeElement === tab('events');
      tab('issues')?.click();
      await settle();
      buttonWithText('ORC-71')?.click();
      await settle();
      const queueSelection = document.querySelector('[aria-label="ORC-71 inspector"]') !== null;
      buttonWithText('ORC-70')?.click();
      await settle();
      const claimSelection = document.querySelector('[aria-label="ORC-70 inspector"]') !== null;
      buttonWithText('Cancel issue')?.click();
      buttonWithText('Open issue task')?.click();
      await settle();
      const actions = window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ ?? {};
      return {
        symphonyTabsInteractive: activitySelected && eventsSelected,
        symphonyKeyboardNavigation: activityFocused && eventsFocused,
        symphonySelectionReconciles: queueSelection && claimSelection,
        symphonyActionsWired: actions.cancelledClaimId === 'claim-orc-70' && actions.openedIssueId === 'issue-orc-70',
      };
    })()`,
    true,
  );
}

async function probeBrowserPreviewInteractions(webContents, narrow) {
  const assertions = await webContents.executeJavaScript(
    `(async () => {
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const exactButton = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === text);
      const buttonStartingWith = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith(text));
      const tabByLabel = (text) => [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.trim() === text);
      const browserTab = tabByLabel('Browser');
      const input = document.querySelector('[data-preview-url-input]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'http://127.0.0.1:4173/cycle-4');
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '4' }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
      await settle();
      document.querySelector('[aria-label="Back"]')?.click();
      document.querySelector('[aria-label="Annotate preview"]')?.click();
      await settle();
      document.querySelector('[aria-label="Cancel annotation"]')?.click();
      const capture = document.querySelector('[aria-label="Capture screenshot"]');
      capture?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await settle();
      document.querySelector('[aria-label="Stop recording"]')?.click();
      exactButton('Simulate unreachable page')?.click();
      await settle();
      exactButton('Details')?.click();
      await settle();
      const failureDetailsVisible = document.body.textContent?.includes('Confirming the dev server is running') ?? false;
      exactButton('Reload')?.click();
      await settle();
      browserTab?.focus();
      browserTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      const previewTab = tabByLabel('README.md');
      const previewSelected = previewTab?.getAttribute('aria-selected') === 'true';
      const previewFocused = document.activeElement === previewTab;
      const previewVisible = document.querySelector('[aria-label="README.md Preview"]') !== null;
      document.querySelector('[aria-label="Show rendered markdown"]')?.click();
      await settle();
      const renderedPreviewVisible = document.querySelector('[aria-label="Rendered README.md content"]') !== null;
      document.querySelector('[aria-label="Close README.md"]')?.click();
      await settle();
      document.querySelector('[aria-label="Close Browser"]')?.click();
      await settle();
      const emptyVisible = document.body.textContent?.includes('Open a surface') ?? false;
      buttonStartingWith('Browser')?.click();
      await settle();
      const reopened = tabByLabel('Browser')?.getAttribute('aria-selected') === 'true';
      const actions = window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ ?? {};
      return {
        browserPreviewTabKeyboardNavigation: Boolean(previewSelected && previewFocused && previewVisible),
        browserPreviewAddressSubmissionWired: actions.browserUrl === 'http://127.0.0.1:4173/cycle-4',
        browserPreviewNavigationWired: actions.browserNavigation === 'back',
        browserPreviewAnnotationWired: actions.browserAnnotation === 'cancelled',
        browserPreviewCaptureWired: actions.browserCapture === 'screenshot',
        browserPreviewFailureRecoveryWired: failureDetailsVisible && actions.browserFailureRecovery === 'reload',
        browserPreviewContentActionWired: renderedPreviewVisible && actions.previewContentMode === 'rendered',
        browserPreviewCloseReopenWired: emptyVisible && reopened && actions.closedSurfaceId === 'browser:new' && actions.reopenedSurfaceId === 'browser:new',
      };
    })()`,
    true,
  );
  if (!narrow) return assertions;

  webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const sheetClosedState = await webContents.executeJavaScript(
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const reopenButton = document.querySelector('[aria-label="Open Browser and Preview"]');
      const actions = window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ ?? {};
      return {
        actionRecorded: actions.sheetClosed === 'true',
        dialogHidden: dialog instanceof HTMLElement
          && (dialog.hidden || dialog.getAttribute('aria-hidden') === 'true' || getComputedStyle(dialog).display === 'none'),
        focusRestored: document.activeElement === reopenButton,
        taskReachable: document.querySelector('[data-acceptance-composer]') !== null,
      };
    })()`,
    true,
  );
  webContents.sendInputEvent({ type: "rawKeyDown", keyCode: "Enter" });
  webContents.sendInputEvent({ type: "char", keyCode: "Enter" });
  webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const sheetReopenedState = await webContents.executeJavaScript(
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const actions = window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ ?? {};
      return {
        actionRecorded: actions.sheetReopened === 'true',
        dialogVisible: dialog instanceof HTMLElement
          && !dialog.hidden
          && dialog.getAttribute('aria-hidden') !== 'true'
          && getComputedStyle(dialog).display !== 'none',
      };
    })()`,
    true,
  );
  process.stdout.write(
    `Browser/Preview narrow sheet probe: ${JSON.stringify({ sheetClosedState, sheetReopenedState })}\n`,
  );
  return {
    ...assertions,
    browserPreviewSheetCloseReopenWired:
      Object.values(sheetClosedState).every(Boolean) &&
      Object.values(sheetReopenedState).every(Boolean),
  };
}

async function probeFilePreviewInteraction(webContents) {
  return webContents.executeJavaScript(
    `(async () => {
      document.querySelector('[aria-label="Show rendered markdown"]')?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const actions = window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ ?? {};
      return {
        filePreviewContentActionWired:
          actions.previewContentMode === 'rendered'
          && document.querySelector('[aria-label="Rendered README.md content"]') !== null
          && document.querySelector('[aria-label="Show markdown source"]') !== null,
      };
    })()`,
    true,
  );
}

function validateRendererState(state, scenario) {
  if (state.width !== scenario.width || state.height !== scenario.height) {
    throw new Error(
      `${scenario.scenario} rendered at ${state.width}x${state.height}; expected ${scenario.width}x${scenario.height}`,
    );
  }
  if (state.deviceScaleFactor !== 1) {
    throw new Error(
      `${scenario.scenario} rendered at deviceScaleFactor ${state.deviceScaleFactor}; expected 1`,
    );
  }
  if (state.assertions === null || typeof state.assertions !== "object") {
    throw new Error(`${scenario.scenario} did not publish acceptance assertions`);
  }

  const assertions = {};
  for (const assertion of scenario.assertions) {
    if (state.assertions[assertion] !== true) {
      throw new Error(
        `${scenario.scenario} assertion ${assertion} was not true (Symphony height ${state.symphonyHeight ?? "n/a"}, viewport ${state.height})`,
      );
    }
    assertions[assertion] = true;
  }
  return assertions;
}

async function captureScenario(BrowserWindow, scenario, stagingDir) {
  const window = new BrowserWindow({
    width: scenario.width,
    height: scenario.height,
    useContentSize: true,
    frame: false,
    show: false,
    resizable: false,
    backgroundColor: scenario.theme === "dark" ? "#111318" : "#f7f7f8",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `orchestra-acceptance-${process.pid}-${scenario.scenario}`,
      sandbox: true,
    },
  });

  try {
    window.setContentSize(scenario.width, scenario.height, false);
    window.webContents.setZoomFactor(1);
    await window.loadFile(acceptanceHtml, {
      query: { state: scenario.state, theme: scenario.theme },
    });
    await window.webContents.insertCSS(
      "*,*::before,*::after{animation:none!important;caret-color:transparent!important;transition:none!important}",
    );
    await window.webContents.executeJavaScript(
      "document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))",
      true,
    );

    const rendererState = await waitForAcceptanceReady(window.webContents, scenario);
    if (scenario.state === "symphony") {
      rendererState.assertions = {
        ...rendererState.assertions,
        ...(await probeSymphonyInteractions(window.webContents)),
      };
    }
    if (scenario.state === "browser-preview" || scenario.state === "browser-preview-narrow") {
      const browserPreviewAssertions = await probeBrowserPreviewInteractions(
        window.webContents,
        scenario.state === "browser-preview-narrow",
      );
      process.stdout.write(
        `Browser/Preview interaction probe ${scenario.scenario}: ${JSON.stringify(browserPreviewAssertions)}\n`,
      );
      rendererState.assertions = {
        ...rendererState.assertions,
        ...browserPreviewAssertions,
      };
    }
    if (scenario.state === "file-preview") {
      rendererState.assertions = {
        ...rendererState.assertions,
        ...(await probeFilePreviewInteraction(window.webContents)),
      };
    }
    const assertions = validateRendererState(rendererState, scenario);
    const image = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: scenario.width,
      height: scenario.height,
    });
    const png = image.toPNG();
    const dimensions = readPngDimensions(png, scenario.scenario);
    if (dimensions.width !== scenario.width || dimensions.height !== scenario.height) {
      throw new Error(
        `${scenario.scenario} PNG is ${dimensions.width}x${dimensions.height}; expected ${scenario.width}x${scenario.height}`,
      );
    }

    const fileName = `${scenario.scenario}.png`;
    await NodeFSP.writeFile(NodePath.join(stagingDir, fileName), png);
    return {
      scenario: scenario.scenario,
      file: `${acceptanceRelativeDir}/${fileName}`,
      width: scenario.width,
      height: scenario.height,
      deviceScaleFactor: 1,
      theme: scenario.theme,
      state: scenario.state,
      sha256: sha256(png),
      assertions,
    };
  } finally {
    window.destroy();
  }
}

async function publishCapture(stagingDir) {
  await NodeFSP.mkdir(acceptanceDir, { recursive: true });
  for (const scenario of scenarios) {
    const fileName = `${scenario.scenario}.png`;
    await NodeFSP.rename(
      NodePath.join(stagingDir, fileName),
      NodePath.join(acceptanceDir, fileName),
    );
  }
  await NodeFSP.rename(
    NodePath.join(stagingDir, "manifest.json"),
    NodePath.join(acceptanceDir, "manifest.json"),
  );
}

async function captureUnderElectron() {
  process.stderr.write("Orchestra acceptance capture entered Electron child mode\n");
  const require = NodeModule.createRequire(import.meta.url);
  const { app, BrowserWindow } = require("electron");
  app.on("window-all-closed", () => undefined);
  app.commandLine.appendSwitch("force-device-scale-factor", "1");
  app.commandLine.appendSwitch("high-dpi-support", "1");
  await Promise.race([
    app.whenReady(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Electron app readiness timed out after 90 seconds")),
        90_000,
      ),
    ),
  ]);

  let stagingDir;
  try {
    await NodeFSP.access(acceptanceHtml);
    await NodeFSP.mkdir(acceptanceParent, { recursive: true });
    const staleCaptureDirectories = (
      await NodeFSP.readdir(acceptanceParent, {
        withFileTypes: true,
      })
    ).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(".orchestra-workspace-capture-"),
    );
    await Promise.all(
      staleCaptureDirectories.map((entry) =>
        NodeFSP.rm(NodePath.join(acceptanceParent, entry.name), {
          recursive: true,
          force: true,
        }),
      ),
    );
    stagingDir = await NodeFSP.mkdtemp(
      NodePath.join(acceptanceParent, ".orchestra-workspace-capture-"),
    );

    const screenshots = [];
    for (const scenario of scenarios) {
      screenshots.push(await captureScenario(BrowserWindow, scenario, stagingDir));
      process.stdout.write(`Captured ${scenario.scenario}\n`);
    }

    const manifest = {
      schemaVersion: 1,
      id: "orchestra-workspace-acceptance-v1",
      role: "product-acceptance-evidence",
      desktop: {
        repository: "edgefloor/orchestra-desktop",
        commit: runGit(["rev-parse", "HEAD"]),
        tree: runGit(["rev-parse", "HEAD^{tree}"]),
      },
      capture: {
        electronVersion: process.versions.electron,
        // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone evidence records the host capture tuple.
        platform: { os: NodeOS.platform(), arch: NodeOS.arch() },
      },
      screenshots,
    };
    await NodeFSP.writeFile(
      NodePath.join(stagingDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await publishCapture(stagingDir);
    process.stdout.write(`Published Orchestra acceptance capture to ${acceptanceDir}\n`);
  } finally {
    if (stagingDir) await NodeFSP.rm(stagingDir, { recursive: true, force: true });
    app.quit();
  }
}

function reportFailure(error) {
  process.stderr.write(
    `Orchestra acceptance capture failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  if (process.versions.electron) {
    const require = NodeModule.createRequire(import.meta.url);
    require("electron").app.exit(1);
  }
  process.exitCode = 1;
}

if (process.versions.electron) {
  // Do not block native Electron startup with top-level await: the ready event is
  // emitted only after the main entry module has finished evaluating.
  void captureUnderElectron().catch(reportFailure);
} else {
  try {
    launchUnderElectron();
  } catch (error) {
    reportFailure(error);
  }
}
