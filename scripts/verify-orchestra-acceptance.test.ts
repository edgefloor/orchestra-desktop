// @effect-diagnostics nodeBuiltinImport:off - Contract tests generate isolated PNG fixtures.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeZlib from "node:zlib";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ORCHESTRA_ACCEPTANCE_SCENARIOS,
  readPngDimensions,
  verifyOrchestraAcceptance,
} from "./verify-orchestra-acceptance.ts";

const temporaryRoots: string[] = [];
const acceptanceDirectory = "docs/acceptance/orchestra-workspace";

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
  header[9] = 0;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", NodeZlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sha256(bytes: Buffer): string {
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

type MutableManifest = {
  schemaVersion: number;
  id: string;
  role: string;
  desktop: { repository: string; commit: string; tree: string };
  capture: { electronVersion: string; platform: { os: string; arch: string } };
  screenshots: Array<{
    scenario: string;
    file: string;
    width: number;
    height: number;
    deviceScaleFactor: number;
    theme: string;
    state: string;
    sha256: string;
    assertions: Record<string, boolean>;
  }>;
};

async function makeFixture(
  mutate?: (manifest: MutableManifest, rootDir: string) => void | Promise<void>,
): Promise<{ readonly rootDir: string; readonly manifest: MutableManifest }> {
  const rootDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "orchestra-acceptance-"));
  temporaryRoots.push(rootDir);
  await NodeFSP.mkdir(NodePath.join(rootDir, acceptanceDirectory), { recursive: true });

  const screenshots: MutableManifest["screenshots"] = [];
  for (const [scenario, contract] of Object.entries(ORCHESTRA_ACCEPTANCE_SCENARIOS)) {
    const file = `${acceptanceDirectory}/${scenario}.png`;
    const image = minimalPng(contract.width, contract.height);
    await NodeFSP.writeFile(NodePath.join(rootDir, file), image);
    screenshots.push({
      scenario,
      file,
      width: contract.width,
      height: contract.height,
      deviceScaleFactor: 1,
      theme: contract.theme,
      state: contract.state,
      sha256: sha256(image),
      assertions: Object.fromEntries(contract.assertions.map((assertion) => [assertion, true])),
    });
  }

  const manifest: MutableManifest = {
    schemaVersion: 1,
    id: "orchestra-workspace-acceptance-v1",
    role: "product-acceptance-evidence",
    desktop: {
      repository: "edgefloor/orchestra-desktop",
      commit: "b3e6534f82c62e6d30fdbac0d0e7aa9aa7301750",
      tree: "974192a2af184643d37df51ca70dea77d24decc9",
    },
    capture: {
      electronVersion: "41.5.0",
      platform: { os: "darwin", arch: "arm64" },
    },
    screenshots,
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

describe("Orchestra workspace acceptance verifier", () => {
  it("accepts the exact six-scenario Product evidence contract", async () => {
    const { rootDir } = await makeFixture();

    await expect(verifyOrchestraAcceptance({ rootDir })).resolves.toBeUndefined();
  });

  it("requires all six scenarios in their sealed order", async () => {
    const { rootDir } = await makeFixture((manifest) => {
      manifest.screenshots.pop();
    });

    await expect(verifyOrchestraAcceptance({ rootDir })).rejects.toThrow(
      "manifest screenshot scenarios must exactly match the acceptance contract",
    );
  });

  it("rejects viewport, theme, and state metadata that diverges from a scenario", async () => {
    const invalidCases: Array<{
      readonly mutate: (screenshot: MutableManifest["screenshots"][number]) => void;
      readonly message: string;
    }> = [
      {
        mutate: (screenshot) => {
          screenshot.width = 1000;
        },
        message: "viewport metadata does not match the scenario",
      },
      {
        mutate: (screenshot) => {
          screenshot.theme = "dark";
        },
        message: "theme/state metadata does not match the scenario",
      },
      {
        mutate: (screenshot) => {
          screenshot.state = "symphony";
        },
        message: "theme/state metadata does not match the scenario",
      },
    ];

    for (const invalidCase of invalidCases) {
      const { rootDir } = await makeFixture((manifest) => {
        invalidCase.mutate(manifest.screenshots[0]!);
      });
      await expect(verifyOrchestraAcceptance({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("reads dimensions from PNG bytes instead of trusting manifest metadata", async () => {
    const { rootDir } = await makeFixture(async (manifest, fixtureRoot) => {
      const screenshot = manifest.screenshots[0]!;
      const replacement = minimalPng(1, 1);
      await NodeFSP.writeFile(NodePath.join(fixtureRoot, screenshot.file), replacement);
      screenshot.sha256 = sha256(replacement);
    });

    await expect(verifyOrchestraAcceptance({ rootDir })).rejects.toThrow(
      "PNG dimensions do not match the scenario",
    );
  });

  it("rejects a digest that does not match the PNG bytes", async () => {
    const { rootDir } = await makeFixture((manifest) => {
      manifest.screenshots[0]!.sha256 = "f".repeat(64);
    });

    await expect(verifyOrchestraAcceptance({ rootDir })).rejects.toThrow(
      "sha256 does not match the PNG bytes",
    );
  });

  it("requires valid desktop Git identities and Electron/platform metadata", async () => {
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
          manifest.desktop.tree = "not-a-tree";
        },
        message: "manifest.desktop.tree must be a lowercase 40-character Git object ID",
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
      await expect(verifyOrchestraAcceptance({ rootDir })).rejects.toThrow(invalidCase.message);
    }
  });

  it("requires every scenario-specific semantic assertion to be exactly true", async () => {
    const { rootDir } = await makeFixture((manifest) => {
      manifest.screenshots[4]!.assertions.contextSheetLabelled = false;
    });

    await expect(verifyOrchestraAcceptance({ rootDir })).rejects.toThrow(
      "assertions.contextSheetLabelled must be true",
    );
  });
});

describe("readPngDimensions", () => {
  it("rejects non-PNG bytes", () => {
    expect(() => readPngDimensions(Buffer.from("not a png"), "fixture")).toThrow(
      "fixture must be a PNG image",
    );
  });
});
