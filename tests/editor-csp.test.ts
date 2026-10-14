import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { staticAssetHeaders } from "./native-save/production-headers.ts";
import { testCsp } from "./native-save/test-csp.ts";

function directives(policy: string) {
  return new Map(policy.split(";").filter((part) => part.trim()).map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, new Set(sources)] as const;
  }));
}

test("production and test CSP allow only same-origin/blob media and the same video frame hosts", () => {
  const source = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  const header = staticAssetHeaders(source, "/").get("Content-Security-Policy");
  assert.ok(header);
  const production = directives(header), server = directives(testCsp);
  const media = new Set(["'self'", "blob:"]);
  const videoHosts = new Set(["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"]);
  for (const policy of [production, server]) {
    assert.deepEqual(policy.get("media-src"), media);
    const frames = policy.get("frame-src");
    assert.ok(frames);
    for (const host of videoHosts) assert.ok(frames.has(host), host);
    assert.deepEqual(new Set([...frames].filter((host) => host !== "'self'" && host !== "https://*.workers.dev")), videoHosts);
  }
  assert.deepEqual(production.get("media-src"), server.get("media-src"));
});
