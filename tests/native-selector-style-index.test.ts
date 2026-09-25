import { test } from "node:test";
import assert from "node:assert/strict";
import { declarationRanges, findStyleRulesInSources } from "../src/styles-index.ts";

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

test("native CSS rule lookup keeps the order it is given, leaving ranking to the cascade", () => {
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
  assert.deepEqual(rules.map((rule) => [rule.path, rule.match]), [
    ["src/styles/site.css", 0],
    ["src/components/project-card/project-card.css", 1],
  ]);
});

test("native CSS rule lookup maps nested rules, whose CSSOM selector gains a leading &", () => {
  const source = `.card {
  color: red;
  a { color: blue; }
  > p { margin: 0; }
  .dark & { color: white; }
}`;
  const rules = findStyleRulesInSources({ "a.css": source }, [
    { path: "a.css", selector: "& a", ruleIndex: 1 },
    { path: "a.css", selector: "& > p", ruleIndex: 2 },
    { path: "a.css", selector: ".dark &", ruleIndex: 3 },
  ]);
  assert.deepEqual(rules.map((rule) => source.slice(rule.start, rule.end)), [
    "a { color: blue; }",
    "> p { margin: 0; }",
    ".dark & { color: white; }",
  ]);
});

test("declaration ranges cover a rule's own declarations, not nested rules", () => {
  const source = `.card {
  color: red;
  margin: 0 /* ; */ auto;
  a { color: blue; }
  background: url("a;b.png")
}`;
  const found = declarationRanges(source, 0, source.length);
  assert.deepEqual(found.map((item) => [item.property, source.slice(item.start, item.end)]), [
    ["color", "color: red;"],
    ["margin", "margin: 0 /* ; */ auto;"],
    ["background", "background: url(\"a;b.png\")"],
  ]);
});
