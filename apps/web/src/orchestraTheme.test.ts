// @effect-diagnostics nodeBuiltinImport:off - This contract test reads the shipped CSS source.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import mainSource from "./main.tsx?raw";

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe("Orchestra theme contract", () => {
  const theme = NodeFS.readFileSync(new URL("./index.css", import.meta.url), "utf8").toLowerCase();
  const staticIndex = NodeFS.readFileSync(new URL("../index.html", import.meta.url), "utf8");

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

  it("keeps normal-size semantic text at WCAG AA contrast", () => {
    const pairs = [
      ["#ffffff", "#5a6ec7"],
      ["#111827", "#7b8cde"],
      ["#9a5800", "#ffffff"],
      ["#667085", "#ffffff"],
      ["#858585", "#1a1a1a"],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(theme).toContain("--orchestra-warning: #9a5800;");
    expect(theme).toContain("--orchestra-on-iris: #111827;");
  });

  it("uses native SF typography without bundling the former web fonts", () => {
    expect(theme).toContain('"sf pro text"');
    expect(theme).toContain('"sf mono"');
    expect(mainSource).not.toContain("@fontsource-variable/dm-sans");
    expect(mainSource).not.toContain("@fontsource/jetbrains-mono");
  });

  it("brands the pre-hydration boot shell as Orchestra with matching canvas colors", () => {
    expect(staticIndex).toContain("<title>Orchestra (Alpha)</title>");
    expect(staticIndex).toContain('aria-label="Orchestra splash screen"');
    expect(staticIndex).toContain('alt="Orchestra"');
    expect(staticIndex).toContain('const LIGHT_BACKGROUND = "#f5f7fa"');
    expect(staticIndex).toContain('const DARK_BACKGROUND = "#0d0d0d"');
    expect(staticIndex).toContain('content="#f5f7fa"');
    expect(staticIndex).toContain('content="#0d0d0d"');
    expect(staticIndex).toContain('"SF Pro Text"');
    expect(staticIndex).not.toContain("T3 Code");
  });

  it("stops nonessential motion and smooth scrolling for reduced-motion users", () => {
    expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
    expect(theme).toContain("animation-duration: 0.01ms !important");
    expect(theme).toContain("animation-iteration-count: 1 !important");
    expect(theme).toContain("transition-duration: 0.01ms !important");
    expect(theme).toContain("scroll-behavior: auto !important");
  });
});
