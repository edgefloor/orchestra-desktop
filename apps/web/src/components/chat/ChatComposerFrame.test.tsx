import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ChatComposerFrame } from "./ChatComposerFrame";

describe("ChatComposerFrame", () => {
  it("retains production composer semantics while accepting fixture-safe slots", () => {
    const markup = renderToStaticMarkup(
      <ChatComposerFrame frameClassName="provider-frame" surfaceClassName="provider-surface">
        <div data-composer-slot="editor">Prompt</div>
        <div data-chat-composer-footer="true">Footer</div>
      </ChatComposerFrame>,
    );

    expect(markup).toContain('data-chat-composer-form="true"');
    expect(markup).toContain("mx-auto w-full min-w-0 max-w-3xl");
    expect(markup).toContain("group rounded-[22px] p-px transition-colors duration-200");
    expect(markup).toContain("chat-composer-glass");
    expect(markup).toContain("rounded-[20px]");
    expect(markup).toContain("border-border");
    expect(markup).toContain('data-chat-composer-mobile-collapsed="false"');
    expect(markup).toContain("provider-frame");
    expect(markup).toContain("provider-surface");
    expect(markup).toContain('data-composer-slot="editor"');
    expect(markup).toContain('data-chat-composer-footer="true"');
    expect(markup.indexOf('data-composer-slot="editor"')).toBeLessThan(
      markup.indexOf('data-chat-composer-footer="true"'),
    );
  });

  it("exposes the controller-owned mobile collapse state", () => {
    const markup = renderToStaticMarkup(<ChatComposerFrame mobileCollapsed />);

    expect(markup).toContain('data-chat-composer-mobile-collapsed="true"');
  });
});
