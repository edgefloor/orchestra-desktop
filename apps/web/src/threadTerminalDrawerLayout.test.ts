import { describe, expect, it } from "vite-plus/test";

import {
  clampTerminalDrawerHeight,
  resolveMaxTerminalDrawerHeight,
  TERMINAL_DRAWER_PRIMARY_CONTENT_RESERVE_PX,
} from "./threadTerminalDrawerLayout";

describe("terminal drawer narrow-height policy", () => {
  it("reserves useful timeline and composer height at 768px", () => {
    const maxHeight = resolveMaxTerminalDrawerHeight(768);

    expect(TERMINAL_DRAWER_PRIMARY_CONTENT_RESERVE_PX).toBe(360);
    expect(maxHeight).toBe(408);
    expect(768 - maxHeight).toBeGreaterThanOrEqual(360);
    expect(clampTerminalDrawerHeight(600, 768)).toBe(408);
  });

  it("retains the minimum drawer height and permits more room in taller windows", () => {
    expect(clampTerminalDrawerHeight(100, 768)).toBe(180);
    expect(resolveMaxTerminalDrawerHeight(1080)).toBe(720);
    expect(clampTerminalDrawerHeight(640, 1080)).toBe(640);
  });
});
