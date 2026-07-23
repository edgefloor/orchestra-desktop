import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { NativeActivityPanel } from "./NativeActivityPanel";
import type { NativeActivityPresentation } from "./NativeActivityPanel.logic";

const presentation: NativeActivityPresentation = {
  accessibleLabel: "Native activity",
  identity: { label: "Root Run", value: "root-1", status: "running" },
  state: "stale",
  overview: { summary: "Bounded snapshot", metadata: "Revision 4" },
  records: [
    {
      id: "activity-1",
      kind: "coordination",
      status: "waiting gate",
      summary: "Waiting for approval",
      detail: "The native gate remains durable.",
      occurredAt: "42 ms",
    },
  ],
  emptyMessage: "No activity.",
  failure: {
    message: "Refresh failed",
    retainedMessage: "Showing the last exact snapshot.",
    retryLabel: "Retry activity",
  },
  truncationMessage: "Earlier activity was not loaded.",
};

describe("NativeActivityPanel", () => {
  it("renders identity, state, normalized records, and retained failure through one interface", () => {
    const markup = renderToStaticMarkup(
      <NativeActivityPanel onRetry={vi.fn()} presentation={presentation} />,
    );

    expect(markup).toContain('aria-label="Native activity"');
    expect(markup).toContain('data-native-activity-state="stale"');
    expect(markup).toContain("Root Run");
    expect(markup).toContain("root-1");
    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain("The native gate remains durable.");
    expect(markup).toContain("waiting gate");
    expect(markup).toContain("Refresh failed");
    expect(markup).toContain("Showing the last exact snapshot.");
    expect(markup).toContain("Retry activity");
    expect(markup).toContain("Earlier activity was not loaded.");
  });

  it("renders the shared empty state without fabricating records", () => {
    const markup = renderToStaticMarkup(
      <NativeActivityPanel
        presentation={{
          ...presentation,
          state: "empty",
          records: [],
          overview: undefined,
          failure: undefined,
          truncationMessage: undefined,
        }}
      />,
    );

    expect(markup).toContain("0 items");
    expect(markup).toContain("No activity.");
    expect(markup).not.toContain("<article");
  });
});
