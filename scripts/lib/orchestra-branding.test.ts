// @effect-diagnostics nodeBuiltinImport:off - This contract test audits shipped source text.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const REPO_ROOT = NodePath.resolve(import.meta.dirname, "../..");
const SOURCE_ROOTS = [
  "apps/desktop/src",
  "apps/server/src",
  "apps/web/src",
  "packages/contracts/src",
  "packages/shared/src",
  "packages/ssh/src",
] as const;
const SOURCE_EXTENSIONS = new Set([".html", ".mjs", ".ts", ".tsx"]);
const LEGACY_IDENTITY_SOURCE = "apps/desktop/src/app/DesktopEnvironment.ts";

function sourceFiles(directory: string): string[] {
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "fixtures" ? [] : sourceFiles(path);
    }
    if (!entry.isFile()) return [];
    if (entry.name.includes(".test.") || entry.name.includes(".generated.")) return [];
    return SOURCE_EXTENSIONS.has(NodePath.extname(entry.name)) ? [path] : [];
  });
}

describe("Orchestra visible branding", () => {
  it("keeps upstream product naming confined to explicit user-data migration aliases", () => {
    const violations = SOURCE_ROOTS.flatMap((sourceRoot) =>
      sourceFiles(NodePath.join(REPO_ROOT, sourceRoot)).flatMap((filePath) => {
        const relativePath = NodePath.relative(REPO_ROOT, filePath);
        const source = NodeFS.readFileSync(filePath, "utf8");
        const auditedSource =
          relativePath === LEGACY_IDENTITY_SOURCE
            ? source.replaceAll('"T3 Code (Dev)"', "").replaceAll('"T3 Code (Alpha)"', "")
            : source;
        return /T3(?: Code|Code)/.test(auditedSource) ? [relativePath] : [];
      }),
    );

    const legacySource = NodeFS.readFileSync(
      NodePath.join(REPO_ROOT, LEGACY_IDENTITY_SOURCE),
      "utf8",
    );
    expect(legacySource).toContain('"T3 Code (Dev)"');
    expect(legacySource).toContain('"T3 Code (Alpha)"');
    expect(violations).toEqual([]);
  });
});
