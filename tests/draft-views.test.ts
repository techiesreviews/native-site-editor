import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import type { DraftScope, SavedDraft } from "../src/drafts.ts";
import type { DraftViewsPorts } from "../src/draft-views.ts";
import type { SessionStamp } from "../src/workspace-session.ts";
import type { Repository, Snapshot } from "../shared/types.ts";

// Just enough DOM for a draft's panel: its text, an image's address and a button's click.
class FakeElement {
  children: FakeElement[] = [];
  listeners = new Map<string, () => unknown>();
  className = ""; textContent = ""; type = ""; alt = ""; src = "";
  attributes = new Map<string, string>();
  constructor(readonly tag = "div") {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: FakeElement[]) { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]) { this.children = [...children]; }
  addEventListener(type: string, listener: () => unknown) { this.listeners.set(type, listener); }
  find(tag: string): FakeElement | undefined { return this.children.find((child) => child.tag === tag) ?? this.children.map((child) => child.find(tag)).find(Boolean); }
  text(): string { return [this.textContent, ...this.children.map((child) => child.text())].filter(Boolean).join(" "); }
}
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
fakeGlobals.document = { createElement: (tag: string) => new FakeElement(tag) };
after(() => { if (saved) Object.defineProperty(globalThis, "document", saved); else Reflect.deleteProperty(globalThis, "document"); });
// The upload bytes live in IndexedDB in the browser: the test holds them.
const bytes = new Map<string, Blob>();
fakeGlobals.draftViewsBytes = { get: async (key: string) => bytes.get(key) };
// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({ load: (url, context, next) => (url.endsWith("/src/uploads.ts")
  ? { format: "module", source: `export * from "${url}?real"; export const uploadBytes = () => globalThis.draftViewsBytes;`, shortCircuit: true }
  : /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });
const { createDraftViews } = await import("../src/draft-views.ts");
const { uploadKey } = await import("../src/uploads.ts");

const SCOPE: DraftScope = { account: "o", repoId: 1, repo: "o/site", branch: "main" };
const REPO = { id: 1, full_name: "o/site" } as Repository; // eslint-disable-line no-restricted-syntax -- only the id and name are read.
const SNAPSHOT = { branch: "main", commit: "c" } as Snapshot; // eslint-disable-line no-restricted-syntax -- only the branch is read.
const draft = (path: string, extra: Partial<SavedDraft> = {}): SavedDraft => ({
  ...SCOPE, version: 1, path, baseSha: null, original: "", content: "", updatedAt: 1, ...extra,
});

// The views over the real app store; the workspace's screen is a fake element, the other ports record what they were asked.
function setup() {
  const calls: string[] = [], content = new FakeElement("main");
  const stamp: SessionStamp = { load: 3, scope: undefined, holds: () => true, changed: () => undefined };
  const late = { fileGeneration: 0, explorer: true };
  const appStore = createAppStore(createDraftStore());
  appStore.repository.value = REPO;
  appStore.snapshot.value = SNAPSHOT;
  const ports = {
    appStore, workspaceSession: { begin: () => stamp },
    get workspace() { return { content: content as unknown as HTMLElement, explorerDropdown: late.explorer ? { close: () => { calls.push("close explorer"); } } : undefined }; }, // eslint-disable-line no-restricted-syntax -- the fake holds only what the panels use.
    get fileGeneration() { return late.fileGeneration; }, set fileGeneration(value) { late.fileGeneration = value; },
    draftScope: () => SCOPE, status: (text: string) => { calls.push(`status ${text}`); }, setCurrentPage: (path?: string) => { calls.push(`page ${path}`); },
    discardUpload: async (path: string) => { calls.push(`discard ${path}`); },
    openAfter: async (path: string | undefined) => { calls.push(`open ${path}`); },
    undoFileChanges: (what: { restore?: string[] }) => { calls.push(`restore ${what.restore?.join()}`); },
    mountSource: async (path: string, source: string, baseSha: string | null, readOnly: boolean, at: SessionStamp, selection: number, options?: { keepExplorer?: boolean }) => {
      calls.push(`mount ${path} ${JSON.stringify([source, baseSha, readOnly, at.load, selection, options])}`);
    },
  } satisfies DraftViewsPorts;
  return { views: createDraftViews(ports), calls, content, late, appStore };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a new draft of the open repository and branch opens in the source pane, counting a file selection", async () => {
  const { views, calls, late } = setup();
  await views.openNewDraft(draft("new.html"), { keepExplorer: true });
  assert.equal(late.fileGeneration, 1);
  assert.deepEqual(calls, ["page new.html", `mount new.html ${JSON.stringify(["", null, false, 3, 1, { keepExplorer: true }])}`]);
  calls.length = 0;
  await views.openNewDraft(draft("other.html"));
  assert.deepEqual(calls.slice(0, 2), ["close explorer", "page other.html"]);
});

test("a draft of another repository or branch, or with no snapshot, is not opened", async () => {
  const { views, calls, late, appStore } = setup();
  await views.openNewDraft(draft("new.html", { repoId: 2 }));
  await views.openNewDraft(draft("new.html", { branch: "feature" }));
  appStore.snapshot.value = undefined;
  await views.openNewDraft(draft("new.html"));
  assert.deepEqual([calls, late.fileGeneration], [[], 0]);
});

test("a moved or copied file whose text is not held says so instead of opening", async () => {
  const { views, calls, content } = setup();
  await views.openNewDraft(draft("docs/report.pdf", { opaque: true, movedFrom: "report.pdf" }));
  assert.match(content.text(), /docs\/report\.pdf is report\.pdf moved here\. Its content is not shown/);
  await views.openNewDraft(draft("copy.pdf", { opaque: true }));
  assert.match(content.text(), /copy\.pdf is a copy of another file/);
  assert.deepEqual(calls.filter((call) => call.startsWith("status")), ["status Selected docs/report.pdf.", "status Selected copy.pdf."]);
});

test("an uploaded picture shows itself, its size and Discard, which opens what is left", async () => {
  const { views, calls, content } = setup();
  bytes.set(uploadKey(SCOPE, "sha-1"), new Blob([new Uint8Array([1, 2, 3])]));
  await views.openNewDraft(draft("images/logo.png", { upload: { size: 2048, type: "image/png" }, sourceSha: "sha-1", opaque: true }));
  assert.match(content.text(), /Uploaded logo\.png images\/logo\.png \(2 KB\) is kept in this browser until you save it to GitHub\./);
  await settle();
  const image = content.find("img");
  assert.equal(image?.alt, "logo.png");
  assert.equal(image?.src, "data:image/png;base64,AQID");
  const discard = content.find("button");
  assert.equal(discard?.attributes.get("aria-label"), "Discard images/logo.png");
  await discard?.listeners.get("click")?.();
  await settle();
  assert.deepEqual(calls.slice(-2), ["discard images/logo.png", "open undefined"]);
});

test("an uploaded file that is not a picture shows no image", async () => {
  const { views, content } = setup();
  await views.openNewDraft(draft("files/notes.zip", { upload: { size: 10, type: "application/zip" }, sourceSha: "sha-2" }));
  assert.equal(content.find("img"), undefined);
  assert.match(content.text(), /\(10 B\)/);
});

test("a deleted file says it goes on save, and Restore takes the deletion back", async () => {
  const { views, calls, content } = setup();
  views.showDeletedFile("blog/old.html");
  assert.match(content.text(), /Deleted old\.html blog\/old\.html is deleted in your changes\. It is removed from GitHub when you save\./);
  const restore = content.find("button");
  assert.equal(restore?.attributes.get("aria-label"), "Restore blog/old.html");
  await restore?.listeners.get("click")?.();
  assert.deepEqual(calls, ["status blog/old.html is deleted in your changes.", "restore blog/old.html"]);
});
