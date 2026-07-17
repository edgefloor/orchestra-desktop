import { describe, expect, it } from "vite-plus/test";

import source from "./ExpandedImageDialog.tsx?raw";

describe("ExpandedImageDialog accessibility contract", () => {
  it("uses the retained dialog primitive for modal focus and dismissal behavior", () => {
    expect(source).toContain("<Dialog open onOpenChange={handleOpenChange}>");
    expect(source).toContain("<DialogPopup");
    expect(source).toContain("<DialogClose");
    expect(source).not.toContain('role="dialog"');
    expect(source).not.toContain('event.key === "Escape"');
  });

  it("provides an accessible title, description, and named image controls", () => {
    expect(source).toContain("<DialogTitle");
    expect(source).toContain("Expanded image preview");
    expect(source).toContain("<DialogDescription");
    expect(source).toContain('aria-label="Close image preview"');
    expect(source).toContain('aria-label="Previous image"');
    expect(source).toContain('aria-label="Next image"');
    expect(source).toContain("Use the left and right arrow keys to browse images.");
  });
});
