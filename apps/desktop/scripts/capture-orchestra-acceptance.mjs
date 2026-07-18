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
        assertions: window.__ORCHESTRA_ACCEPTANCE__ ?? null
      }))()`,
      true,
    );
    if (state.ready) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${scenario.scenario} did not set data-acceptance-ready within 30 seconds`);
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
      throw new Error(`${scenario.scenario} assertion ${assertion} was not true`);
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
