import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  resolveTerminalSelectionActionPosition,
  shouldHandleTerminalSelectionMouseUp,
  TerminalDrawerResizeHandle,
  terminalSelectionActionDelayForClickCount,
} from "./ThreadTerminalDrawer";

describe("TerminalDrawerResizeHandle", () => {
  it("renders as a focusable, named horizontal separator with its height range", () => {
    const pointerHandler = vi.fn();
    const markup = renderToStaticMarkup(
      <TerminalDrawerResizeHandle
        height={320}
        maxHeight={408}
        onHeightChange={vi.fn()}
        onPointerDown={pointerHandler}
        onPointerMove={pointerHandler}
        onPointerUp={pointerHandler}
        onPointerCancel={pointerHandler}
      />,
    );

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('aria-label="Resize terminal drawer"');
    expect(markup).toContain('aria-valuemin="180"');
    expect(markup).toContain('aria-valuemax="408"');
    expect(markup).toContain('aria-valuenow="320"');
    expect(markup).toContain('aria-valuetext="320 pixels"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("focus-visible:ring-2");
  });
});

describe("resolveTerminalSelectionActionPosition", () => {
  it("prefers the selection rect over the last pointer position", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: { right: 260, bottom: 140 },
        pointer: { x: 520, y: 200 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 260,
      y: 144,
    });
  });

  it("falls back to the pointer position when no selection rect is available", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 180, y: 130 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 180,
      y: 130,
    });
  });

  it("clamps the pointer fallback into the terminal drawer bounds", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 720, y: 340 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 600,
      y: 270,
    });

    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 40, y: 20 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 100,
      y: 50,
    });
  });

  it("delays multi-click selection actions so triple-click selection can complete", () => {
    expect(terminalSelectionActionDelayForClickCount(1)).toBe(0);
    expect(terminalSelectionActionDelayForClickCount(2)).toBe(260);
    expect(terminalSelectionActionDelayForClickCount(3)).toBe(260);
  });

  it("only handles mouseup when the selection gesture started in the terminal", () => {
    expect(shouldHandleTerminalSelectionMouseUp(true, 0)).toBe(true);
    expect(shouldHandleTerminalSelectionMouseUp(false, 0)).toBe(false);
    expect(shouldHandleTerminalSelectionMouseUp(true, 1)).toBe(false);
  });
});
