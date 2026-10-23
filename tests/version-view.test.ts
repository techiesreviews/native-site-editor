import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { createCommitHistory } from "../src/components/commit-history.ts";
import type { VersionCompare } from "../src/components/source-editor.ts";
import type { SavedDraft } from "../src/drafts.ts";
import type { VersionViewPorts } from "../src/version-view.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
import type { HistoryCommit, Repository, RestoreResult, Snapshot } from "../shared/types.ts";

// Just enough DOM for the version bar, its buttons and the History panel.
class FakeElement {
  children: unknown[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, () => void>();
  style: Record<string, string> = {};
  className = ""; textContent = ""; title = ""; type = "";
  open = false;
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  click() { this.listeners.get("click")?.(); }
  append(...children: unknown[]) { this.children.push(...children); }
  replaceChildren(...children: unknown[]) { this.children = children; }
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
  matches() { return this.open; }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
  getBoundingClientRect() { return { bottom: 40, right: 700, width: 300 }; }
}
const byId = new Map(["changes", "history-button"].map((id) => [id, new FakeElement()]));
const saved = ["document", "window", "innerWidth", "innerHeight"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const fakeGlobals = globalThis as Record<string, unknown>;
const body = new FakeElement();
fakeGlobals.document = { getElementById: (id: string) => byId.get(id) ?? null, createElement: () => new FakeElement(), body };
fakeGlobals.window = { addEventListener: () => {}, removeEventListener: () => {} };
fakeGlobals.innerWidth = 800; fakeGlobals.innerHeight = 600;
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createVersionView } = await import("../src/version-view.ts");
const { ApiError } = await import("../src/github-reads.ts");

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const REPO = { id: 501, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } } satisfies Repository;
const SNAPSHOT: Snapshot = { commit: "head", branch: "main", entries: [] };
const OLD: HistoryCommit = { sha: "a".repeat(40), message: "First words", author: "lex", date: "not a date", url: "" };
const SCOPE = { account: "lex", repoId: 501, repo: "lex/site", branch: "main" };
const RESULT: RestoreResult = { commit: "new", branch: "main", url: "", unchanged: false };
type HistoryOptions = Parameters<typeof createCommitHistory>[0];

/** `race` answers the version read at once and wraps the awaits named in `awaits` (src/version-view.ts). */
function fixture(race?: AwaitRace, awaits = ["api", "loadConfirmDialog", "ask", "postApi"]) {
  byId.get("changes")!.open = false;
  const wrap = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => race && awaits.includes(name) ? race.port(name, work) : work;
  const appStore = { openFile: signal<string | undefined>("index.html"), repository: signal<Repository | undefined>(REPO), snapshot: signal<Snapshot | undefined>(SNAPSHOT) };
  const session = createWorkspaceSession();
  const said: string[] = [], refused: string[] = [], compared: [string, VersionCompare | undefined][] = [], viewing: (HTMLElement | undefined)[] = [];
  const reads: { path: string; params?: Record<string, string>; answer: ReturnType<typeof deferred<unknown>> }[] = [];
  const posts: { path: string; body: unknown }[] = [], opened: string[] = [], snapshots: string[] = [];
  const histories: HistoryOptions[] = [];
  const drafts = new Map<string, SavedDraft>();
  const errors: unknown[] = [];
  let preview: VersionViewPorts["nativePreview"] = { setViewing: (bar) => { viewing.push(bar); } }, setup = "lex/site";
  let source = "<p>Now</p>", refreshes = 0, confirm = true, repositoryHolds = true, dialogs = 0;
  let restore: () => Promise<RestoreResult> = async () => RESULT;
  const read = (path: string, params?: Record<string, string>) => { const answer = deferred<unknown>(); reads.push({ path, params, answer }); return answer.promise; };
  const readNow = wrap("api", async (path: string, params?: Record<string, string>) => { reads.push({ path, params, answer: deferred() }); return { content: "<p>Then</p>" }; });
  const ask = wrap("ask", async () => confirm);
  const post = wrap("postApi", async (path: string, body: unknown) => { posts.push({ path, body }); return restore(); });
  const ports = {
    appStore, workspaceSession: session,
    guardedEdits: { stamp: () => ({ holds: () => repositoryHolds, changed: () => undefined }) },
    editorModule: { compareVersion: (path, version) => { compared.push([path, version]); } },
    get nativePreview() { return preview; },
    currentLoad: () => session.current().load,
    setupScope: () => setup,
    draftScope: () => SCOPE,
    draftStore: () => ({ get: (_scope, path) => drafts.get(path) }),
    nativeEffectiveSource: () => source,
    updateNativePreviewSources: () => { refreshes++; },
    loadHistory: async () => ({ createCommitHistory: (options: HistoryOptions) => {
      histories.push(options);
      return { root: {} as HTMLElement, destroy: () => {}, mark: () => {}, refresh: () => {} };
    } }),
    loadConfirmDialog: wrap("loadConfirmDialog", async () => ({ createConfirmDialog: () => { dialogs++; return { root: {} as HTMLElement, ask }; } })),
    api: <T,>(path: string, params?: Record<string, string>) => (race ? readNow(path, params) : read(path, params)) as Promise<T>,
    postApi: async <T,>(path: string, _params: Record<string, string>, body: unknown) => await post(path, body) as T,
    restoreFile: async (path) => { opened.push(path); appStore.openFile.value = path; },
    loadSnapshot: async (path) => { snapshots.push(path); },
    status: (message) => { said.push(message); },
    errorMessage: (error) => { errors.push(error); },
    refuse: (message) => { refused.push(message); },
  } satisfies VersionViewPorts;
  const versions = createVersionView(ports);
  return {
    versions, appStore, session, said, refused, compared, viewing, reads, posts, opened, snapshots, histories, drafts, errors,
    refreshes: () => refreshes,
    dialogs: () => dialogs,
    /** The host's preview now: none before the site's preview mounts. */
    setPreview: (next: VersionViewPorts["nativePreview"]) => { preview = next; },
    /** An account or branch switch that starts no new load. */
    switchSetup: (next: string) => { setup = next; },
    restoreWith: (next: () => Promise<RestoreResult>) => { restore = next; },
    edit: (next: string) => { source = next; },
    decline: () => { confirm = false; },
    moveRepository: () => { repositoryHolds = false; },
    /** Opens History and returns the options the panel was mounted with. */
    async history() { await versions.history.open(); return histories.at(-1)!; },
  };
}
/** Opens History and shows OLD on index.html; returns the panel's options. */
async function show(f: ReturnType<typeof fixture>) {
  const history = await f.history();
  history.onView(OLD, "head", false);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  return history;
}
// The bar's buttons: Back to latest, then Restore this version.
const click = (bar: HTMLElement | undefined, index: number) => (bar?.children[index] as HTMLElement).click();

test("an earlier version chosen in History shows in the preview and beside the code, and History marks it", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  assert.deepEqual(f.reads.map((read) => [read.path, read.params]), [["file-at", { repo: "lex/site", commit: OLD.sha, path: "index.html" }]]);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  assert.equal(f.versions.view?.content, "<p>Then</p>");
  assert.deepEqual(f.compared, [["index.html", { content: "<p>Then</p>", label: "aaaaaaa" }]]);
  assert.equal(f.refreshes(), 1);
  assert.equal(f.viewing.at(-1)?.getAttribute("aria-label"), "Earlier version");
  assert.equal(history.viewing(), OLD.sha);
});

test("Back to latest ends the version on show, and with none on show the latest commit ends nothing", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  click(f.viewing.at(-1), 1);
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.compared.at(-1), ["index.html", undefined]);
  assert.equal(f.viewing.at(-1), undefined);
  assert.equal(f.refreshes(), 2);
  history.onView(OLD, "head", true);
  assert.equal(f.compared.length, 2, "nothing on show: nothing to end");
});

test("a version answered after another file opened is dropped", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  f.appStore.openFile.value = "about.html";
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.compared, []);
});

test("the version on show ends once the file's source changes, without refreshing the preview again", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  f.versions.check();
  assert.ok(f.versions.view, "nothing changed: it stays");
  f.edit("<p>Edited</p>");
  f.versions.check();
  assert.equal(f.versions.view, undefined);
  assert.equal(f.refreshes(), 1);
});

test("a file chosen from the site's history opens and shows its version from that commit", async () => {
  const f = fixture(), history = await f.history();
  history.onOpenFile("about.html", OLD, "head");
  await flush();
  assert.deepEqual(f.opened, ["about.html"]);
  assert.equal(f.reads[0].params?.path, "about.html");
  f.reads[0].answer.resolve({ content: "<p>About then</p>" });
  await flush();
  assert.equal(f.versions.view?.path, "about.html");
  assert.equal(f.versions.view?.content, "<p>About then</p>");
});

test("a file chosen at the branch's latest commit opens without a read and ends the version on show", async () => {
  const f = fixture(), history = await show(f);
  history.onOpenFile("about.html", { ...OLD, sha: "head" }, "head");
  await flush();
  assert.deepEqual(f.opened, ["about.html"]);
  assert.equal(f.reads.length, 1);
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.compared.at(-1), ["index.html", undefined]);
});

test("choosing the latest commit in History ends the version on show", async () => {
  const f = fixture(), history = await show(f);
  history.onView({ ...OLD, sha: "head" }, "head", true);
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.compared.at(-1), ["index.html", undefined]);
  assert.equal(f.refreshes(), 2);
});

test("a newer choice supersedes an older one answered later", async () => {
  const f = fixture(), history = await f.history();
  const other = { ...OLD, sha: "b".repeat(40), message: "Second words" };
  history.onView(OLD, "head", false);
  history.onView(other, "head", false);
  f.reads[1].answer.resolve({ content: "<p>Second</p>" });
  await flush();
  f.reads[0].answer.resolve({ content: "<p>First</p>" });
  await flush();
  assert.equal(f.versions.view?.commit.sha, other.sha);
  assert.equal(f.versions.view?.content, "<p>Second</p>");
  assert.equal(f.compared.length, 1);
});

test("a version answered after a new workspace load is dropped", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  f.session.next(undefined);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.compared, []);
});

test("a version read writes nothing once the file, the load or a newer choice moved on while it was read", async () => {
  const moves = [
    (f: ReturnType<typeof fixture>) => { f.appStore.openFile.value = "about.html"; },
    (f: ReturnType<typeof fixture>) => { f.session.next(undefined); },
    (f: ReturnType<typeof fixture>) => { f.versions.end(); },
  ];
  for (const move of moves) {
    const points = await forEachAwait(
      (race) => {
        const f = fixture(race, ["api"]);
        return { f, done: f.history().then(async (history) => { history.onView(OLD, "head", false); await flush(); }) };
      },
      ({ f }) => move(f),
      ({ f }) => {
        assert.equal(f.versions.view, undefined);
        assert.deepEqual(f.compared, []);
        assert.deepEqual(f.said, []);
        assert.equal(f.refreshes(), 0);
      },
    );
    assert.equal(points, 1);
  }
});

test("a restore writes nothing once the version on show ended during its awaits", async () => {
  const points = await forEachAwait(
    (race) => {
      const f = fixture(race, ["loadConfirmDialog", "ask", "postApi"]), at = { said: 0, posts: 0, compared: 0 };
      const done = f.history().then(async (history) => {
        history.onView(OLD, "head", false);
        await flush();
        click(f.viewing.at(-1), 2);
        await flush();
      });
      return { f, at, done };
    },
    ({ f, at }) => {
      f.versions.end();
      Object.assign(at, { said: f.said.length, posts: f.posts.length, compared: f.compared.length });
    },
    ({ f, at }) => {
      assert.equal(f.said.length, at.said);
      assert.equal(f.posts.length, at.posts);
      assert.equal(f.compared.length, at.compared);
      assert.deepEqual(f.snapshots, []);
    },
  );
  assert.equal(points, 3);
});

test("Restore this version asks, commits against the head it showed, then reloads the snapshot", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  click(f.viewing.at(-1), 2);
  await flush();
  assert.deepEqual(f.posts, [{ path: "restore", body: { branch: "main", path: "index.html", target: OLD.sha, expectedHead: "head" } }]);
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.snapshots, ["index.html"]);
  assert.deepEqual(f.said, ["Restoring file…", "Restored index.html in a new commit. Other files are unchanged."]);
});

test("Restore refuses over the file's draft, and stops when declined or once the repository moved", async () => {
  for (const block of ["draft", "decline", "moved"] as const) {
    const f = fixture(), history = await f.history();
    history.onView(OLD, "head", false);
    f.reads[0].answer.resolve({ content: "<p>Then</p>" });
    await flush();
    if (block === "draft") f.drafts.set("index.html", { ...SCOPE, version: 1, path: "index.html", baseSha: "b", original: "", content: "", updatedAt: 0 });
    if (block === "decline") f.decline();
    if (block === "moved") f.moveRepository();
    click(f.viewing.at(-1), 2);
    await flush();
    assert.deepEqual(f.posts, [], block);
    assert.ok(f.versions.view, block);
    assert.deepEqual(f.refused, block === "draft" ? ["Publish or discard this file’s draft before restoring. Other files’ drafts are kept."] : [], block);
  }
});

test("a restore from the History panel ends the version on show and reloads", async () => {
  const f = fixture(), history = await f.history();
  history.onView(OLD, "head", false);
  f.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  await history.onRestored(RESULT);
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.snapshots, ["index.html"]);
});

test("a failed restore says why and keeps the version on show", async () => {
  const f = fixture();
  await show(f);
  f.restoreWith(async () => { throw new Error("Head moved on."); });
  click(f.viewing.at(-1), 2);
  await flush();
  assert.equal(f.said.at(-1), "Head moved on.");
  assert.ok(f.versions.view);
  assert.deepEqual(f.snapshots, []);
});

test("restoring a version the file already matches does not reload the snapshot", async () => {
  const f = fixture();
  await show(f);
  f.restoreWith(async () => ({ ...RESULT, unchanged: true }));
  click(f.viewing.at(-1), 2);
  await flush();
  assert.deepEqual(f.snapshots, []);
  assert.equal(f.said.at(-1), "This file already matches that version.");
  assert.equal(f.versions.view, undefined);
});

test("a second Restore reuses the one confirm dialog", async () => {
  const f = fixture(), appended = body.children.length;
  await show(f);
  f.decline();
  click(f.viewing.at(-1), 2);
  await flush();
  click(f.viewing.at(-1), 2);
  await flush();
  assert.equal(f.dialogs(), 1);
  assert.equal(body.children.length, appended + 1);
  assert.deepEqual(f.posts, []);
});

test("a restore History made beside a draft says the draft was kept", async () => {
  const f = fixture(), history = await f.history();
  f.drafts.set("index.html", { ...SCOPE, version: 1, path: "index.html", baseSha: "b", original: "", content: "", updatedAt: 0 });
  history.onRestoreSkipped({ ...RESULT, unchanged: false });
  assert.equal(f.said.at(-1), "Restored index.html in a new commit; reload before saving. Your draft was kept.");
});

test("an expired GitHub session in History asks to connect again", async () => {
  const f = fixture(), history = await f.history();
  history.onExpired();
  const [error] = f.errors;
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 401);
});

test("the version on show ends once the setup scope changes, and an answer after that writes nothing", async () => {
  const f = fixture();
  await show(f);
  f.switchSetup("lex/other");
  f.versions.check();
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.compared.at(-1), ["index.html", undefined]);
  const late = fixture(), history = await late.history();
  history.onView(OLD, "head", false);
  late.switchSetup("lex/other");
  late.reads[0].answer.resolve({ content: "<p>Then</p>" });
  await flush();
  assert.equal(late.versions.view, undefined);
  assert.deepEqual(late.compared, []);
  assert.deepEqual(late.viewing, []);
});

test("the preview is read when the version shows or ends, not when the view is made", async () => {
  const f = fixture();
  f.setPreview(undefined);
  const history = await show(f);
  assert.ok(f.versions.view, "the code pane still compares without a preview");
  assert.deepEqual(f.viewing, []);
  const bars: (HTMLElement | undefined)[] = [];
  f.setPreview({ setViewing: (bar) => { bars.push(bar); } });
  history.onView({ ...OLD, sha: "b".repeat(40) }, "head", false);
  f.reads[1].answer.resolve({ content: "<p>Second</p>" });
  await flush();
  assert.equal(bars.length, 2);
  assert.equal(bars[0], undefined);
  assert.equal(bars[1]?.getAttribute("aria-label"), "Earlier version");
  click(bars[1], 1);
  assert.deepEqual(bars.slice(2), [undefined]);
  assert.equal(f.versions.view, undefined);
  assert.deepEqual(f.viewing, []);
});
