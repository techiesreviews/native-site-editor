// Share preview on the preview editor (slice 35): its PREVIEW_ORIGIN is the workers.dev address of the previews Worker
// that wrangler.preview-host.jsonc deploys for it (`--env preview`), a separate site from the editor. The live editor
// (wrangler.techies.jsonc) sets none until Lex turns preview links on there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const origin = (config: string) => /"PREVIEW_ORIGIN"\s*:\s*"([^"]*)"/.exec(config)?.[1];

test("the preview editor's previews address is its own previews Worker on workers.dev; the live editor has none", () => {
  const host = /"preview"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"/.exec(read("wrangler.preview-host.jsonc"))?.[1];
  assert.equal(host, "native-site-editor-previews-preview");
  const url = new URL(origin(read("wrangler.preview.jsonc")) ?? "");
  assert.equal(url.protocol, "https:");
  assert.match(url.hostname, new RegExp(`^${host}\\.[a-z0-9-]+\\.workers\\.dev$`));
  assert.equal(url.origin, url.href.replace(/\/$/, ""), "an origin only, no path");
  assert.equal(origin(read("wrangler.techies.jsonc")), undefined);
});
