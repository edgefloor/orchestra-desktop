import { useState } from "react";

import type { RightPanelSurface } from "../rightPanelStore";
import { RightPanelTabs } from "../components/RightPanelTabs";
import { PreviewChromeRow } from "../components/preview/PreviewChromeRow";
import { PreviewUnreachable } from "../components/preview/PreviewUnreachable";
import { Button } from "../components/ui/button";
import { FilePreviewModeToggle } from "../components/files/FilePreviewModeToggle";

const BROWSER_SURFACE: RightPanelSurface = {
  id: "browser:new",
  kind: "preview",
  resourceId: null,
};
const FILE_SURFACE: RightPanelSurface = {
  id: "file:README.md",
  kind: "file",
  relativePath: "README.md",
  revealLine: null,
  revealRequestId: 0,
};

function recordAction(key: string, value: string) {
  window.__ORCHESTRA_ACCEPTANCE_ACTIONS__ = {
    ...window.__ORCHESTRA_ACCEPTANCE_ACTIONS__,
    [key]: value,
  };
}

export function BrowserPreviewAcceptanceSurface({
  mode,
  initialSurface = "browser",
}: {
  readonly mode: "inline" | "sheet";
  readonly initialSurface?: "browser" | "file";
}) {
  const [surfaces, setSurfaces] = useState<RightPanelSurface[]>([BROWSER_SURFACE, FILE_SURFACE]);
  const [activeSurfaceId, setActiveSurfaceId] = useState<string>(
    initialSurface === "file" ? FILE_SURFACE.id : BROWSER_SURFACE.id,
  );
  const [browserUrl, setBrowserUrl] = useState("http://127.0.0.1:4173/orchestra");
  const [pickActive, setPickActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [renderMarkdown, setRenderMarkdown] = useState(false);

  const activeSurface = surfaces.find((surface) => surface.id === activeSurfaceId) ?? null;
  const closeSurface = (surface: RightPanelSurface) => {
    const index = surfaces.findIndex((entry) => entry.id === surface.id);
    const nextSurfaces = surfaces.filter((entry) => entry.id !== surface.id);
    setSurfaces(nextSurfaces);
    if (surface.id === activeSurfaceId) {
      setActiveSurfaceId(nextSurfaces[Math.min(index, nextSurfaces.length - 1)]?.id ?? "");
    }
    recordAction("closedSurfaceId", surface.id);
  };
  const addBrowser = () => {
    setSurfaces((current) =>
      current.some((surface) => surface.id === BROWSER_SURFACE.id)
        ? current
        : [...current, BROWSER_SURFACE],
    );
    setActiveSurfaceId(BROWSER_SURFACE.id);
    recordAction("reopenedSurfaceId", BROWSER_SURFACE.id);
  };

  return (
    <aside
      aria-label="Task Browser and Preview"
      className={mode === "inline" ? "h-full min-h-0" : "h-[min(80vh,44rem)] min-h-0"}
      data-browser-preview-acceptance=""
      data-task-association="acceptance-task"
    >
      <RightPanelTabs
        activeSurfaceId={activeSurface?.id ?? null}
        browserAvailable
        diffAvailable
        filesAvailable
        mode={mode}
        onActivate={(surface) => setActiveSurfaceId(surface.id)}
        onAddBrowser={addBrowser}
        onAddDiff={() => undefined}
        onAddFiles={() => undefined}
        onAddTerminal={() => undefined}
        onCloseAllSurfaces={() => {
          setSurfaces([]);
          setActiveSurfaceId("");
        }}
        onCloseOtherSurfaces={(surface) => {
          setSurfaces([surface]);
          setActiveSurfaceId(surface.id);
        }}
        onCloseSurface={closeSurface}
        onCloseSurfacesToRight={(surface) => {
          const index = surfaces.findIndex((entry) => entry.id === surface.id);
          setSurfaces(surfaces.slice(0, index + 1));
        }}
        onCopyFilePath={(relativePath) => recordAction("copiedPath", relativePath)}
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        surfaces={surfaces}
        terminalLabelsById={new Map()}
      >
        {activeSurface?.kind === "preview" ? (
          <section aria-label="Browser preview" className="flex min-h-0 flex-1 flex-col">
            <PreviewChromeRow
              canGoBack
              canGoForward={false}
              loadProgress={0}
              loading={false}
              onBack={() => recordAction("browserNavigation", "back")}
              onCapture={(record) => {
                setRecording(record);
                recordAction("browserCapture", record ? "record" : "screenshot");
              }}
              onForward={() => undefined}
              onRefresh={() => recordAction("browserNavigation", "refresh")}
              onPickElement={() => {
                setPickActive((current) => !current);
                recordAction("browserAnnotation", pickActive ? "cancelled" : "active");
              }}
              onSubmit={(url) => {
                setBrowserUrl(url);
                recordAction("browserUrl", url);
              }}
              refreshDisabled={false}
              recording={recording}
              pickActive={pickActive}
              url={browserUrl}
            />
            {unreachable ? (
              <PreviewUnreachable
                code={-105}
                description="ERR_NAME_NOT_RESOLVED"
                onReload={() => {
                  setUnreachable(false);
                  recordAction("browserFailureRecovery", "reload");
                }}
                url="https://unreachable.invalid"
              />
            ) : (
              <div
                aria-label="Deterministic Browser viewport"
                className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 p-6"
              >
                <div className="max-w-md rounded-xl border bg-background p-5 text-center">
                  <div className="text-sm font-semibold">Orchestra local preview</div>
                  <p className="mt-2 text-xs text-muted-foreground">{browserUrl}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Task acceptance-task · network-free deterministic content
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setUnreachable(true)}
                    size="sm"
                    variant="outline"
                  >
                    Simulate unreachable page
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : activeSurface?.kind === "file" ? (
          <section aria-label="README.md Preview" className="flex min-h-0 flex-1 flex-col">
            <header className="surface-subheader justify-between gap-2 px-3">
              <span className="truncate text-xs font-medium">README.md</span>
              <FilePreviewModeToggle
                rendered={renderMarkdown}
                onRenderedChange={(rendered) => {
                  setRenderMarkdown(rendered);
                  recordAction("previewContentMode", rendered ? "rendered" : "source");
                }}
              />
            </header>
            {renderMarkdown ? (
              <article
                aria-label="Rendered README.md content"
                className="min-h-0 flex-1 overflow-auto p-6"
              >
                <h2 className="text-lg font-semibold">Orchestra workspace</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Browser and Preview remain attached to acceptance-task.
                </p>
              </article>
            ) : (
              <pre
                aria-label="README.md source content"
                className="min-h-0 flex-1 overflow-auto p-6 text-sm"
              >
                {
                  "# Orchestra workspace\n\nBrowser and Preview remain attached to acceptance-task.\n"
                }
              </pre>
            )}
          </section>
        ) : null}
      </RightPanelTabs>
    </aside>
  );
}
