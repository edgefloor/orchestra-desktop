import { memo, useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "../ui/dialog";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

interface ExpandedImageDialogProps {
  preview: ExpandedImagePreview;
  onClose: () => void;
}

export const ExpandedImageDialog = memo(function ExpandedImageDialog({
  preview,
  onClose,
}: ExpandedImageDialogProps) {
  const [imageOffset, setImageOffset] = useState(0);
  const index = (preview.index + imageOffset + preview.images.length) % preview.images.length;

  const navigateImage = useCallback((direction: -1 | 1) => {
    setImageOffset((current) => current + direction);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (preview.images.length <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateImage(-1);
        return;
      }
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      navigateImage(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateImage, preview.images.length]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const item = preview.images[index];
  if (!item) return null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogPopup
        showCloseButton={false}
        bottomStickOnMobile={false}
        backdropClassName="cursor-zoom-out bg-black/75 backdrop-blur-none"
        viewportClassName="[-webkit-app-region:no-drag]"
        className="isolate w-fit max-w-[92vw] border-0 bg-transparent shadow-none before:hidden"
      >
        <DialogTitle className="sr-only">Expanded image preview</DialogTitle>
        <DialogDescription className="sr-only">
          {item.name}. Image {index + 1} of {preview.images.length}.
          {preview.images.length > 1 ? " Use the left and right arrow keys to browse images." : ""}
        </DialogDescription>
        {preview.images.length > 1 && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:-left-14"
            aria-label="Previous image"
            onClick={() => navigateImage(-1)}
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
        )}
        <div className="relative max-h-[92vh] max-w-[92vw]">
          <DialogClose
            aria-label="Close image preview"
            className="absolute right-2 top-2 z-10"
            render={<Button type="button" size="icon-xs" variant="ghost" />}
          >
            <XIcon />
          </DialogClose>
          <img
            src={item.src}
            alt={item.name}
            className="max-h-[86vh] max-w-[92vw] select-none rounded-lg border border-border/70 bg-background object-contain shadow-2xl"
            draggable={false}
          />
          <p className="mt-2 max-w-[92vw] truncate text-center text-xs text-white/80">
            {item.name}
            {preview.images.length > 1 ? ` (${index + 1}/${preview.images.length})` : ""}
          </p>
        </div>
        {preview.images.length > 1 && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:-right-14"
            aria-label="Next image"
            onClick={() => navigateImage(1)}
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        )}
      </DialogPopup>
    </Dialog>
  );
});
