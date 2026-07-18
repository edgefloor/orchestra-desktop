import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";

export function runGit(rootDir, args) {
  return NodeChildProcess.execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function isPinnedGitSubtreeIdentity(rootDir, revision, subtreePath, expectedTree) {
  try {
    return (
      runGit(rootDir, ["rev-parse", "--verify", `${revision}^{commit}`]) === revision &&
      runGit(rootDir, ["rev-parse", `${revision}:${subtreePath}`]) === expectedTree
    );
  } catch {
    return false;
  }
}

export function sha256(bytes) {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export function readPngDimensions(bytes, context = "image") {
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
