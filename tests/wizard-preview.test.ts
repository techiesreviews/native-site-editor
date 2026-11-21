import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { NATIVE_STARTER_VERSION } from "../shared/native-starter-version";
import type { createSetupActions } from "../src/setup-actions";

// TOOLS-188 new-user test: the ready screen showed a placeholder card instead
// of the new site's home page, because the Starter's home page is built from
// components (<site-header>, <section-hero>, …) and the preview refused any
// page that uses one. Its components now show as the site's loader shows them.

const folder = `public/native-static-starter/${NATIVE_STARTER_VERSION}`;
const manifest = JSON.parse(readFileSync(`${folder}/manifest.json`, "utf8")) as { files: { path: string }[] };
const starter = (path: string) => readFileSync(`${folder}/files/${path}.asset`);

const bundled = build({ entryPoints: ["src/setup-actions.ts"], bundle: true, write: false, format: "esm", platform: "node", loader: { ".css": "empty" },
  plugins: [{ name: "no-dialog", setup(plugin) {
    plugin.onResolve({ filter: /^\.\/components\/confirm-dialog$/ }, () => ({ path: "dialog", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const createConfirmDialog = () => { throw new Error('Unused'); };" }));
  } }],
}).then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));

test("the ready screen previews a Starter home page, its components drawn in place", async () => {
  // Each blob's sha is its path, so the fake reads the vendored file back.
  const tree = manifest.files.map((file) => ({ path: file.path, type: "blob", sha: file.path }));
  const read: string[] = [];
  const ports = {
    api: async <T>(action: string) => {
      assert.equal(action, "snapshot");
      return { branch: "main", commit: "c", entries: [], tree } as T;
    },
    readFiles: async (_repo: string, shas: string[]) => {
      read.push(...shas);
      return Object.fromEntries(shas.map((sha) => [sha, starter(sha).toString("utf8")]));
    },
    readBlob: async (_repo: string, sha: string) => new Blob([starter(sha)]),
  } satisfies Pick<Parameters<typeof createSetupActions>[0], "api" | "readFiles" | "readBlob">;
  const module = await bundled;
  const html: string | undefined = await module.createSetupActions(ports).wizardPreview({ id: 1, name: "my-site", fullName: "lex/my-site", defaultBranch: "main", committed: true });
  assert.ok(html, "the preview is drawn");
  // The header's template, inside a declarative shadow root after <site-header>.
  assert.match(html, /<site-header\b[^>]*><template shadowrootmode="open">[\s\S]*?<a class="brand" href="\/">/);
  assert.match(html, /<section-hero\b[^>]*><template shadowrootmode="open">/);
  // The cards nested in the home page get theirs too, and the shared styles reach inside each one.
  assert.equal(html.match(/<card-project\b[^>]*><template shadowrootmode="open"><style>/g)?.length, 3);
  // The Starter hides components until its script defines them; none runs here, so they show.
  assert.match(html, /:not\(:defined\)\{visibility:visible!important\}/);
  // Still a picture: no scripts.
  assert.doesNotMatch(html, /<script\b/i);
  // Only the templates and styles the home page uses are read, each once.
  assert.equal(new Set(read).size, read.length);
  assert.ok(!read.includes("components/section-split/section-split.html"));
});
