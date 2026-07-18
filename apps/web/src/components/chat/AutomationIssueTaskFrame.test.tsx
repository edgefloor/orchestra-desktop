import type { FormEvent, MouseEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationIssueTaskFrame } from "./AutomationIssueTaskFrame";

describe("AutomationIssueTaskFrame", () => {
  it("composes Issue activity with the reachable normal task composer and preserves behavior", () => {
    const inspectActivity = vi.fn();
    const sendNormalTaskMessage = vi.fn();
    const activity = (
      <button aria-label="Inspect issue activity" onClick={inspectActivity} type="button">
        Native task event
      </button>
    );
    const composer = (
      <form aria-label="Normal task composer" onSubmit={sendNormalTaskMessage}>
        <button type="submit">Send normal task message</button>
      </form>
    );

    const frame = AutomationIssueTaskFrame({
      issueActive: true,
      activity,
      composer,
      children: null,
    }) as ReactElement<{ children: ReactElement[]; className: string }>;
    const [activityRegion, retainedComposer] = frame.props.children;
    const activityChildren = (activityRegion as ReactElement<{ children: ReactElement[] }>).props
      .children;

    expect(activityChildren[1]).toBe(activity);
    expect(retainedComposer).toBe(composer);
    activity.props.onClick({} as MouseEvent<HTMLButtonElement>);
    composer.props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);
    expect(inspectActivity).toHaveBeenCalledOnce();
    expect(sendNormalTaskMessage).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(frame);
    expect(markup).toContain('<section aria-label="Issue activity"');
    expect(markup).toContain('data-automation-issue-activity="">Issue activity</div>');
    expect(markup).toContain('aria-label="Normal task composer"');
    expect(markup).toContain(
      'data-automation-issue-layout="bounded-context-with-retained-composer"',
    );
    expect(frame.props.className).toContain("min-w-0");
    expect(frame.props.className).toContain("overflow-hidden");
  });

  it("retains the same composer when no issue context is selected", () => {
    const composer = <form aria-label="Normal task composer" />;
    const frame = AutomationIssueTaskFrame({
      issueActive: false,
      activity: <div>Task activity</div>,
      composer,
      children: null,
    }) as ReactElement<{ children: ReactElement[] }>;

    expect(frame.props.children[1]).toBe(composer);
    expect(renderToStaticMarkup(frame)).not.toContain('aria-label="Issue activity"');
  });
});
