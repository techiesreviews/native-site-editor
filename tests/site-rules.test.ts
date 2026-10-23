import { strict as assert } from "node:assert";
import { test } from "node:test";
import { componentSourceProblem, makeComponentProblem, pageAddressProblem } from "../shared/site-rules.ts";

const ADDRESS = "Use lowercase letters, digits and dashes in the URL, at most 80, starting with a letter or digit.";

test("a new page address is lowercase letters, digits and dashes, at most 80, starting with a letter or digit", () => {
  for (const slug of ["about", "my-first-video", "2026", "a", "x-", "a".repeat(80)]) assert.equal(pageAddressProblem(slug), undefined, slug);
  for (const slug of ["", "About_Us.v2", "About", "about_us", "a.b", "-x", "a b", "a/b", "é", "a".repeat(81)]) assert.equal(pageAddressProblem(slug), ADDRESS, slug);
});

test("make component checks the name, then the element, with one wording each", () => {
  assert.equal(makeComponentProblem(undefined, "section-intro", []), undefined);
  assert.equal(makeComponentProblem(undefined, "", []), "Type a name with a dash, such as section-intro.");
  assert.equal(makeComponentProblem(undefined, "1-x", []), "A component's name starts with a lowercase letter.");
  assert.equal(makeComponentProblem(undefined, "section", []), "A component's name has a dash in it, such as section-intro.");
  assert.equal(makeComponentProblem(undefined, "section--hero", []), "Use lowercase letters, digits and single dashes between words.");
  assert.equal(makeComponentProblem(undefined, "font-face", []), "font-face is reserved by HTML.");
  assert.equal(makeComponentProblem(undefined, "feature-block", ["feature-block"]), "There is a component <feature-block> already.");
  assert.equal(makeComponentProblem({ tag: "main" }, "section-x", []), "A <main> cannot be a component.");
  assert.equal(makeComponentProblem({ tag: "BODY" }, "section-x", []), "A <body> cannot be a component.");
  assert.equal(makeComponentProblem({ tag: "site-header" }, "section-x", []), "<site-header> is the site's header component already.");
  assert.equal(makeComponentProblem({ tag: "site-footer" }, "section-x", []), "<site-footer> is the site's footer component already.");
  assert.equal(makeComponentProblem({ tag: "card-note" }, "section-x", []), "<card-note> is a component already.");
  assert.equal(makeComponentProblem({ tag: "section" }, "section-x", []), undefined);
  // The name is checked first.
  assert.equal(makeComponentProblem({ tag: "main" }, "section", []), "A component's name has a dash in it, such as section-intro.");
  assert.equal(componentSourceProblem({ tag: "div" }), undefined);
});
