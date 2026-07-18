import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { FilePreviewModeToggle } from "./FilePreviewModeToggle";

describe("FilePreviewModeToggle", () => {
  it("labels the production file Preview mode action", () => {
    expect(
      renderToStaticMarkup(
        <FilePreviewModeToggle rendered={false} onRenderedChange={() => undefined} />,
      ),
    ).toContain('aria-label="Show rendered markdown"');
    expect(
      renderToStaticMarkup(<FilePreviewModeToggle rendered onRenderedChange={() => undefined} />),
    ).toContain('aria-label="Show markdown source"');
  });
});
