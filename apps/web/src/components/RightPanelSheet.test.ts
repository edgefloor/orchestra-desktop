import { describe, expect, it } from "vite-plus/test";

import source from "./RightPanelSheet.tsx?raw";
import controlsSource from "./chat/PanelLayoutControls.tsx?raw";

describe("RightPanelSheet", () => {
  it("gives the retained sheet dialog an accessible name and description", () => {
    expect(source).toContain('<SheetTitle className="sr-only">Workspace panel</SheetTitle>');
    expect(source).toContain('<SheetDescription className="sr-only">');
    expect(source).toContain("Contextual workspace tools and task information.");
  });

  it("returns focus to the external retained-panel toggle when the sheet closes", () => {
    expect(source).toContain(
      'export const RIGHT_PANEL_TOGGLE_ID = "workspace-right-panel-toggle";',
    );
    expect(source).toContain("requestAnimationFrame(() =>");
    expect(source).toContain("document.getElementById(returnFocusId)?.focus()");
    expect(source).toContain("finalFocus={props.returnFocusId ? false : undefined}");
    expect(controlsSource).toContain("id={RIGHT_PANEL_TOGGLE_ID}");
    expect(controlsSource.indexOf("id={RIGHT_PANEL_TOGGLE_ID}")).toBeGreaterThan(
      controlsSource.indexOf('aria-label="Toggle terminal drawer"'),
    );
    expect(controlsSource.indexOf("id={RIGHT_PANEL_TOGGLE_ID}")).toBeLessThan(
      controlsSource.indexOf('aria-label="Toggle right panel"'),
    );
  });
});
