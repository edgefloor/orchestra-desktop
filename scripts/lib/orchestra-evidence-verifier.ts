// @effect-diagnostics nodeBuiltinImport:off - Standalone evidence verifiers share filesystem and Git checks.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { readPngDimensions, runGit, sha256 } from "./orchestra-evidence-primitives.mjs";

export { readPngDimensions, sha256 };

export function requireFields(
  value: unknown,
  expected: ReadonlyArray<string>,
  context: string,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${context} fields must be ${wanted.join(", ")}`);
  }
}

export function requireExactArray(
  actual: unknown,
  expected: ReadonlyArray<unknown>,
  context: string,
  contractName = "acceptance",
): void {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${context} must exactly match the ${contractName} contract`);
  }
}

export function requireGitObjectId(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${context} must be a lowercase 40-character Git object ID`);
  }
}

export function requireSha256(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${context} must be a lowercase SHA-256 digest`);
  }
}

export function requireSafeRelativePath(value: unknown, context: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    NodePath.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${context} must be a safe repository-relative path`);
  }
}

export async function verifyDesktopSourceIdentity(input: {
  readonly rootDir: string;
  readonly commit: string;
  readonly tree: string;
  readonly requiredSourceFiles?: ReadonlyArray<string>;
}): Promise<void> {
  try {
    await NodeFSP.stat(NodePath.join(input.rootDir, ".git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  try {
    runGit(input.rootDir, ["rev-parse", "--verify", `${input.commit}^{commit}`]);
  } catch {
    throw new Error("manifest.desktop.commit does not resolve to a commit in this repository");
  }

  let resolvedTree: string;
  try {
    resolvedTree = runGit(input.rootDir, ["rev-parse", `${input.commit}^{tree}`]);
  } catch {
    throw new Error("manifest.desktop.commit tree could not be resolved in this repository");
  }
  if (resolvedTree !== input.tree) {
    throw new Error("manifest.desktop.tree does not match manifest.desktop.commit");
  }

  try {
    runGit(input.rootDir, ["merge-base", "--is-ancestor", input.commit, "HEAD"]);
  } catch {
    throw new Error("manifest.desktop.commit must be an ancestor of repository HEAD");
  }

  for (const sourceFile of input.requiredSourceFiles ?? []) {
    try {
      runGit(input.rootDir, ["cat-file", "-e", `${input.commit}:${sourceFile}`]);
    } catch {
      throw new Error(`manifest.desktop.commit must contain evidence source ${sourceFile}`);
    }
  }
}

export async function requireEvidenceFile(
  rootDir: string,
  relativePath: string,
  context: string,
): Promise<Buffer> {
  requireSafeRelativePath(relativePath, context);
  const absolutePath = NodePath.resolve(rootDir, relativePath);
  const relativeToRoot = NodePath.relative(rootDir, absolutePath);
  if (relativeToRoot.startsWith("..") || NodePath.isAbsolute(relativeToRoot)) {
    throw new Error(`${context} escapes the repository root`);
  }
  const stat = await NodeFSP.stat(absolutePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${context} requires a non-empty file at ${relativePath}`);
  }
  return NodeFSP.readFile(absolutePath);
}
