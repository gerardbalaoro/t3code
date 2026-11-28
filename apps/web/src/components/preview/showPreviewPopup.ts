import type { ScopedThreadRef } from "@t3tools/contracts";

import { browserMiniPlayerSource, usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { whenPreviewTabKnown } from "~/previewStateStore";
import { type SurfacePlacement, useRightPanelStore, withSurfacePlacement } from "~/rightPanelStore";

export function showPreviewPopup(
  threadRef: ScopedThreadRef,
  popupTabId: string,
  from: "panel" | "floating",
  placement: SurfacePlacement = "sidebar",
): void {
  whenPreviewTabKnown(threadRef, popupTabId, () => {
    if (from === "floating") {
      usePreviewMiniPlayerStore.getState().open(threadRef, browserMiniPlayerSource(popupTabId));
    } else {
      withSurfacePlacement(placement, () =>
        useRightPanelStore.getState().openBrowser(threadRef, popupTabId),
      );
    }
  });
}
