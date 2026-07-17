// @effect-diagnostics nodeBuiltinImport:off - This contract test reads the shipped CSS source.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import mainSource from "./main.tsx?raw";

describe("Orchestra theme contract", () => {
  const theme = NodeFS.readFileSync(new URL("./index.css", import.meta.url), "utf8").toLowerCase();

  it("freezes the approved light and dark surface palettes", () => {
    expect(theme).toContain("--orchestra-canvas: #f5f7fa;");
    expect(theme).toContain("--orchestra-chrome: #eef1f5;");
    expect(theme).toContain("--orchestra-surface: #ffffff;");
    expect(theme).toContain("--orchestra-canvas: #0d0d0d;");
    expect(theme).toContain("--orchestra-chrome: #141414;");
    expect(theme).toContain("--orchestra-surface: #1a1a1a;");
  });

  it("maps interaction and status semantics to the approved tokens", () => {
    for (const token of [
      "--orchestra-iris",
      "--orchestra-iris-hover",
      "--orchestra-iris-wash",
      "--orchestra-focus-ring",
      "--orchestra-selection",
      "--orchestra-success",
      "--orchestra-warning",
      "--orchestra-danger",
      "--orchestra-info",
    ]) {
      expect(theme).toContain(`${token}:`);
    }
    expect(theme).toContain("--primary: var(--orchestra-iris);");
    expect(theme).toContain("--ring: var(--orchestra-focus-ring);");
    expect(theme).toContain("::selection");
  });

  it("uses native SF typography without bundling the former web fonts", () => {
    expect(theme).toContain('"sf pro text"');
    expect(theme).toContain('"sf mono"');
    expect(mainSource).not.toContain("@fontsource-variable/dm-sans");
    expect(mainSource).not.toContain("@fontsource/jetbrains-mono");
  });
});
