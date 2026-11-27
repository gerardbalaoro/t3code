import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function addUpdateNotes(manifest, version, notes) {
  if (!manifest.split(/\r?\n/).includes(`version: ${version}`)) {
    throw new Error(`Updater manifest must specify version ${version}.`);
  }
  if (/^release(?:Name|Notes):/m.test(manifest)) {
    throw new Error("Updater manifest already contains release notes or a release name.");
  }
  // A JSON string is a YAML double-quoted scalar. Preserve the Markdown and
  // its final newline rather than depending on GitHub's rendered Atom feed.
  return `${manifest.trimEnd()}\nreleaseName: ${JSON.stringify(`G Code ${version}`)}\nreleaseNotes: ${JSON.stringify(notes)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [directory, version] = process.argv.slice(2);
  const notes = readFileSync(new URL(`versions/${version}.md`, import.meta.url), "utf8");
  for (const name of ["latest.yml", "latest-mac.yml", "latest-linux.yml", "latest-linux-arm64.yml"]) {
    const path = join(directory, name);
    writeFileSync(path, addUpdateNotes(readFileSync(path, "utf8"), version, notes));
  }
}
