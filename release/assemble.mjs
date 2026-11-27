import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const upstreamUrl = "https://github.com/pingdotgg/t3code.git";
export const nightlyPattern = /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;
export const shaPattern = /^[0-9a-f]{40}$/;

export function readSource() {
  const source = JSON.parse(readFileSync(new URL("source.json", import.meta.url), "utf8"));
  if (!nightlyPattern.test(source.upstream?.tag) || !shaPattern.test(source.upstream?.commit) || !Array.isArray(source.patches)) {
    throw new Error("Pin the upstream nightly tag, its full commit SHA, and the patches array.");
  }
  return source;
}

export function assemble(directory, source, origin, upstream = upstreamUrl) {
  function git(...args) {
    return execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, GIT_EDITOR: "true", GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  }

  git("init", "-q");
  git("config", "user.name", "G Code Release");
  git("config", "user.email", "release@gcode.codes");
  git("config", "commit.gpgsign", "false");
  git("config", "rerere.enabled", "false");
  git("config", "rebase.updateRefs", "false");
  git("config", "core.hooksPath", "/dev/null");
  git("remote", "add", "origin", origin);
  git("remote", "add", "upstream", upstream);
  for (const remote of ["origin", "upstream"]) {
    git("config", `remote.${remote}.promisor`, "true");
    git("config", `remote.${remote}.partialclonefilter`, "blob:none");
  }
  git("sparse-checkout", "set", "--no-cone", "/*", "!/.repos/");
  git("fetch", "--quiet", "--no-tags", "--filter=blob:none", "upstream", `refs/tags/${source.upstream.tag}`);
  if (git("rev-parse", "FETCH_HEAD^{commit}") !== source.upstream.commit) {
    throw new Error(`Upstream tag ${source.upstream.tag} disagrees with its pinned commit.`);
  }
  git("checkout", "--quiet", "--detach", source.upstream.commit);

  const applied = new Map();
  for (const patch of source.patches) {
    const { branch, base, commit, parent, repository } = patch;
    if (!/^(?:(?:feature|feat)\/[\w./-]+|dev\/patch)$/.test(branch) ||
        !shaPattern.test(base) || !shaPattern.test(commit) || applied.has(branch)) {
      throw new Error(`Invalid or duplicate patch range for ${branch}.`);
    }
    if (repository !== undefined && !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/.test(repository)) {
      throw new Error(`Use a GitHub HTTPS repository URL for ${branch}.`);
    }
    if (parent ? applied.get(parent) !== base : !isAncestor(base, source.upstream.commit)) {
      throw new Error(`Patch ${branch} must start on upstream or at its declared parent's pinned commit.`);
    }

    git("fetch", "--quiet", "--no-tags", "--filter=blob:none", repository ?? "origin", commit);
    if (!isAncestor(base, commit) || git("rev-list", "--merges", `${base}..${commit}`)) {
      throw new Error(`Patch ${branch} needs a linear range from ${base} to ${commit}.`);
    }
    if (branch === "dev/patch") {
      const check = fileURLToPath(new URL("../check-upstream-icons.sh", import.meta.url));
      execFileSync(check, [base, source.upstream.commit], { cwd: directory, stdio: "inherit" });
    }

    const onto = git("rev-parse", "HEAD");
    git("checkout", "--quiet", "--detach", commit);
    try {
      git("rebase", "--quiet", "--committer-date-is-author-date", "--onto", onto, base);
    } catch {
      const conflicts = git("diff", "--name-only", "--diff-filter=U");
      git("rebase", "--abort");
      throw new Error(`Could not replay ${branch} on ${source.upstream.tag}.\n${conflicts}`);
    }
    applied.set(branch, commit);
    console.error(`Applied ${branch}.`);
  }
  return git("rev-parse", "HEAD");

  function isAncestor(base, head) {
    try {
      git("merge-base", "--is-ancestor", base, head);
      return true;
    } catch (error) {
      if (error.status === 1) return false;
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [directory, origin, upstream, releaseRecord] = process.argv.slice(2);
  if (!directory || !origin) throw new Error("Usage: node release/assemble.mjs <empty-directory> <fork-url>");
  const source = releaseRecord ? JSON.parse(readFileSync(releaseRecord, "utf8")).source : readSource();
  console.log(assemble(directory, source, origin, upstream || undefined));
}
