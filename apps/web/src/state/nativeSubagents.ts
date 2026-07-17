import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const readNativeSubagent = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "NativeSubagent.read",
  tag: WS_METHODS.nativeSubagentRead,
});
