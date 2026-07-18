import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { BrowserPreviewAcceptanceSurface } from "./BrowserPreviewAcceptanceSurface";

describe("BrowserPreviewAcceptanceSurface", () => {
  it("uses retained panel tabs and Browser chrome in the task-scoped inline surface", () => {
    const markup = renderToStaticMarkup(<BrowserPreviewAcceptanceSurface mode="inline" />);

    expect(markup).toContain('aria-label="Task Browser and Preview"');
    expect(markup).toContain('data-task-association="acceptance-task"');
    expect(markup).toContain('data-preview-panel-mode="inline"');
    expect(markup).toContain('aria-label="Open panel surfaces"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("Browser");
    expect(markup).toContain("README.md");
    expect(markup).toContain('data-preview-url-input="true"');
    expect(markup).toContain('aria-label="Annotate preview"');
    expect(markup).toContain('aria-label="Capture screenshot"');
    expect(markup).toContain('aria-label="Deterministic Browser viewport"');
    expect(markup).toContain("Simulate unreachable page");
  });

  it("uses the retained sheet mode for narrow desktop", () => {
    const markup = renderToStaticMarkup(<BrowserPreviewAcceptanceSurface mode="sheet" />);

    expect(markup).toContain('data-preview-panel-mode="sheet"');
    expect(markup).toContain('role="tabpanel"');
  });

  it("composes deterministic content with the production file Preview mode action", () => {
    const markup = renderToStaticMarkup(
      <BrowserPreviewAcceptanceSurface initialSurface="file" mode="inline" />,
    );

    expect(markup).toContain('aria-label="README.md Preview"');
    expect(markup).toContain('aria-label="README.md source content"');
    expect(markup).toContain('aria-label="Show rendered markdown"');
  });
});
