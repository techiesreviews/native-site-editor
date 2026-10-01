import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeWranglerConfig, parseJsonc, update } from "../scripts/update-editor.mjs";

const upstreamConfig = `{
  // Upstream comment with a URL: https://example.com/a // not a comment end
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "native-site-editor",
  "workers_dev": true,
  "vars": {
    // Your GitHub username.
    "OWNER_GITHUB": "",
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["SessionStore"] }, { "tag": "v2" }],
}
`;

test("the copy's Worker name, vars and routes survive an update; upstream's migrations arrive", () => {
  const local = `{
  "name": "my-editor",
  "routes": [{ "pattern": "edit.example.com", "custom_domain": true }],
  "vars": { "OWNER_GITHUB": "octo", "EDITOR_ORIGIN": "https://edit.example.com" },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["SessionStore"] }],
}`;
  const merged = mergeWranglerConfig(upstreamConfig, local);
  const value = parseJsonc(merged);
  assert.equal(value.name, "my-editor");
  assert.deepEqual(value.vars, { OWNER_GITHUB: "octo", EDITOR_ORIGIN: "https://edit.example.com" });
  assert.deepEqual(value.routes, [{ pattern: "edit.example.com", custom_domain: true }]);
  assert.equal(value.migrations.length, 2);
  assert.equal(value.$schema, "node_modules/wrangler/config-schema.json");
});

test("vars named like top-level keys, odd formatting, commas in strings and non-string vars all survive", () => {
  const upstream = `{
  "name": "native-site-editor", // the Worker
  "main": "worker/index.ts",
  "vars": { "OWNER_GITHUB": "" /* yours */ },
}`;
  const local = `{
  "name": "my-editor",
  "vars": { "name": "custom-variable", "main": "x", "TEXT": "a,} b,]", "LIMIT": 42, "OPTIONS": { "enabled": true, }, },
}`;
  const value = parseJsonc(mergeWranglerConfig(upstream, local));
  assert.equal(value.name, "my-editor");
  assert.equal(value.main, "worker/index.ts");
  assert.deepEqual(value.vars, {
    OWNER_GITHUB: "",
    name: "custom-variable",
    main: "x",
    TEXT: "a,} b,]",
    LIMIT: 42,
    OPTIONS: { enabled: true },
  });
});

test("the shipped wrangler.jsonc parses and merges with itself unchanged", () => {
  const text = readFileSync("wrangler.jsonc", "utf8");
  assert.equal(parseJsonc(text).vars.OWNER_GITHUB, "");
  const once = mergeWranglerConfig(text, text);
  assert.deepEqual(parseJsonc(once), parseJsonc(text));
  assert.equal(mergeWranglerConfig(text, once), once);
});

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "update-editor-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
  return dir;
}

test("an update replaces editor files, removes old ones, keeps workflows and settings, and is idempotent", () => {
  const upstream = repo({
    "wrangler.jsonc": upstreamConfig,
    "worker/app.ts": "new",
    "worker/added.ts": "added",
    ".github/workflows/update-editor.yml": "upstream workflow",
  });
  const copy = repo({
    "wrangler.jsonc": `{ "name": "my-editor", "vars": { "OWNER_GITHUB": "octo" } }`,
    "worker/app.ts": "old",
    "worker/removed.ts": "gone upstream",
    ".github/workflows/update-editor.yml": "copy workflow",
  });
  const sha = execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(update(copy, { dir: upstream, sha }), sha);
  assert.equal(readFileSync(join(copy, "worker/app.ts"), "utf8"), "new");
  assert.equal(readFileSync(join(copy, "worker/added.ts"), "utf8"), "added");
  assert.equal(existsSync(join(copy, "worker/removed.ts")), false);
  assert.equal(readFileSync(join(copy, ".github/workflows/update-editor.yml"), "utf8"), "copy workflow");
  const config = parseJsonc(readFileSync(join(copy, "wrangler.jsonc"), "utf8"));
  assert.equal(config.name, "my-editor");
  assert.equal(config.vars.OWNER_GITHUB, "octo");
  assert.equal(readFileSync(join(copy, ".editor-upstream"), "utf8"), `${sha}\n`);
  assert.equal(update(copy, { dir: upstream, sha }), null);
});
