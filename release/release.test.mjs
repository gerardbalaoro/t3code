import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assemble } from "./assemble.mjs";
import { releaseNotes } from "./version.mjs";

test("release notes preserve Markdown and put upstream last in a fixed order", () => {
  const tag = "v0.1.13-nightly.20261125.5258";
  const first = {
    id: "a",
    summary: "#### Add search\n\n> Search any project.\n\n```sh\ngcode --version\n```",
  };
  const last = { id: "b", summary: "#### Fix a crash\n\n- Recover the last session." };
  const highlights = "- Fix repeated app notes.";
  const notes = releaseNotes([last, first], tag, highlights);
  assert.equal(notes, releaseNotes([first, last], tag, highlights));
  assert.equal(notes, [
    first.summary,
    last.summary,
    `#### Based on T3 Code ${tag}`,
    highlights,
    `[Full T3 Code release notes](https://github.com/pingdotgg/t3code/releases/tag/${tag})\n`,
  ].join("\n\n"));
  assert.match(releaseNotes([], tag, ""), /^#### Based on T3 Code /);
  assert.throws(() => releaseNotes([{ id: "no-title", summary: "Add search" }], tag, ""), /level-four heading/);
});

test("assembly replays each stacked range once and rejects a stale parent", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gcode-source-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin");
  mkdirSync(origin);
  const git = (directory, ...args) => execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git(origin, "init", "-qb", "main");

  function commit(file, text) {
    writeFileSync(join(origin, file), text);
    git(origin, "add", file);
    git(origin, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com",
      "-c", "commit.gpgsign=false", "commit", "-qm", file);
    return git(origin, "rev-parse", "HEAD");
  }
  const base = commit("upstream", "first nightly");
  const tag = "v0.1.0-nightly.20261125.5258";
  const next = commit("upstream", "next nightly");
  git(origin, "tag", tag, next);
  git(origin, "checkout", "-qb", "feature/parent", base);
  const parent = commit("parent", "parent content");
  git(origin, "checkout", "-qb", "feature/child");
  const child = commit("child", "child content");
  const source = {
    upstream: { tag, commit: next },
    patches: [
      { branch: "feature/parent", base, commit: parent },
      { branch: "feature/child", parent: "feature/parent", base: parent, commit: child },
    ],
  };
  function fresh(label, manifest) {
    const candidate = join(root, label);
    mkdirSync(candidate);
    return [candidate, assemble(candidate, manifest, origin, origin)];
  }
  const [candidate, head] = fresh("candidate", source);
  assert.equal(git(candidate, "rev-list", "--count", `${next}..${head}`), "2");
  assert.equal(readFileSync(join(candidate, "child"), "utf8"), "child content");
  assert.equal(fresh("retry", source)[1], head);
  assert.throws(() => fresh("stale", { ...source, patches: [
    source.patches[0],
    { ...source.patches[1], base },
  ] }), /declared parent's pinned commit/);
});
