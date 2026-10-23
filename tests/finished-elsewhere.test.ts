// Notes of work that finished on another project or branch (src/finished-elsewhere.ts): kept per
// workspace, counted and named, gone once that workspace opens, and a clicked one opens its changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFinishedElsewhere, noteCount, noteWords, tileWords, type FinishedNote } from "../src/finished-elsewhere";
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

test("a workspace shown takes its note away; another branch's note stays", () => {
  const { list, drawn } = notes();
  list.add(main, "saved");
  list.add(feature, "added", { count: 2 });
  list.shown(githubScope(main));
  assert.deepEqual(list.notes().map((note) => note.scope.branch), ["feature"]);
  assert.equal(drawn.length, 3);
  // Nothing loaded yet, or a version view of feature: not feature shown.
  list.shown(undefined);
  list.shown({ ...githubScope(feature), view: "abc1234" });
  assert.equal(list.notes().length, 1);
  assert.equal(drawn.length, 3);
});

test("a note clicked opens its workspace, goes at once, and its changes open once its editor mounts", () => {
  const { list, opened, followed } = notes();
  list.add(feature, "saved", { commit });
  list.add(other, "agent");
  const note = list.notes().find((note) => note.scope.branch === "feature")!;
  list.open(note);
  assert.deepEqual(opened, [feature]);
  assert.deepEqual(list.notes().map((note) => note.scope.repo), ["lex/blog"]);
  // The repository's load begins with no branch yet, then the branch's.
  list.shown(undefined);
  list.shown(githubScope(feature));
  // Another workspace's editor first: nothing yet.
  const { host, clicks, total } = toolbar();
  list.mounted(main, host);
  assert.deepEqual(clicks, []);
  list.mounted(feature, host);
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
  list.shown(githubScope(other));
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
  list.shown(githubScope(main));
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
