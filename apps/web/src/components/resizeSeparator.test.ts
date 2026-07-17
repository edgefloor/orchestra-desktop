import { describe, expect, it } from "vite-plus/test";

import { resolveResizeSeparatorKey } from "./resizeSeparator";

describe("resolveResizeSeparatorKey", () => {
  const base = {
    value: 320,
    min: 180,
    max: 480,
    increaseKey: "ArrowUp",
    decreaseKey: "ArrowDown",
  };

  it("increments and decrements with the configured arrow keys", () => {
    expect(resolveResizeSeparatorKey({ ...base, key: "ArrowUp" })).toBe(336);
    expect(resolveResizeSeparatorKey({ ...base, key: "ArrowDown" })).toBe(304);

    const rightAnchoredPanel = {
      ...base,
      increaseKey: "ArrowLeft",
      decreaseKey: "ArrowRight",
    };
    expect(resolveResizeSeparatorKey({ ...rightAnchoredPanel, key: "ArrowLeft" })).toBe(336);
    expect(resolveResizeSeparatorKey({ ...rightAnchoredPanel, key: "ArrowRight" })).toBe(304);
  });

  it("moves to the minimum and maximum with Home and End", () => {
    expect(resolveResizeSeparatorKey({ ...base, key: "Home" })).toBe(180);
    expect(resolveResizeSeparatorKey({ ...base, key: "End" })).toBe(480);
  });

  it("clamps arrow changes and ignores unrelated keys", () => {
    expect(resolveResizeSeparatorKey({ ...base, value: 480, key: "ArrowUp" })).toBe(480);
    expect(resolveResizeSeparatorKey({ ...base, value: 180, key: "ArrowDown" })).toBe(180);
    expect(resolveResizeSeparatorKey({ ...base, key: "Enter" })).toBeNull();
  });
});
