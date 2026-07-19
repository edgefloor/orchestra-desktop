import type { MouseEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationIssueTaskFrame } from "./AutomationIssueTaskFrame";

describe("AutomationIssueTaskFrame", () => {
  it("composes native Issue activity without presenting the owner composer as Issue input", () => {
    const inspectActivity = vi.fn();
    const activity = (
      <button aria-label="Inspect issue activity" onClick={inspectActivity} type="button">
        Native task event
      </button>
    );
    const frame = AutomationIssueTaskFrame({
      issueActive: true,
      issueActivity: activity,
      activity: <div>Owner task event</div>,
      composer: <form aria-label="Normal task composer" />,
      children: null,
    }) as ReactElement<{ children: ReactElement[]; className: string }>;
    const [activityRegion, ownerComposer] = frame.props.children;
    const activityChildren = (activityRegion as ReactElement<{ children: ReactElement[] }>).props
      .children;

    expect(activityChildren[1]).toBe(activity);
    expect(ownerComposer).toBeNull();
    activity.props.onClick({} as MouseEvent<HTMLButtonElement>);
    expect(inspectActivity).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(frame);
    expect(markup).toContain('<section aria-label="Issue activity"');
    expect(markup).toContain('data-automation-issue-activity="">Issue activity</div>');
    expect(markup).not.toContain('aria-label="Normal task composer"');
    expect(markup).toContain('data-automation-issue-layout="owner-hosted-native-child"');
    expect(frame.props.className).toContain("min-w-0");
    expect(frame.props.className).toContain("overflow-hidden");
  });

  it("retains the same composer when no issue context is selected", () => {
    const composer = <form aria-label="Normal task composer" />;
    const frame = AutomationIssueTaskFrame({
      issueActive: false,
      issueActivity: null,
      activity: <div>Task activity</div>,
      composer,
      children: null,
    }) as ReactElement<{ children: ReactElement[] }>;

    expect(frame.props.children[1]).toBe(composer);
    expect(renderToStaticMarkup(frame)).not.toContain('aria-label="Issue activity"');
  });
});
