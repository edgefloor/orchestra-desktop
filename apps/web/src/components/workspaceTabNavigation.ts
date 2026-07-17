export function resolveWorkspaceTabNavigation(input: {
  readonly currentIndex: number;
  readonly key: string;
  readonly tabCount: number;
}): number | null {
  if (input.tabCount <= 0) return null;
  switch (input.key) {
    case "ArrowLeft":
      return (input.currentIndex - 1 + input.tabCount) % input.tabCount;
    case "ArrowRight":
      return (input.currentIndex + 1) % input.tabCount;
    case "Home":
      return 0;
    case "End":
      return input.tabCount - 1;
    default:
      return null;
  }
}
