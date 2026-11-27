import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nightlyPattern, readSource, shaPattern } from "./assemble.mjs";

const config = new URL("../package.json", import.meta.url);
const releaseDir = new URL("./", import.meta.url);
const root = new URL("../", import.meta.url);
const notesPath = (version) => new URL(`versions/${version}.md`, releaseDir);
const recordPath = (version) => new URL(`versions/${version}.json`, releaseDir);
const changelog = new URL("../CHANGELOG.md", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function pendingFiles() {
  return readdirSync(new URL(".changeset/", root))
    .filter((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md")
    .sort();
}

export function releaseNotes(changesets, upstreamTag, highlights) {
  const sections = [...changesets]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(({ id, summary }) => {
      const body = summary.trim();
      if (!body) return [];
      if (!/^#### \S/.test(body) || /^#### Based on T3 Code /m.test(body)) {
        throw new Error(`Start ${id}.md with a level-four heading. The upstream heading is generated.`);
      }
      return [body];
    });
  const upstream = [
    `#### Based on T3 Code ${upstreamTag}`,
    highlights.trim(),
    `[Full T3 Code release notes](https://github.com/pingdotgg/t3code/releases/tag/${upstreamTag})`,
  ];
  return [...sections, ...upstream.filter(Boolean)].join("\n\n") + "\n";
}

function changeset(...args) {
  return execFileSync(fileURLToPath(new URL("node_modules/.bin/changeset", root)), args, {
    cwd: root,
    encoding: "utf8",
  });
}

function plan() {
  const actual = readJson(config);
  const directory = mkdtempSync(join(tmpdir(), "gcode-version-"));
  const report = join(directory, "plan.json");
  let data;
  try {
    changeset("status", "--output", report);
    data = readJson(report);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const [release] = data.releases;
  if (data.releases.length !== 1 || release.name !== actual.name || release.oldVersion !== actual.version) {
    throw new Error("Pending Changesets must version the private gcode package.");
  }
  for (const entry of data.changesets) {
    if (entry.releases.length !== 1 || entry.releases[0].name !== actual.name) {
      throw new Error(`Assign a G Code bump to ${entry.id}.md.`);
    }
  }
  return { ...data, release };
}

function upstreamHighlights(upstreamTag, oldVersion) {
  const previous = recordPath(oldVersion);
  const previousTag = existsSync(previous) ? readJson(previous).upstream.tag : undefined;
  if (previousTag === upstreamTag) return "";

  const directory = new URL("upstream/", releaseDir);
  const compare = new Intl.Collator("en", { numeric: true }).compare;
  const tags = readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .filter((tag) => nightlyPattern.test(tag))
    .sort(compare);
  if (!tags.includes(upstreamTag)) {
    throw new Error(`Add release/upstream/${upstreamTag}.md with highlights for the new base.`);
  }
  const included = previousTag && compare(previousTag, upstreamTag) > 0
    ? [upstreamTag]
    : tags.filter((tag) => (!previousTag || compare(tag, previousTag) > 0) && compare(tag, upstreamTag) <= 0);
  return included.map((tag) => readFileSync(new URL(`${tag}.md`, directory), "utf8").trim())
    .filter(Boolean).join("\n\n");
}

function prepare() {
  const { changesets, release } = plan();
  const source = readSource();
  const { upstream } = source;
  const notes = releaseNotes(changesets, upstream.tag, upstreamHighlights(upstream.tag, release.oldVersion));
  changeset("version");
  const version = readJson(config).version;
  if (version !== release.newVersion || existsSync(recordPath(version))) {
    throw new Error(`Unexpected or already recorded release version ${version}.`);
  }
  const record = {
    version,
    previousVersion: existsSync(recordPath(release.oldVersion)) ? release.oldVersion : null,
    upstream,
    source,
    notesSha256: sha256(notes),
  };
  mkdirSync(new URL("versions/", releaseDir), { recursive: true });
  writeFileSync(recordPath(version), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  writeFileSync(notesPath(version), notes, { flag: "wx" });
  const title = "# G Code Changelog\n";
  const previousLog = existsSync(changelog) ? readFileSync(changelog, "utf8").slice(title.length) : "";
  writeFileSync(changelog, `${title}\n## ${version}\n\n${notes}${previousLog}`);
}

function validate() {
  const { release, changesets } = plan();
  const { upstream } = readSource();
  releaseNotes(changesets, upstream.tag, upstreamHighlights(upstream.tag, release.oldVersion));
  console.log(release.newVersion);
}

function verify(expected) {
  const version = expected ?? readJson(config).version;
  if (!versionPattern.test(version)) throw new Error("Expected a G Code release version.");
  const record = readJson(recordPath(version));
  const { upstream } = record;
  if (record.version !== version || !nightlyPattern.test(upstream?.tag) || !shaPattern.test(upstream?.commit) ||
      !Array.isArray(record.source?.patches) ||
      (record.previousVersion !== null &&
        (!versionPattern.test(record.previousVersion) || !existsSync(recordPath(record.previousVersion)))) ||
      record.source.upstream?.tag !== upstream.tag || record.source.upstream?.commit !== upstream.commit ||
      record.notesSha256 !== sha256(readFileSync(notesPath(version)))) {
    throw new Error("The release record disagrees with the source manifest or release notes.");
  }
  const fields = {
    version,
    tag: `v${version}`,
    previous_tag: record.previousVersion ? `v${record.previousVersion}` : "",
    record: `release/versions/${version}.json`,
    upstream_tag: upstream.tag,
    upstream_commit: upstream.commit,
    notes: `release/versions/${version}.md`,
  };
  const output = Object.entries(fields).map(([key, value]) => `${key}=${value}\n`).join("");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (command === "prepare") prepare();
  else if (command === "validate") validate();
  else if (command === "verify") verify(arg);
  else if (command === "pending") console.log(pendingFiles().length);
  else throw new Error("Use prepare, validate, verify, or pending.");
}
