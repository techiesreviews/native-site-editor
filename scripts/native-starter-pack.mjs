#!/usr/bin/env node
// Writes the native static Starter's pack: every `files/<path>.asset` in
// manifest order, back to back, as one `starter.pack` beside the manifest.
// Create site reads the Starter in one Worker request, and Cloudflare's
// Workers Free plan allows 50 subrequests per request, so the worker reads
// the manifest and this pack (two ASSETS fetches) instead of one fetch per
// file. The manifest's sizes give each file's place in the pack.
//
// Run after vendoring a new starter version:
//   node scripts/native-starter-pack.mjs public/native-static-starter/v<sha>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/native-starter-pack.mjs public/native-static-starter/v<sha>");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
const parts = manifest.files.map((entry) => {
  const bytes = readFileSync(join(folder, "files", `${entry.path}.asset`));
  if (bytes.length !== entry.size) throw new Error(`${entry.path} is ${bytes.length} bytes; the manifest says ${entry.size}`);
  return bytes;
});
writeFileSync(join(folder, "starter.pack"), Buffer.concat(parts));
console.log(`Wrote ${join(folder, "starter.pack")}: ${parts.length} files.`);
