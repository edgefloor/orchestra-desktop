// @effect-diagnostics nodeBuiltinImport:off - Thin adapter around the pinned native Product authority.
// @effect-diagnostics globalDate:off - Native command timestamps are ISO wall-clock audit labels.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type * as DesktopEnvironment from "../app/DesktopEnvironment.ts";

export const OrchestraUpdateRelease = Schema.Struct({
  version: Schema.String,
  orchestraManifestSha256: Schema.String,
  orchestraSnapshotSchema: Schema.String,
  orchestraProjectionSchema: Schema.String,
});
export type OrchestraUpdateRelease = typeof OrchestraUpdateRelease.Type;

export type OrchestraStartupPhase =
  | "unsupported"
  | "initialized"
  | "steady"
  | "staged"
  | "first-launch-pending";

export class OrchestraProductLifecycleError extends Schema.TaggedErrorClass<OrchestraProductLifecycleError>()(
  "OrchestraProductLifecycleError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Orchestra Product lifecycle operation ${this.operation} failed.`;
  }
}

type Environment = DesktopEnvironment.DesktopEnvironment["Service"];

const supported = (environment: Environment): boolean =>
  environment.isPackaged && environment.platform === "darwin";

const paths = (environment: Environment) => ({
  executable: NodePath.join(environment.resourcesPath, "orchestra", "orchestra-product"),
  manifest: NodePath.join(environment.resourcesPath, "orchestra", "release-manifest.json"),
  policyRoot: NodePath.join(environment.resourcesPath, "orchestra"),
  state: NodePath.join(environment.stateDir, "orchestra-product-install-state.json"),
  codexHome: process.env.CODEX_HOME?.trim() || NodePath.join(environment.homeDirectory, ".codex"),
  appBundle: NodePath.resolve(environment.resourcesPath, "..", ".."),
});

const run = (environment: Environment, operation: string, args: ReadonlyArray<string>) =>
  Effect.try({
    try: () => {
      const result = NodeChildProcess.spawnSync(paths(environment).executable, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1024 * 1024,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `orchestra-product exited ${result.status}`);
      }
      return result.stdout.trim();
    },
    catch: (cause) => new OrchestraProductLifecycleError({ operation, cause }),
  });

const commonArgs = (environment: Environment) => {
  const resolved = paths(environment);
  return [
    "--codex-home",
    resolved.codexHome,
    "--state",
    resolved.state,
    "--recorded-at",
    new Date().toISOString(),
  ];
};

export const decodeUpdateRelease = Schema.decodeUnknownEffect(OrchestraUpdateRelease);

export const beginStartup = (
  environment: Environment,
): Effect.Effect<OrchestraStartupPhase, OrchestraProductLifecycleError> => {
  if (!supported(environment)) return Effect.succeed("unsupported");
  const resolved = paths(environment);
  return run(environment, "startup-begin", [
    "desktop-startup-begin",
    ...commonArgs(environment),
    "--manifest",
    resolved.manifest,
    "--policy-root",
    resolved.policyRoot,
  ]).pipe(Effect.map((phase) => phase as OrchestraStartupPhase));
};

export const commitStartup = (
  environment: Environment,
): Effect.Effect<void, OrchestraProductLifecycleError> =>
  supported(environment)
    ? run(environment, "startup-commit", [
        "desktop-startup-commit",
        ...commonArgs(environment),
      ]).pipe(Effect.asVoid)
    : Effect.void;

export const rollbackStartup = (
  environment: Environment,
): Effect.Effect<void, OrchestraProductLifecycleError> => {
  if (!supported(environment)) return Effect.void;
  const resolved = paths(environment);
  return run(environment, "startup-rollback", [
    "desktop-startup-rollback",
    ...commonArgs(environment),
    "--app-bundle",
    resolved.appBundle,
    "--policy-root",
    resolved.policyRoot,
  ]).pipe(Effect.asVoid);
};

export const stageUpdate = (
  environment: Environment,
  release: OrchestraUpdateRelease,
): Effect.Effect<void, OrchestraProductLifecycleError> => {
  if (!supported(environment)) return Effect.void;
  const resolved = paths(environment);
  return run(environment, "update-stage", [
    "desktop-update-stage",
    ...commonArgs(environment),
    "--manifest",
    resolved.manifest,
    "--app-bundle",
    resolved.appBundle,
    "--next-version",
    release.version,
    "--next-manifest-sha",
    release.orchestraManifestSha256,
    "--next-snapshot-schema",
    release.orchestraSnapshotSchema,
    "--next-projection-schema",
    release.orchestraProjectionSchema,
  ]).pipe(Effect.asVoid);
};

export const abortUpdate = (
  environment: Environment,
): Effect.Effect<void, OrchestraProductLifecycleError> =>
  supported(environment)
    ? run(environment, "update-abort", ["desktop-update-abort", ...commonArgs(environment)]).pipe(
        Effect.asVoid,
      )
    : Effect.void;
