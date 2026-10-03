import assert from "node:assert/strict";
import test from "node:test";
import { fuzzyMatch, groupRanked, markRuns, parseQuery, pushRecent, rankItems, type Searchable } from "../src/page-builder/palette-search.ts";
import { availableCommands, guardCommand, keyCaps, keyLabel, matchesKeys, registerCommand, registerCommandSource, registerShortcut, resetCommands, runCommand, shortcutSheet, type Command } from "../src/page-builder/commands.ts";

test("fuzzy matching finds letters in order and prefers word starts and runs", () => {
  assert.equal(fuzzyMatch("xyz", "Publish changes"), undefined);
  // Letters out of order do not match.
  assert.equal(fuzzyMatch("cp", "Publish changes"), undefined);
  // Word starts: "pc" picks P(ublish) and c(hanges), not the c in "Publish".
  assert.deepEqual(fuzzyMatch("pc", "Publish changes")?.indices, [0, 8]);
  // A run beats scattered letters.
  assert.deepEqual(fuzzyMatch("hang", "Publish changes")?.indices, [9, 10, 11, 12]);
  // Case does not matter; the text's own case is kept for the word starts.
  assert.deepEqual(fuzzyMatch("fb", "FeatureBlock")?.indices, [0, 7]);
  // Prefix and exact matches score above a match in the middle.
  const prefix = fuzzyMatch("about", "About us")!.score;
  const middle = fuzzyMatch("about", "Read about us")!.score;
  assert.ok(prefix > middle);
  assert.ok(fuzzyMatch("undo", "Undo")!.score > fuzzyMatch("undo", "Undo all")!.score);
  assert.deepEqual(fuzzyMatch("", "anything"), { score: 0, indices: [] });
});

const items: Searchable[] = [
  { id: "a", title: "Hide code", group: "Actions", keywords: ["toggle"] },
  { id: "b", title: "About", hint: "/about/", group: "Pages" },
  { id: "c", title: "styles.css", hint: "styles", group: "Files" },
  { id: "d", title: "Add Feature block", hint: "<feature-block>", group: "Components" },
  { id: "e", title: "Home", hint: "/", group: "Pages" },
];

test("ranking needs every word, searches hints and keywords, and lifts recent items", () => {
  assert.deepEqual(rankItems(items, "about").map((r) => r.item.id), ["b"]);
  // Every word must match somewhere.
  assert.deepEqual(rankItems(items, "add feat").map((r) => r.item.id), ["d"]);
  assert.deepEqual(rankItems(items, "add zzz").map((r) => r.item.id), []);
  // A hint: the URL finds the page, with the hint's letters marked.
  const byUrl = rankItems(items, "/about");
  assert.equal(byUrl[0].item.id, "b");
  assert.deepEqual(byUrl[0].hint, [0, 1, 2, 3, 4, 5]);
  // Letters scattered through the middle of words are no match.
  const files: Searchable[] = [{ id: "s", title: "site.css", group: "Files" }, { id: "j", title: "components.js", group: "Files" }];
  assert.deepEqual(rankItems(files, "css").map((r) => r.item.id), ["s"]);
  // One letter finds the words it starts, the text that starts with it first.
  assert.deepEqual(rankItems(files, "c").map((r) => r.item.id), ["j", "s"]);
  assert.deepEqual(rankItems(files, "o").map((r) => r.item.id), []);
  // A keyword from its start.
  assert.deepEqual(rankItems(items, "togg").map((r) => r.item.id), ["a"]);
  assert.deepEqual(rankItems(items, "oggle").map((r) => r.item.id), []);
  // With no query everything, recent first, then in the given order.
  assert.deepEqual(rankItems(items, "", ["c", "e"]).map((r) => r.item.id), ["c", "e", "a", "b", "d"]);
  // Recent items rank first among equally good matches.
  const two: Searchable[] = [{ id: "x", title: "Open one", group: "Files" }, { id: "y", title: "Open two", group: "Files" }];
  assert.deepEqual(rankItems(two, "open", ["y"]).map((r) => r.item.id), ["y", "x"]);
});

test("groups come where their best item ranks, with a limit each", () => {
  const ranked = rankItems(items, "");
  const groups = groupRanked(ranked, { Pages: 1 });
  assert.deepEqual(groups.map((g) => [g.group, g.items.map((r) => r.item.id)]), [
    ["Actions", ["a"]], ["Pages", ["b"]], ["Files", ["c"]], ["Components", ["d"]],
  ]);
});

test("recent list, highlight runs and query prefixes", () => {
  assert.deepEqual(pushRecent(["a", "b", "c"], "c", 3), ["c", "a", "b"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
  assert.deepEqual(markRuns("About", [0, 1, 4]), [{ text: "Ab", marked: true }, { text: "ou", marked: false }, { text: "t", marked: true }]);
  assert.deepEqual(parseQuery("> undo"), { scope: "actions", text: "undo" });
  assert.deepEqual(parseQuery("/about"), { scope: "pages", text: "/about" });
  assert.deepEqual(parseQuery("/"), { scope: "pages", text: "" });
  assert.deepEqual(parseQuery(" hero ", "go"), { scope: "go", text: "hero" });
});

test("the registry lists available commands, sources and shortcuts", async () => {
  resetCommands();
  let ran = "";
  let open = true;
  const remove = registerCommand({ id: "x.save", title: "Publish", group: "Actions", shortcut: [["Mod", "S"]], run: () => { ran = "save"; } });
  registerCommand({ id: "x.hidden", title: "Hidden", group: "Actions", when: () => open, run: () => {} });
  registerCommand({ id: "x.broken", title: "Broken", group: "Actions", when: () => { throw new Error("no"); }, run: () => {} });
  registerCommandSource(() => [{ id: "page:a", title: "A", group: "Pages", run: () => { ran = "a"; } }, { id: "x.save", title: "Dupe", group: "Pages", run: () => {} }]);
  registerShortcut({ area: "Canvas", label: "Move", keys: [["Alt", "ArrowUp"]] });
  assert.deepEqual(availableCommands().map((c: Command) => c.id), ["x.save", "x.hidden", "page:a"]);
  open = false;
  assert.deepEqual(availableCommands().map((c: Command) => c.id), ["x.save", "page:a"]);
  assert.equal(await runCommand("page:a"), true);
  assert.equal(ran, "a");
  assert.equal(await runCommand("x.hidden"), false);
  assert.deepEqual(shortcutSheet().map((area) => [area.area, area.entries.map((entry) => entry.label)]), [["Actions", ["Publish"]], ["Canvas", ["Move"]]]);
  // Removed, its id is free: the source's command with that id shows.
  remove();
  assert.deepEqual(availableCommands().map((c: Command) => [c.id, c.title]), [["page:a", "A"], ["x.save", "Dupe"]]);
  resetCommands();
});

test("keys show and match per platform", () => {
  assert.deepEqual(keyCaps(["Mod", "Shift", "Z"], true), ["⌘", "⇧", "Z"]);
  assert.deepEqual(keyCaps(["Mod", "Shift", "Z"], false), ["Ctrl", "Shift", "Z"]);
  assert.deepEqual(keyCaps(["Alt", "ArrowUp"], true), ["⌥", "↑"]);
  assert.equal(keyLabel(["Mod", "K"], true), "⌘K");
  assert.equal(keyLabel(["Mod", "K"], false), "Ctrl+K");
  const press = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) =>
    ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  assert.equal(matchesKeys(press("k", { metaKey: true }), ["Mod", "K"], true), true);
  assert.equal(matchesKeys(press("k", { ctrlKey: true }), ["Mod", "K"], true), false);
  assert.equal(matchesKeys(press("k", { ctrlKey: true }), ["Mod", "K"], false), true);
  assert.equal(matchesKeys(press("K", { ctrlKey: true, shiftKey: true }), ["Mod", "K"], false), false);
  assert.equal(matchesKeys(press("Z", { metaKey: true, shiftKey: true }), ["Mod", "Shift", "Z"], true), true);
  // "?" comes with Shift held on most layouts.
  assert.equal(matchesKeys(press("?", { shiftKey: true }), ["?"], true), true);
  assert.equal(matchesKeys(press("Enter", { shiftKey: true }), ["Shift", "Enter"], false), true);
  assert.equal(matchesKeys(press("Enter"), ["Shift", "Enter"], false), false);
});


test("source guards reject stale insertion closures and selection changes", async () => {
  let source = "<section>Old</section><p>Text</p>";
  let selection = "section:0";
  const capturedSource = source;
  const capturedSelection = selection;
  const offset = source.indexOf("<p>");
  let rejected = 0;
  const duplicate = guardCommand(() => {
    source = source.slice(0, offset) + "<section>Old</section>" + source.slice(offset);
  }, () => source === capturedSource && selection === capturedSelection, () => { rejected++; });
  source = "<section>Longer replacement</section><p>Text</p>";
  const changed = source;
  await duplicate();
  assert.equal(source, changed);
  assert.equal(rejected, 1);
  source = capturedSource;
  selection = "section:1";
  await duplicate();
  assert.equal(source, capturedSource);
  assert.equal(rejected, 2);
  selection = capturedSelection;
  await duplicate();
  assert.equal(source, "<section>Old</section><section>Old</section><p>Text</p>");
});
