import { describe, expect, it } from "vite-plus/test";

import {
  NARROW_DESKTOP_MAX_WIDTH_PX,
  NARROW_DESKTOP_SHEET_MEDIA_QUERY,
  shouldUseNarrowDesktopSheet,
} from "./rightPanelLayout";

describe("narrow desktop surface policy", () => {
  it("uses sheets for retained and Orchestra context surfaces at 1024px", () => {
    expect(NARROW_DESKTOP_MAX_WIDTH_PX).toBe(1024);
    expect(NARROW_DESKTOP_SHEET_MEDIA_QUERY).toBe("(max-width: 1024px)");
    expect(shouldUseNarrowDesktopSheet(1024)).toBe(true);
  });

  it("keeps contextual surfaces inline above the narrow desktop boundary", () => {
    expect(shouldUseNarrowDesktopSheet(1025)).toBe(false);
    expect(shouldUseNarrowDesktopSheet(1440)).toBe(false);
  });
});
