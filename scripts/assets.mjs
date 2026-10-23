import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { json } from "./assemble.mjs";

const hash = (path, algorithm, encoding = "hex") =>
  createHash(algorithm).update(readFileSync(path)).digest(encoding);
export function requiredAssets(version) {
  return [
    ...["arm64", "x64"].flatMap((arch) => [
      `T3-Code-${version}-${arch}.dmg`,
      `T3-Code-${version}-${arch}.zip`,
      `T3-Code-${version}-${arch}.exe`,
      ...["dmg", "zip", "exe"].map((ext) => `T3-Code-${version}-${arch}.${ext}.blockmap`),
    ]),
    ...["arm64", "x86_64"].map((arch) => `T3-Code-${version}-${arch}.AppImage`),
    ...["arm64", "amd64"].map((arch) => `T3-Code-${version}-${arch}.deb`),
    ...["darwin-arm64", "linux-x64", "linux-arm64", "win32-x64", "win32-arm64"].map(
      (key) => `t3-${version}-${key}.${key.startsWith("win32") ? "zip" : "tar.gz"}`,
    ),
    "latest.yml",
    "latest-mac.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
    "provenance.json",
    "manifest.json",
  ];
}
export async function validateAssets({ directory, sourceRoot, version }) {
  if (!/^1\.0\.\d+$/.test(version)) throw new Error("Invalid distribution version");
  const { parseUpdateManifest, mergeUpdateManifests, serializeUpdateManifest } = await import(
    pathToFileURL(join(resolve(sourceRoot), "scripts/lib/update-manifest.ts")).href
  );
  const merge = (platform, primary, secondary, output) => {
    const a = parseUpdateManifest(
      readFileSync(join(directory, primary), "utf8"),
      primary,
      platform,
    );
    const b = parseUpdateManifest(
      readFileSync(join(directory, secondary), "utf8"),
      secondary,
      platform,
    );
    const merged = mergeUpdateManifests(a, b, platform);
    writeFileSync(
      join(directory, output),
      serializeUpdateManifest(merged, { platformLabel: platform }),
    );
    for (const name of new Set([primary, secondary]))
      if (name !== output) rmSync(join(directory, name));
  };
  merge("mac", "latest-mac.yml", "latest-mac-x64.yml", "latest-mac.yml");
  merge("win", "latest-win-x64.yml", "latest-win-arm64.yml", "latest.yml");
  for (const name of readdirSync(directory)) {
    if (name === "builder-debug.yml" || name === "builder-effective-config.yaml")
      rmSync(join(directory, name));
  }
  const files = requiredAssets(version);
  for (const name of files) {
    const path = join(directory, name);
    if (!statSync(path, { throwIfNoEntry: false })?.isFile() || statSync(path).size === 0)
      throw new Error(`Missing or empty required release asset: ${name}`);
  }
  for (const [name, arches, extension] of [
    ["latest-mac.yml", ["arm64", "x64"], "zip"],
    ["latest.yml", ["arm64", "x64"], "exe"],
    ["latest-linux.yml", ["x86_64"], "AppImage"],
    ["latest-linux-arm64.yml", ["arm64"], "AppImage"],
  ]) {
    const manifest = parseUpdateManifest(readFileSync(join(directory, name), "utf8"), name, name);
    if (manifest.version !== version) throw new Error(`${name}: version mismatch`);
    for (const arch of arches)
      if (!manifest.files.some((file) => file.url === `T3-Code-${version}-${arch}.${extension}`))
        throw new Error(`${name}: missing ${arch} ${extension}`);
    for (const file of manifest.files) {
      if (!files.includes(file.url))
        throw new Error(`${name}: unexpected or unsafe asset ${file.url}`);
      const path = join(directory, file.url);
      if (statSync(path).size !== file.size || hash(path, "sha512", "base64") !== file.sha512)
        throw new Error(`${name}: checksum/size mismatch for ${file.url}`);
    }
  }
  const provenance = JSON.parse(readFileSync(join(directory, "provenance.json")));
  const sources = JSON.parse(readFileSync(join(sourceRoot, "PATCH-SOURCES.json")));
  if (
    provenance.version !== version ||
    provenance.automationSha !== sources.automationSha ||
    provenance.sources.manifestSha256 !== sources.manifestSha256
  )
    throw new Error("Provenance/source mismatch");
  const upstreamManifest = readFileSync(join(directory, "manifest.json"));
  if (createHash("sha256").update(upstreamManifest).digest("hex") !== sources.manifestSha256)
    throw new Error("Manifest digest mismatch");
  provenance.status = "validated";
  writeFileSync(join(directory, "provenance.json"), json(provenance));
  const checksums = files
    .sort()
    .map((name) => `${hash(join(directory, name), "sha256")}  ${name}`)
    .join("\n");
  writeFileSync(join(directory, "SHA256SUMS"), `${checksums}\n`);
  const actual = readdirSync(directory).filter((name) => !["asset-list.json"].includes(name));
  const allowed = [...files, "SHA256SUMS"];
  if (actual.some((name) => !allowed.includes(name)))
    throw new Error(
      `Unexpected assets: ${actual.filter((name) => !allowed.includes(name)).join(", ")}`,
    );
  writeFileSync(join(directory, "asset-list.json"), json(allowed));
  return allowed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, sourceRoot, version] = process.argv.slice(2);
  console.log(await validateAssets({ directory, sourceRoot, version }));
}
