import { test } from "node:test";
import assert from "node:assert/strict";
import { planStructuralTransaction } from "../src/browser-structural-preview.ts";

const path = "src/pages/index.astro";
const base = `---
import Layout from '../layouts/Layout.astro';
---
<Layout>
  <h1>Title</h1>
  <p>Intro</p>
  <a class="button" href="/about/">About</a>
  <button class="button-text">Save</button>
</Layout>
`;

test("plans same-parent literal insert and delete without changing outside bytes", () => {
  const next = base.replace(
    '  <a class="button" href="/about/">About</a>',
    '  <a class="button" href="/about/">About</a>\n  <a class="button" href="/about/">About</a>',
  );
  const plan = planStructuralTransaction(path, base, next);
  assert.equal(plan?.operations.length, 1);
  assert.equal(plan.operations[0].action, "insert");
  assert.equal(plan.operations[0].element.tag, "a");
  assert.equal(plan.operations[0].element.text, "About");
  assert.equal(plan.operations[0].element.href?.value, "/about/");

  const deleted = planStructuralTransaction(path, next, base);
  assert.equal(deleted?.operations.length, 1);
  assert.equal(deleted.operations[0].action, "delete");
});

for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6", "p", "button"] as const) {
  test(`plans literal ${tag} insertion`, () => {
    const previous = `<main><${tag}>One</${tag}><p>Tail</p></main>`;
    const source = `<main><${tag}>One</${tag}><${tag}>Two</${tag}><p>Tail</p></main>`;
    const plan = planStructuralTransaction(path, previous, source);
    assert.equal(plan?.operations.length, 1);
    assert.equal(plan.operations[0].action, "insert");
    assert.equal(plan.operations[0].element.tag, tag);
    assert.equal(plan.operations[0].element.text, "Two");
    assert.equal(source.slice(0, plan.afterSpan.start), previous.slice(0, plan.beforeSpan.start));
    assert.equal(source.slice(plan.afterSpan.end), previous.slice(plan.beforeSpan.end));
  });
}

test("plans reorder as verified delete plus insert for identical literal siblings", () => {
  const next = base.replace(
    "  <h1>Title</h1>\n  <p>Intro</p>",
    "  <p>Intro</p>\n  <h1>Title</h1>",
  );
  const plan = planStructuralTransaction(path, base, next);
  assert.equal(plan?.operations.map((op) => op.action).join(","), "delete,delete,insert,insert");
});

test("fails closed for expressions, imports, components, unsafe attrs, and cross-parent edits", () => {
  assert.equal(planStructuralTransaction(path, base, base.replace("<p>Intro</p>", "<p>{intro}</p>")), undefined);
  assert.equal(planStructuralTransaction(path, base, base.replace("</Layout>", "  <Counter />\n</Layout>")), undefined);
  assert.equal(planStructuralTransaction(path, base, base.replace("<p>Intro</p>", '<p onclick="x()">Intro</p>')), undefined);
  assert.equal(planStructuralTransaction(path, base, base.replace("<p>Intro</p>", '<p set:html={html}>Intro</p>')), undefined);
  assert.equal(planStructuralTransaction(path, base, base.replace("import Layout", "import Counter from '../components/Counter.tsx';\nimport Layout")), undefined);
  assert.equal(planStructuralTransaction(path, base, base.replace("<p>Intro</p>", "<section><p>Intro</p></section>")), undefined);
});

test("fails closed for mixed atom and non-atom changes in one sibling run", () => {
  assert.equal(
    planStructuralTransaction(path,
      "<main><h1>A</h1><p>B</p><p>C</p></main>",
      "<main><h1>A</h1><div>B</div><p>D</p><p>C</p></main>",
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      "<main><h1>A</h1><p>B</p><p>C</p></main>",
      "<main><h1>A</h1>{items.map(item => <p>{item}</p>)}<p>D</p><p>C</p></main>",
    ),
    undefined,
  );
});

test("fails closed when changed run contains non-atom bytes", () => {
  assert.equal(
    planStructuralTransaction(path,
      "<main>{ok && <p>A</p>}<h2>B</h2></main>",
      "<main>{ok && <p>A</p><p>C</p>}<h2>B</h2></main>",
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      '<main><a href="/">A</a></main>',
      '<main><a href="/">A</a><a href="javascript:alert(1)">B</a></main>',
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      '<main><a href="/">A</a></main>',
      '<main><a href="/">A</a><a href="/x?a=1&amp;b=2">X</a></main>',
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      "<main><h1>A</h1><Counter /><p>B</p></main>",
      "<main><h1>A</h1><Other /><p>C</p><p>B</p></main>",
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      "<main><h1>A</h1>hello<p>B</p></main>",
      "<main><h1>A</h1>bye<p>C</p><p>B</p></main>",
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      "<main>{ok && <p>A</p>}</main>",
      "<main>{ok && <p>A</p><p>C</p>}</main>",
    ),
    undefined,
  );
  assert.equal(
    planStructuralTransaction(path,
      "<main><Other><p>A</p></Other></main>",
      "<main><Other><p>A</p><p>C</p></Other></main>",
    ),
    undefined,
  );
});
