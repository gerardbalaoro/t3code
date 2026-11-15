import { msg } from "gt-i18n";
import { type MarkedText, markedTextEnglish } from "../errors/translatable.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import {
  type EnvironmentId,
  ProjectId,
  type ProjectReadFileResult,
  type ScopedProjectRef,
  WS_METHODS,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Atom, AtomRegistry } from "effect/reactivity";

import { type EnvironmentRpcInput, request, requestGuarded } from "../rpc/client.ts";
import type { EnvironmentProject } from "./models.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";
import { createProject, deleteProject, updateProject } from "../operations/commands.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createFileMetadataAtoms } from "./fileMetadata.ts";
import { resolveWorkspaceFilePath } from "@t3tools/shared/path";

export type {
  CreateProjectInput,
  DeleteProjectInput,
  UpdateProjectInput,
} from "../operations/commands.ts";

export type OptimisticProjectFile = {
  readonly data: ProjectReadFileResult;
} & (
  | { readonly saved: false }
  | {
      readonly saved: true;
      /** Only this query's next successful answer can replace the saved contents. */
      readonly confirmingQuery: Atom.Atom<unknown>;
    }
);

export interface OptimisticProjectFileTarget {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

function optimisticProjectFileKey(target: OptimisticProjectFileTarget): string {
  return JSON.stringify([target.environmentId, target.cwd, target.relativePath]);
}

function writtenFilePaths(
  input: { readonly cwd: string; readonly relativePath: string },
  result: { readonly relativePath: string },
) {
  return new Set(
    [result.relativePath, input.relativePath].map((path) =>
      resolveWorkspaceFilePath(path, input.cwd),
    ),
  );
}

export class ScratchProjectNotLoadedError extends Schema.TaggedError<ScratchProjectNotLoadedError>()(
  "ScratchProjectNotLoadedError",
  { projectId: ProjectId },
) {
  override get message(): string {
    return markedTextEnglish(this.i18nMessage);
  }

  get i18nMessage(): MarkedText {
    return [
      msg("The folder for threads without a project has not reached this device yet. Try again."),
    ];
  }
}

export function createProjectEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | SecureRandom.SecureRandom | R, E>,
  options: {
    readonly projectAtom: (ref: ScopedProjectRef) => Atom.Atom<EnvironmentProject | null>;
  },
) {
  const fileMetadata = createFileMetadataAtoms(runtime);
  const projectScheduler = createAtomCommandScheduler();
  const fileScheduler = createAtomCommandScheduler();
  const optimisticFileFamily = Atom.family((key: string) =>
    Atom.make<OptimisticProjectFile | null>(null).pipe(
      Atom.withLabel(`environment-data:projects:optimistic-file:${key}`),
    ),
  );
  const readFileFamily = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:projects:read-file",
    tag: WS_METHODS.projectsReadFile,
    // A file can change outside this client, so reopening it reads it again. The idle TTL only
    // keeps the last contents on screen while that read runs.
    staleTimeMs: 0,
    idleTtlMs: 5 * 60_000,
    onAnswer: (target, _value, registry): Effect.Effect<void> =>
      Effect.sync(() => {
        const atom = optimisticFileFamily(
          optimisticProjectFileKey({ environmentId: target.environmentId, ...target.input }),
        );
        const overlay = registry.get(atom);
        if (overlay?.saved && overlay.confirmingQuery === readFile(target))
          registry.set(atom, null);
      }),
    execute: (input) =>
      fileMetadata.seedAfterRead(request(WS_METHODS.projectsReadFile, input), (result, isCurrent) =>
        result.exists === false
          ? Effect.void
          : fileMetadata.rememberFile(input.cwd, result, isCurrent),
      ),
  });
  const projectConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { projectId: string } }) =>
      JSON.stringify([environmentId, input.projectId]),
  };
  const readTargets = new Map<string, Parameters<typeof readFileFamily>[0]>();
  const readFile = (target: Parameters<typeof readFileFamily>[0]) => {
    readTargets.set(JSON.stringify(target), target);
    if (readTargets.size > 1024) readTargets.delete(readTargets.keys().next().value!);
    return readFileFamily(target);
  };
  const mutationPaths = (
    environmentId: EnvironmentId,
    cwd: string,
    roots: ReadonlyArray<string>,
  ) => {
    const relativePaths = new Set(roots);
    for (const target of readTargets.values()) {
      if (
        target.environmentId === environmentId &&
        target.input.cwd === cwd &&
        roots.some(
          (root) =>
            target.input.relativePath === root || target.input.relativePath.startsWith(`${root}/`),
        )
      )
        relativePaths.add(target.input.relativePath);
    }
    return {
      relativePaths,
      paths: fileMetadata.affectedPaths(
        environmentId,
        [...relativePaths].map((relativePath) => resolveWorkspaceFilePath(relativePath, cwd)),
      ),
    };
  };
  return {
    fileMetadata: fileMetadata.metadata,
    fileMetadataThread: fileMetadata.retainThread,
    invalidateFileMetadata: createEnvironmentCommand(runtime, {
      label: "environment-data:filesystem:invalidate-metadata",
      execute: (input: { paths: ReadonlyArray<string> }, registry, environmentId) =>
        Effect.forEach([...new Set(input.paths)], (path) =>
          fileMetadata
            .invalidate(path)
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => fileMetadata.refreshPath(environmentId, path, registry)),
              ),
            ),
        ),
    }),
    searchEntries: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:search-entries",
      tag: WS_METHODS.projectsSearchEntries,
      staleTimeMs: 15_000,
      execute: (input) =>
        fileMetadata.seedAfterRead(
          request(WS_METHODS.projectsSearchEntries, input),
          (result, isCurrent) => fileMetadata.rememberEntries(input.cwd, result.entries, isCurrent),
        ),
    }),
    listEntries: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:list-entries",
      tag: WS_METHODS.projectsListEntries,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
      execute: (input) =>
        fileMetadata.seedAfterRead(
          request(WS_METHODS.projectsListEntries, input),
          (result, isCurrent) => fileMetadata.rememberEntries(input.cwd, result.entries, isCurrent),
        ),
    }),
    listIgnoredFiles: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:list-ignored-files",
      tag: WS_METHODS.projectsListIgnoredFiles,
      staleTimeMs: 15_000,
    }),
    readFile,
    optimisticFile: (target: OptimisticProjectFileTarget) =>
      optimisticFileFamily(optimisticProjectFileKey(target)),
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:create",
      execute: createProject,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:update",
      execute: updateProject,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:delete",
      execute: deleteProject,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    // Finds or creates the environment's Scratch project and resolves once the
    // project is in the client store, since drafts key off its stored path.
    openScratch: createEnvironmentCommand(runtime, {
      label: "environment-data:projects:open-scratch",
      execute: (
        input: EnvironmentRpcInput<typeof WS_METHODS.projectsEnsureScratch>,
        registry,
        environmentId,
      ) =>
        request(WS_METHODS.projectsEnsureScratch, input).pipe(
          Effect.flatMap(({ projectId }) =>
            AtomRegistry.toStream(registry, options.projectAtom({ environmentId, projectId })).pipe(
              Stream.filter(Predicate.isNotNull),
              Stream.runHead,
              Effect.timeoutOption("10 seconds"),
              Effect.map(Option.flatten),
              Effect.flatMap(
                Option.match({
                  onSome: Effect.succeed,
                  onNone: () => Effect.fail(new ScratchProjectNotLoadedError({ projectId })),
                }),
              ),
            ),
          ),
        ),
      scheduler: projectScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    createNew: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:create-new",
      tag: WS_METHODS.projectsCreateNew,
      scheduler: projectScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    createFromThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:create-from-thread",
      tag: WS_METHODS.projectsCreateFromThread,
      scheduler: projectScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    renameEntry: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:renameEntry",
      tag: WS_METHODS.projectsRenameEntry,
      scheduler: fileScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.cwd]),
      },
      execute: Effect.fn("projects.mutateEntry")(function* (input) {
        const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
        return yield* requestGuarded(WS_METHODS.projectsRenameEntry, input).pipe(
          Effect.tap((result) =>
            Effect.forEach(
              mutationPaths(supervisor.target.environmentId, input.cwd, [
                input.relativePath,
                input.newRelativePath,
                result.relativePath,
              ]).paths,
              fileMetadata.invalidate,
            ),
          ),
        );
      }),
      onSuccess: ({ environmentId, input }, registry, result) =>
        Effect.sync(() => {
          const affected = mutationPaths(environmentId, input.cwd, [
            input.relativePath,
            input.newRelativePath,
            result.relativePath,
          ]);
          for (const path of affected.paths)
            fileMetadata.refreshPath(environmentId, path, registry);
          for (const relativePath of affected.relativePaths)
            for (const allowMissing of [undefined, true])
              registry.refresh(
                readFile({
                  environmentId,
                  input: {
                    cwd: input.cwd,
                    relativePath,
                    ...(allowMissing ? { allowMissing } : {}),
                  },
                }),
              );
        }),
    }),
    deleteEntry: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:deleteEntry",
      tag: WS_METHODS.projectsDeleteEntry,
      scheduler: fileScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.cwd]),
      },
      execute: Effect.fn("projects.mutateEntry")(function* (input) {
        const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
        return yield* requestGuarded(WS_METHODS.projectsDeleteEntry, input).pipe(
          Effect.tap((result) =>
            Effect.forEach(
              mutationPaths(supervisor.target.environmentId, input.cwd, [
                input.relativePath,
                result.relativePath,
              ]).paths,
              fileMetadata.invalidate,
            ),
          ),
        );
      }),
      onSuccess: ({ environmentId, input }, registry, result) =>
        Effect.sync(() => {
          const affected = mutationPaths(environmentId, input.cwd, [
            input.relativePath,
            result.relativePath,
          ]);
          for (const path of affected.paths)
            fileMetadata.refreshPath(environmentId, path, registry);
          for (const relativePath of affected.relativePaths)
            for (const allowMissing of [undefined, true])
              registry.refresh(
                readFile({
                  environmentId,
                  input: {
                    cwd: input.cwd,
                    relativePath,
                    ...(allowMissing ? { allowMissing } : {}),
                  },
                }),
              );
        }),
    }),
    createFile: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:create-file",
      tag: WS_METHODS.projectsCreateFile,
      scheduler: fileScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.cwd, input.relativePath]),
      },
      execute: (input) =>
        requestGuarded(WS_METHODS.projectsCreateFile, input).pipe(
          Effect.tap((result) =>
            Effect.forEach(writtenFilePaths(input, result), fileMetadata.invalidate),
          ),
        ),
      onSuccess: ({ environmentId, input }, registry, result) =>
        Effect.sync(() => {
          for (const path of writtenFilePaths(input, result))
            fileMetadata.refreshPath(environmentId, path, registry);
          for (const relativePath of new Set([input.relativePath, result.relativePath])) {
            for (const allowMissing of [undefined, true]) {
              registry.refresh(
                readFile({
                  environmentId,
                  input: {
                    cwd: input.cwd,
                    relativePath,
                    ...(allowMissing ? { allowMissing } : {}),
                  },
                }),
              );
            }
          }
        }),
    }),
    writeFile: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:write-file",
      tag: WS_METHODS.projectsWriteFile,
      scheduler: fileScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.cwd, input.relativePath]),
      },
      execute: (input) =>
        requestGuarded(WS_METHODS.projectsWriteFile, input).pipe(
          Effect.tap((result) =>
            Effect.forEach(writtenFilePaths(input, result), fileMetadata.invalidate),
          ),
        ),
      onSuccess: ({ environmentId, input }, registry, result) =>
        Effect.sync(() => {
          for (const path of writtenFilePaths(input, result))
            fileMetadata.refreshPath(environmentId, path, registry);
        }),
    }),
  };
}
