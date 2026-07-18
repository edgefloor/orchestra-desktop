export interface NativeShellScenario {
  readonly scenario: string;
  readonly width: number;
  readonly height: number;
  readonly theme: "dark" | "light";
  readonly drawerOpen: boolean;
}

export interface NativeShellAssertion {
  readonly observed: unknown;
  readonly passed: boolean;
}

export const ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY: string;
export const ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS: ReadonlyArray<string>;
export const ORCHESTRA_NATIVE_SHELL_ASSERTIONS: ReadonlyArray<string>;
export const ORCHESTRA_NATIVE_SHELL_SCREENSHOTS: ReadonlyArray<NativeShellScenario>;

export function buildNativeGuestFixture(origin: string): {
  readonly pages: Readonly<Record<string, string>>;
  readonly digest: string;
};
export function makeNativeShellAssertion(observed: unknown, passed?: boolean): NativeShellAssertion;
export function isExactNativeDogfoodResponseCount(requestCount: number): boolean;
export function isNativeWorkflowLifecycleObservation(observation: unknown): boolean;
export function isNativeEvidenceObservation(observation: unknown): boolean;
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
