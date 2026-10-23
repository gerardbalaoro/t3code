import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble } from "../scripts/assemble.mjs";
import { git, identity, remoteSha } from "../scripts/git.mjs";
import {
  assertFresh,
  assertFastForward,
  guardedPush,
  selectRelease,
} from "../scripts/pipeline.mjs";

const automationSha = "a".repeat(40);
const stamp = {
  ...identity,
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "patch-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "upstream");
  mkdirSync(source);
  git(source, ["init", "-q", "-b", "main"]);
  const commit = (name, content, message = name) => {
    writeFileSync(join(source, name), content);
    git(source, ["add", name]);
    git(source, ["commit", "-qm", message], { env: stamp });
    return git(source, ["rev-parse", "HEAD"]).trim();
  };
  const base = commit("value.txt", "base\n");
  const manifestPath = join(root, "manifest.json");
  const manifest = (features = [], ref = base) =>
    writeFileSync(
      manifestPath,
      JSON.stringify({ schema: 1, upstream: { repository: source, ref }, features }),
    );
  const build = (name = "result", extra = {}) =>
    assemble({ manifestPath, output: join(root, name), automationSha, ...extra });
  return { root, source, base, commit, manifest, build };
}

test("empty manifest produces deterministic source records and commits", (t) => {
  const f = fixture(t);
  f.manifest();
  const a = f.build("one"),
    b = f.build("two");
  assert.deepEqual(a, b);
  assert.equal(a.upstream.sha, f.base);
  assert.deepEqual(a.features, []);
  assert.equal(git(join(f.root, "one"), ["rev-parse", "HEAD^"]).trim(), f.base);
  assert.equal(readFileSync(join(f.root, "one/value.txt"), "utf8"), "base\n");
  assert.notEqual(
    f.build("different", { automationSha: "b".repeat(40) }).assembledSha,
    a.assembledSha,
  );
});

test("ordered external deltas omit unrelated branch history", (t) => {
  const f = fixture(t);
  // External branch includes a separate upstream commit before the feature base.
  const external = join(f.root, "external");
  git(f.root, ["clone", "-q", f.source, external]);
  writeFileSync(join(external, "unrelated.txt"), "Do not import this history\n");
  git(external, ["add", "."]);
  git(external, ["commit", "-qm", "unrelated"], { env: stamp });
  const base = git(external, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(external, "value.txt"), "first\n");
  git(external, ["commit", "-qam", "feature one"], { env: stamp });
  const first = git(external, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(external, "value.txt"), "second\n");
  git(external, ["commit", "-qam", "feature two"], { env: stamp });
  const second = git(external, ["rev-parse", "HEAD"]).trim();
  f.manifest([
    { id: "one", repository: external, base, head: first },
    { id: "two", repository: external, base: first, head: second },
  ]);
  const result = f.build();
  assert.equal(readFileSync(join(f.root, "result/value.txt"), "utf8"), "second\n");
  assert.equal(existsSync(join(f.root, "result/unrelated.txt")), false);
  assert.deepEqual(
    result.features.map((record) => record.status),
    ["applied", "applied"],
  );
  assert.equal(git(join(f.root, "result"), ["rev-parse", "HEAD^"]).trim(), f.base);
  assert.equal(remoteSha(f.root, external, "refs/heads/main"), second);
});

test("conflicts identify the feature and path, remove output, and leave remote dev intact", (t) => {
  const f = fixture(t);
  const feature = f.commit("value.txt", "feature\n");
  git(f.source, ["checkout", "-q", "--detach", f.base]);
  const upstream = f.commit("value.txt", "upstream\n");
  git(f.source, ["branch", "dev", upstream]);
  f.manifest([{ id: "conflicting", repository: f.source, base: f.base, head: feature }], upstream);
  assert.throws(() => f.build(), /conflicting.*Conflicts: value.txt/s);
  assert.equal(existsSync(join(f.root, "result")), false);
  assert.equal(remoteSha(f.root, f.source, "refs/heads/dev"), upstream);
});

test("patch already in upstream is recorded without duplicating its change", (t) => {
  const f = fixture(t);
  const feature = f.commit("value.txt", "feature\n");
  const upstream = f.commit("another.txt", "later\n");
  f.manifest([{ id: "included", repository: f.source, base: f.base, head: feature }], upstream);
  const result = f.build();
  assert.equal(result.features[0].status, "already-present");
  assert.equal(readFileSync(join(f.root, "result/value.txt"), "utf8"), "feature\n");
});

test("missing source refs, invalid repositories, duplicate IDs, and reversed ranges fail closed", (t) => {
  const f = fixture(t);
  const head = f.commit("value.txt", "next\n");
  const good = { id: "one", repository: f.source, base: f.base, head };
  for (const [name, features] of [
    ["missing", [{ ...good, head: "refs/heads/missing" }]],
    ["bad-repo", [{ ...good, repository: join(f.root, "missing") }]],
    ["duplicate", [good, good]],
    ["reversed", [{ ...good, base: head, head: f.base }]],
  ]) {
    f.manifest(features);
    assert.throws(() => f.build(name));
    assert.equal(existsSync(join(f.root, name)), false);
  }
  f.manifest([], "refs/heads/missing");
  assert.throws(() => f.build());
});

test("binary changes are applied; moving source refs resolve to exact SHAs", (t) => {
  const f = fixture(t);
  const head = f.commit("binary.bin", Buffer.from([0, 1, 2, 255]));
  f.manifest([{ id: "binary", repository: f.source, base: f.base, head: "refs/heads/main" }]);
  const result = f.build();
  assert.equal(result.features[0].headSha, head);
  assert.deepEqual(readFileSync(join(f.root, "result/binary.bin")), Buffer.from([0, 1, 2, 255]));
});

test("stale automation, divergent mirrors, and stale dev leases reject without partial pushes", (t) => {
  const f = fixture(t);
  git(f.source, ["branch", "patch", f.base]);
  git(f.source, ["branch", "dev", f.base]);
  assertFresh(f.root, f.source, f.base);
  assert.throws(() => assertFresh(f.root, f.source, automationSha), /Stale automation/);
  const ahead = f.commit("new.txt", "new\n");
  assertFastForward(f.source, f.base, ahead);
  assert.throws(() => assertFastForward(f.source, ahead, f.base), /diverged/);
  // A bare destination represents the actual generated branch publisher.
  const remote = join(f.root, "remote.git");
  git(f.root, ["clone", "-q", "--bare", f.source, remote]);
  git(remote, ["update-ref", "refs/heads/dev", ahead]);
  assert.throws(() =>
    guardedPush(f.source, remote, [
      { ref: "refs/heads/patch", expected: f.base, sha: ahead },
      { ref: "refs/heads/dev", expected: f.base, sha: f.base },
    ]),
  );
  assert.equal(remoteSha(f.root, remote, "refs/heads/patch"), f.base);
  guardedPush(f.source, remote, [{ ref: "refs/heads/dev", expected: ahead, sha: f.base }]);
  assert.equal(remoteSha(f.root, remote, "refs/heads/dev"), f.base);
});

test("release polling deduplicates IDs and retries failures, ignoring previews and fork events", () => {
  const releases = [
    { id: 3, tag_name: "v0.1.3", prerelease: true },
    { id: 2, tag_name: "v0.1.2" },
    { id: 1, tag_name: "v0.1.1" },
    { id: 4, tag_name: "v0.1.4", draft: true },
  ];
  assert.equal(selectRelease(releases, { initialized: false }).id, 2);
  assert.equal(
    selectRelease(releases, {
      initialized: true,
      releases: { 1: { status: "baseline" }, 2: { status: "failed" } },
    }).id,
    2,
  );
  assert.equal(
    selectRelease(releases, {
      initialized: true,
      releases: { 1: { status: "validated" }, 2: { status: "published" } },
    }),
    undefined,
  );
  assert.throws(() => selectRelease(releases, {}, "v0.1.3"), /not a stable/);
  assert.equal(selectRelease(releases, {}, "1").tag_name, "v0.1.1");
});
