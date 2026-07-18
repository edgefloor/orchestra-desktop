import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { resolveElectronLaunchCommand } from "./electron-launcher.mjs";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const desktopDir = NodePath.resolve(__dirname, "..");
const mainJs = NodePath.resolve(desktopDir, "dist-electron/main.cjs");
const runtimeDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "orchestra-smoke-"));

console.log("\nLaunching Electron smoke test...");

const electronCommand = resolveElectronLaunchCommand([mainJs]);
const environment = {
  ...process.env,
  HOME: NodePath.join(runtimeDir, "home"),
  T3CODE_HOME: NodePath.join(runtimeDir, "t3"),
  CODEX_HOME: NodePath.join(runtimeDir, "codex"),
  T3CODE_DISABLE_AUTO_UPDATE: "1",
  ELECTRON_ENABLE_LOGGING: "1",
};
for (const directory of [environment.HOME, environment.T3CODE_HOME, environment.CODEX_HOME]) {
  NodeFS.mkdirSync(directory, { recursive: true });
}
delete environment.VITE_DEV_SERVER_URL;
delete environment.ELECTRON_RUN_AS_NODE;

const child = NodeChildProcess.spawn(electronCommand.electronPath, electronCommand.args, {
  stdio: ["pipe", "pipe", "pipe"],
  env: environment,
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

let reachedObservationWindow = false;
const timeout = setTimeout(() => {
  reachedObservationWindow = true;
  child.kill();
}, 8_000);

child.on("exit", (code, signal) => {
  clearTimeout(timeout);
  NodeFS.rmSync(runtimeDir, { recursive: true, force: true });

  const fatalPatterns = [
    "Cannot find module",
    "MODULE_NOT_FOUND",
    "Refused to execute",
    "Uncaught Error",
    "Uncaught TypeError",
    "Uncaught ReferenceError",
  ];
  const failures = fatalPatterns.filter((pattern) => output.includes(pattern));
  if (!reachedObservationWindow) {
    failures.push(`Electron exited before the observation window (code=${code}, signal=${signal})`);
  }
  for (const required of ["backend ready", "main window created"]) {
    if (!output.includes(required)) failures.push(`Missing startup marker: ${required}`);
  }

  if (failures.length > 0) {
    console.error("\nDesktop smoke test failed:");
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    console.error("\nFull output:\n" + output);
    process.exit(1);
  }

  console.log("Desktop smoke test passed.");
  process.exit(0);
});
