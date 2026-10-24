import { spawnSync } from "node:child_process";

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr ?? ""}${result.error ?? ""}`,
    );
  }
  return result.stdout;
}
export function git(cwd, args, options = {}) {
  return run("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args], {
    ...options,
    cwd,
  });
}
export function tryGit(cwd, args, options = {}) {
  try {
    return git(cwd, args, options);
  } catch {
    return undefined;
  }
}
export function remoteSha(cwd, repository, ref) {
  return git(cwd, ["ls-remote", "--refs", repository, ref]).trim().split(/\s+/)[0] || "";
}
export function resolve(cwd, repository, ref) {
  if (
    typeof repository !== "string" ||
    !repository ||
    repository.startsWith("-") ||
    typeof ref !== "string" ||
    !ref ||
    ref.startsWith("-")
  )
    throw new Error("Missing or invalid source repository/ref");
  git(cwd, ["fetch", "--no-tags", "--force", repository, ref]);
  return git(cwd, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]).trim();
}
export const identity = {
  GIT_AUTHOR_NAME: "Gerard patch automation",
  GIT_AUTHOR_EMAIL: "patch@users.noreply.github.com",
  GIT_COMMITTER_NAME: "Gerard patch automation",
  GIT_COMMITTER_EMAIL: "patch@users.noreply.github.com",
};

export function guardedPush(cwd, repository, updates, { token } = {}) {
  const auth = token
    ? ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
    : [];
  git(
    cwd,
    [
      ...auth,
      "push",
      "--atomic",
      ...updates.map(({ ref, expected }) => `--force-with-lease=${ref}:${expected}`),
      repository,
      ...updates.map(({ ref, sha }) => `${sha}:${ref}`),
    ],
    token ? { env: { GH_TOKEN: token, GITHUB_TOKEN: "" } } : {},
  );
}
