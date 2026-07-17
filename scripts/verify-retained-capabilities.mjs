#!/usr/bin/env node

import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const root = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const capabilityManifestPath = NodePath.join(root, "docs/retained-desktop-capabilities.json");
const referenceManifestPath = NodePath.join(
  root,
  "docs/design-reference/orchestra-workspace/reference.json",
);
const expectedCapabilityIds = [
  "annotations",
  "approvals",
  "auth",
  "browser-preview",
  "composer",
  "diff-review",
  "environments",
  "files-editor",
  "models",
  "panels",
  "recovery",
  "settings",
  "terminal-context",
  "updates",
  "vcs",
];
const expectedPrecedence = [
  "native-behavior",
  "retained-capabilities",
  "coherent-fusion",
  "reference-pixels",
];
const expectedExclusions = [
  "detached-workflow-control-planes",
  "landing-and-marketing-pages",
  "mobile-and-widths-at-or-below-820px",
  "pixel-parity-that-conflicts-with-native-behavior",
  "prototype-actions-as-runtime-authority",
  "prototype-data-as-product-authority",
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

function requireExactArray(actual, expected, context) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${context} must exactly match the sealed baseline`);
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

function requireSha256(value, context) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${context} must be a lowercase SHA-256 digest`);
  }
}

async function requireFile(relative, context) {
  requireSafeSortedPaths([relative], context);
  const absolute = NodePath.join(root, relative);
  const stat = await NodeFSP.stat(absolute);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${context} requires a non-empty file at ${relative}`);
  }
  return NodeFSP.readFile(absolute);
}

function sha256(bytes) {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

function readJpegDimensions(bytes, context) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`${context} must be a JPEG image`);
  }
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new Error(`${context} has no readable JPEG dimensions`);
}

async function verifyCapabilities() {
  const manifest = JSON.parse(await NodeFSP.readFile(capabilityManifestPath, "utf8"));
  requireFields(manifest, ["schemaVersion", "upstreamRevision", "capabilities"], "manifest");
  if (manifest.schemaVersion !== 1) throw new Error("schemaVersion must be 1");
  if (manifest.upstreamRevision !== "ecb35f75839925dd1ac6f854efeef5c9e291d11b") {
    throw new Error("upstreamRevision does not match the pinned fork base");
  }
  if (!Array.isArray(manifest.capabilities)) throw new Error("capabilities must be an array");
  requireExactArray(
    manifest.capabilities.map((capability) => capability.id),
    expectedCapabilityIds,
    "capability IDs",
  );
  for (const capability of manifest.capabilities) {
    requireFields(capability, ["id", "requiredFiles", "requiredTests"], capability.id);
    requireSafeSortedPaths(capability.requiredFiles, `${capability.id}.requiredFiles`);
    requireSafeSortedPaths(capability.requiredTests, `${capability.id}.requiredTests`);
    for (const relative of [...capability.requiredFiles, ...capability.requiredTests]) {
      await requireFile(relative, capability.id);
    }
  }
}

async function verifyReference() {
  const reference = JSON.parse(await NodeFSP.readFile(referenceManifestPath, "utf8"));
  requireFields(
    reference,
    [
      "schemaVersion",
      "id",
      "role",
      "captureDate",
      "source",
      "precedence",
      "brandNotes",
      "screenshots",
      "exclusions",
    ],
    "reference",
  );
  if (reference.schemaVersion !== 1) throw new Error("reference.schemaVersion must be 1");
  if (reference.id !== "orchestra-workspace-v1") throw new Error("reference.id is not sealed");
  if (reference.role !== "non-authoritative-direction") {
    throw new Error("reference.role must remain non-authoritative-direction");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reference.captureDate)) {
    throw new Error("reference.captureDate must use YYYY-MM-DD");
  }
  requireExactArray(reference.precedence, expectedPrecedence, "reference.precedence");
  requireExactArray(reference.exclusions, expectedExclusions, "reference.exclusions");

  requireFields(reference.source, ["url", "contentType", "bytes", "sha256"], "reference.source");
  if (reference.source.url !== "https://orchestra.demystify.hu/orchestra-workspace") {
    throw new Error("reference source URL is not the approved workspace route");
  }
  if (reference.source.contentType !== "text/html; charset=utf-8") {
    throw new Error("reference source content type is not sealed");
  }
  if (!Number.isInteger(reference.source.bytes) || reference.source.bytes <= 0) {
    throw new Error("reference source byte count must be positive");
  }
  requireSha256(reference.source.sha256, "reference.source.sha256");

  requireFields(reference.brandNotes, ["file", "sha256"], "reference.brandNotes");
  requireSha256(reference.brandNotes.sha256, "reference.brandNotes.sha256");
  const brandNotes = await requireFile(reference.brandNotes.file, "reference.brandNotes.file");
  if (sha256(brandNotes) !== reference.brandNotes.sha256) {
    throw new Error("brand notes digest does not match reference.json");
  }

  if (!Array.isArray(reference.screenshots) || reference.screenshots.length !== 2) {
    throw new Error("reference.screenshots must contain the two approved desktop viewports");
  }
  requireExactArray(
    reference.screenshots.map((screenshot) => screenshot.id),
    ["desktop", "narrow-desktop"],
    "reference screenshot IDs",
  );
  for (const screenshot of reference.screenshots) {
    requireFields(
      screenshot,
      [
        "id",
        "file",
        "width",
        "height",
        "deviceScaleFactor",
        "theme",
        "state",
        "approval",
        "sha256",
      ],
      `reference.screenshots.${screenshot.id}`,
    );
    if (screenshot.approval !== "approved-reference") {
      throw new Error(`${screenshot.id} is not an approved reference`);
    }
    if (screenshot.deviceScaleFactor !== 1 || screenshot.theme !== "light") {
      throw new Error(`${screenshot.id} capture metadata is not sealed`);
    }
    if (!Number.isInteger(screenshot.width) || !Number.isInteger(screenshot.height)) {
      throw new Error(`${screenshot.id} dimensions must be integers`);
    }
    requireSha256(screenshot.sha256, `${screenshot.id}.sha256`);
    const image = await requireFile(screenshot.file, `${screenshot.id}.file`);
    if (sha256(image) !== screenshot.sha256) {
      throw new Error(`${screenshot.id} digest does not match reference.json`);
    }
    const dimensions = readJpegDimensions(image, screenshot.id);
    if (dimensions.width !== screenshot.width || dimensions.height !== screenshot.height) {
      throw new Error(`${screenshot.id} dimensions do not match reference.json`);
    }
  }
}

try {
  await verifyCapabilities();
  await verifyReference();
  console.log("retained desktop capabilities and design reference verified");
} catch (error) {
  console.error(
    `retained capability verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
