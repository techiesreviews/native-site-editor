import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { componentsChapter, siteConventions } from "../worker/site-conventions.ts";

test("the starter's AGENTS.md Components chapter matches the conventions exactly", () => {
  const conventions = componentsChapter(siteConventions);
  const starter = componentsChapter(readFileSync(new URL("../fixtures/actual-starter/AGENTS.md", import.meta.url), "utf8"));
  const refresh = "Copy the Components chapter from worker/site-conventions.ts into the starter's AGENTS.md on its dev branch, then refresh fixtures/actual-starter from that commit (see fixtures/actual-starter.README.md).";
  assert.notEqual(conventions, undefined, "worker/site-conventions.ts must contain a ## Components chapter.");
  assert.notEqual(starter, undefined, `fixtures/actual-starter/AGENTS.md must contain a ## Components chapter. ${refresh}`);
  assert.equal(starter, conventions, refresh);
});
