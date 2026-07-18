export function runGit(rootDir: string, args: ReadonlyArray<string>): string;
export function isPinnedGitSubtreeIdentity(
  rootDir: string,
  revision: string,
  subtreePath: string,
  expectedTree: string,
): boolean;
export function sha256(bytes: Uint8Array): string;
export function readPngDimensions(
  bytes: Buffer,
  context?: string,
): { readonly width: number; readonly height: number };
