#!/usr/bin/env node

import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const root = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const manifestPath = NodePath.join(root, "docs/retained-desktop-capabilities.json");
const expectedIds = [
  "browser-preview",
  "composer",
  "diff-review",
  "environments",
  "files-editor",
  "responsive-panels",
  "settings-keybindings",
  "terminal-context",
  "update-recovery",
  "vcs",
];

function requireFields(value, expected, context) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${context} fields must be ${wanted.join(", ")}`);
  }
}

function requireSafeSortedPaths(paths, context) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error(`${context} must be a non-empty array`);
  }
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) {
    throw new Error(`${context} must be sorted`);
  }
  for (const value of paths) {
    if (
      typeof value !== "string" ||
      NodePath.isAbsolute(value) ||
      value.split("/").includes("..")
    ) {
      throw new Error(`${context} contains an unsafe path`);
    }
  }
}

async function verify() {
  const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8"));
  requireFields(manifest, ["schemaVersion", "upstreamRevision", "capabilities"], "manifest");
  if (manifest.schemaVersion !== 1) {
    throw new Error("schemaVersion must be 1");
  }
  if (manifest.upstreamRevision !== "ecb35f75839925dd1ac6f854efeef5c9e291d11b") {
    throw new Error("upstreamRevision does not match the pinned fork base");
  }
  if (!Array.isArray(manifest.capabilities)) {
    throw new Error("capabilities must be an array");
  }
  const ids = manifest.capabilities.map((capability) => capability.id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
    throw new Error("capability IDs are missing, duplicated, unknown, or unsorted");
  }
  for (const capability of manifest.capabilities) {
    requireFields(capability, ["id", "requiredFiles", "requiredTests"], capability.id);
    requireSafeSortedPaths(capability.requiredFiles, `${capability.id}.requiredFiles`);
    requireSafeSortedPaths(capability.requiredTests, `${capability.id}.requiredTests`);
    for (const relative of [...capability.requiredFiles, ...capability.requiredTests]) {
      const stat = await NodeFSP.stat(NodePath.join(root, relative));
      if (!stat.isFile() || stat.size === 0) {
        throw new Error(`${capability.id} requires a non-empty file at ${relative}`);
      }
    }
  }
}

try {
  await verify();
  console.log("retained desktop capabilities verified");
} catch (error) {
  console.error(
    `retained capability verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
