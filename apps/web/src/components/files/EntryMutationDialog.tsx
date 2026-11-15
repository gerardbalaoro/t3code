import type { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { T, useGT } from "gt-react";
import { useId, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

export function EntryMutationDialog({
  environmentId,
  cwd,
  relativePath,
  operation,
  folder,
  canMutate,
  hasPendingEdits,
  onClose,
  onCompleted,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  relativePath: string;
  operation: "rename" | "delete";
  folder: boolean;
  canMutate: boolean;
  hasPendingEdits: boolean;
  onClose: () => void;
  onCompleted: (relativePath: string) => void;
}) {
  const [filePath, setFilePath] = useState(relativePath);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gt = useGT();
  const inputId = useId();
  const renameEntry = useAtomCommand(projectEnvironment.renameEntry, { reportFailure: false });
  const deleteEntry = useAtomCommand(projectEnvironment.deleteEntry, { reportFailure: false });
  const submit = async () => {
    if (pending || !canMutate || hasPendingEdits || !filePath.trim()) return;
    setPending(true);
    setError(null);
    const result =
      operation === "rename"
        ? await renameEntry({
            environmentId,
            input: { cwd, relativePath, newRelativePath: filePath.trim() },
          })
        : await deleteEntry({ environmentId, input: { cwd, relativePath } });
    setPending(false);
    if (result._tag === "Success") {
      onCompleted(result.value.relativePath);
      onClose();
    } else if (result._tag === "Failure") {
      const cause = Cause.squash(result.cause);
      setError(cause instanceof Error ? cause.message : gt("Could not change entry. Try again."));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>
                {operation === "rename" ? "Rename" : "Delete"} {folder ? "folder" : "file"}
              </T>
            </DialogTitle>
            <DialogDescription>
              {operation === "rename" ? (
                <T>Enter a path relative to {cwd}. Missing folders will be created.</T>
              ) : (
                <T>
                  Permanently delete “{relativePath}”{folder ? " and all its contents" : ""}? This
                  cannot be undone.
                </T>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {operation === "rename" ? (
              <label htmlFor={inputId} className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  <T>Path</T>
                </span>
                <Input
                  id={inputId}
                  autoFocus
                  value={filePath}
                  spellCheck={false}
                  placeholder="src/example.ts"
                  disabled={pending}
                  onChange={(event) => {
                    setFilePath(event.target.value);
                    setError(null);
                  }}
                />
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            {hasPendingEdits ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                <T>Save or discard the open file’s edits before changing it or its folder.</T>
              </p>
            ) : null}
            {!canMutate ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                <T>This operation is unavailable on this connection.</T>
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !canMutate || hasPendingEdits || !filePath.trim()}
            >
              {pending ? <T>Working…</T> : operation === "rename" ? <T>Rename</T> : <T>Delete</T>}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
