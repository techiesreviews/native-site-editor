import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveText, isNewDraft, newDraftPaths, type OverlayDraft } from "../shared/site-overlay.ts";
import { isImagePath } from "../src/native-structure.ts";
import { nativePageRoute } from "../shared/native-routes.ts";
import { SiteFiles, type SiteFileReader } from "../shared/site-files.ts";
import type { EditorContext, Repository } from "../shared/types.ts";

// One site's drafts, every kind the callers tell apart.
const SHA = "a".repeat(40);
const drafts: OverlayDraft[] = [
  { path: "index.html", baseSha: SHA },
  { path: "about/index.html", baseSha: null },
  { path: "styles/card.css", baseSha: null },
  { path: "news/index.html", baseSha: null, movedFrom: "blog/index.html" },
  { path: "blog/index.html", baseSha: SHA, deleted: true },
  { path: "media/photo.jpg", baseSha: null, upload: true, opaque: true },
  { path: "media/logo.svg", baseSha: null, movedFrom: "logo.svg", opaque: true },
  { path: "media/hero.png", baseSha: null },
  { path: "gone.html", baseSha: null, deleted: true },
  { path: "media/dropped.webp", baseSha: null, deleted: true },
];
const all = ["about/index.html", "styles/card.css", "news/index.html", "media/photo.jpg", "media/logo.svg", "media/hero.png"];
const notMoved = ["about/index.html", "styles/card.css", "media/photo.jpg", "media/hero.png"];

test("main.ts nativeImagePaths: new images, uploads and moved ones included; deleted ones not", () => {
  assert.deepEqual(newDraftPaths(drafts, { kind: isImagePath }), ["media/photo.jpg", "media/logo.svg", "media/hero.png"]);
});

test("main.ts nativeFiles: every new file, moved and uploaded ones included", () => {
  assert.deepEqual(newDraftPaths(drafts), all);
});

test("main.ts newDraftPaths: every new file in the scope", () => {
  assert.deepEqual(newDraftPaths(drafts), all);
  assert.deepEqual(newDraftPaths([]), []);
});

test("main.ts treeState: the tree's drafted paths are every new file", () => {
  assert.deepEqual(newDraftPaths(drafts), all);
});

test("linked-styles openSecondary: a stylesheet new in the drafts, not an upload or opaque file", () => {
  const draft = (path: string) => drafts.find((item) => item.path === path);
  assert.equal(isNewDraft(draft("styles/card.css"), { uploads: false }), true);
  assert.equal(isNewDraft(draft("media/photo.jpg"), { uploads: false }), false);
  assert.equal(isNewDraft(draft("media/logo.svg"), { uploads: false }), false);
  assert.equal(isNewDraft(draft("gone.html"), { uploads: false }), false);
  assert.equal(isNewDraft(draft("index.html"), { uploads: false }), false);
  assert.equal(isNewDraft(undefined, { uploads: false }), false);
});

test("linked-styles openComponentLinkedStyle: the same answer as openSecondary", () => {
  assert.deepEqual(newDraftPaths(drafts, { uploads: false }), ["about/index.html", "styles/card.css", "news/index.html", "media/hero.png"]);
});

test("pages-state renderPagesTree: new pages marked, a moved page is the same page", () => {
  assert.deepEqual(newDraftPaths(drafts, { moved: false }), notMoved);
});

test("agent-site buildAgentContext: new files without moved ones", () => {
  assert.deepEqual(newDraftPaths(drafts, { moved: false }), notMoved);
});

test("agent-site structuralOutcome create_page: the first new, unmoved page", () => {
  const after = new Map<string, OverlayDraft | undefined>([
    ["index.html", undefined],
    ["news/index.html", drafts[3]],
    ["styles/card.css", drafts[2]],
    ["about/index.html", drafts[1]],
  ]);
  assert.equal([...after].find(([file, record]) => isNewDraft(record, { moved: false }) && nativePageRoute(file))?.[0], "about/index.html");
});

test("site-files paths: new files marked A, moved ones R, a deleted new one left out", async () => {
  const reader: SiteFileReader = {
    commitTree: async () => [{ path: "index.html", mode: "100644", type: "blob", sha: SHA }],
    file: async () => "",
    prefetchTexts: async () => {},
    hasText: () => false,
  };
  // eslint-disable-next-line no-restricted-syntax -- paths() reads only the context's commit and drafts
  const context = {
    commit: "b".repeat(40),
    drafts: [
      { path: "about/index.html", baseSha: null, updatedAt: 1 },
      { path: "news/index.html", baseSha: null, updatedAt: 1, movedFrom: "blog/index.html" },
      { path: "gone.html", baseSha: null, updatedAt: 1, deleted: true },
    ],
  } as unknown as EditorContext;
  const files = new SiteFiles(reader, { full_name: "o/r" } as Repository, context);
  assert.deepEqual(await files.paths(), [
    { path: "about/index.html", draft: "A" },
    { path: "index.html" },
    { path: "news/index.html", draft: "R" },
  ]);
});

test("effectiveText: the open editor's text, else the draft's, else GitHub's", () => {
  const layers = (mounted?: string, draft?: { content: string; deleted?: boolean; opaque?: boolean }, base?: string) =>
    ({ mounted: () => mounted, draft: () => draft, base: () => base });
  assert.equal(effectiveText("a.html", layers("typed", { content: "draft" }, "base")), "typed");
  assert.equal(effectiveText("a.html", layers("", { content: "draft" }, "base")), "");
  assert.equal(effectiveText("a.html", layers(undefined, { content: "draft" }, "base")), "draft");
  assert.equal(effectiveText("a.html", layers(undefined, { content: "" }, "base")), "");
  assert.equal(effectiveText("a.html", layers(undefined, undefined, "base")), "base");
  assert.equal(effectiveText("a.html", layers()), undefined);
  assert.equal(effectiveText("a.html", {}), undefined);
});

test("effectiveText: a deleted or opaque draft has no text, even open in the editor", () => {
  const read = (draft: { content: string; deleted?: boolean; opaque?: boolean }) =>
    effectiveText("a.svg", { mounted: () => "typed", draft: () => draft, base: () => "base" });
  assert.equal(read({ content: "draft", deleted: true }), undefined);
  assert.equal(read({ content: "", opaque: true }), undefined);
});

test("effectiveText reads each layer at the path asked", () => {
  const asked: string[] = [];
  const at = (layer: string) => (path: string) => { asked.push(`${layer}:${path}`); return undefined; };
  effectiveText("x/y.css", { mounted: at("mounted"), draft: at("draft"), base: at("base") });
  assert.deepEqual(asked.sort(), ["base:x/y.css", "draft:x/y.css", "mounted:x/y.css"]);
});
