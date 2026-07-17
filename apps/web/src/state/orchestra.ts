import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const queryOrchestra = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Orchestra.query",
  tag: WS_METHODS.orchestraQuery,
});
