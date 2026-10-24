import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, identity, remoteSha } from "../scripts/git.mjs";
import { checkPushAccess, requirePushToken } from "../scripts/push-auth.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "patch-auth-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  mkdirSync(source);
  git(source, ["init", "-q", "-b", "patch"]);
  writeFileSync(join(source, "original.txt"), "original\n");
  git(source, ["add", "."]);
  git(source, ["commit", "-qm", "initial"], { env: identity });
  const sha = git(source, ["rev-parse", "HEAD"]).trim();
  const remote = join(root, "fork.git");
  git(root, ["clone", "-q", "--bare", source, remote]);
  git(remote, ["update-ref", "refs/heads/main", sha]);
  git(remote, ["update-ref", "refs/heads/dev", sha]);
  const receiver = join(root, "receive");
  // The production client disables its hooks; the remote has its own policy.
  writeFileSync(receiver, '#!/bin/sh\nunset GIT_CONFIG_PARAMETERS\nexec git-receive-pack "$@"\n');
  chmodSync(receiver, 0o755);
  git(source, ["remote", "add", "probe", remote]);
  git(source, ["config", "remote.probe.receivepack", receiver]);
  const hook = join(remote, "hooks/pre-receive");
  writeFileSync(
    hook,
    `#!/bin/sh
while read old next ref; do
  case "$next" in 0000000000000000000000000000000000000000) continue ;; esac
  if test -n "$(git diff-tree --no-commit-id --name-only -r "$next" -- .github/workflows/)" && test "$GH_TOKEN" != test-only-workflows; then
    echo "refusing to allow workflow update without workflows permission: $GH_TOKEN" >&2
    exit 1
  fi
done
`,
  );
  chmodSync(hook, 0o755);
  return { root, source, remote, sha };
}

test("missing promotion secret never falls back to GITHUB_TOKEN or CLI credentials", () => {
  assert.throws(
    () => requirePushToken({ GH_TOKEN: "test-only-contents", GITHUB_TOKEN: "test-only-contents" }),
    /Missing PATCH_PUSH_TOKEN/,
  );
  assert.throws(() => requirePushToken({ PATCH_PUSH_TOKEN: "   " }), /Missing PATCH_PUSH_TOKEN/);
});

test("contents-only permission fails the real workflow ref push before any production ref changes", (t) => {
  const f = fixture(t);
  assert.throws(
    () => checkPushAccess(f.source, "probe", "test-only-contents"),
    (error) => {
      assert.match(error.message, /without workflows permission/);
      assert.doesNotMatch(error.message, /test-only-contents/);
      assert.match(error.message, /<REDACTED>/);
      return true;
    },
  );
  assert.equal(git(f.source, ["ls-remote", f.remote, "refs/tags/*"]).trim(), "");
  for (const branch of ["main", "dev", "patch"])
    assert.equal(remoteSha(f.root, f.remote, `refs/heads/${branch}`), f.sha);
});

test("workflow-capable promotion credential passes a real push and removes its probe", (t) => {
  const f = fixture(t);
  checkPushAccess(f.source, "probe", "test-only-workflows");
  assert.equal(git(f.source, ["ls-remote", f.remote, "refs/tags/*"]).trim(), "");
  assert.equal(git(f.source, ["status", "--porcelain"]).trim(), "");
  for (const branch of ["main", "dev", "patch"])
    assert.equal(remoteSha(f.root, f.remote, `refs/heads/${branch}`), f.sha);
});
