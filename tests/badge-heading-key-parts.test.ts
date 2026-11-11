import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_KINDS, BADGE_TONES, COUNT_LIMIT, badgeKind, badgeMarkup, badgeTone, countText } from "../src/ui/parts/badge-options.ts";
import { keyList, keyMarkup } from "../src/ui/parts/key-options.ts";
import { DEFAULT_HEADING_LEVEL, HEADING_LEVELS, headingLevel, sectionHeadingMarkup } from "../src/ui/parts/section-heading-options.ts";
import { escapeWords } from "../src/ui/parts/escape.ts";
import { PARTS, isPart } from "../src/catalogue/parts.ts";

// The Badge, Section heading and Keyboard key parts (atomic catalogue ticket 13): options become markup with one class
// per part, the variants as data attributes and the words escaped.

test("escape: the characters that could end text or an attribute", () => {
  assert.equal(escapeWords(`<b a="1">&'`), "&lt;b a=&quot;1&quot;&gt;&amp;&#39;");
  assert.equal(escapeWords("plain"), "plain");
});

test("badge: kinds and tones are the set, anything else is the default", () => {
  assert.deepEqual([...BADGE_KINDS], ["count", "status", "tag", "dot", "mark"]);
  assert.deepEqual([...BADGE_TONES], ["neutral", "action", "warning", "question", "success", "danger"]);
  for (const kind of BADGE_KINDS) assert.equal(badgeKind(kind), kind);
  for (const tone of BADGE_TONES) assert.equal(badgeTone(tone), tone);
  assert.equal(badgeKind(undefined), "tag");
  assert.equal(badgeKind("pill"), "tag");
  assert.equal(badgeTone(undefined), "neutral");
  assert.equal(badgeTone("purple"), "neutral");
});

test("badge: one class, the kind and the tone as data, the words as text", () => {
  assert.equal(badgeMarkup({ kind: "tag", tone: "warning", words: "Unsaved" }), '<span class="ui-badge" data-kind="tag" data-tone="warning">Unsaved</span>');
  assert.equal(badgeMarkup({ kind: "status", tone: "success", words: " Saved " }), '<span class="ui-badge" data-kind="status" data-tone="success">Saved</span>');
  assert.equal(badgeMarkup(), '<span class="ui-badge" data-kind="tag" data-tone="neutral"></span>', "no options: an empty neutral tag");
  assert.equal(badgeMarkup({ kind: "sideways", tone: "loud", words: "x" }), badgeMarkup({ words: "x" }), "unknown options fall back to the defaults");
  for (const kind of BADGE_KINDS) for (const tone of BADGE_TONES) {
    const markup = badgeMarkup({ kind, tone, words: "Name" });
    assert.ok(markup.includes(`data-kind="${kind}" data-tone="${tone}"`), `${kind} ${tone}`);
    assert.equal([...markup.matchAll(/class="/g)].length, 1, "one class and no modifier classes");
  }
});

test("badge: words are escaped", () => {
  assert.equal(badgeMarkup({ words: "<img src=x onerror=1>" }), '<span class="ui-badge" data-kind="tag" data-tone="neutral">&lt;img src=x onerror=1&gt;</span>');
  assert.ok(badgeMarkup({ kind: "dot", words: 'say "hi"' }).includes('aria-label="say &quot;hi&quot;"'));
});

test("badge count: a whole number up to the limit, 99+ above, 0 for nothing, other words kept", () => {
  assert.equal(COUNT_LIMIT, 99);
  assert.equal(countText("3"), "3");
  assert.equal(countText("099"), "99");
  assert.equal(countText("99"), "99");
  assert.equal(countText("100"), "99+");
  assert.equal(countText("120"), "99+");
  assert.equal(countText(undefined), "0");
  assert.equal(countText("   "), "0");
  assert.equal(countText("New"), "New");
  assert.ok(badgeMarkup({ kind: "count", tone: "action", words: "120" }).endsWith(">99+</span>"));
  assert.ok(badgeMarkup({ kind: "count" }).endsWith(">0</span>"));
});

test("badge dot and mark: a name for a screen reader when there are words, hidden when there are none", () => {
  assert.equal(badgeMarkup({ kind: "dot", tone: "question", words: "Waiting" }), '<span class="ui-badge" data-kind="dot" data-tone="question" role="img" aria-label="Waiting"></span>');
  assert.equal(badgeMarkup({ kind: "dot", tone: "question" }), '<span class="ui-badge" data-kind="dot" data-tone="question" aria-hidden="true"></span>');
  assert.equal(badgeMarkup({ kind: "dot", words: "  " }), '<span class="ui-badge" data-kind="dot" data-tone="neutral" aria-hidden="true"></span>');
  const drawing = '<svg class="icon"></svg>';
  assert.equal(badgeMarkup({ kind: "mark", tone: "success", words: "Done" }, drawing), `<span class="ui-badge" data-kind="mark" data-tone="success" role="img" aria-label="Done">${drawing}</span>`);
  assert.equal(badgeMarkup({ kind: "mark" }, drawing), `<span class="ui-badge" data-kind="mark" data-tone="neutral" aria-hidden="true">${drawing}</span>`);
  // The words of a dot or a mark are a name, never text on screen; the drawing belongs to a mark only.
  assert.ok(!badgeMarkup({ kind: "dot", words: "Waiting" }, drawing).includes(">Waiting<"));
  assert.ok(!badgeMarkup({ kind: "tag", words: "Heading" }, drawing).includes("svg"));
  assert.ok(!badgeMarkup({ kind: "count", words: "3" }, drawing).includes("svg"));
});

test("section heading: levels are 2 to 4, anything else is 3", () => {
  assert.deepEqual([...HEADING_LEVELS], [2, 3, 4]);
  for (const level of HEADING_LEVELS) assert.equal(headingLevel(level), level);
  assert.equal(headingLevel("4"), 4, "a level from a text option");
  assert.equal(headingLevel(undefined), DEFAULT_HEADING_LEVEL);
  assert.equal(headingLevel(1), 3);
  assert.equal(headingLevel(7), 3);
  assert.equal(headingLevel("big"), 3);
});

test("section heading: the words are a real heading, the end slot follows them", () => {
  assert.equal(sectionHeadingMarkup("Pages"), '<div class="ui-section-heading"><h3>Pages</h3></div>');
  assert.equal(sectionHeadingMarkup("Pages", { level: 2 }), '<div class="ui-section-heading"><h2>Pages</h2></div>');
  assert.equal(sectionHeadingMarkup("Pages", { level: "4" }, "12"), '<div class="ui-section-heading"><h4>Pages</h4><span data-slot="end">12</span></div>');
  assert.equal(sectionHeadingMarkup("Pages", {}, true), '<div class="ui-section-heading"><h3>Pages</h3><span data-slot="end"></span></div>', "an empty slot for the caller's node");
  assert.equal(sectionHeadingMarkup("Pages", {}, "   "), sectionHeadingMarkup("Pages"), "a blank end leaves no slot");
  assert.equal(sectionHeadingMarkup("Pages", {}, undefined), sectionHeadingMarkup("Pages"));
});

test("section heading: words and end text are escaped, and the words are not changed to capitals in the markup", () => {
  assert.equal(sectionHeadingMarkup("Pages & files <new>", {}, "<1>"), '<div class="ui-section-heading"><h3>Pages &amp; files &lt;new&gt;</h3><span data-slot="end">&lt;1&gt;</span></div>');
});

test("key: text splits at +, a list is kept, blanks are dropped", () => {
  assert.deepEqual(keyList("Ctrl+K"), ["Ctrl", "K"]);
  assert.deepEqual(keyList(" Ctrl + Shift + Z "), ["Ctrl", "Shift", "Z"]);
  assert.deepEqual(keyList(["Ctrl", "K"]), ["Ctrl", "K"]);
  assert.deepEqual(keyList(["Page Down"]), ["Page Down"], "a list keeps a key's own spaces");
  assert.deepEqual(keyList("Ctrl++"), ["Ctrl"], "a lone + is the separator");
  assert.deepEqual(keyList(""), []);
  assert.deepEqual(keyList(undefined), []);
});

test("key: one key is one cap, several are a group of caps, none is nothing", () => {
  assert.equal(keyMarkup("K"), '<kbd class="ui-key">K</kbd>');
  assert.equal(keyMarkup(["Page Down"]), '<kbd class="ui-key">Page Down</kbd>');
  assert.equal(keyMarkup("Ctrl+K"), '<kbd class="ui-key" data-combo><kbd>Ctrl</kbd><kbd>K</kbd></kbd>');
  assert.equal(keyMarkup(["⌘", ","]), '<kbd class="ui-key" data-combo><kbd>⌘</kbd><kbd>,</kbd></kbd>');
  assert.equal(keyMarkup(""), "");
  assert.equal(keyMarkup([" ", ""]), "");
  assert.equal(keyMarkup("<b>"), '<kbd class="ui-key">&lt;b&gt;</kbd>', "escaped");
});

test("the board shows every kind, tone, heading end slot and key count, and its options reach the parts", () => {
  const badge = PARTS.find((entry) => entry.id === "badge");
  assert.ok(badge && isPart(badge));
  assert.deepEqual(badge.rows.map((row) => row.values?.kind).filter((kind, i, all) => all.indexOf(kind) === i), [...BADGE_KINDS]);
  assert.deepEqual(badge.columns.map((column) => column.values?.tone), [...BADGE_TONES]);
  const choices = (part: typeof badge, key: string) => part.controls.flatMap((control) => (control.kind === "choice" && control.key === key ? control.choices.map(([value]) => value) : []));
  assert.deepEqual(choices(badge, "kind"), [...BADGE_KINDS]);
  assert.deepEqual(choices(badge, "tone"), [...BADGE_TONES]);
  assert.ok(badge.rows.some((row) => row.values?.kind === "count" && countText(String(row.values.words)) === "99+"), "a count over 99");

  const heading = PARTS.find((entry) => entry.id === "section-heading");
  assert.ok(heading && isPart(heading));
  assert.deepEqual(new Set(heading.rows.map((row) => row.values?.end ?? heading.defaults.end)), new Set(["none", "count", "button"]));
  assert.deepEqual(choices(heading, "level"), HEADING_LEVELS.map(String));

  const key = PARTS.find((entry) => entry.id === "key");
  assert.ok(key && isPart(key));
  const counts = new Set(key.rows.map((row) => keyList(String(row.values?.keys ?? key.defaults.keys)).length));
  assert.deepEqual([...counts].sort(), [1, 2, 3]);
});
