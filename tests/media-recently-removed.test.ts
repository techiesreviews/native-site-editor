import test from "node:test";
import assert from "node:assert/strict";
import { removalNotice, removedMembersLabel, removedMessage, removedRows, restoreRefusal } from "../src/page-builder/media-recently-removed";

const today = "2026-10-14";

test("rows show the removal date, the days left and the restore identity", () => {
  const rows = removedRows([
    { path: "images/a.png", sha: "blob-a", date: "2026-10-14", family: [{ path: "images/a-480.png", sha: "blob-c" }, { path: "media/originals/a.heic", sha: "blob-o" }] },
    { path: "images/b.svg", browserKey: "removed:2026-10-13:blob-b", date: "2026-10-13" },
    { path: "docs/c.pdf", sha: "blob-c", date: "2026-09-20" },
    { path: "images/d.png", sha: "blob-d", date: "2026-09-14" },
    { path: "images/broken.png", date: "2026-10-14" },
  ], today);
  assert.deepEqual(rows.map(row => [row.name, row.id, row.when, row.left, row.members, row.browserOnly]), [
    ["a.png", "blob-a", "Removed today", "30 days left", 2, false],
    ["b.svg", "removed:2026-10-13:blob-b", "Removed yesterday", "29 days left", 0, true],
    ["c.pdf", "blob-c", "Removed 20 Sept", "6 days left", 0, false],
    ["d.png", "blob-d", "Removed 14 Sept", "Last day", 0, false],
  ]);
  assert.equal(rows.find(row => row.name === "c.pdf")!.left, "6 days left");
  assert.equal(removedMembersLabel(0), "");
  assert.equal(removedMembersLabel(1), "Comes back with its 1 copy");
  assert.equal(removedMembersLabel(3), "Comes back with its 3 copies");
  assert.equal(removedRows([{ path: "x.png", sha: "s", date: "2026-10-13" }], "2026-10-14")[0].left, "29 days left");
  assert.equal(removedRows([{ path: "x.png", sha: "s", date: "2026-09-15" }], "2026-10-14")[0].left, "1 day left");
});

test("a used file's notice names its pages once and says their pictures break; Remove stays allowed", () => {
  const usage = {
    "images/a.png": { pages: ["index.html", "about/index.html"], files: ["index.html", "about/index.html", "styles.css"], alts: [] },
    "images/b.png": { pages: ["index.html"], files: ["index.html"], alts: [] },
  };
  const one = removalNotice(["images/b.png"], usage);
  assert.equal(one.title, "Remove b.png?");
  assert.equal(one.used, true);
  assert.deepEqual(one.pages, ["index.html"]);
  assert.equal(one.warning, "1 page uses this file. The picture on it will break until you choose another picture or restore it. Open a page to swap the picture first, or remove it anyway.");
  assert.equal(one.confirm, "Remove file");
  assert.match(one.note, /^It stays in More → Recently removed for 30 days/);
  const both = removalNotice(["images/a.png", "images/b.png"], usage);
  assert.equal(both.title, "Remove 2 files?");
  assert.deepEqual(both.pages, ["index.html", "about/index.html"]);
  assert.deepEqual(both.others, ["styles.css"]);
  assert.match(both.warning, /^2 pages use these files\. Their pictures will break until you choose another picture or restore them\./);
  assert.equal(both.confirm, "Remove 2 files");
});

test("an unused file's notice says so; one mentioned elsewhere names those files", () => {
  const usage = { "a.png": { pages: [], files: [], alts: [] }, "b.png": { pages: [], files: ["data.json"], alts: [] } };
  assert.equal(removalNotice(["a.png"], usage).warning, "Nothing on the site uses this file.");
  assert.equal(removalNotice(["c.png"], usage).used, false);
  const mentioned = removalNotice(["b.png"], usage);
  assert.equal(mentioned.warning, "No page uses this file, but other site files mention it.");
  assert.deepEqual(mentioned.others, ["data.json"]);
});

test("messages after removing and refusals when restoring are plain", () => {
  assert.equal(removedMessage(["images/a.png"]), "Removed a.png. Restore it from More → Recently removed.");
  assert.equal(removedMessage(["a.png", "b.png"]), "Removed 2 files. Restore them from More → Recently removed.");
  assert.equal(restoreRefusal(new Error("images/a-480.png already exists."), "images/a.png"),
    "a.png cannot come back: images/a-480.png is there now. Rename or remove that file first, then restore.");
  assert.equal(restoreRefusal(new Error("a.png was kept in this browser only and its copy is gone."), "a.png"), "a.png was kept in this browser only and its copy is gone.");
  assert.equal(restoreRefusal("odd", "images/a.png"), "a.png could not be restored.");
});
