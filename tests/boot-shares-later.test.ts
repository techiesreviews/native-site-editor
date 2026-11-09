// The editor's boot stays within its byte budget (355 KB, tests/perf/byte-budget.ts): Share to edit's control and menu
// items and Share preview's load when the project menu first opens or a moment after the first paint
// (src/shares-later.ts), so boot modules import them as types only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boot = ["src/main.ts", "src/workspace-shares.ts", "src/preview-share.ts", "src/components/repository-menu.ts", "src/workspace-mount.ts"];
const later = /(?:^|\/)(?:share-control|share-menu|preview-control|preview-menu|shares-later)$/;

test("boot modules import Share to edit and Share preview's code as types only", () => {
  for (const file of boot) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)) {
      const path = match[2].replace(/\.ts$/, "");
      if (later.test(path)) assert.ok(match[1], `${file} imports ${match[2]} as a value; it belongs in src/shares-later.ts`);
    }
  }
});
