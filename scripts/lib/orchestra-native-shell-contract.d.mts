export interface NativeShellScenario {
  readonly scenario: string;
  readonly width: number;
  readonly height: number;
}

export interface NativeShellAssertion {
  readonly observed: unknown;
  readonly passed: boolean;
}

export const ORCHESTRA_NATIVE_SHELL_ACCEPTANCE_DIRECTORY: string;
export const ORCHESTRA_NATIVE_SHELL_BUILD_ARTIFACTS: ReadonlyArray<string>;
export const ORCHESTRA_NATIVE_SHELL_ASSERTIONS: ReadonlyArray<string>;
export const ORCHESTRA_NATIVE_SHELL_SCREENSHOTS: ReadonlyArray<NativeShellScenario>;

export function sha256(bytes: Uint8Array): string;
export function buildNativeGuestFixture(origin: string): {
  readonly pages: Readonly<Record<string, string>>;
  readonly digest: string;
};
export function makeNativeShellAssertion(observed: unknown, passed?: boolean): NativeShellAssertion;
export function assertNativeShellAssertions(
  assertions: Readonly<Record<string, NativeShellAssertion>>,
): void;
export function readNativeShellPngDimensions(
  bytes: Buffer,
  context?: string,
): { readonly width: number; readonly height: number };
export function shouldRunNativeShellElectronChild(
  environment: Readonly<Record<string, string | undefined>>,
): boolean;
export function isNativeShellProcessGroupEmpty(
  pid: number,
  platform: NodeJS.Platform,
): boolean | null;
export function cleanupFailedNativeShellCapture(input: {
  readonly runtimeDirectory: string;
  readonly evidenceDirectory: string;
  readonly removeRuntime?: boolean;
}): Promise<void>;
