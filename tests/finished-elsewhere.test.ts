// Notes of work that finished on another project or branch (src/finished-elsewhere.ts): kept per
// workspace, counted and named, gone once that workspace opens, and a clicked one opens its changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFinishedElsewhere, noteCount, noteWords, openLink, tileWords, type FinishedNote } from "../src/finished-elsewhere";
import type { Repository } from "../shared/types";
import { githubScope } from "../src/workspace-session";
import type { DraftScope } from "../src/drafts";
import type { SavedCommit } from "../src/components/site-actions";

const main: DraftScope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const feature: DraftScope = { ...main, branch: "feature" };
const other: DraftScope = { account: "lex", repoId: 2, repo: "lex/blog", branch: "main" };
const commit: SavedCommit = { repo: "lex/site", commit: "abc1234", url: "https://github.com/lex/site/commit/abc1234" };

function notes() {
  const drawn: (readonly FinishedNote[])[] = [], opened: DraftScope[] = [], followed: [SavedCommit, DraftScope][] = [];
  const list = createFinishedElsewhere({
    draw: (notes) => drawn.push(notes),
    open: (scope) => opened.push(scope),
    follow: (commit, scope) => followed.push([commit, scope]),
  });
  return { list, drawn, opened, followed };
}

// A toolbar with the Publish panel's caret and its folded changes; the panel open when `shown`.
function toolbar(disabled = false, shown = false) {
  const clicks: string[] = [];
  const more = { disabled, click: () => clicks.push("more") };
  const total = { open: false };
  const host = {
    querySelector: (selector: string) =>
      selector.startsWith(".publish-menu__more") ? (selector.includes(":not(:disabled)") && more.disabled ? null : more)
      : selector === ".publish-menu__total" ? total
      : selector === ".publish-menu__panel:popover-open" && shown ? {} : null,
  };
  // eslint-disable-next-line no-restricted-syntax -- only the three elements the note reads; querySelector's overloads cannot be satisfied by a fake.
  return { host: host as unknown as ParentNode, clicks, total };
}

test("work on one workspace adds up in one note, the latest workspace first", () => {
  const { list, drawn } = notes();
  list.add(main, "saved", { commit });
  list.add(other, "agent");
  list.add({ ...main, account: "Lex" }, "added", { count: 3 });
  assert.equal(list.notes().length, 2);
  const [first, second] = list.notes();
  assert.deepEqual(first.scope, main);
  assert.deepEqual(first.done, { saved: 1, added: 3, agent: 0 });
  assert.equal(first.commit, commit);
  assert.equal(noteWords(first), "Saved, 3 files added");
  assert.equal(noteWords(second), "Agent changes waiting");
  assert.equal(noteCount(list.notes()), 5);
  assert.equal(drawn.length, 3);
});

test("words for one and many", () => {
  const { list } = notes();
  list.add(main, "added");
  list.add(feature, "saved");
  list.add(feature, "saved");
  assert.deepEqual(list.notes().map(noteWords), ["Saved 2 times", "1 file added"]);
  list.add(main, "added", { count: 0 });
  assert.equal(noteCount(list.notes()), 3);
});

test("a workspace shown again (its editor mounted) takes its note away; a load that only began does not", () => {
  const { list, drawn } = notes();
  list.add(main, "saved");
  list.add(feature, "added", { count: 2 });
  // A load of main began, and may yet fail: its note stays.
  list.loading(githubScope(main));
  assert.equal(list.notes().length, 2);
  const { host } = toolbar();
  list.mounted(main, host);
  assert.deepEqual(list.notes().map((note) => note.scope.branch), ["feature"]);
  assert.equal(drawn.length, 3);
  list.mounted(undefined, host);
  assert.equal(list.notes().length, 1);
  assert.equal(drawn.length, 3);
});

test("a note clicked opens its workspace, and once its editor mounts the note goes and its changes open", () => {
  const { list, opened, followed } = notes();
  list.add(feature, "saved", { commit });
  list.add(other, "agent");
  const note = list.notes().find((note) => note.scope.branch === "feature")!;
  list.open(note);
  assert.deepEqual(opened, [feature]);
  // Until it is shown, the note stays: a click that opened nothing leaves it to click again.
  assert.equal(list.notes().length, 2);
  // The repository's load begins with no branch yet, then the branch's.
  list.loading(undefined);
  list.loading(githubScope(feature));
  // Another workspace's editor first: nothing yet.
  const { host, clicks, total } = toolbar();
  list.mounted(main, host);
  assert.deepEqual(clicks, []);
  list.mounted(feature, host);
  assert.deepEqual(list.notes().map((note) => note.scope.repo), ["lex/blog"]);
  assert.deepEqual(followed, [[commit, feature]]);
  assert.deepEqual(clicks, ["more"]);
  assert.equal(total.open, true);
  // Once only.
  list.mounted(feature, host);
  assert.deepEqual(clicks, ["more"]);
});

test("a note clicked and then left for another workspace opens nothing there later", () => {
  const { list, followed } = notes();
  list.add(feature, "added", { count: 1 });
  list.open(list.notes()[0]);
  list.loading(githubScope(other));
  const { host, clicks } = toolbar();
  list.mounted(feature, host);
  assert.deepEqual(clicks, []);
  assert.deepEqual(followed, []);
});

test("with nothing to show, the Publish caret stays shut", () => {
  const { list } = notes();
  list.add(feature, "agent");
  list.open(list.notes()[0]);
  const { host, clicks, total } = toolbar(true);
  list.mounted(feature, host);
  assert.deepEqual(clicks, []);
  assert.equal(total.open, true);
});

test("a second delivery of an agent command already noted is no new work", () => {
  const { list, drawn } = notes();
  list.add(main, "agent", { id: "edit-1" });
  list.add(main, "agent", { id: "edit-1" });
  list.add(main, "agent", { id: "edit-2" });
  assert.deepEqual(list.notes().map((note) => note.done.agent), [2]);
  assert.equal(drawn.length, 2);
  // Still once after its workspace was shown and left again.
  list.mounted(main, toolbar().host);
  list.add(main, "agent", { id: "edit-1" });
  assert.deepEqual(list.notes(), []);
});

test("a Publish panel already open is left open", () => {
  const { list } = notes();
  list.add(feature, "added");
  list.open(list.notes()[0]);
  const { host, clicks, total } = toolbar(false, true);
  list.mounted(feature, host);
  assert.deepEqual(clicks, []);
  assert.equal(total.open, true);
});

test("the menu's tile: a waiting question takes its corner, and its name says both", () => {
  const blog = { id: 2, full_name: "lex/blog" } satisfies Pick<Repository, "id" | "full_name">;
  const { list } = notes();
  list.add(main, "saved");
  list.add({ ...other, repo: "" }, "agent");
  const open = { repoId: main.repoId, repo: main.repo };
  // The other repository by its name from the list, even when the note has none.
  // eslint-disable-next-line no-restricted-syntax -- tileWords reads only a repository's id and full name.
  const listed = [blog as unknown as Repository];
  assert.deepEqual(tileWords(0, list.notes(), open, listed), { words: " — Agent changes waiting on lex/blog (main); Saved on main", counted: true });
  assert.deepEqual(tileWords(1, list.notes(), open, listed), {
    words: " — an agent asks you a question — Agent changes waiting on lex/blog (main); Saved on main", counted: false,
  });
  assert.deepEqual(tileWords(2, [], open, listed), { words: " — agents ask you 2 questions", counted: false });
  assert.deepEqual(tileWords(0, [], open, listed), { words: "", counted: false });
});

test("a note's workspace link opens it, and a link already in the address bar opens it again", () => {
  const sent: string[] = [];
  const win = { location: { hash: "#repo=1&branch=feature" }, dispatchEvent: (event: Event) => { sent.push(event.type); return true; } };
  openLink(main, win);
  assert.equal(win.location.hash, "repo=1&branch=main");
  assert.deepEqual(sent, []);
  // A folder's view or a load not remembered yet leaves the link as it is: no hashchange would come.
  win.location.hash = "#repo=1&branch=main";
  openLink(main, win);
  assert.equal(win.location.hash, "#repo=1&branch=main");
  assert.deepEqual(sent, ["hashchange"]);
});

test("an agent's write is noted only when it changed the draft there", async () => {
  const { list } = notes();
  const drafts = new Map<string, { updatedAt: number }>([["index.html", { updatedAt: 1 }]]);
  const draft = (_scope: DraftScope, path: string) => drafts.get(path);
  const outcome = { message: "Changed" };
  // A fresh write: its draft changed.
  await list.agent(main, { id: "a", path: "index.html" }, draft, async () => { drafts.set("index.html", { updatedAt: 2 }); return outcome; })();
  // A second delivery recorded before (applied while main was shown): its draft as it was.
  await list.agent(main, { id: "b", path: "index.html" }, draft, async () => outcome)();
  // Text that is the branch's own: no draft left.
  await list.agent(main, { id: "c", path: "robots.txt" }, draft, async () => outcome)();
  // Finished on show (nothing elsewhere), or with no scope read.
  await list.agent(main, { id: "d", path: "index.html" }, draft, async () => { drafts.set("index.html", { updatedAt: 3 }); return undefined; })();
  await list.agent(undefined, { id: "e", path: "index.html" }, draft, async () => { drafts.set("index.html", { updatedAt: 4 }); return outcome; })();
  assert.deepEqual(list.notes().map((note) => note.done), [{ saved: 0, added: 0, agent: 1 }]);
});
