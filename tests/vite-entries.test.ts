// The editor's built entry is assets/index-<hash>.js: kit preview finds it by that name to check the deploy went
// live (scripts/agents/project.d/preview `builtBundle`). With two pages (live.html, slice 30), Vite names each
// entry after its input key, so the editor's key stays "index".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the editor page's build input is keyed index, so its bundle stays assets/index-<hash>.js", () => {
  const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const input = /input:\s*\{([^}]*)\}/.exec(config)?.[1] ?? "";
  assert.match(input, /\bindex:\s*fileURLToPath\(new URL\("\.\/index\.html"/, "index.html is the input keyed index");
});
