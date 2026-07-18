const DEFAULT_AUTOMATION_TEXT_LIMIT_BYTES = 512;

export function boundedAutomationText(
  value: string,
  maxBytes = DEFAULT_AUTOMATION_TEXT_LIMIT_BYTES,
): string {
  const normalized = value.trim();
  if (maxBytes <= 0) return "";

  const encoder = new TextEncoder();
  if (encoder.encode(normalized).byteLength <= maxBytes) return normalized;

  const ellipsis = "…";
  if (encoder.encode(ellipsis).byteLength > maxBytes) return "";

  const characters = Array.from(normalized);
  while (
    characters.length > 0 &&
    encoder.encode(`${characters.join("")}${ellipsis}`).byteLength > maxBytes
  ) {
    characters.pop();
  }
  return `${characters.join("")}${ellipsis}`;
}

export function readableAutomationError(
  cause: unknown,
  maxBytes = DEFAULT_AUTOMATION_TEXT_LIMIT_BYTES,
): string {
  return boundedAutomationText(
    cause instanceof Error ? cause.message : "The Automation request failed.",
    maxBytes,
  );
}
