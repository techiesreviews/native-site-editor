import { test } from "node:test";
import assert from "node:assert/strict";
import { findStyleRulesInSources } from "../src/styles-index.ts";

test("native CSS rule lookup uses active CSSOM rule identity and ignores inactive duplicate selectors", () => {
  const source = `<style>
@media (max-width: 1px) {
  .slot-probe { color: rgb(1, 2, 3); }
}
.slot-probe, .lead { color: rgb(190, 20, 40); }
</style>`;
  const rules = findStyleRulesInSources(
    { "src/pages/index.html": source },
    [{ path: "src/pages/index.html", selector: ".slot-probe", ruleIndex: 1 }],
  );
  assert.equal(rules.length, 1);
  assert.match(source.slice(rules[0].start, rules[0].end), /190,\s*20,\s*40/);
});

test("native CSS rule lookup does not count keyframe frames as selectable style rules", () => {
  const source = `@keyframes pulse {
  from { opacity: 0; }
  to { opacity: 1; }
}
.hero h1 { color: red; }`;
  const rules = findStyleRulesInSources(
    { "src/styles/site.css": source },
    [{ path: "src/styles/site.css", selector: ".hero h1", ruleIndex: 0 }],
  );
  assert.equal(rules.length, 1);
  assert.match(source.slice(rules[0].start, rules[0].end), /^\.hero h1/);
});

test("native CSS rule lookup fails closed when indexed selector does not match source rule", () => {
  const rules = findStyleRulesInSources(
    { "src/styles/site.css": ".other { color: red; }" },
    [{ path: "src/styles/site.css", selector: ".hero h1", ruleIndex: 0 }],
  );
  assert.equal(rules.length, 0);
});

test("native CSS rule lookup ranks component CSS after shared CSS at equal specificity", () => {
  const rules = findStyleRulesInSources(
    {
      "src/styles/site.css": ".project-card__title { color: blue; }",
      "src/components/project-card/project-card.css": ".project-card__title { color: red; }",
    },
    [
      { path: "src/styles/site.css", selector: ".project-card__title", ruleIndex: 0 },
      { path: "src/components/project-card/project-card.css", selector: ".project-card__title", ruleIndex: 0 },
    ],
  );
  assert.equal(rules[0]?.path, "src/components/project-card/project-card.css");
});
