import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sharedTitleEnding, withoutTitleEnding } from "../src/components/page-title-ending.ts";

test("the site name most titles end with is their shared ending", () => {
  const titles = ["About · Larkspur Studio", "Fern & Kettle · Larkspur Studio", "Contact", "Price list · Larkspur Studio"];
  assert.equal(sharedTitleEnding(titles), " · Larkspur Studio");
  assert.equal(withoutTitleEnding("Fern & Kettle · Larkspur Studio", " · Larkspur Studio"), "Fern & Kettle");
  assert.equal(withoutTitleEnding("Contact", " · Larkspur Studio"), "Contact");
});

test("other separators count, and the last one in a title is its ending", () => {
  assert.equal(sharedTitleEnding(["Blog | Acme", "Team | Acme"]), " | Acme");
  assert.equal(sharedTitleEnding(["News — Q1 — Acme", "Jobs — Acme"]), " — Acme");
  assert.equal(sharedTitleEnding(["Pricing - Acme Co", "Docs - Acme Co", "Help"]), " - Acme Co");
});

test("an ending only one title has, or fewer than half, is no shared ending", () => {
  assert.equal(sharedTitleEnding(["About · Larkspur", "Contact", "Work"]), undefined);
  assert.equal(sharedTitleEnding(["A · X", "B · X", "C", "D", "E"]), undefined);
  assert.equal(sharedTitleEnding([]), undefined);
  // Words joined by a hyphen inside a title are not an ending.
  assert.equal(sharedTitleEnding(["Well-known", "Self-hosted"]), undefined);
});

test("a title that is only the ending keeps its text", () => {
  assert.equal(withoutTitleEnding(" · Larkspur", " · Larkspur"), " · Larkspur");
  assert.equal(withoutTitleEnding("Home", undefined), "Home");
});
