import {
  AuthOrchestrationOperateScope,
  AuthPreviewOperateScope,
  AuthTerminalOperateScope,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { getTerminalLabel } from "@t3tools/shared/terminalLabelsCopy";
import { agentControlledBrowserCloseConfirmation } from "../components/ChatView.logic";
import { useClosedViewStore } from "../closedViewStore";
import { closePreviewSession } from "../components/preview/closePreviewSession";
import { useThreadTerminalActions } from "../components/terminal/useThreadTerminalActions";
import { m } from "../i18n/messages";
import { confirmTerminalClose } from "../lib/terminalCloseConfirm";
import { focusPanelTerminalAfterClose } from "../lib/terminalFocus";
import { readLocalApi } from "../localApi";
import { setActivePreviewTab, useThreadPreviewState } from "../previewStateStore";
import {
  surfacePlacementOf,
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
  surfacesInPlacement,
  type SurfacePlacement,
} from "../rightPanelStore";
import { readThreadShell, waitForThreadShellRemoval } from "../state/entities";
import { previewEnvironment } from "../state/preview";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { useStableCallback } from "./useStableCallback";

/**
 * Closing releases preview and terminal sessions, and deletes a side chat that never ran.
 * Agent-driven browsers and terminal tabs require confirmation.
 */
export function useRightPanelSurfaceClose(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly terminalLabelsById: ReadonlyMap<string, string>;
}) {
  const { threadRef, terminalLabelsById } = input;
  const closePreview = useAtomCommand(previewEnvironment.close, "preview close");
  const deleteThread = useAtomCommand(threadEnvironment.delete, "side chat delete");
  const canOperatePreview = useEnvironmentScope(
    threadRef?.environmentId ?? null,
    AuthPreviewOperateScope,
  );
  const previewState = useThreadPreviewState(threadRef);
  const terminalActions = useThreadTerminalActions(threadRef);
  const storeCloseTerminal = useTerminalUiStateStore((state) => state.closeTerminal);

  const releaseSurfaceResources = (
    ref: ScopedThreadRef,
    surface: RightPanelSurface,
    placement: SurfacePlacement,
  ) => {
    // Without preview access, server state remains until an authorized close or restart.
    if (canOperatePreview && surface.kind === "preview" && surface.resourceId) {
      void closePreviewSession({
        closePreview,
        snapshot: previewState.sessions[surface.resourceId] ?? null,
        tabId: surface.resourceId,
        threadRef: ref,
        placement,
      });
    }
    if (
      surface.kind === "terminal" &&
      readEnvironmentScope(ref.environmentId, AuthTerminalOperateScope)
    ) {
      for (const terminalId of surface.terminalIds) {
        storeCloseTerminal(ref, terminalId);
        terminalActions.closeTerminalSession(terminalId, ref);
      }
    }
    if (
      surface.kind === "thread" &&
      // Only a side chat the shell still lists is thrown away with its tab; a subagent belongs to
      // its parent's work, and an unlisted side chat is already deleted.
      readThreadShell(scopeThreadRef(ref.environmentId, surface.threadId))?.lineage.sideChat ===
        true &&
      readEnvironmentScope(ref.environmentId, AuthOrchestrationOperateScope)
    ) {
      const sideChatRef = scopeThreadRef(ref.environmentId, surface.threadId);
      // The server keeps a side chat with a run or message. Reopen cannot tell one it deleted from
      // an idle subagent the shell leaves out, so forget the tab once the server has removed it.
      void deleteThread({
        environmentId: ref.environmentId,
        input: { threadId: surface.threadId, onlyIfUnused: true },
      }).then(async (result) => {
        if (result._tag !== "Success" || !(await waitForThreadShellRemoval(sideChatRef))) return;
        const closedViews = useClosedViewStore.getState();
        for (const entry of closedViews.entries) {
          if (
            entry.kind === "panel-tab" &&
            entry.surface.id === surface.id &&
            scopedThreadKey(entry.threadRef) === scopedThreadKey(ref)
          ) {
            closedViews.remove(entry.id);
          }
        }
      });
    }
  };
  const closeAfterAgentBrowserConfirmation = (
    toClose: readonly RightPanelSurface[],
    closeSurfaces: () => void,
  ) => {
    const message = agentControlledBrowserCloseConfirmation(toClose, previewState.desktopByTabId);
    if (!message) {
      closeSurfaces();
      return;
    }
    const localApi = readLocalApi();
    if (!localApi) return;
    void localApi.dialogs.confirm(message, { variant: "destructive" }).then(
      (confirmed) => {
        if (confirmed) closeSurfaces();
      },
      () => undefined,
    );
  };
  const finishClose = (toClose: readonly RightPanelSurface[]) => {
    if (!threadRef) return;
    const store = useRightPanelStore.getState();
    const before = selectThreadRightPanelState(store.byThreadKey, threadRef);
    const openIds = new Set(before.surfaces.map((surface) => surface.id));
    const closingSurfaces = toClose.filter((surface) => openIds.has(surface.id));
    const firstSurface = closingSurfaces[0];
    if (!firstSurface) return;
    const placement = surfacePlacementOf(before, firstSurface.id);
    const activeId = placement === "main" ? before.mainActiveSurfaceId : before.activeSurfaceId;
    // Close the tabs before releasing sessions, which can prune the tabs during reconciliation.
    store.closeSurfaces(
      threadRef,
      closingSurfaces.map((surface) => surface.id),
    );
    // Close the active tab's session last so reopening restores it first.
    const releaseOrder = closingSurfaces.toSorted(
      (left, right) => Number(left.id === activeId) - Number(right.id === activeId),
    );
    for (const surface of releaseOrder) {
      releaseSurfaceResources(threadRef, surface, surfacePlacementOf(before, surface.id));
    }
    const after = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);
    const nextActiveId = placement === "main" ? after.mainActiveSurfaceId : after.activeSurfaceId;
    const nextActiveSurface = surfacesInPlacement(after, placement).find(
      (surface) => surface.id === nextActiveId,
    );
    if (nextActiveSurface?.kind === "preview" && nextActiveSurface.resourceId) {
      setActivePreviewTab(threadRef, nextActiveSurface.resourceId);
    }
    focusPanelTerminalAfterClose(threadRef, activeId, placement);
  };
  const labelFor = (terminalId: string) =>
    terminalLabelsById.get(terminalId) ?? getTerminalLabel(terminalId, m);
  const closeSurfaces = (toClose: readonly RightPanelSurface[]) => {
    if (!threadRef) return;
    closeAfterAgentBrowserConfirmation(toClose, () => {
      const labels = readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope)
        ? toClose.flatMap((surface) =>
            surface.kind === "terminal" ? surface.terminalIds.map(labelFor) : [],
          )
        : [];
      const [first, ...rest] = labels;
      if (first === undefined) {
        finishClose(toClose);
        return;
      }
      void confirmTerminalClose([first, ...rest]).then((confirmed) => {
        if (confirmed) finishClose(toClose);
      });
    });
  };

  const closeSurface = useStableCallback((surface: RightPanelSurface) => {
    if (!threadRef) return;
    if (surface.kind === "preview") {
      closeSurfaces([surface]);
      return;
    }
    if (
      surface.kind !== "terminal" ||
      !readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope)
    ) {
      finishClose([surface]);
      return;
    }
    const otherLabels = surface.terminalIds
      .filter((terminalId) => terminalId !== surface.activeTerminalId)
      .map(labelFor);
    void confirmTerminalClose([labelFor(surface.activeTerminalId), ...otherLabels]).then(
      (confirmed) => {
        if (confirmed) finishClose([surface]);
      },
    );
  });
  const laneSurfaces = (surface: RightPanelSurface) => {
    const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);
    return surfacesInPlacement(
      panel,
      panel.mainSurfaceIds?.includes(surface.id) ? "main" : "sidebar",
    );
  };
  const closeOtherSurfaces = useStableCallback((surface: RightPanelSurface) =>
    closeSurfaces(laneSurfaces(surface).filter((entry) => entry.id !== surface.id)),
  );
  const closeSurfacesToRight = useStableCallback((surface: RightPanelSurface) => {
    const surfaces = laneSurfaces(surface);
    const surfaceIndex = surfaces.findIndex((entry) => entry.id === surface.id);
    if (surfaceIndex < 0) return;
    closeSurfaces(surfaces.slice(surfaceIndex + 1));
  });
  const closeAllSurfaces = useStableCallback((placement: SurfacePlacement = "sidebar") =>
    closeSurfaces(
      surfacesInPlacement(
        selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
        placement,
      ),
    ),
  );
  const closeSelectedSurfaces = useStableCallback(closeSurfaces);

  return {
    closeSurface,
    closeSelectedSurfaces,
    closeOtherSurfaces,
    closeSurfacesToRight,
    closeAllSurfaces,
  };
}
