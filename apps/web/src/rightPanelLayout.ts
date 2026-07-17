export const NARROW_DESKTOP_MAX_WIDTH_PX = 1024;
export const NARROW_DESKTOP_SHEET_MEDIA_QUERY = `(max-width: ${NARROW_DESKTOP_MAX_WIDTH_PX}px)`;

export function shouldUseNarrowDesktopSheet(viewportWidth: number): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth <= NARROW_DESKTOP_MAX_WIDTH_PX;
}

export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0 wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";
