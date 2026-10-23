import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { requiredAssets, validateAssets } from "../scripts/assets.mjs";
import { json, sha256 } from "../scripts/assemble.mjs";

const selectedSource = process.env.PATCH_TEST_SOURCE;
if (!selectedSource)
  throw new Error("Set PATCH_TEST_SOURCE to an isolated upstream source checkout");
const version = "1.0.42";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "patch-assets-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source"),
    directory = join(root, "assets");
  mkdirSync(join(sourceRoot, "scripts/lib"), { recursive: true });
  mkdirSync(directory);
  copyFileSync(
    join(resolve(selectedSource), "scripts/lib/update-manifest.ts"),
    join(sourceRoot, "scripts/lib/update-manifest.ts"),
  );
  writeFileSync(join(sourceRoot, "package.json"), '{"type":"module"}');
  const manifest = Buffer.from('{"schema":1,"features":[]}');
  const sources = { automationSha: "a".repeat(40), manifestSha256: sha256(manifest) };
  writeFileSync(join(sourceRoot, "PATCH-SOURCES.json"), json(sources));
  for (const name of requiredAssets(version))
    writeFileSync(join(directory, name), `test bytes for ${name}\n`);
  writeFileSync(join(directory, "manifest.json"), manifest);
  writeFileSync(
    join(directory, "provenance.json"),
    json({ version, automationSha: sources.automationSha, sources }),
  );
  const feed = (name, arch, extension) => {
    const url = `T3-Code-${version}-${arch}.${extension}`;
    const bytes = readFileSync(join(directory, url));
    const checksum = createHash("sha512").update(bytes).digest("base64");
    writeFileSync(
      join(directory, name),
      `version: ${version}\nfiles:\n  - url: ${url}\n    sha512: ${checksum}\n    size: ${bytes.length}\npath: ${url}\nsha512: ${checksum}\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`,
    );
  };
  feed("latest-mac.yml", "arm64", "zip");
  feed("latest-mac-x64.yml", "x64", "zip");
  feed("latest-win-x64.yml", "x64", "exe");
  feed("latest-win-arm64.yml", "arm64", "exe");
  rmSync(join(directory, "latest.yml"));
  feed("latest-linux.yml", "x86_64", "AppImage");
  feed("latest-linux-arm64.yml", "arm64", "AppImage");
  return { directory, sourceRoot, version };
}

test("merges both architectures, validates all assets, and hashes final release bytes", async (t) => {
  const f = fixture(t);
  const files = await validateAssets(f);
  assert.ok(files.includes("SHA256SUMS"));
  const manifest = readFileSync(join(f.directory, "latest.yml"), "utf8");
  assert.match(manifest, /x64\.exe/);
  assert.match(manifest, /arm64\.exe/);
  const bytes = readFileSync(join(f.directory, "latest.yml"));
  assert.match(
    readFileSync(join(f.directory, "SHA256SUMS"), "utf8"),
    new RegExp(`${sha256(bytes)}  latest.yml`),
  );
});

test("a missing mac updater ZIP rejects the entire release", async (t) => {
  const f = fixture(t);
  rmSync(join(f.directory, `T3-Code-${version}-x64.zip`));
  await assert.rejects(validateAssets(f), /Missing or empty.*x64.zip/);
});

test("corrupted installer bytes reject updater metadata", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, `T3-Code-${version}-arm64.exe`), "corrupted");
  await assert.rejects(validateAssets(f), /checksum\/size mismatch/);
});

test("a missing Windows architecture rejects the feed merge", async (t) => {
  const f = fixture(t);
  rmSync(join(f.directory, "latest-win-arm64.yml"));
  await assert.rejects(validateAssets(f), /ENOENT/);
});

test("a different manifest rejects provenance", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, "manifest.json"), '{"features":["wrong"]}');
  await assert.rejects(validateAssets(f), /Manifest digest mismatch/);
});
