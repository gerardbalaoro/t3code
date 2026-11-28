import type { SurfacePlacement } from "../../rightPanelStore";

export type PreviewAction =
  | "toggle-panel"
  | "refresh"
  | "back"
  | "forward"
  | "focus-url"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom"
  | "find";

const EVENT_NAME = "t3code:preview-action";

interface PreviewActionEvent {
  readonly action: PreviewAction;
  readonly origin?: Element;
}

export function dispatchPreviewAction(action: PreviewAction, origin?: Element): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PreviewActionEvent>(EVENT_NAME, {
      detail: origin ? { action, origin } : { action },
    }),
  );
}

export function subscribePreviewAction(
  listener: (action: PreviewAction, origin?: Element) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PreviewActionEvent>).detail;
    if (typeof detail?.action === "string") listener(detail.action, detail.origin);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

const visibleViews = new Map<HTMLElement, (action: PreviewAction) => void>();
let lastInteractedView: HTMLElement | null = null;
let unsubscribeActions: (() => void) | undefined;

const desktopActions = new Map<string, PreviewAction>([
  ["preview.focusUrl", "focus-url"],
  ["preview.zoomIn", "zoom-in"],
  ["preview.zoomOut", "zoom-out"],
  ["preview.resetZoom", "reset-zoom"],
  ["preview.find", "find"],
]);

function findView(target: Element | null): HTMLElement | undefined {
  if (!target) return undefined;
  // The hosted Electron webview lives outside the panel DOM.
  const viewport = target.closest<HTMLElement>("[data-preview-viewport]");
  if (viewport) {
    return [...visibleViews.keys()].find(
      (view) => view.dataset.previewRuntimeTab === viewport.dataset.previewViewport,
    );
  }
  const panel = target.closest("[data-preview-panel-mode]");
  return [...visibleViews.keys()].find(
    (view) => view.contains(target) || target.contains(view) || panel?.contains(view),
  );
}

function activeView(): HTMLElement | undefined {
  const active = document.activeElement;
  const focusedView = findView(active === document.body ? null : active);
  // A floating webview handles its own navigation and must not drive another view.
  if (focusedView || active?.closest("[data-preview-viewport]")) return focusedView;
  return lastInteractedView ?? visibleViews.keys().next().value;
}

export function getPreviewActionPlacement(): SurfacePlacement | undefined {
  const placement = activeView()?.dataset.previewPlacement;
  return placement === "main" || placement === "sidebar" ? placement : undefined;
}

function routeToView(action: PreviewAction, origin?: Element): void {
  if (action === "toggle-panel") return;
  const target = origin ? findView(origin) : activeView();
  if (target) visibleViews.get(target)?.(action);
}

/** View actions have one recipient even when both the main and sidebar browsers are visible. */
export function registerPreviewActionView(
  view: HTMLElement,
  listener: (action: PreviewAction) => void,
): () => void {
  visibleViews.set(view, listener);
  const markInteraction = () => {
    lastInteractedView = view;
  };
  view.addEventListener("focusin", markInteraction);
  view.addEventListener("pointerdown", markInteraction, true);
  if (visibleViews.size === 1) {
    const unsubscribe = subscribePreviewAction(routeToView);
    // A focused Electron page forwards its own shortcuts through the desktop menu channel.
    const unsubscribeMenu = window.desktopBridge?.onMenuAction((action) => {
      const previewAction = desktopActions.get(action);
      if (previewAction) routeToView(previewAction);
    });
    unsubscribeActions = () => {
      unsubscribe();
      unsubscribeMenu?.();
    };
  }
  return () => {
    visibleViews.delete(view);
    if (lastInteractedView === view) lastInteractedView = null;
    view.removeEventListener("focusin", markInteraction);
    view.removeEventListener("pointerdown", markInteraction, true);
    if (visibleViews.size === 0) {
      unsubscribeActions?.();
      unsubscribeActions = undefined;
    }
  };
}
