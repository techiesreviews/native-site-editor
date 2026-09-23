// Writes the built revision into dist so the editor can verify which commit a preview shows.
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
const dist = new URL("../dist/", import.meta.url);
const revision = {
  sha: process.env.GITHUB_SHA ?? process.env.REVISION_SHA ?? "local",
  ref: process.env.GITHUB_REF_NAME ?? process.env.REVISION_REF ?? "local",
  builtAt: new Date().toISOString(),
};
mkdirSync(new URL(".astro-editor/", dist), { recursive: true });
writeFileSync(new URL(".astro-editor/revision.json", dist), JSON.stringify(revision));
const headers = new URL("_headers", dist);
const rule = "\n/.astro-editor/revision.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-store\n";
if (existsSync(headers)) appendFileSync(headers, rule); else writeFileSync(headers, rule.trimStart());
console.log("Stamped", revision);
