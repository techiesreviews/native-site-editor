import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveText, isNewDraft, newDraftPaths, newDrafts, type OverlayDraft } from "../shared/site-overlay.ts";
import { isImagePath } from "../src/native-structure.ts";
import { nativePageRoute } from "../shared/native-routes.ts";

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
];
const all = ["about/index.html", "styles/card.css", "news/index.html", "media/photo.jpg", "media/logo.svg", "media/hero.png"];
const notMoved = ["about/index.html", "styles/card.css", "media/photo.jpg", "media/hero.png"];

test("main.ts nativeImagePaths: new images, uploads and moved ones included", () => {
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

test("site-files paths: new files marked A, moved ones R", () => {
  const marks = newDrafts(drafts).map((draft) => [draft.path, draft.movedFrom ? "R" : "A"]);
  assert.deepEqual(marks, [
    ["about/index.html", "A"], ["styles/card.css", "A"], ["news/index.html", "R"],
    ["media/photo.jpg", "A"], ["media/logo.svg", "R"], ["media/hero.png", "A"],
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
