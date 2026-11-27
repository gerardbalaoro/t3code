import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

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

if (process.argv[1] === NodeURL.fileURLToPath(import.meta.url)) {
  const [directory, version, notesFile] = process.argv.slice(2);
  const notes = NodeFS.readFileSync(notesFile, "utf8");
  for (const name of [
    "latest.yml",
    "latest-mac.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
  ]) {
    const path = NodePath.join(directory, name);
    NodeFS.writeFileSync(path, addUpdateNotes(NodeFS.readFileSync(path, "utf8"), version, notes));
  }
}
