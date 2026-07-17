import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildProjectRouteParams, resolveProjectRouteRef } from "./projectRoutes";

describe("project routes", () => {
  it("round-trips retained scoped project identity", () => {
    const ref = {
      environmentId: EnvironmentId.make("desktop-local"),
      projectId: ProjectId.make("orchestra"),
    };

    expect(resolveProjectRouteRef(buildProjectRouteParams(ref))).toEqual(ref);
  });

  it("rejects partial project routes", () => {
    expect(resolveProjectRouteRef({ environmentId: "desktop-local" })).toBeNull();
    expect(resolveProjectRouteRef({ projectId: "orchestra" })).toBeNull();
  });
});
