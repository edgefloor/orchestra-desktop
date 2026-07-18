// @effect-diagnostics nodeBuiltinImport:off - Contract tests generate isolated binary fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeZlib from "node:zlib";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ORCHESTRA_NATIVE_SHELL_ASSERTIONS,
  ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES,
  ORCHESTRA_NATIVE_SHELL_SCREENSHOTS,
  readNativeShellPngDimensions,
  verifyOrchestraNativeShell,
} from "./verify-orchestra-native-shell.ts";

const temporaryRoots: string[] = [];
const acceptanceDirectory = "docs/acceptance/orchestra-native-shell";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function minimalPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", NodeZlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sha256(bytes: Uint8Array): string {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

type MutableManifest = {
  schemaVersion: number;
  id: string;
  role: string;
  desktop: { repository: string; commit: string; tree: string };
  capture: { electronVersion: string; platform: { os: string; arch: string } };
  productionEntry: string;
  buildArtifacts: Array<{ path: string; sha256: string }>;
  screenshots: Array<{
    scenario: string;
    file: string;
    width: number;
    height: number;
    deviceScaleFactor: number;
    theme: string;
    sha256: string;
  }>;
  assertions: Record<string, boolean>;
  guest: { origin: string; fixtureSha256: string };
  humanReview: { status: string; reviewedAt: string; notes: string };
};

async function makeFixture(
  mutate?: (manifest: MutableManifest, rootDir: string) => void | Promise<void>,
): Promise<{ readonly rootDir: string; readonly manifest: MutableManifest }> {
  const rootDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "orchestra-native-shell-"));
  temporaryRoots.push(rootDir);
  await NodeFSP.mkdir(NodePath.join(rootDir, acceptanceDirectory), { recursive: true });

  const buildArtifacts: MutableManifest["buildArtifacts"] = [];
  for (const path of ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS) {
    const bytes = Buffer.from(`native build artifact: ${path}`);
    await NodeFSP.mkdir(NodePath.dirname(NodePath.join(rootDir, path)), { recursive: true });
    await NodeFSP.writeFile(NodePath.join(rootDir, path), bytes);
    buildArtifacts.push({ path, sha256: sha256(bytes) });
  }

  const screenshots: MutableManifest["screenshots"] = [];
  for (const [scenario, contract] of Object.entries(ORCHESTRA_NATIVE_SHELL_SCREENSHOTS)) {
    const file = `${acceptanceDirectory}/${scenario}.png`;
    const image = minimalPng(contract.width, contract.height);
    await NodeFSP.writeFile(NodePath.join(rootDir, file), image);
    screenshots.push({
      scenario,
      file,
      width: contract.width,
      height: contract.height,
      deviceScaleFactor: 1,
      theme: "dark",
      sha256: sha256(image),
    });
  }

  const manifest: MutableManifest = {
    schemaVersion: 1,
    id: "orchestra-native-shell-acceptance-v1",
    role: "product-native-shell-evidence",
    desktop: {
      repository: "edgefloor/orchestra-desktop",
      commit: "b3e6534f82c62e6d30fdbac0d0e7aa9aa7301750",
      tree: "974192a2af184643d37df51ca70dea77d24decc9",
    },
    capture: {
      electronVersion: "41.5.0",
      platform: { os: "darwin", arch: "arm64" },
    },
    productionEntry: "t3code://app/",
    buildArtifacts,
    screenshots,
    assertions: Object.fromEntries(
      ORCHESTRA_NATIVE_SHELL_ASSERTIONS.map((assertion) => [assertion, true]),
    ),
    guest: {
      origin: "http://127.0.0.1:43123",
      fixtureSha256: sha256(Buffer.from("native guest fixture")),
    },
    humanReview: {
      status: "observed",
      reviewedAt: "2026-07-18T12:34:56.000Z",
      notes: "Wide and narrow native-shell captures were inspected.",
    },
  };
  await mutate?.(manifest, rootDir);
  await NodeFSP.writeFile(
    NodePath.join(rootDir, acceptanceDirectory, "manifest.json"),
    JSON.stringify(manifest),
  );
  return { rootDir, manifest };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true, force: true })),
  );
});

describe("Orchestra native-shell evidence verifier", () => {
  it("accepts the exact production shell and real guest evidence contract", async () => {
    const { rootDir } = await makeFixture();

    await expect(verifyOrchestraNativeShell({ rootDir })).resolves.toBeUndefined();
  });

  it("requires the four production artifacts in sealed order and checks their bytes", async () => {
    const reordered = await makeFixture((manifest) => {
      manifest.buildArtifacts.reverse();
    });
    await expect(verifyOrchestraNativeShell({ rootDir: reordered.rootDir })).rejects.toThrow(
      "manifest build artifact paths must exactly match the native-shell evidence contract",
    );

    const corrupted = await makeFixture(async (_manifest, rootDir) => {
      await NodeFSP.writeFile(
        NodePath.join(rootDir, ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS[0]),
        "corrupted",
      );
    });
    await expect(verifyOrchestraNativeShell({ rootDir: corrupted.rootDir })).rejects.toThrow(
      "sha256 does not match the artifact bytes",
    );
  });

  it("requires exactly the ordered wide and narrow dark screenshots", async () => {
    expect(ORCHESTRA_NATIVE_SHELL_SCREENSHOT_NAMES).toEqual([
      "native-browser-1440x900-dark",
      "native-workspace-1024x768-dark",
    ]);
    const { rootDir } = await makeFixture((manifest) => {
      manifest.screenshots.reverse();
    });

    await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(
      "manifest screenshot scenarios must exactly match the native-shell evidence contract",
    );
  });

  it("reads PNG dimensions and digests from the captured files", async () => {
    const wrongDimensions = await makeFixture(async (manifest, rootDir) => {
      const screenshot = manifest.screenshots[0]!;
      const replacement = minimalPng(1, 1);
      await NodeFSP.writeFile(NodePath.join(rootDir, screenshot.file), replacement);
      screenshot.sha256 = sha256(replacement);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: wrongDimensions.rootDir })).rejects.toThrow(
      "PNG dimensions do not match the scenario",
    );

    const wrongDigest = await makeFixture((manifest) => {
      manifest.screenshots[0]!.sha256 = "f".repeat(64);
    });
    await expect(verifyOrchestraNativeShell({ rootDir: wrongDigest.rootDir })).rejects.toThrow(
      "sha256 does not match the PNG bytes",
    );
  });

  it("requires every sealed native and guest assertion to be true", async () => {
    const { rootDir } = await makeFixture((manifest) => {
      manifest.assertions.realWebviewAttached = false;
    });

    await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(
      "manifest.assertions.realWebviewAttached must be true",
    );
  });

  it("requires production entry, guest identity, and observed human review", async () => {
    const invalidCases: Array<{
      readonly mutate: (manifest: MutableManifest) => void;
      readonly message: string;
    }> = [
      {
        mutate: (manifest) => {
          manifest.productionEntry = "http://localhost:5173";
        },
        message: "manifest.productionEntry must be t3code://app/",
      },
      {
        mutate: (manifest) => {
          manifest.guest.origin = "http://127.0.0.1:43123/page-a";
        },
        message: "manifest.guest.origin must be an HTTP(S) URL origin without a path",
      },
      {
        mutate: (manifest) => {
          manifest.humanReview.status = "pending";
        },
        message: "manifest.humanReview.status must be observed",
      },
      {
        mutate: (manifest) => {
          manifest.humanReview.notes = " ";
        },
        message: "manifest.humanReview.notes must be non-empty",
      },
      {
        mutate: (manifest) => {
          manifest.humanReview.reviewedAt = "0";
        },
        message: "manifest.humanReview.reviewedAt must be an ISO timestamp",
      },
    ];

    for (const invalidCase of invalidCases) {
      const { rootDir } = await makeFixture(invalidCase.mutate);
      await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("requires valid desktop Git identities and native capture metadata", async () => {
    const invalidCases: Array<{
      readonly mutate: (manifest: MutableManifest) => void;
      readonly message: string;
    }> = [
      {
        mutate: (manifest) => {
          manifest.desktop.commit = "not-a-commit";
        },
        message: "manifest.desktop.commit must be a lowercase 40-character Git object ID",
      },
      {
        mutate: (manifest) => {
          manifest.capture.electronVersion = "latest";
        },
        message: "manifest.capture.electronVersion must be a semantic Electron version",
      },
      {
        mutate: (manifest) => {
          manifest.capture.platform.os = "browser";
        },
        message: "manifest.capture.platform.os must be darwin, linux, or win32",
      },
    ];

    for (const invalidCase of invalidCases) {
      const { rootDir } = await makeFixture(invalidCase.mutate);
      await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("rejects a desktop tree that does not belong to the resolved source commit", async () => {
    const { rootDir, manifest } = await makeFixture();
    const git = (args: ReadonlyArray<string>): string =>
      NodeChildProcess.execFileSync("git", args, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();

    git(["init"]);
    git(["add", "."]);
    git([
      "-c",
      "user.name=Orchestra Acceptance",
      "-c",
      "user.email=acceptance@example.invalid",
      "commit",
      "-m",
      "native shell fixture",
    ]);
    manifest.desktop.commit = git(["rev-parse", "HEAD"]);
    manifest.desktop.tree = "f".repeat(40);
    await NodeFSP.writeFile(
      NodePath.join(rootDir, acceptanceDirectory, "manifest.json"),
      JSON.stringify(manifest),
    );

    await expect(verifyOrchestraNativeShell({ rootDir })).rejects.toThrow(
      "manifest.desktop.tree does not match manifest.desktop.commit",
    );
  });
});

describe("readNativeShellPngDimensions", () => {
  it("rejects non-PNG bytes", () => {
    expect(() => readNativeShellPngDimensions(Buffer.from("not a png"), "fixture")).toThrow(
      "fixture must be a PNG image",
    );
  });
});
