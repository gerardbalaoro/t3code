import type { ReactNode } from "react";

import { PreviewPanelShell } from "../preview/PreviewPanelShell";
import { dispatchPreviewAction } from "../preview/previewActionBus";
import { preventThumbButtonFocus, takeThumbButtonNavigation } from "../preview/thumbButtons";

/**
 * A surface opened as a tab, covering the thread below its header. The thread stays mounted
 * underneath, so its draft, scroll position and running work are there when its tab returns.
 */
export function ThreadSurfaceTabPanel(props: {
  readonly focusKey: string;
  readonly label: string;
  readonly previewActive: boolean;
  readonly children: ReactNode;
}) {
  return (
    // Below the shared header, over the thread body and terminal drawer.
    <div
      className="absolute inset-x-0 bottom-0 top-(--chat-header-height) z-10 flex min-h-0 min-w-0 flex-col bg-background"
      data-thread-surface-tab-panel
    >
      <PreviewPanelShell
        workspaceArea
        workspaceAreaName="surface-tab"
        workspaceFocusKey={props.focusKey}
        workspaceLabel={props.label}
        mode="embedded"
        onMouseDown={preventThumbButtonFocus}
        onMouseUp={(event) =>
          takeThumbButtonNavigation(
            event,
            props.previewActive
              ? (action) => dispatchPreviewAction(action, event.currentTarget)
              : undefined,
          )
        }
      >
        <div className="flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
          {props.children}
        </div>
      </PreviewPanelShell>
    </div>
  );
}
