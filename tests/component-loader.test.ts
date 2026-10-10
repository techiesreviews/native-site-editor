import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { starterLoader } from "../src/page-builder/starter-loader";
import { NATIVE_STARTER_VERSION } from "../worker/starter";
import { addComponentLoaderScript, componentLoaderPlan, COMPONENT_LOADER_PATH, COMPONENT_LOADER_RULE, COMPONENT_LOADER_SCRIPT, pageLoadsComponentLoader, stylesheetHasUndefinedRule, type ComponentLoaderInput } from "../src/page-builder/component-loader";

const page = (script = "", href = "/styles/site.css") => `<html>\n<head>\n  <link rel="stylesheet" href="${href}">\n${script ? `  ${script}\n` : ""}</head>\n<body></body>\n</html>\n`;
function input(sources: Record<string, string>, exists = false): ComponentLoaderInput {
  return { pages: Object.keys(sources).filter(path => path.endsWith(".html")), sources, exists: path => path === COMPONENT_LOADER_PATH && exists, loader: "loader bytes\n" };
}

test("missing loader file only: preserve page scripts, create exact bytes, append the rule", () => {
  const plan = componentLoaderPlan(input({ "index.html": page(COMPONENT_LOADER_SCRIPT), "styles/site.css": "body {}\n" }));
  assert.deepEqual(plan?.creates, [{ path: COMPONENT_LOADER_PATH, content: "loader bytes\n" }]);
  assert.deepEqual(plan?.pages, []);
  assert.equal(plan?.edits.get("styles/site.css"), `body {}\n\n${COMPONENT_LOADER_RULE}\n`);
  assert.equal(plan?.edits.has("index.html"), false);
  assert.match(plan!.added, /components\/components.js/);
});

test("some missing scripts: edit only those pages and preserve an existing loader", () => {
  const plan = componentLoaderPlan(input({ "index.html": page(COMPONENT_LOADER_SCRIPT), "about/index.html": page(), "styles/site.css": "body {}" }, true));
  assert.deepEqual(plan?.creates, []);
  assert.deepEqual(plan?.pages, ["about/index.html"]);
  assert.equal(plan?.edits.has("index.html"), false);
  assert.equal(plan?.added, "Added the component loader to the page, and its :not(:defined) rule to styles/site.css.");
});

test("all missing: add the loader, every page script, and the rule", () => {
  const sources = Object.fromEntries(["index.html", "a/index.html", "b.html", "404.html"].map(path => [path, page()]));
  const plan = componentLoaderPlan(input({ ...sources, "styles/site.css": "body {}" }));
  assert.equal(plan?.pages.length, 4);
  for (const path of Object.keys(sources)) assert.equal(pageLoadsComponentLoader(plan!.edits.get(path)!, path), true);
  assert.equal(plan?.added, "Added the component loader to 4 pages, and its :not(:defined) rule to styles/site.css (components/components.js created).");
});

for (const rule of [COMPONENT_LOADER_RULE, "body {}"])
  test(`loader and all scripts present: no plan (${rule === COMPONENT_LOADER_RULE ? "rule present" : "rule-only repair refused"})`, () => {
    assert.equal(componentLoaderPlan(input({ "index.html": page(COMPONENT_LOADER_SCRIPT), "styles/site.css": rule }, true)), undefined);
  });

for (const [path, src] of [["index.html", "/components/components.js"], ["index.html", "components/components.js"], ["index.html", "./components/components.js?v=3"], ["about/index.html", "../components/components.js?cache=1#x"], ["about/index.html", "/components/components.js?v=3"]])
  test(`script src resolves: ${path}: ${src}`, () => assert.equal(pageLoadsComponentLoader(page(`<script src="${src}"></script>`), path), true));

test("comments, external scripts, and body scripts do not load the site's loader", () => {
  for (const source of [page(`<!-- ${COMPONENT_LOADER_SCRIPT} -->`), page('<script src="https://elsewhere.test/components/components.js"></script>'), page().replace("<body>", `<body>${COMPONENT_LOADER_SCRIPT}`)]) {
    assert.equal(pageLoadsComponentLoader(source, "index.html"), false);
    assert.equal(componentLoaderPlan(input({ "index.html": source }))?.pages.length, 1);
  }
});

test("uppercase head with attributes: insert after the last stylesheet, matching indentation", () => {
  const before = '<HTML>\n<HEAD data-test="x">\n\t<LINK REL="stylesheet" HREF="a.css">\n\t<LINK REL="stylesheet" HREF="b.css">\n\t<META name="x">\n</HEAD>\n</HTML>';
  assert.equal(addComponentLoaderScript(before), before.replace('\t<META', `\t${COMPONENT_LOADER_SCRIPT}\n\t<META`));
});

test("one-line head: script has its own line between link and next tag", () => {
  assert.equal(addComponentLoaderScript('<HEAD class="x"><link rel="stylesheet" href="a.css"><meta name="x"></HEAD>'), `<HEAD class="x"><link rel="stylesheet" href="a.css">\n${COMPONENT_LOADER_SCRIPT}\n<meta name="x"></HEAD>`);
});

test("several tags on one indented line: insert directly after the stylesheet", () => {
  assert.equal(addComponentLoaderScript('<head>\n  <meta><link rel="stylesheet" href="a.css"><title>X</title>\n</head>'), `<head>\n  <meta><link rel="stylesheet" href="a.css">\n  ${COMPONENT_LOADER_SCRIPT}\n  <title>X</title>\n</head>`);
});

test("no stylesheet: insert before the closing head using previous line's indentation", () => {
  assert.equal(addComponentLoaderScript('<head>\n  <title>X</title>\n</head>'), `<head>\n  <title>X</title>\n  ${COMPONENT_LOADER_SCRIPT}\n</head>`);
  assert.equal(addComponentLoaderScript('<head></head>'), `<head>\n${COMPONENT_LOADER_SCRIPT}\n</head>`);
});

test("CRLF preserved for the head and appended rule", () => {
  const source = page().replace(/\n/g, "\r\n");
  assert.equal(addComponentLoaderScript(source), source.replace('</head>', `  ${COMPONENT_LOADER_SCRIPT}\r\n</head>`));
  const plan = componentLoaderPlan(input({ "index.html": source, "styles/site.css": "body {}\r\n" }));
  assert.equal(plan?.edits.get("styles/site.css"), `body {}\r\n\r\n${COMPONENT_LOADER_RULE.replace(/\n/g, "\r\n")}\r\n`);
});

test("no head or unclosed head: leave page out and report it", () => {
  assert.equal(addComponentLoaderScript('<body></body>'), undefined);
  assert.equal(addComponentLoaderScript('<head><title>X</title>'), undefined);
  const plan = componentLoaderPlan(input({ "index.html": page(), "other.html": "<body></body>", "styles/site.css": "body {}" }));
  assert.deepEqual(plan?.pages, ["index.html"]);
  assert.match(plan!.notes[0], /other.html.*left out/);
  assert.equal(plan?.edits.has("other.html"), false);
});

test("main stylesheet prefers styles/site.css even if only one page links it", () => {
  const plan = componentLoaderPlan(input({ "index.html": page("", "/a.css"), "other.html": page(), "a.css": "body {}", "styles/site.css": "body {}" }));
  assert.equal(plan?.edits.has("styles/site.css"), true);
  assert.equal(plan?.edits.has("a.css"), false);
});

test("main stylesheet is the first shared sheet in home page order, not page input order", () => {
  const home = page("", "/b.css").replace('</head>', '<link rel="stylesheet" href="/a.css"></head>');
  const other = page("", "/a.css").replace('</head>', '<link rel="stylesheet" href="/b.css"></head>');
  const plan = componentLoaderPlan(input({ "other.html": other, "index.html": home, "a.css": "body {}", "b.css": "body {}" }));
  assert.equal(plan?.edits.has("b.css"), true);
  assert.equal(plan?.edits.has("a.css"), false);
});

test("no shared main stylesheet: report omitted rule", () => {
  const plan = componentLoaderPlan(input({ "index.html": page("", "/a.css"), "other.html": page("", "/b.css"), "a.css": "body {}", "b.css": "body {}" }));
  assert.deepEqual(plan?.notes, ["No shared main stylesheet was found; the :not(:defined) rule was left out."]);
  assert.equal(plan?.edits.size, 2);
});

test("undefined rule in an imported stylesheet counts across the site's linked sheets", () => {
  const plan = componentLoaderPlan(input({ "index.html": page(), "styles/site.css": '@import "other.css";\nbody {}', "styles/other.css": COMPONENT_LOADER_RULE }));
  assert.equal(plan?.edits.has("styles/site.css"), false);
  assert.equal(plan?.added, "Added the component loader to the page (components/components.js created).");
});

test("rule detection ignores comments, declarations and strings but reads grouping and nesting", () => {
  for (const source of ['/* :not(:defined) {} */', 'body { content: ":not(:defined)"; }', '[data-text=":not(:defined)"] { color: red; }', '@supports selector(:not(:defined)) { body { color: red; } }']) assert.equal(stylesheetHasUndefinedRule(source), false, source);
  for (const source of [':not(:defined) {}', '@scope (.test) { :not( :defined ) {} }', '.parent { & :not(:defined) {} }']) assert.equal(stylesheetHasUndefinedRule(source), true, source);
});

test("lazy starter export matches the version named by the worker, byte for byte; rule matches starter CSS", async () => {
  const root = `public/native-static-starter/${NATIVE_STARTER_VERSION}/files`;
  const bytes = readFileSync(`${root}/components/components.js.asset`, "utf8");
  const fetcher: typeof fetch = async request => {
    assert.equal(request, `/native-static-starter/${NATIVE_STARTER_VERSION}/files/components/components.js.asset`);
    return new Response(bytes);
  };
  assert.equal(await starterLoader(fetcher), bytes);
  assert.equal(readFileSync(`${root}/styles/site.css.asset`, "utf8").includes(COMPONENT_LOADER_RULE), true);
});

test("loader asset failure refuses the read", async () => {
  await assert.rejects(starterLoader(async () => new Response("missing", { status: 404 })), /could not be read/);
});

test("a headless page still reports the omitted script when the loader already exists, without repairing the rule", () => {
  const plan = componentLoaderPlan(input({ "index.html": "<body></body>", "styles/site.css": "body {}" }, true));
  assert.deepEqual(plan?.creates, []);
  assert.equal(plan?.edits.size, 0);
  assert.equal(plan?.added, "");
  assert.match(plan!.notes[0], /index.html.*left out/);
});
