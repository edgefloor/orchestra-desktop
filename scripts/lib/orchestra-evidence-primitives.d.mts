export function runGit(rootDir: string, args: ReadonlyArray<string>): string;
export function sha256(bytes: Uint8Array): string;
export function readPngDimensions(
  bytes: Buffer,
  context?: string,
): { readonly width: number; readonly height: number };
