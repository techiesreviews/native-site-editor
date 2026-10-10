import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { staticAssetHeaders } from "./native-save/production-headers.ts";
const source = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
test("hashed assets alone receive immutable caching and common security headers", () => {
  for (const path of ["/assets/index-abc.js", "/assets/editor-abc.css", "/assets/ts.worker-abc.js", "/assets/native-preview-runtime-abc.js", "/assets/native-preview-runtime-abc.js.map"]) {
    const headers = staticAssetHeaders(source, path);
    assert.equal(headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  }
  for (const path of ["/", "/index.html", "/native-static-starter/index.html", "/assets-other/file.js"]) {
    const headers = staticAssetHeaders(source, path);
    assert.equal(headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
    assert.equal(headers.get("X-Frame-Options"), "DENY");
  }
});
test("all Workers leave assets to the static asset handler", () => {
  for (const file of ["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.techies.jsonc"]) {
    const config = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const patterns = config.match(/"run_worker_first"\s*:\s*\[([^\]]+)\]/)?.[1];
    assert.ok(patterns);
    const rules = JSON.parse(`[${patterns}]`) as string[];
    const match = (pattern: string) => new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test("/assets/index-abc.js");
    const intercepted = rules.some((rule) => !rule.startsWith("!") && match(rule))
      && !rules.some((rule) => rule.startsWith("!") && match(rule.slice(1)));
    assert.equal(intercepted, false, `${file} must leave hashed assets to static serving`);
  }
});
