import { test } from "node:test";
import assert from "node:assert/strict";
import { readStyleFiles, styleFileHold, type StyleDraft, type StyleFileReads } from "../src/native-style-files";

/** A small editor: pages link `linked`; `branch` is the repository's text; `drafts` are the editor's drafts. */
function editor(options: { linked: string[]; branch?: Record<string, string>; drafts?: Record<string, StyleDraft & { content?: string }>; unreadable?: string[]; imports?: Record<string, string[]> }) {
  const base = new Map<string, string>(), shown = new Set<string>(), missing = new Set<string>(), unreadable = new Set<string>(), reading = new Set<string>();
  const calls = { find: 0, readTexts: 0, wanted: 0, draft: 0 };
  // As main.ts: a stylesheet is a text source once shown with text (its draft's, or the branch's).
  const text = (path: string) => {
    const draft = options.drafts?.[path];
    if (draft?.deleted || draft?.opaque) return undefined;
    return draft ? draft.content ?? "" : base.get(path);
  };
  const sources = () => new Set([...shown].filter(path => text(path) !== undefined));
  const reads: StyleFileReads = {
    wanted() {
      calls.wanted++;
      const have = sources();
      const imported = options.linked.filter(path => have.has(path)).flatMap(path => options.imports?.[path] ?? []);
      return [...options.linked, ...imported].filter(path => !have.has(path));
    },
    skipped: path => missing.has(path) || unreadable.has(path) || reading.has(path),
    draft: path => { calls.draft++; return options.drafts?.[path]; },
    read: path => base.has(path),
    async find(path) { calls.find++; return options.branch?.[path] !== undefined || options.unreadable?.includes(path) ? { sha: `sha:${path}` } : undefined; },
    async readTexts(files) {
      calls.readTexts++;
      const texts = new Map<string, string>();
      for (const file of files) if (options.branch?.[file.path] !== undefined) texts.set(file.path, options.branch[file.path]);
      return { texts, unreadable: files.filter(file => options.unreadable?.includes(file.path)).map(file => ({ path: file.path, message: "Not text." })) };
    },
    live: () => true,
    reading: (paths, on) => paths.forEach(path => on ? reading.add(path) : reading.delete(path)),
    shown(path, value) { if (value !== undefined) base.set(path, value); shown.add(path); },
    missing: path => { missing.add(path); },
    unreadable: files => files.forEach(file => unreadable.add(file.path)),
  };
  return { reads, calls, shown, missing, unreadable, reading };
}

test("a stylesheet's hold: its draft, text already read, the branch, deleted, or no text at all", () => {
  assert.equal(styleFileHold(undefined, false), "branch");
  assert.equal(styleFileHold(undefined, true), "held");
  assert.equal(styleFileHold({}, false), "held");
  assert.equal(styleFileHold({ deleted: true }, true), "deleted");
  // An uploaded (opaque) draft has no text, even over text read from the branch.
  assert.equal(styleFileHold({ opaque: true }, false), "no-text");
  assert.equal(styleFileHold({ opaque: true }, true), "no-text");
});

test("an uploaded stylesheet draft is asked for once and never counts as loaded, so the preview stops reading (slice 101)", async () => {
  const e = editor({ linked: ["styles/site.css", "styles/media-player.css"], branch: { "styles/site.css": "body{}" },
    drafts: { "styles/media-player.css": { opaque: true } } });
  assert.equal(await readStyleFiles(e.reads), true, "the site's own stylesheet loads");
  assert.deepEqual([...e.shown], ["styles/site.css"]);
  assert.equal(e.calls.find, 1, "the upload is never looked up in the branch");
  // The preview refreshes after a load and reads again: nothing new, so it stops there.
  const wanted = e.calls.wanted;
  assert.equal(await readStyleFiles(e.reads), false);
  assert.equal(await readStyleFiles(e.reads), false);
  assert.equal(e.calls.wanted - wanted, 4, "each later pass looks once, then stops");
  assert.equal(e.calls.readTexts, 1);
  assert.deepEqual(e.reading, new Set(), "no path is left marked as being read");
});

test("a new stylesheet drafted as text is taken up once and then is a source", async () => {
  const e = editor({ linked: ["styles/media-player.css"], drafts: { "styles/media-player.css": { content: ".player{}" } } });
  assert.equal(await readStyleFiles(e.reads), true);
  assert.deepEqual([...e.shown], ["styles/media-player.css"]);
  assert.equal(e.calls.find, 0);
  assert.equal(await readStyleFiles(e.reads), false, "a second pass finds nothing to read");
});

test("imports of imports are followed a level at a time; missing and unreadable sheets are not asked again", async () => {
  const e = editor({ linked: ["styles/a.css", "styles/gone.css", "styles/bin.css"], imports: { "styles/a.css": ["styles/b.css"] },
    branch: { "styles/a.css": "@import 'b.css';", "styles/b.css": "p{}" }, unreadable: ["styles/bin.css"] });
  assert.equal(await readStyleFiles(e.reads), true);
  assert.deepEqual([...e.shown].sort(), ["styles/a.css", "styles/b.css"]);
  assert.deepEqual([...e.missing], ["styles/gone.css"]);
  assert.deepEqual([...e.unreadable], ["styles/bin.css"]);
  const finds = e.calls.find;
  assert.equal(await readStyleFiles(e.reads), false);
  assert.equal(e.calls.find, finds);
});

test("a deleted stylesheet draft is missing, and a pass that is no longer live stops", async () => {
  const e = editor({ linked: ["styles/old.css"], branch: { "styles/old.css": "p{}" }, drafts: { "styles/old.css": { deleted: true } } });
  assert.equal(await readStyleFiles(e.reads), false);
  assert.deepEqual([...e.missing], ["styles/old.css"]);
  assert.equal(e.calls.find, 0);
  const stale = editor({ linked: ["styles/site.css"], branch: { "styles/site.css": "body{}" } });
  stale.reads.live = () => false;
  assert.equal(await readStyleFiles(stale.reads), false);
  assert.deepEqual([...stale.shown], []);
  assert.deepEqual(stale.reading, new Set());
});

test("even a reader whose held sheet never becomes a source asks for it once per pass", async () => {
  // A guard against any other way a sheet can count as held without text: the pass still ends.
  const e = editor({ linked: ["styles/odd.css"], drafts: { "styles/odd.css": { content: "p{}" } } });
  e.reads.shown = () => {};
  assert.equal(await readStyleFiles(e.reads), true);
  assert.equal(e.calls.draft, 1);
});
