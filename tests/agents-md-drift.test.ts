import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { componentsChapter, conventionsChapter, mediaChapter, siteConventions } from "../worker/site-conventions.ts";

test("the starter's AGENTS.md Components chapter matches the conventions exactly", () => {
  const conventions = componentsChapter(siteConventions);
  const starterGuide = readFileSync(new URL("../fixtures/actual-starter/AGENTS.md", import.meta.url), "utf8");
  const starter = componentsChapter(starterGuide);
  const refresh = "Copy the Components chapter from worker/site-conventions.ts into the starter's AGENTS.md on its dev branch, then refresh fixtures/actual-starter from that commit (see fixtures/actual-starter.README.md).";
  assert.notEqual(conventions, undefined, "worker/site-conventions.ts must contain a ## Components chapter.");
  assert.notEqual(starter, undefined, `fixtures/actual-starter/AGENTS.md must contain a ## Components chapter. ${refresh}`);
  assert.ok(chaptersMatch(siteConventions, starterGuide, "Components"), refresh);
});

/** Missing chapters never count as matching copies. */
function chaptersMatch(conventions: string, starter: string, title: string) {
  const chapter = conventionsChapter(conventions, title);
  return chapter !== undefined && chapter === conventionsChapter(starter, title);
}

test("the starter's AGENTS.md Media chapter matches the conventions exactly", () => {
  const conventions = mediaChapter(siteConventions);
  const starterGuide = readFileSync(new URL("../fixtures/actual-starter/AGENTS.md", import.meta.url), "utf8");
  const starter = mediaChapter(starterGuide);
  const refresh = "Copy the Media chapter from worker/site-conventions.ts into the starter's AGENTS.md on its dev branch, then refresh fixtures/actual-starter from that commit (see fixtures/actual-starter.README.md).";
  assert.notEqual(conventions, undefined, "worker/site-conventions.ts must contain a ## Media chapter.");
  assert.notEqual(starter, undefined, `fixtures/actual-starter/AGENTS.md must contain a ## Media chapter. ${refresh}`);
  assert.ok(chaptersMatch(siteConventions, starterGuide, "Media"), refresh);
});

test("chapter comparison detects a line changed in either copy alone", () => {
  for (const title of ["Components", "Media"]) {
    const chapter = conventionsChapter(siteConventions, title)!;
    const changed = chapter.replace(chapter.split("\n")[1], "Changed rule.");
    assert.equal(chaptersMatch(chapter, chapter, title), true);
    assert.equal(chaptersMatch(changed, chapter, title), false);
    assert.equal(chaptersMatch(chapter, changed, title), false);
    assert.equal(chaptersMatch(changed, changed, title), true);
    assert.equal(chaptersMatch("", "", title), false);
  }
});

test("chapter cutter ends at the next chapter, keeps subheadings and trims", () => {
  const guide = "# Guide\n\n## Media\nA rule.\n### Seeing\nAnother rule.\n\n## Next\nOther rules.\n";
  const chapter = "## Media\nA rule.\n### Seeing\nAnother rule.";
  assert.equal(conventionsChapter(guide, "Media"), chapter);
  assert.equal(conventionsChapter(chapter + "\n\n", "Media"), chapter);
  assert.equal(conventionsChapter(guide, "Missing"), undefined);
  assert.equal(conventionsChapter("### Media\nNo chapter.", "Media"), undefined);
});
