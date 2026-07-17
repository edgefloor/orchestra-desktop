import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { RightPanelSurface } from "~/rightPanelStore";

import { RightPanelTabs } from "./RightPanelTabs";

const surfaces: RightPanelSurface[] = [
  { id: "diff", kind: "diff" },
  { id: "files", kind: "files" },
];

function renderTabs(activeSurfaceId: string | null) {
  return renderToStaticMarkup(
    <RightPanelTabs
      mode="sheet"
      surfaces={surfaces}
      activeSurfaceId={activeSurfaceId}
      pendingSurfaceIds={new Set()}
      previewSessions={{}}
      terminalLabelsById={new Map()}
      onActivate={vi.fn()}
      onCloseSurface={vi.fn()}
      onCloseOtherSurfaces={vi.fn()}
      onCloseSurfacesToRight={vi.fn()}
      onCloseAllSurfaces={vi.fn()}
      onCopyFilePath={vi.fn()}
      onAddBrowser={vi.fn()}
      onAddTerminal={vi.fn()}
      onAddDiff={vi.fn()}
      onAddFiles={vi.fn()}
      browserAvailable
      diffAvailable
      filesAvailable
    >
      <div>Active panel content</div>
    </RightPanelTabs>,
  );
}

describe("RightPanelTabs", () => {
  it("exposes retained panel surfaces as an accessible tablist and tabpanel", () => {
    const markup = renderTabs("diff");

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Open panel surfaces"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-selected="false"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-label="Diff"');
    expect(markup).toContain('aria-label="Close Diff"');
  });

  it("does not claim a tabpanel when no retained surface is active", () => {
    const markup = renderTabs(null);

    expect(markup).toContain('role="tablist"');
    expect(markup).not.toContain('role="tabpanel"');
    expect(markup).toContain("Open a surface");
  });
});
