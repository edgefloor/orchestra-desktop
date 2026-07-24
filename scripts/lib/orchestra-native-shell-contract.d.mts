export interface NativeShellScenario {
  readonly scenario: string;
  readonly width: number;
  readonly height: number;
  readonly theme: "dark" | "light";
  readonly drawerOpen: boolean;
  readonly selectedIssue?: boolean;
}

export interface NativeShellAssertion {
  readonly observed: unknown;
  readonly passed: boolean;
}

export interface NativeShellGitFixtureIdentity {
  readonly name: "origin";
  readonly transport: "local-bare";
  readonly externalMutation: false;
}

export const ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY: string;
export const ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS: ReadonlyArray<string>;
export const ORCHESTRA_NATIVE_SHELL_GIT_FIXTURE_IDENTITY: NativeShellGitFixtureIdentity;
export const ORCHESTRA_NATIVE_SHELL_GIT_MUTATION_PATH: string;
export const ORCHESTRA_NATIVE_SHELL_GIT_MUTATION_SUBJECT: string;
export const ORCHESTRA_NATIVE_SHELL_TERMINAL_TITLE_PATTERN: string;
export const ORCHESTRA_NATIVE_SHELL_ASSERTIONS: ReadonlyArray<string>;
export const ORCHESTRA_NATIVE_SHELL_SCREENSHOTS: ReadonlyArray<NativeShellScenario>;

export function buildNativeGuestFixture(origin: string): {
  readonly pages: Readonly<Record<string, string>>;
  readonly digest: string;
};
export function makeNativeShellAssertion(observed: unknown, passed?: boolean): NativeShellAssertion;
export function isExactNativeDogfoodResponseCount(requestCount: number): boolean;
export function isNativeShellGitFixtureIdentity(
  value: unknown,
): value is NativeShellGitFixtureIdentity;
export function isNativeShellGitMutationObservation(value: unknown): boolean;
export function isNativeShellTerminalSurfaceTitle(value: unknown): value is string;
export function createNativeShellRequestCountWaiter(): {
  readonly count: number;
  readonly increment: () => number;
  readonly fail: (error: unknown) => void;
  readonly waitFor: (target: number, context: string, timeoutMs?: number) => Promise<number>;
};
export function isNativeWorkflowLifecycleObservation(observation: unknown): boolean;
export function isNativeEvidenceObservation(observation: unknown): boolean;
export function isNativeGitCheckEvidenceReferenceObservation(observation: unknown): boolean;
export function isNativeGitCheckEvidenceObservation(observation: unknown): boolean;
export function isUniqueNativeSymphonyInspection(started: unknown, inspected: unknown): boolean;
export function isNarrowDrawerOpenedObservation(observations: unknown): boolean;
export function assertNativeShellAssertions(
  assertions: Readonly<Record<string, NativeShellAssertion>>,
): void;
export function shouldRunNativeShellElectronChild(
  environment: Readonly<Record<string, string | undefined>>,
): boolean;
export function isNativeShellProcessGroupEmpty(
  pid: number,
  platform: NodeJS.Platform,
): boolean | null;
export function isNativeShellResourceCleanupComplete(observation: unknown): boolean;
export function reserveNativeShellPort(): Promise<number>;
export function canConnectToNativeShellPort(port: number): Promise<boolean>;
export function terminateAndVerifyNativeShellResources(input: {
  readonly pid?: number;
  readonly ports: ReadonlyArray<number>;
  readonly platform: NodeJS.Platform;
  readonly timeoutMs?: number;
}): Promise<{
  readonly terminationAttempted: boolean;
  readonly portsClosed: boolean;
  readonly processGroupEmpty: boolean | null;
}>;
export function cleanupFailedNativeShellCapture(input: {
  readonly runtimeDirectory: string;
  readonly evidenceDirectory: string;
  readonly removeRuntime?: boolean;
}): Promise<void>;
