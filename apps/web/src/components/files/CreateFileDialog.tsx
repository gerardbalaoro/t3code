import type { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { useEffect, useId, useRef, useState } from "react";

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

export function CreateFileDialog({
  environmentId,
  cwd,
  directory,
  canCreate,
  onClose,
  onCreated,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  directory: string;
  canCreate: boolean;
  onClose: () => void;
  onCreated: (relativePath: string) => void;
}) {
  const [filePath, setFilePath] = useState(directory ? `${directory}/` : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const createFile = useAtomCommand(projectEnvironment.createFile, { reportFailure: false });
  const submit = async () => {
    if (pending || !canCreate || !filePath.trim()) return;
    setPending(true);
    setError(null);
    const result = await createFile({
      environmentId,
      input: { cwd, relativePath: filePath.trim() },
    });
    if (!active.current) return;
    setPending(false);
    if (result._tag === "Success") {
      onCreated(result.value.relativePath);
      onClose();
    } else if (result._tag === "Failure") {
      const cause = Cause.squash(result.cause);
      setError(cause instanceof Error ? cause.message : "Could not create file. Try again.");
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
            <DialogTitle>New file</DialogTitle>
            <DialogDescription>
              Enter a path relative to {cwd}. Missing folders will be created.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <label htmlFor={inputId} className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">File path</span>
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
            {error ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            {!canCreate ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                File creation is unavailable on this connection.
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !canCreate || !filePath.trim()}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
