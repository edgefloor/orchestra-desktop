import { DEFAULT_THREAD_TERMINAL_HEIGHT } from "./types";

export const MIN_TERMINAL_DRAWER_HEIGHT_PX = 180;
export const TERMINAL_DRAWER_MAX_HEIGHT_RATIO = 0.75;
export const TERMINAL_DRAWER_PRIMARY_CONTENT_RESERVE_PX = 360;

export function resolveMaxTerminalDrawerHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_THREAD_TERMINAL_HEIGHT;
  }

  const ratioLimit = Math.floor(viewportHeight * TERMINAL_DRAWER_MAX_HEIGHT_RATIO);
  const primaryContentLimit = Math.floor(
    viewportHeight - TERMINAL_DRAWER_PRIMARY_CONTENT_RESERVE_PX,
  );
  return Math.max(MIN_TERMINAL_DRAWER_HEIGHT_PX, Math.min(ratioLimit, primaryContentLimit));
}

export function clampTerminalDrawerHeight(height: number, viewportHeight: number): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  const maxHeight = resolveMaxTerminalDrawerHeight(viewportHeight);
  return Math.min(Math.max(Math.round(safeHeight), MIN_TERMINAL_DRAWER_HEIGHT_PX), maxHeight);
}
