export const RESIZE_SEPARATOR_KEYBOARD_STEP_PX = 16;

export function resolveResizeSeparatorKey(options: {
  key: string;
  value: number;
  min: number;
  max: number;
  increaseKey: string;
  decreaseKey: string;
  step?: number;
}): number | null {
  const { key, value, min, max, increaseKey, decreaseKey } = options;
  const step = options.step ?? RESIZE_SEPARATOR_KEYBOARD_STEP_PX;
  const clamp = (nextValue: number) => Math.min(max, Math.max(min, Math.round(nextValue)));

  if (key === "Home") return min;
  if (key === "End") return max;
  if (key === increaseKey) return clamp(value + step);
  if (key === decreaseKey) return clamp(value - step);
  return null;
}
