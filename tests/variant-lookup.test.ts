import { test } from "node:test";
import assert from "node:assert/strict";
import { readVariants, variantLookup } from "../shared/variant-lookup.ts";
import { memoryVariantFiles, page } from "./variant-files-fake.ts";

// The one Variant lookup (shared/variant-lookup.ts) through its interface,
// over a memory site: which files count, scripts, scope, cache, rounds.

const attributes = (variants: { attribute: string }[] | undefined) => variants?.map(({ attribute }) => attribute);
const values = (variants: { attribute: string; values: { value: string }[] }[] | undefined, attribute: string) =>
  variants?.find((variant) => variant.attribute === attribute)?.values.map(({ value }) => value);

function site() {
  return memoryVariantFiles({
    "index.html": page(["/styles/site.css"], ["/components/components.js", "/scripts/tips.js"]),
    "about/index.html": page(["../styles/about.css"], ["/components/components.js"]),
    "components/components.js": 'el.setAttribute("data-unloaded", "");',
    "scripts/tips.js": 'import "./open.js";\ntip.dataset.ready = "";',
    "scripts/open.js": 'tip.toggleAttribute("data-open");',
    // Not loaded by any page: its attributes count for nothing.
    "scripts/unused.js": 'tip.dataset.layout = "x";',
    "styles/site.css": '@import "tones.css" screen;\ncard-tip[data-emphasis="accent"] {}\n.btn[data-size="large"] {}\n',
    "styles/tones.css": '[data-tone="dark"] {} [data-open] {}',
    "styles/about.css": '[data-color-scheme="dark"] {}',
    // Linked by no page and imported by none.
    "styles/orphan.css": 'card-tip[data-orphan="yes"] {}',
    "components/card-tip/card-tip.html": '<article><slot name="title"><h3>Tip</h3></slot></article>',
    "components/card-tip/card-tip.css": '@import "parts.css";\n:host {} :host([data-open]) {} :host([data-ready]) {} :host([data-layout="wide"]) {}',
    "components/card-tip/parts.css": ':host([data-size="small"]) {}',
    "components/site-header/site-header.html": "<header></header>",
  });
}

test("a component's Variants: its own CSS with imports, every page's linked sheets with theirs, global rules; no orphan sheets", () => {
  const lookup = variantLookup(site());
  const tip = lookup.forTag("CARD-TIP")!;
  // In cascade order: an imported sheet before the one importing it.
  assert.deepEqual(attributes(tip.variants), ["data-size", "data-layout", "data-tone", "data-open", "data-emphasis", "data-color-scheme"]);
  // The imported sheet keeps its import's condition.
  assert.deepEqual(tip.variants.find((variant) => variant.attribute === "data-tone")!.conditions, ["@media screen"]);
  assert.deepEqual(tip.warnings, []);
  // A component without CSS gets the site's global Variants only.
  assert.deepEqual(attributes(lookup.forTag("site-header")!.variants), ["data-tone", "data-open", "data-color-scheme"]);
  assert.equal(lookup.forTag("card-gone"), undefined);
  assert.equal(lookup.forTag("section"), undefined);
});

test("scripts the pages load, and what they import, set attributes: left out of the component's own CSS only", () => {
  const lookup = variantLookup(site());
  const tip = lookup.forTag("card-tip")!.variants;
  // data-ready (tips.js) and data-open (open.js, imported) leave the own CSS;
  // the site's global data-open rule still counts; unused.js loads nowhere.
  assert.equal(tip.some((variant) => variant.attribute === "data-ready"), false);
  assert.deepEqual(values(tip, "data-layout"), ["wide"]);
  assert.equal(tip.find((variant) => variant.attribute === "data-open")?.kind, "yes-no");
});

test("a script that is not JavaScript, or external, is not read", () => {
  const files = site();
  files.files["index.html"] = `${page(["/styles/site.css"])}<script type="application/ld+json" src="/scripts/tips.js"></script><script src="https://cdn.example/x.js"></script>`;
  const tip = variantLookup(files).forTag("card-tip")!.variants;
  assert.ok(tip.some((variant) => variant.attribute === "data-ready"));
  assert.equal(files.reads.includes("scripts/tips.js"), false);
});

test("a page scope narrows the site sheets to the ones that page links; scripts stay the site's", () => {
  const lookup = variantLookup(site());
  assert.deepEqual(attributes(lookup.forTag("card-tip", { page: "about/index.html" })!.variants), ["data-size", "data-layout", "data-color-scheme"]);
  assert.deepEqual(attributes(lookup.global({ page: "index.html" })), ["data-tone", "data-open"]);
  assert.deepEqual(attributes(lookup.global()), ["data-tone", "data-open", "data-color-scheme"]);
  assert.deepEqual(lookup.forClass("btn", { page: "about/index.html" }), []);
});

test("a class's Variants come from the site sheets; isComponentCss knows the components' own sheets", () => {
  const lookup = variantLookup(site());
  assert.deepEqual(attributes(lookup.forClass("btn")), ["data-size"]);
  assert.deepEqual(lookup.forClass("BTN"), []);
  assert.equal(lookup.isComponentCss("components/card-tip/card-tip.css"), true);
  assert.equal(lookup.isComponentCss("components/site-header/site-header.css"), true);
  assert.equal(lookup.isComponentCss("components/card-tip/parts.css"), false);
  assert.equal(lookup.isComponentCss("styles/site.css"), false);
});

test("no site, no Variants", () => {
  const lookup = variantLookup({ site: () => undefined, read: () => "" });
  assert.equal(lookup.forTag("card-tip"), undefined);
  assert.deepEqual(lookup.forClass("btn"), []);
  assert.deepEqual(lookup.global(), []);
  assert.equal(lookup.isComponentCss("components/card-tip/card-tip.css"), false);
});

test("the same files give the same lookup and the same answer; a changed import, script, page or site gives a new one", () => {
  const files = site();
  const lookup = variantLookup(files);
  assert.equal(variantLookup(files), lookup);
  const first = lookup.forTag("card-tip");
  assert.equal(lookup.forTag("card-tip"), first);

  files.files["components/card-tip/parts.css"] = ':host([data-size="tiny"]) {}';
  const imported = lookup.forTag("card-tip")!;
  assert.notEqual(imported, first);
  assert.deepEqual(values(imported.variants, "data-size"), ["tiny"]);

  // data-ready is only in the component's own CSS: a script edit brings it back.
  const warm = lookup.forTag("card-tip");
  files.files["scripts/tips.js"] = 'import "./open.js";';
  assert.notEqual(lookup.forTag("card-tip"), warm);
  assert.ok(lookup.forTag("card-tip")!.variants.some((variant) => variant.attribute === "data-ready"));
  files.files["scripts/tips.js"] = 'import "./open.js";\ntip.dataset.ready = "";';

  files.files["index.html"] = page(["/styles/site.css", "/styles/orphan.css"]);
  const linked = lookup.forTag("card-tip")!.variants;
  assert.deepEqual(values(linked, "data-orphan"), ["yes"]);
  assert.ok(linked.some((variant) => variant.attribute === "data-ready"), "no page loads tips.js now");

  files.files["components/card-new/card-new.html"] = "<article></article>";
  assert.deepEqual(attributes(lookup.forTag("card-new")!.variants), ["data-tone", "data-open", "data-color-scheme"]);
});

test("the same site object with other pages or components is another site", () => {
  const files = site();
  const shape = { pages: ["index.html"], components: { "card-tip": "components/card-tip/card-tip.html" } as Record<string, string> };
  const lookup = variantLookup({ site: () => shape, read: (path) => files.files[path] });
  assert.equal(lookup.forTag("card-tip")!.variants.some((variant) => variant.attribute === "data-color-scheme"), false);
  shape.pages.push("about/index.html");
  assert.ok(lookup.forTag("card-tip")!.variants.some((variant) => variant.attribute === "data-color-scheme"));
  delete shape.components["card-tip"];
  assert.equal(lookup.forTag("card-tip"), undefined);
});

test("script imports are read from code, not comments or strings; JavaScript types count", () => {
  const files = site();
  files.files["scripts/tips.js"] = '// import "./unused.js";\nconst text = "import \'./unused.js\'";\nimport/* open */"./open.js";\nexport { x } from "./more.mjs";\nimport("./late.js");\nimport "lit";';
  files.files["scripts/more.mjs"] = 'tip.dataset.ready = "";';
  files.files["scripts/late.js"] = '';
  files.files["index.html"] = page(["/styles/site.css"]).replace("</head>", '<script type="text/javascript" src="/scripts/tips.js"></script></head>');
  const tip = variantLookup(files).forTag("card-tip")!.variants;
  assert.equal(tip.some((variant) => variant.attribute === "data-layout"), true, "unused.js is not imported");
  assert.equal(tip.some((variant) => variant.attribute === "data-ready"), false, "more.mjs is");
  assert.ok(files.reads.includes("scripts/late.js"));
  assert.equal(files.reads.includes("scripts/unused.js") || files.reads.includes("lit"), false);
});

test("a file not read yet counts once it is read", () => {
  const files = site();
  const later = files.files["styles/tones.css"];
  delete files.files["styles/tones.css"];
  const lookup = variantLookup(files);
  assert.equal(lookup.forTag("card-tip")!.variants.some((variant) => variant.attribute === "data-tone"), false);
  files.files["styles/tones.css"] = later;
  assert.deepEqual(values(lookup.forTag("card-tip")!.variants, "data-tone"), ["dark"]);
});

test("readVariants reads in batched rounds, asks for each path once, and answers as the lookup over the same files", async () => {
  const files = site().files;
  const batches: string[][] = [];
  const answer = await readVariants(
    { pages: ["index.html", "about/index.html"], components: { "card-tip": "components/card-tip/card-tip.html", "site-header": "components/site-header/site-header.html" } },
    async (paths) => {
      batches.push(paths);
      return new Map(paths.flatMap((path) => Object.hasOwn(files, path) ? [[path, files[path]] as const] : []));
    },
    (lookup) => lookup.forTag("card-tip"),
  );
  assert.deepEqual(answer, variantLookup(site()).forTag("card-tip"));
  // Pages and the component's own sheet, then what they link, then the imports.
  assert.deepEqual(batches[0].sort(), ["about/index.html", "components/card-tip/card-tip.css", "index.html"]);
  assert.ok(batches.length <= 4, `${batches.length} rounds`);
  const all = batches.flat();
  assert.equal(new Set(all).size, all.length, "each path once");
  assert.equal(all.includes("scripts/unused.js") || all.includes("styles/orphan.css"), false, "only what the site links");
  // A failed read fails the answer.
  await assert.rejects(readVariants({ pages: ["index.html"], components: {} }, async () => { throw new Error("offline"); }, (lookup) => lookup.global()), /offline/);
});

test("readVariants reads likely paths with the pages, and again without them when that fails", async () => {
  const files = site().files;
  const shape = { pages: ["index.html"], components: {} };
  const batches: string[][] = [];
  const load = async (paths: string[]) => {
    batches.push(paths);
    if (paths.includes("styles/stale.css")) throw new Error("unreadable draft");
    return new Map(paths.flatMap((path) => Object.hasOwn(files, path) ? [[path, files[path]] as const] : []));
  };
  const plain = await readVariants(shape, load, (lookup) => lookup.global());
  const plainRounds = batches.length;
  batches.length = 0;
  assert.deepEqual(await readVariants(shape, load, (lookup) => lookup.global(), ["styles/site.css", "styles/tones.css"]), plain);
  assert.equal(batches.length, plainRounds - 2, "the likely sheets save their rounds");
  batches.length = 0;
  assert.deepEqual(await readVariants(shape, load, (lookup) => lookup.global(), ["styles/stale.css"]), plain);
  assert.deepEqual(batches.slice(0, 2), [["index.html", "styles/stale.css"], ["index.html"]]);
});

test("readVariants fails rather than answering without files linked too deep", async () => {
  const files: Record<string, string> = { "index.html": page(["/s0.css"]) };
  for (let depth = 0; depth < 20; depth++) files[`s${depth}.css`] = `@import "s${depth + 1}.css";`;
  files["s20.css"] = '[data-deep="yes"] {}';
  assert.deepEqual(variantLookup(memoryVariantFiles(files)).global().map(({ attribute }) => attribute), ["data-deep"]);
  const load = async (paths: string[]) => new Map(paths.flatMap((path) => Object.hasOwn(files, path) ? [[path, files[path]] as const] : []));
  await assert.rejects(readVariants({ pages: ["index.html"], components: {} }, load, (lookup) => lookup.global()), /deeper than/);
});
