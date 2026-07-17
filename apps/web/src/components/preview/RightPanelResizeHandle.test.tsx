import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

describe("RightPanelResizeHandle", () => {
  it("renders as a focusable, named vertical separator with its width range", () => {
    const pointerHandler = vi.fn();
    const markup = renderToStaticMarkup(
      <RightPanelResizeHandle
        handlers={{
          onPointerDown: pointerHandler,
          onPointerMove: pointerHandler,
          onPointerUp: pointerHandler,
          onPointerCancel: pointerHandler,
        }}
        width={540}
        minWidth={360}
        maxWidth={896}
        onWidthChange={vi.fn()}
      />,
    );

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('aria-label="Resize right panel"');
    expect(markup).toContain('aria-valuemin="360"');
    expect(markup).toContain('aria-valuemax="896"');
    expect(markup).toContain('aria-valuenow="540"');
    expect(markup).toContain('aria-valuetext="540 pixels"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("focus-visible:ring-2");
  });
});
