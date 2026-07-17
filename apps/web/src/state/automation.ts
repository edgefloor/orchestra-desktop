import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const validateAutomationProfile = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.validateProfile",
  tag: WS_METHODS.automationValidate,
});

export const startAutomation = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.start",
  tag: WS_METHODS.automationStart,
});

export const readLinearAutomation = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.readLinear",
  tag: WS_METHODS.automationLinearRead,
});

export const readAutomationQueue = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.readQueue",
  tag: WS_METHODS.automationQueueRead,
});

export const readAutomationStatus = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.status",
  tag: WS_METHODS.automationStatus,
});

export const pauseAutomation = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.pause",
  tag: WS_METHODS.automationPause,
});

export const refreshAutomation = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.refresh",
  tag: WS_METHODS.automationRefresh,
});

export const resumeAutomation = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.resume",
  tag: WS_METHODS.automationResume,
});

export const cancelAutomation = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.cancel",
  tag: WS_METHODS.automationCancel,
});

export const cancelAutomationIssue = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.cancelIssue",
  tag: WS_METHODS.automationCancelIssue,
});

export const steerAutomationIssue = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "Automation.steerIssue",
  tag: WS_METHODS.automationSteerIssue,
});
