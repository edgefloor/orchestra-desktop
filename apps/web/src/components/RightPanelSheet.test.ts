import { describe, expect, it } from "vite-plus/test";

import source from "./RightPanelSheet.tsx?raw";

describe("RightPanelSheet", () => {
  it("gives the retained sheet dialog an accessible name and description", () => {
    expect(source).toContain('<SheetTitle className="sr-only">Workspace panel</SheetTitle>');
    expect(source).toContain('<SheetDescription className="sr-only">');
    expect(source).toContain("Contextual workspace tools and task information.");
  });
});
