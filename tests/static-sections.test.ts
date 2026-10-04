import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument } from "../src/page-builder/page-builder-document.ts";
import { listSectionChoices, previewStaticSection, readStaticSectionRecords, planStaticSectionInsert, type StaticSectionRecord, type StaticSectionInsertInput } from "../src/page-builder/static-sections.ts";

const section: StaticSectionRecord = {
  id: "intro", label: "Introduction", rootClass: "intro-section", stylesheetPath: "styles/sections.css",
  html: `<section class="intro-section" data-action="open" aria-label="A &amp; B"><!-- Keep comment --><h2>Welcome &amp; hello</h2><p data-label='Say &quot;Hi&quot;'>Plain HTML</p><pre>First\n  Second</pre></section>`,
  css: `/* authored CSS */\n.intro-section { color: var(--brand); --gap: 1rem; }\n@media (min-width: 40rem) { .intro-section > h2, .intro-section p { margin: 0; } }\n@supports (display: grid) { @container (min-width: 20rem) { .intro-section { display: grid; gap: var(--gap); } } }\n`,
  future: { author: "Keep unknown record metadata" },
};
const page = '<!doctype html><html><head><title>Native site</title></head><body><main><!-- Existing --><p>Keep</p></main></body></html>';
function document(record: StaticSectionRecord = section): string { return JSON.stringify({version:1,pages:{},collections:{},future:{kept:true},reusableSections:{version:1,records:{[record.id]:record},future:["unknown"]}}); }
function input(extra: Partial<StaticSectionInsertInput> = {}): StaticSectionInsertInput {
  return { documentText: document(), sectionId: "intro", pagePath: "index.html", pageSource: page, parent: [0], index: 1, stylesheetSources: { "styles/sections.css": undefined }, files: ["index.html", EDITOR_PAGE_BUILDER_PATH], ...extra };
}
function good(value: StaticSectionInsertInput) { const result = planStaticSectionInsert(value); if ("error" in result) assert.fail(result.error); return result; }
function failure(value: StaticSectionInsertInput, reason: string) { const before = structuredClone(value); assert.deepEqual(planStaticSectionInsert(value), { error: reason }); assert.deepEqual(value, before); }

test("catalogue validates whole JSON, preserves unknown metadata and previews literal HTML/CSS", () => {
  const text = document();
  assert.deepEqual(listSectionChoices(text), [{id:"intro",label:"Introduction",rootClass:"intro-section"}]);
  assert.deepEqual(previewStaticSection(text,"intro"), {html:section.html,css:section.css,rootClass:section.rootClass});
  assert.deepEqual(readStaticSectionRecords(text).intro.future, section.future);
  assert.equal(writePageBuilderDocument(readPageBuilderDocument(text), text), text);
  assert.deepEqual(listSectionChoices(undefined), []);
  assert.deepEqual(previewStaticSection(undefined,"intro"), {error:"Choose a registered static section."});
  for (const version of [2,"1"]) {
    const parsed=JSON.parse(text);parsed.reusableSections.version=version;
    assert.throws(()=>readStaticSectionRecords(JSON.stringify(parsed)),{message:"Unsupported reusable sections version."});
  }
  assert.throws(()=>readStaticSectionRecords('{"version":2,"pages":{},"collections":{}}'),{message:"Unsupported page builder document version."});
  const mismatch=JSON.parse(text);mismatch.reusableSections.records.intro.id="other";
  assert.throws(()=>readStaticSectionRecords(JSON.stringify(mismatch)),{message:"Invalid static section identity, label, rootClass or stylesheet path."});
});

test("insert is one guarded native HTML operation and ordinary CSS creation", () => {
  const before=input(), plan=good(before);
  const html=plan.operation.edits.get("index.html")!;
  assert.equal(html, '<!doctype html><html><head><title>Native site</title>\n  <link rel="stylesheet" href="styles/sections.css">\n</head><body><main><!-- Existing --><p>Keep</p>\n'+section.html+'</main></body></html>');
  assert.deepEqual(plan.operation.creates,[{path:"styles/sections.css",content:section.css}]);
  assert.equal(plan.operation.edits.size,1);
  assert.equal(plan.operation.expectedSources.get("index.html"),page);
  assert.equal(plan.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH),before.documentText);
  assert.ok(plan.operation.expectedSources.has("styles/sections.css"));
  assert.equal(plan.operation.expectedSources.get("styles/sections.css"),undefined);
  assert.deepEqual(plan.selection,{path:"index.html",node:[0,1]});
  assert.deepEqual(plan.expectedFiles,[EDITOR_PAGE_BUILDER_PATH,"index.html"]);
  assert.ok(html.includes('data-action="open"'));assert.ok(html.includes('aria-label="A &amp; B"'));assert.ok(html.includes("data-label='Say &quot;Hi&quot;'"));assert.ok(html.includes('<pre>First\n  Second</pre>'));
  assert.equal(html.includes(section.id+'="'),false);assert.equal(html.includes('data-editor'),false);
  assert.deepEqual(before,input());
});

test("existing unrelated CSS bytes append literally and repeated instances deduplicate CSS/link", () => {
  const existing='/* Other author */\r\nbody { margin: 0; }\r\n';
  const first=good(input({stylesheetSources:{"styles/sections.css":existing},files:["index.html",EDITOR_PAGE_BUILDER_PATH,"styles/sections.css"]}));
  const css=first.operation.edits.get("styles/sections.css")!;
  assert.equal(css,existing+section.css);
  const firstPage=first.operation.edits.get("index.html")!;
  const second=good(input({pageSource:firstPage,index:2,stylesheetSources:{"styles/sections.css":css},files:["index.html",EDITOR_PAGE_BUILDER_PATH,"styles/sections.css"]}));
  assert.equal(second.operation.edits.has("styles/sections.css"),false);assert.equal(second.operation.creates,undefined);
  const secondPage=second.operation.edits.get("index.html")!;
  assert.equal((secondPage.match(/<section /g)??[]).length,2);
  assert.equal((secondPage.match(/rel="stylesheet"/g)??[]).length,1);
  assert.equal(second.operation.expectedSources.get("styles/sections.css"),css);
  assert.equal(second.operation.expectedSources.get("index.html"),firstPage);
});

test("subpage link is relative; metadata remains private and optional after publication", () => {
  const plan=good(input({pagePath:"work/a/index.html",files:["work/a/index.html",EDITOR_PAGE_BUILDER_PATH]}));
  const html=plan.operation.edits.get("work/a/index.html")!;
  assert.ok(html.includes('href="../../styles/sections.css"'));
  assert.equal(plan.operation.edits.has(EDITOR_PAGE_BUILDER_PATH),false);
  assert.equal(html.includes('reusableSections'),false);assert.equal(html.includes('<template'),false);assert.equal(html.includes('<script'),false);assert.equal(html.includes('<slot'),false);
  assert.equal(plan.operation.creates![0].content,section.css);
  assert.deepEqual(previewStaticSection(undefined,"intro"),{error:"Choose a registered static section."});
});

test("CSS absence requires both explicit source absence and a complete graph", () => {
  failure(input({stylesheetSources:{}}),'Load styles/sections.css or explicitly prove it is absent.');
  failure(input({files:undefined}),'A complete file graph must prove the new stylesheet is absent.');
  failure(input({files:["index.html",EDITOR_PAGE_BUILDER_PATH,"styles/sections.css"]}),'A complete file graph must prove the new stylesheet is absent.');
  failure(input({documentText:undefined}),'Choose a registered static section.');
});

for (const html of [
  '<section class="intro-section"><script>alert(1)</script></section>',
  '<section class="intro-section"><card-project></card-project></section>',
  '<section class="intro-section"><slot></slot></section>',
  '<section class="intro-section"><template><p>Inert</p></template></section>',
  '<section class="intro-section"><style>.x {color:red}</style></section>',
]) test(`unsupported section markup refuses without dropping content: ${html}`, () => {
  failure(input({documentText:document({...section,html})}),"Static sections support ordinary HTML without scripts, embedded styles, custom tags, slots, templates or foreign markup.");
});

test("malformed HTML, implied closures, multiple roots, duplicated attrs/ids and editor attributes refuse", () => {
  for (const html of ['<section class="intro-section"><p>One<p>Two</section>','<section class="intro-section"><b>Open</section>']) failure(input({documentText:document({...section,html})}),"Section HTML cannot be safely inserted: malformed, implied-closing or unsupported native markup.");
  failure(input({documentText:document({...section,html:section.html+'<p>Another root</p>'})}),"A static section needs exactly one explicit <section> root.");
  failure(input({documentText:document({...section,html:'<section class="intro-section" class="other"></section>'})}),"Duplicate section attributes are unsupported.");
  failure(input({documentText:document({...section,html:'<section class="intro-section" data-native-selection-box="x"></section>'})}),"Editor-owned or shadow attributes cannot be published in a static section.");
  failure(input({documentText:document({...section,html:'<section class="intro-section"><h2 id="same">A</h2><p id="same">B</p></section>'})}),"A section cannot contain duplicate authored ids.");
});

for (const css of ['body {color:red}', '.intro-section-other {color:red}', '.intro-section + p {color:red}', '.intro-section ~ p {color:red}', ':is(.intro-section, body) {color:red}', '.intro\\2d section {color:red}', '.intro-section, body {color:red}', '.intro-section { & h2 {color:red} }', '.intro-section,,.intro-section h2 {color:red}']) test(`CSS cannot leak its scope: ${css}`, () => {
  failure(input({documentText:document({...section,css})}),"Every section style selector must be rooted in its literal rootClass without global leakage or nesting.");
});

test("unsupported CSS at-rules and malformed CSS refuse explicitly", () => {
  failure(input({documentText:document({...section,css:'.intro-section ::slotted(h2) {color:red}'})}),"Shadow-only CSS is unsupported in static sections.");
  failure(input({documentText:document({...section,css:'@import "other.css"; .intro-section {color:red}'})}),"Standalone CSS at-rules are unsupported in section styles.");
  failure(input({documentText:document({...section,css:'@font-face { font-family: x; src:url(x); }'})}),"Section styles support only rule-grouping @media, @supports and @container.");
  failure(input({documentText:document({...section,css:'.intro-section { color:red'})}),"The stylesheet has unbalanced CSS delimiters.");
});

test("shared CSS conflicts refuse without overwriting or deduplicating comment text", () => {
  for (const css of ['.intro-section { color:blue }', '.intro\\2d section { color:blue }', '/* '+section.css.replace('/* authored CSS */\n','')+' */\n.intro-section { color:blue }']) failure(input({stylesheetSources:{'styles/sections.css':css},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'styles/sections.css']} ),"Existing stylesheet rules conflict with this section's rootClass; no CSS was overwritten.");
  const conditional='@media print { '+section.css+' }';
  failure(input({stylesheetSources:{'styles/sections.css':conditional},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'styles/sections.css']} ),"Existing stylesheet rules conflict with this section's rootClass; no CSS was overwritten.");
});

test("authored ids remain literal; a second instance with those ids refuses", () => {
  const record={...section,html:'<section class="intro-section" id="authored"><h2>Keep</h2></section>'};
  const first=good(input({documentText:document(record)}));
  const html=first.operation.edits.get('index.html')!;assert.ok(html.includes('id="authored"'));
  failure(input({documentText:document(record),pageSource:html,index:2,stylesheetSources:{'styles/sections.css':section.css},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'styles/sections.css']}),'Inserting this section would duplicate an authored id.');
});

test("conditional links, imports and base href refuse instead of changing stylesheet semantics", () => {
  for (const attr of ['media="print"','integrity="sha384-proof"','disabled','title="Alternative"']) failure(input({pageSource:page.replace('</head>',`<link rel="stylesheet" href="styles/sections.css" ${attr}></head>`)}),"The section stylesheet has a conditional or protected existing link.");
  failure(input({pageSource:page.replace('</head>','<base href="/other/"></head>')}),"A base href prevents safe static section stylesheet linking.");
  failure(input({stylesheetSources:{'styles/sections.css':undefined,'styles/site.css':'@import "sections.css";'},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'styles/site.css']}),"The section stylesheet is already loaded through a CSS import.");
});

test("authored functional data attributes remain literal, including names that resemble editor metadata", () => {
  const record={...section,html:'<!-- Intro --><section class="intro-section" data-editor-mode="catalogue" data-page-builder-label="site-feature"><h2>Native</h2></section><!-- End -->'};
  const result=good(input({documentText:document(record)}));
  assert.ok(result.operation.edits.get('index.html')!.includes(record.html));
});

test("supplied shared stylesheet conflicts and unknown active stylesheet links refuse", () => {
  failure(input({stylesheetSources:{'styles/sections.css':undefined,'theme.css':'.intro-section {color:red}'},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'theme.css']}),"Another supplied stylesheet already uses this section's rootClass.");
  failure(input({pageSource:page.replace('</head>','<link rel="stylesheet" href="theme.css"></head>')}),'Load theme.css before verifying section stylesheet links.');
  failure(input({documentText:document({...section,css:'.intro-section { color:red; @apply something; }'})}),'Standalone CSS at-rules are unsupported in section styles.');
});

test("CSS in comments never substitutes for active rules; comment-only CSS deduplicates", () => {
  const record={...section,css:'.intro-section { color:red; }'};
  const comment='/* '+record.css+' */\n';
  const plan=good(input({documentText:document(record),stylesheetSources:{'styles/sections.css':comment},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'styles/sections.css']}));
  assert.equal(plan.operation.edits.get('styles/sections.css'),comment+record.css);
  const onlyComment={...section,css:'/* Native section inherits the site typography. */'};
  const dedup=good(input({documentText:document(onlyComment),stylesheetSources:{'styles/sections.css':onlyComment.css},files:['index.html',EDITOR_PAGE_BUILDER_PATH,'styles/sections.css']}));
  assert.equal(dedup.operation.edits.has('styles/sections.css'),false);
});

test("inline class collisions and uninspectable external stylesheet links refuse", () => {
  failure(input({pageSource:page.replace('</head>','<style>.intro-section { color: blue; }</style></head>')}),"An inline stylesheet already uses this section's rootClass.");
  failure(input({pageSource:page.replace('</head>','<link rel="stylesheet" href="https://example.test/theme.css"></head>')}),"External stylesheet links cannot be verified for static section insertion.");
});
