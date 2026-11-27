import { useGT } from "gt-react";
import type { ReactNode } from "react";

import { PreviewPanelShell } from "../preview/PreviewPanelShell";
import { dispatchPreviewAction } from "../preview/previewActionBus";
import { preventThumbButtonFocus, takeThumbButtonNavigation } from "../preview/thumbButtons";

/**
 * A surface opened as a tab, covering the thread below its tab strip. The thread stays mounted
 * underneath, so its draft, scroll position and running work are there when its tab returns.
 */
export function ThreadSurfaceTabPanel(props: {
  readonly focusKey: string;
  readonly previewActive: boolean;
  readonly children: ReactNode;
}) {
  const gt = useGT();
  return (
    // Below the chat header and the tab strip (h-9), over the thread body and terminal drawer.
    <div
      className="absolute inset-x-0 bottom-0 top-[calc(var(--chat-header-height)+--spacing(9))] z-10 flex min-h-0 min-w-0 flex-col bg-background"
      data-thread-surface-tab-panel
    >
      <PreviewPanelShell
        workspaceArea
        workspaceFocusKey={props.focusKey}
        workspaceLabel={gt("Workspace panel")}
        mode="embedded"
        onMouseDown={preventThumbButtonFocus}
        onMouseUp={(event) =>
          takeThumbButtonNavigation(event, props.previewActive ? dispatchPreviewAction : undefined)
        }
      >
        <div className="flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
          {props.children}
        </div>
      </PreviewPanelShell>
    </div>
  );
}
