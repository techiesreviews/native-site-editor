import { test } from "node:test";
import assert from "node:assert/strict";
import { createFilesTreeController, type FilesTreePorts } from "../src/controllers/files-tree-controller";
import type { FileOperationsTreeState } from "../src/controllers/file-operations-controller";
import type { TreeEntry } from "../shared/types";

class Element {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  listeners = new Map<string, (() => unknown)[]>();
  hidden = false;
  disabled = false;
  isConnected = true;
  title = "";
  textContent = "";
  className = "";
  focused = false;
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, callback: () => unknown) { this.listeners.set(name, [...this.listeners.get(name) ?? [], callback]); }
  async click() { for (const callback of this.listeners.get("click") ?? []) await callback(); }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap(child => [...(child.className.split(" ").includes(selector.slice(1)) || child.classes.has(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  contains(element: Element) { return this.querySelectorAll(".file-row").includes(element); }
  closest() { return this; }
  focus() { this.focused = true; }
}
const entry = (path: string, type: "tree" | "blob" = "blob"): TreeEntry => ({ path, type, sha: path, mode: type === "tree" ? "040000" : "100644" });
function harness(entries = [entry("a.txt")]) {
  let epoch = 1, repo: { full_name: string } | undefined = { full_name: "a/r" };
  let snapshot: { entries: TreeEntry[]; tree?: TreeEntry[] } | undefined = { entries };
  let state: FileOperationsTreeState = { changes: new Map(), deleted: new Map(), drafted: [] };
  const root = new Element(), calls: string[] = [];
  let load = async () => ({ entries: [entry("child.txt")] });
  const node = (_tag: string, className = "", text = "") => Object.assign(new Element(), { className, textContent: text });
  const ports = {
    ui: { node, button: (text: string, action: () => void, className: string) => { const row = node("button", className, text); row.addEventListener("click", action); return row; }, setIcon: () => {} },
    snapshot: () => snapshot, repo: () => repo, epoch: () => epoch, root: () => root,
    state: () => state, openFile: () => "a.txt", scope: () => undefined, draft: () => undefined,
    load: () => load(), images: () => calls.push("images"), clearError: () => calls.push("clear"),
    error: () => calls.push("error"), status: (text: string) => calls.push(text), announce: (text: string) => calls.push(text), refuse: (text: string) => calls.push(text),
    intent: (path: string) => calls.push(`intent ${path}`), openEntry: async (_entry: TreeEntry, path: string) => { calls.push(`open ${path}`); },
    openDraft: async () => { calls.push("draft"); }, restore: () => calls.push("restore"), create: () => calls.push("create"),
    actions: () => undefined, visible: () => Boolean(repo),
  } as unknown as FilesTreePorts;
  const controller = createFilesTreeController(ports);
  return { controller, root, calls, ports, row: (path: string) => root.querySelectorAll(".file-row").find(row => row.dataset.path === path)!,
    state: (next: FileOperationsTreeState) => { state = next; }, epoch: () => { epoch++; }, repo: () => { repo = undefined; },
    snapshot: (next: typeof snapshot) => { snapshot = next; }, load: (next: typeof load) => { load = next; } };
}

// Minimal DOM verifies controller interactions without loading the browser icon assets.
test.before(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: undefined } });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: Element });
});
test.after(() => { Reflect.deleteProperty(globalThis, "document"); Reflect.deleteProperty(globalThis, "HTMLElement"); });

test("render reads live snapshot and restores focus by path", () => {
  const h = harness(); h.controller.render();
  Object.assign(document, { activeElement: h.row("a.txt") });
  h.controller.render(); assert.equal(h.row("a.txt").focused, true);
  Object.assign(document, { activeElement: undefined });
  h.snapshot({ entries: [entry("b.txt")] }); h.controller.render();
  assert.deepEqual(h.root.querySelectorAll(".file-row").map(row => row.dataset.path), ["b.txt"]);
});
test("missing snapshot leaves rows intact", () => {
  const h = harness(); h.controller.render(); const list = h.root.children[0];
  h.snapshot(undefined); h.controller.render(); assert.equal(h.root.children[0], list);
});
test("refresh always requests images but redraws only on changed signature", () => {
  const h = harness(); h.controller.render(); const list = h.root.children[0]; h.controller.refresh();
  assert.equal(h.root.children[0], list); assert.deepEqual(h.calls, ["images"]);
  h.state({ changes: new Map([["b.txt", { path: "b.txt", kind: "A", drafts: [] }]]), deleted: new Map(), drafted: ["b.txt"] });
  h.controller.refresh(); assert.notEqual(h.root.children[0], list); assert.ok(h.row("b.txt"));
});
test("file click selects and records intent before opening", async () => {
  const h = harness(); h.controller.render(); await h.row("a.txt").click();
  assert.deepEqual(h.calls, ["clear", "intent a.txt", "open a.txt"]); assert.ok(h.row("a.txt").classes.has("selected"));
});
for (const guard of ["epoch", "repo"] as const) test(`file click refuses stale ${guard}`, async () => {
  const h = harness(); h.controller.render(); h[guard](); await h.row("a.txt").click(); assert.deepEqual(h.calls, []);
});
test("folder click loads once, closes and reopens without opening file", async () => {
  const h = harness([entry("folder", "tree")]); let reads = 0;
  h.load(async () => { reads++; return { entries: [entry("child.txt")] }; });
  h.controller.render(); const row = h.row("folder"); await row.click(); await row.click();
  assert.equal(row.attributes.get("aria-expanded"), "false"); await row.click();
  assert.equal(row.attributes.get("aria-expanded"), "true"); assert.equal(reads, 1);
  h.controller.render(); assert.ok(h.row("folder/child.txt"));
  h.controller.reset(); h.controller.render(); assert.equal(h.row("folder").attributes.get("aria-expanded"), "false");
});
test("folder await rechecks epoch and releases disabled row", async () => {
  const h = harness([entry("folder", "tree")]);
  h.load(async () => { h.epoch(); return { entries: [entry("child.txt")] }; });
  h.controller.render(); const row = h.row("folder"); await row.click();
  assert.equal(row.disabled, false); assert.equal(row.attributes.get("aria-expanded"), "false");
  assert.equal(h.root.querySelectorAll(".file-row").length, 1);
});
test("deleted row announces and restore delegates without opening", async () => {
  const h = harness(); h.state({ changes: new Map(), deleted: new Map([["a.txt", { version: 1, account: "a", repoId: 1, repo: "a/r", branch: "main", path: "a.txt", baseSha: "sha", original: "", content: "", updatedAt: 0, deleted: true }]]), drafted: [] });
  h.controller.render(); await h.row("a.txt").click();
  assert.deepEqual(h.calls, ["clear", "a.txt is deleted. Restore it to open it."]);
  await h.root.querySelectorAll(".file-restore")[0].click(); assert.equal(h.calls.at(-1), "restore");
});
test("new nested drafts create folders and preserve creation action", async () => {
  const h = harness([]); h.state({ changes: new Map(), deleted: new Map(), drafted: ["new/a.txt", "new/b.txt"] });
  h.controller.openFolder("new"); h.controller.render(); assert.ok(h.row("new/a.txt")); assert.ok(h.row("new/b.txt"));
  await h.root.querySelectorAll(".file-add")[0].click(); assert.deepEqual(h.calls, ["create"]);
});

test("new file click reads current draft scope and draft at click time", async () => {
  const h = harness([]);
  h.state({ changes: new Map(), deleted: new Map(), drafted: ["new.txt"] }); h.controller.render();
  const scope = { account: "a", repoId: 1, repo: "a/r", branch: "main" };
  const draft = { ...scope, version: 1 as const, path: "new.txt", baseSha: null, original: "", content: "new", updatedAt: 0 };
  h.ports.scope = () => scope;
  h.ports.draft = (actual, path) => { assert.equal(actual, scope); assert.equal(path, "new.txt"); return draft; };
  await h.row("new.txt").click(); assert.deepEqual(h.calls, ["clear", "intent new.txt", "draft"]);
});
for (const situation of ["deleted", "moved", "partial", "new"] as const) test(`folder markers preserve ${situation} branch contents`, () => {
  const h = harness([entry("folder", "tree")]);
  const marker = { version: 1 as const, account: "a", repoId: 1, repo: "a/r", branch: "main", path: "folder/a.txt", baseSha: "sha", original: "", content: "", updatedAt: 0, deleted: true as const };
  h.snapshot({ entries: [entry("folder", "tree")], tree: [entry("folder/a.txt"), ...(situation === "partial" ? [entry("folder/b.txt")] : [])] });
  h.state({
    changes: situation === "moved" ? new Map([["other.txt", { kind: "R", path: "other.txt", from: "folder/a.txt", drafts: [] }]]) : new Map(),
    deleted: new Map([[marker.path, { ...marker, ...(situation === "moved" ? { movedTo: "other.txt" } : {}) }]]),
    drafted: situation === "new" ? ["folder/new.txt"] : [],
  });
  h.controller.render();
  if (situation === "moved") assert.equal(h.controller.row("folder"), undefined);
  else assert.equal(h.row("folder").classes.has("is-deleted"), situation === "deleted");
});
test("failed folder load reports only current epoch and always enables row", async () => {
  for (const stale of [false, true]) {
    const h = harness([entry("folder", "tree")]);
    h.load(async () => { if (stale) h.epoch(); throw new Error("load failed"); });
    h.controller.render(); const row = h.row("folder"); await row.click();
    assert.equal(row.disabled, false); assert.equal(h.calls.includes("error"), !stale);
  }
});
