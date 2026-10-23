import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, resolve as pathResolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { git, tryGit, resolve, identity } from "./git.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function apply(cwd, bytes, label) {
  if (!bytes.length) return "empty";
  if (
    tryGit(cwd, ["apply", "--reverse", "--check", "--binary", "-"], { input: bytes }) !== undefined
  )
    return "already-present";
  try {
    git(cwd, ["apply", "--3way", "--index", "--binary", "-"], { input: bytes });
  } catch (error) {
    const conflicts = git(cwd, ["diff", "--name-only", "--diff-filter=U"]).trim();
    throw new Error(
      `Assembly stopped at ${label}. Conflicts: ${conflicts || "(see Git diagnostic)"}\n${error.message}`,
    );
  }
  return git(cwd, ["diff", "--cached", "--name-only"]).trim() ? "applied" : "already-present";
}

// No pushes occur here. A failed assembly removes its temporary directory.
export function assemble({
  manifestPath,
  output,
  sourceRef,
  automationSha,
  distributionPath,
  release = null,
}) {
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 1 || !manifest.upstream || !Array.isArray(manifest.features))
    throw new Error("Invalid manifest schema");
  const ids = new Set();
  for (const feature of manifest.features) {
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(feature.id) ||
      ids.has(feature.id) ||
      !feature.base ||
      !feature.head ||
      !feature.repository
    )
      throw new Error("Invalid or duplicate feature source");
    ids.add(feature.id);
  }
  if (!/^[a-f0-9]{40}$/.test(automationSha))
    throw new Error("automationSha must be a full commit SHA");
  output = pathResolve(output);
  if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = mkdtempSync(join(dirname(output), ".assembly-"));
  try {
    git(temporary, ["init", "-q"]);
    const upstreamSha = resolve(
      temporary,
      manifest.upstream.repository,
      sourceRef || manifest.upstream.ref,
    );
    // Resolve every feature before changing the working tree.
    const features = manifest.features.map((feature) => {
      const baseSha = resolve(temporary, feature.repository, feature.base);
      const headSha = resolve(temporary, feature.repository, feature.head);
      if (tryGit(temporary, ["merge-base", "--is-ancestor", baseSha, headSha]) === undefined)
        throw new Error(`${feature.id}: base is not an ancestor of head`);
      const delta = git(
        temporary,
        ["diff", "--binary", "--full-index", "--no-renames", "--no-ext-diff", baseSha, headSha],
        { encoding: "buffer" },
      );
      return { id: feature.id, repository: feature.repository, baseSha, headSha, delta };
    });
    git(temporary, ["checkout", "-q", "--detach", upstreamSha]);
    const records = [];
    for (const { delta, ...feature } of features) {
      const before = git(temporary, ["write-tree"]).trim();
      const status = apply(temporary, delta, feature.id);
      records.push({ ...feature, deltaSha256: sha256(delta), status });
      // Reset the comparison baseline without importing any feature history.
      const tree = git(temporary, ["write-tree"]).trim();
      if (tree !== before) {
        const stamp = `${git(temporary, ["show", "-s", "--format=%ct", upstreamSha]).trim()} +0000`;
        const checkpoint = git(temporary, ["commit-tree", tree, "-p", upstreamSha], {
          input: `${feature.id}\n`,
          env: { ...identity, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
        }).trim();
        git(temporary, ["reset", "--soft", checkpoint]);
      }
    }
    const distribution = distributionPath ? readFileSync(distributionPath) : Buffer.alloc(0);
    const distributionStatus = apply(temporary, distribution, "distribution/cli-feed.patch");
    const record = {
      schema: 1,
      automationSha,
      manifestSha256: sha256(bytes),
      upstream: { repository: manifest.upstream.repository, sha: upstreamSha, release },
      features: records,
      distribution: { sha256: sha256(distribution), status: distributionStatus },
    };
    if (existsSync(join(temporary, "PATCH-SOURCES.json")))
      throw new Error("Reserved source path PATCH-SOURCES.json already exists");
    writeFileSync(join(temporary, "PATCH-SOURCES.json"), json(record));
    git(temporary, ["add", "PATCH-SOURCES.json"]);
    const tree = git(temporary, ["write-tree"]).trim();
    const stamp = `${git(temporary, ["show", "-s", "--format=%ct", upstreamSha]).trim()} +0000`;
    const assembledSha = git(temporary, ["commit-tree", tree, "-p", upstreamSha], {
      input: `build: assemble Gerard distribution\n\nManifest: ${record.manifestSha256}\nAutomation: ${automationSha}\n`,
      env: { ...identity, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
    }).trim();
    git(temporary, ["reset", "--hard", assembledSha]);
    renameSync(temporary, output);
    return { ...record, assembledSha, treeSha: tree };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href) {
  const [manifestPath, output, sourceRef] = process.argv.slice(2);
  if (!manifestPath || !output)
    throw new Error("Usage: node scripts/assemble.mjs manifest.json OUTPUT [SOURCE_REF]");
  const automationSha = git(process.cwd(), ["rev-parse", "HEAD"]).trim();
  console.log(
    json(
      assemble({
        manifestPath,
        output,
        sourceRef,
        automationSha,
        distributionPath: "distribution/cli-feed.patch",
      }),
    ),
  );
}
