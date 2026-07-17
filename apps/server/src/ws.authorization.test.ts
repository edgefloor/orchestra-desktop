import { AuthOrchestrationOperateScope, WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { rpcRequiredScope } from "./ws.ts";

describe("Automation websocket authorization", () => {
  it("requires operate authority for production start and issue steering", () => {
    expect(rpcRequiredScope(WS_METHODS.automationStart)).toBe(AuthOrchestrationOperateScope);
    expect(rpcRequiredScope(WS_METHODS.automationSteerIssue)).toBe(AuthOrchestrationOperateScope);
  });

  it("fails closed when an RPC method has no declared scope", () => {
    expect(() => rpcRequiredScope("automation.unregistered")).toThrow(
      "has no declared authorization scope",
    );
  });
});
