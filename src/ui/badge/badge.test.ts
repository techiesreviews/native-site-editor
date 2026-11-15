import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_KINDS, BADGE_TONES, COUNT_LIMIT, badgeKind, badgeMarkup, badgeTone, countText } from "./badge-options.ts";

// The Badge part's options become markup: one class, the kind and the tone as data attributes, the words escaped.

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
  assert.equal(badgeMarkup({ kind: "tag", tone: "warning", words: "Unsaved" }), '<span class="ui-badge" data-kind="tag" data-tone="warning"><span>Unsaved</span></span>');
  assert.equal(badgeMarkup({ kind: "status", tone: "success", words: " Saved " }), '<span class="ui-badge" data-kind="status" data-tone="success"><span>Saved</span></span>');
  assert.equal(badgeMarkup(), '<span class="ui-badge" data-kind="tag" data-tone="neutral"></span>', "no options: an empty neutral tag");
  assert.equal(badgeMarkup({ kind: "sideways", tone: "loud", words: "x" }), badgeMarkup({ words: "x" }), "unknown options fall back to the defaults");
  for (const kind of BADGE_KINDS) for (const tone of BADGE_TONES) {
    const markup = badgeMarkup({ kind, tone, words: "Name" });
    assert.ok(markup.includes(`data-kind="${kind}" data-tone="${tone}"`), `${kind} ${tone}`);
    assert.equal([...markup.matchAll(/class="/g)].length, 1, "one class and no modifier classes");
  }
});

test("badge: the words sit in their own span (so long words can be cut), and a status with no words is hidden", () => {
  assert.ok(badgeMarkup({ kind: "tag", words: "Heading" }).includes("><span>Heading</span></span>"));
  assert.ok(badgeMarkup({ kind: "status", tone: "success", words: "Saved" }).includes("><span>Saved</span></span>"));
  assert.equal(badgeMarkup({ kind: "status" }), '<span class="ui-badge" data-kind="status" data-tone="neutral" aria-hidden="true"></span>');
  assert.equal(badgeMarkup({ kind: "tag", words: "  " }), '<span class="ui-badge" data-kind="tag" data-tone="neutral"></span>');
});

test("badge: words are escaped", () => {
  assert.equal(badgeMarkup({ words: "<img src=x onerror=1>" }), '<span class="ui-badge" data-kind="tag" data-tone="neutral"><span>&lt;img src=x onerror=1&gt;</span></span>');
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
  assert.ok(badgeMarkup({ kind: "count", tone: "action", words: "120" }).endsWith("><span>99+</span></span>"));
  assert.ok(badgeMarkup({ kind: "count" }).endsWith("><span>0</span></span>"));
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
