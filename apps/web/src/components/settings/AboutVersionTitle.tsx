import { T3_CODE_REPOSITORY, T3_CODE_UPSTREAM_TAG } from "@t3tools/shared/buildProvenance";
import { msg, T, useGT } from "gt-react";

import { APP_VERSION } from "../../branding";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function AboutVersionTitle() {
  const gt = useGT();
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: {
      target: "version",
      unavailableMessage: msg("Clipboard API is unavailable while copying version."),
      failureMessage: msg("Failed to copy version to the clipboard."),
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: gt("Could not copy version"),
          description: error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span>
        <T>Version</T>
      </span>
      <code className="text-2xs font-medium">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                tone="muted"
                aria-label={gt("Copy version {version}", { version: APP_VERSION })}
                onClick={() => copyToClipboard(APP_VERSION, undefined)}
              >
                {APP_VERSION}
              </InlineButton>
            }
          />
          <TooltipPopup>
            <T>Copy version</T>
          </TooltipPopup>
        </Tooltip>
      </code>
      {T3_CODE_UPSTREAM_TAG ? (
        <a
          className="text-xs font-normal text-muted-foreground underline underline-offset-2"
          href={`${T3_CODE_REPOSITORY}/releases/tag/${encodeURIComponent(T3_CODE_UPSTREAM_TAG)}`}
          target="_blank"
          rel="noreferrer"
        >
          {gt("Based on T3 Code {version}", { version: T3_CODE_UPSTREAM_TAG })}
        </a>
      ) : null}
    </span>
  );
}
