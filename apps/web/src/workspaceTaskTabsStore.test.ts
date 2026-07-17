import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useWorkspaceTaskTabsStore } from "./workspaceTaskTabsStore";

beforeEach(() => {
  useWorkspaceTaskTabsStore.setState({ closedTaskKeysByProject: {} });
});

describe("workspace task tabs store", () => {
  it("closes and explicitly reopens presentation tabs without touching tasks", () => {
    const store = useWorkspaceTaskTabsStore.getState();
    store.closeTask("project", "task-a");
    store.closeTask("project", "task-b");
    expect(useWorkspaceTaskTabsStore.getState().closedTaskKeysByProject).toEqual({
      project: ["task-a", "task-b"],
    });

    useWorkspaceTaskTabsStore.getState().reopenTask("project", "task-a");
    expect(useWorkspaceTaskTabsStore.getState().closedTaskKeysByProject).toEqual({
      project: ["task-b"],
    });
  });

  it("reconciles removed native task identities and drops empty project state", () => {
    const store = useWorkspaceTaskTabsStore.getState();
    store.closeTask("project", "removed");
    store.closeTask("project", "retained");
    useWorkspaceTaskTabsStore.getState().reconcileProject("project", ["retained"]);
    expect(useWorkspaceTaskTabsStore.getState().closedTaskKeysByProject).toEqual({
      project: ["retained"],
    });

    useWorkspaceTaskTabsStore.getState().reconcileProject("project", []);
    expect(useWorkspaceTaskTabsStore.getState().closedTaskKeysByProject).toEqual({});
  });
});
