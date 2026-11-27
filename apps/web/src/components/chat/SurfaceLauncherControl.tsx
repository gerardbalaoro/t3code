import { Grid2X2PlusIcon } from "lucide-react";
import { useGT } from "gt-react";

import { useBrowserDefaults } from "~/browser/browserDefaults";

import { SurfaceLauncher, type SurfaceLauncherProps } from "../RightPanelTabs";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type SurfaceLauncherActions = Omit<SurfaceLauncherProps, "browserProfiles">;

/** The thread header's "Open a surface" control. Its entries open where the view layout puts them. */
export function SurfaceLauncherControl(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly actions: SurfaceLauncherActions;
}) {
  const gt = useGT();
  const browserProfiles = useBrowserDefaults().profiles;
  const label = gt("Open a surface");
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <Tooltip>
        <TooltipTrigger render={<span className="flex shrink-0" />}>
          <PopoverTrigger
            render={
              <Toggle
                className="shrink-0 [-webkit-app-region:no-drag]"
                pressed={props.open}
                aria-label={label}
                data-right-panel-toggle
                variant="ghost"
                size="sm"
              />
            }
          >
            <Grid2X2PlusIcon className="size-4" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipPopup side="bottom">{label}</TooltipPopup>
      </Tooltip>
      <PopoverPopup align="end" side="bottom" sideOffset={6} padding="compact">
        <SurfaceLauncher
          {...props.actions}
          browserProfiles={browserProfiles}
          variant="popover"
          onDidOpen={() => props.onOpenChange(false)}
        />
      </PopoverPopup>
    </Popover>
  );
}
