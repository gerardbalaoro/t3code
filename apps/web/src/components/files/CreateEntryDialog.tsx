import type { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { T, Var, useGT } from "gt-react";
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

export function CreateEntryDialog({
  environmentId,
  cwd,
  directory,
  kind,
  canCreate,
  onClose,
  onCreated,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  directory: string;
  kind: "file" | "directory";
  canCreate: boolean;
  onClose: () => void;
  onCreated: (relativePath: string) => void;
}) {
  const [entryPath, setEntryPath] = useState(directory ? `${directory}/` : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gt = useGT();
  const inputId = useId();
  const isFolder = kind === "directory";
  const createEntry = useAtomCommand(
    isFolder ? projectEnvironment.createDirectory : projectEnvironment.createFile,
    { reportFailure: false },
  );
  const relativePath = entryPath.trim();
  const canSubmit =
    canCreate && relativePath !== "" && (!directory || relativePath !== `${directory}/`);
  const submit = async () => {
    if (pending || !canSubmit) return;
    setPending(true);
    setError(null);
    const result = await createEntry({
      environmentId,
      input: { cwd, relativePath },
    });
    setPending(false);
    if (result._tag === "Success") {
      onCreated(result.value.relativePath);
      onClose();
    } else if (result._tag === "Failure") {
      const cause = Cause.squash(result.cause);
      setError(
        cause instanceof Error
          ? cause.message
          : isFolder
            ? gt("Could not create folder. Try again.")
            : gt("Could not create file. Try again."),
      );
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
            <DialogTitle>{isFolder ? <T>New folder</T> : <T>New file</T>}</DialogTitle>
            <DialogDescription>
              <T>
                Enter a path relative to <Var>{cwd}</Var>. Missing folders will be created.
              </T>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <label htmlFor={inputId} className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">
                {isFolder ? <T>Folder path</T> : <T>File path</T>}
              </span>
              <Input
                id={inputId}
                autoFocus
                value={entryPath}
                spellCheck={false}
                placeholder={isFolder ? "src/example" : "src/example.ts"}
                disabled={pending}
                onChange={(event) => {
                  setEntryPath(event.target.value);
                  setError(null);
                }}
              />
            </label>
            {error ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            {!canCreate ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {isFolder ? (
                  <T>Folder creation is unavailable on this connection.</T>
                ) : (
                  <T>File creation is unavailable on this connection.</T>
                )}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" size="sm" disabled={pending || !canSubmit}>
              {pending ? <T>Creating…</T> : <T>Create</T>}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
