/**
 * Bound diagnostic text without leaving a dangling UTF-16 high surrogate.
 */
export function truncateDiagnosticText(value: string, maxCodeUnits: number): string {
  if (value.length <= maxCodeUnits) return value;
  if (maxCodeUnits <= 0) return "";

  const sliced = value.slice(0, maxCodeUnits - 1);
  const lastCodeUnit = sliced.charCodeAt(sliced.length - 1);
  const completePrefix =
    lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? sliced.slice(0, -1) : sliced;
  return `${completePrefix}…`;
}
