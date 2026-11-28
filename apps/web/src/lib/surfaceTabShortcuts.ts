import type { SurfacePlacement, ThreadRightPanelState } from "../rightPanelStore";
import { getTerminalFocusOwner } from "./terminalFocus";

export function focusedSurfacePlacement(target: EventTarget | null): SurfacePlacement | undefined {
  if (!(target instanceof Element)) return undefined;
  if (
    target.closest(
      "[data-thread-surface-tab-panel], [data-right-panel-tabbar]:not([data-thread-tab-titlebar])",
    )
  )
    return "main";
  if (
    target.closest(
      '[data-workspace-area="panel"], [data-right-panel-tabbar][data-thread-tab-titlebar]',
    )
  )
    return "sidebar";
  return undefined;
}

export function surfaceTabShortcutContext(
  target: EventTarget | null,
  panel: ThreadRightPanelState,
) {
  const focused = focusedSurfacePlacement(target);
  const inWorkspace =
    focused !== undefined ||
    (target instanceof Element && target.closest("[data-chat-column]") !== null) ||
    target === document.body;
  const sidebar = focused === "sidebar" || (panel.isOpen && panel.maximized === true);
  const mainCount = panel.mainSurfaceIds?.length ?? 0;
  return {
    surfaceTabNavigation:
      inWorkspace &&
      getTerminalFocusOwner() !== "drawer" &&
      (sidebar ? panel.isOpen && panel.surfaces.length > mainCount : mainCount > 0),
    surfaceTabReturn: inWorkspace && (mainCount > 0 || (sidebar && panel.isOpen)),
  };
}
