import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveSidebarAcceptedMaxWidth,
  resolveSidebarResizeKey,
  Sidebar,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./sidebar";
import { resolveSidebarState } from "./sidebarState";

function renderSidebarButton(className?: string) {
  return renderToStaticMarkup(
    <SidebarProvider>
      <SidebarMenuButton className={className}>Projects</SidebarMenuButton>
    </SidebarProvider>,
  );
}

describe("sidebar interactive cursors", () => {
  it("uses mobile sheet visibility for the shared responsive state", () => {
    expect(resolveSidebarState({ isMobile: true, open: true, openMobile: false })).toBe(
      "collapsed",
    );
    expect(resolveSidebarState({ isMobile: true, open: false, openMobile: true })).toBe("expanded");
    expect(resolveSidebarState({ isMobile: false, open: true, openMobile: false })).toBe(
      "expanded",
    );
  });

  it("exposes collapsed state for shared titlebar inset styling", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider defaultOpen={false}>
        <div />
      </SidebarProvider>,
    );

    expect(html).toContain('data-sidebar-state="collapsed"');
  });

  it("keeps the sidebar trigger interactive inside Electron drag regions", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    expect(html).toContain("[-webkit-app-region:no-drag]");
    expect(html).toContain("size-[var(--workspace-titlebar-control-size)]!");
  });

  it("uses a pointer cursor for menu buttons by default", () => {
    const html = renderSidebarButton();

    expect(html).toContain('data-slot="sidebar-menu-button"');
    expect(html).toContain("cursor-pointer");
  });

  it("lets project drag handles override the default pointer cursor", () => {
    const html = renderSidebarButton("cursor-grab");

    expect(html).toContain("cursor-grab");
    expect(html).not.toContain("cursor-pointer");
  });

  it("uses a pointer cursor for menu actions", () => {
    const html = renderToStaticMarkup(
      <SidebarMenuAction aria-label="Create thread">
        <span>+</span>
      </SidebarMenuAction>,
    );

    expect(html).toContain('data-slot="sidebar-menu-action"');
    expect(html).toContain("cursor-pointer");
  });

  it("uses a pointer cursor for submenu buttons", () => {
    const html = renderToStaticMarkup(
      <SidebarMenuSubButton render={<button type="button" />}>Show more</SidebarMenuSubButton>,
    );

    expect(html).toContain('data-slot="sidebar-menu-sub-button"');
    expect(html).toContain("cursor-pointer");
  });

  it("renders an expanded resizable rail as a focusable, finite separator", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <Sidebar resizable={{ minWidth: 208, maxWidth: 480 }}>
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="Resize Sidebar"');
    expect(html).toContain('aria-valuemin="208"');
    expect(html).toContain('aria-valuemax="480"');
    expect(html).toContain('aria-valuenow="256"');
    expect(html).toContain('aria-valuetext="256 pixels"');
    expect(html).toContain('tabindex="0"');
  });

  it("retains toggle button semantics while the resizable sidebar is collapsed", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider defaultOpen={false}>
        <Sidebar resizable>
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(html).toContain('aria-label="Toggle Sidebar"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain('role="separator"');
    expect(html).not.toContain("aria-valuemax");
  });
});

describe("sidebar keyboard resizing", () => {
  it("uses physical arrow directions appropriate to the sidebar side", () => {
    expect(
      resolveSidebarResizeKey({ key: "ArrowRight", value: 256, min: 208, max: 480, side: "left" }),
    ).toBe(272);
    expect(
      resolveSidebarResizeKey({ key: "ArrowLeft", value: 256, min: 208, max: 480, side: "left" }),
    ).toBe(240);
    expect(
      resolveSidebarResizeKey({ key: "ArrowLeft", value: 256, min: 208, max: 480, side: "right" }),
    ).toBe(272);
    expect(
      resolveSidebarResizeKey({ key: "ArrowRight", value: 256, min: 208, max: 480, side: "right" }),
    ).toBe(240);
  });

  it("supports Home and End and clamps arrows to the exposed range", () => {
    expect(
      resolveSidebarResizeKey({ key: "Home", value: 320, min: 208, max: 480, side: "left" }),
    ).toBe(208);
    expect(
      resolveSidebarResizeKey({ key: "End", value: 320, min: 208, max: 480, side: "left" }),
    ).toBe(480);
    expect(
      resolveSidebarResizeKey({ key: "ArrowRight", value: 476, min: 208, max: 480, side: "left" }),
    ).toBe(480);
    expect(
      resolveSidebarResizeKey({ key: "Enter", value: 320, min: 208, max: 480, side: "left" }),
    ).toBeNull();
  });

  it("finds the finite maximum accepted by dynamic main-content constraints", () => {
    expect(
      resolveSidebarAcceptedMaxWidth({
        minWidth: 208,
        upperWidth: 1_024,
        accepts: (width) => 1_024 - width >= 640,
      }),
    ).toBe(384);
  });
});
