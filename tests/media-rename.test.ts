import { test } from "node:test";
import assert from "node:assert/strict";
import { planMediaRename, suggestMediaName, tidyMediaName } from "../src/page-builder/media-rename";
import { parseMediaRecords } from "../shared/media-records";

const from = "media/images/photo.webp", to = "media/images/b-photo.webp";
const paths = [from, "media/images/photo-480w.webp", "media/images/photo-480.webp", "media/originals/photo.HEIC", "media/images/photo-crop.webp"];
const records = parseMediaRecords(JSON.stringify({ version: 2, collections: ["Travel"], files: {
  [from]: { collections: ["Travel"], description: { text: "Tram", byAgent: true }, alwaysKeep: true },
  "media/images/photo-480.webp": { alwaysKeep: true },
  "media/images/photo-crop.webp": { trimmedFrom: { source: from, trim: { x: 0, y: 0, width: 1, height: 1 } } },
} }));
function plan(sources: Record<string, string> = {}, extra: Partial<Parameters<typeof planMediaRename>[0]> = {}) {
  const result = planMediaRename({ from, to, paths, sources, records, site: { origins: ["https://site.test"] }, ...extra });
  assert.ok(!("taken" in result));
  return result;
}

test("tidy basename, punctuation, empty names and other languages", () => {
  assert.equal(tidyMediaName("folder/My Photo (1).WEBP"), "my-photo-1.webp");
  assert.equal(tidyMediaName("C:\\photos\\京都 新年_２０２６.webp"), "京都-新年-２０２６.webp");
  assert.equal(tidyMediaName("Été -- München.webp"), "été-münchen.webp");
  assert.equal(tidyMediaName(""), "media");
  assert.equal(tidyMediaName("!? __"), "media");
  assert.equal(tidyMediaName("--.webp"), "media.webp");
});
test("whole family follows, trimmed file keeps its name and records follow", () => {
  const result = plan();
  assert.deepEqual(result.moves, [
    { from, to }, { from: paths[2], to: "media/images/b-photo-480.webp" },
    { from: paths[1], to: "media/images/b-photo-480w.webp" },
    { from: paths[3], to: "media/originals/b-photo.HEIC" },
  ]);
  assert.deepEqual(result.records.files[to], records.files[from]);
  assert.equal(result.records.files[paths[4]].trimmedFrom?.source, to);
  assert.equal(result.records.files["media/images/b-photo-480.webp"].alwaysKeep, true);
  assert.ok(records.files[from]);
});
test("every text kind, escaped addresses, own host and family mentions rewrite once", () => {
  const sources = {
    "index.html": '<img src="/media/images/photo.webp" srcset="/media/images/photo.webp 1x, /media/images/photo-480.webp 2x"><script type="application/ld+json">{"image":"/media/images/photo.webp"}</script><script>const x="/media/images/photo.webp"</script><!-- /media/images/photo.webp --><meta property="og:image" content="http://www.site.test/media/images/photo.webp?x=1&amp;y=2#hi">',
    "styles/main.css": 'a{background:url(../media/images/photo.webp)}',
    "scripts/app.js": 'const x="\\/media\\/images\\/photo.webp?x=1#hi";',
    "data.json": '{"image":"/media/images/photo.webp"}',
    "sitemap.xml": '<loc>https://site.test/media/images/photo.webp?a=1&amp;b=2#hi</loc>',
    "icon.svg": '<image xlink:href="/media/images/photo.webp"/>',
    "AGENTS.md": '[image](media/images/photo.webp) photo.webp',
    "_headers": '/media/images/photo.webp\n  Cache-Control: max-age=10',
    "external.txt": 'https://other.test/media/images/photo.webp //other.test/media/images/photo.webp photo-crop.webp',
  };
  const result = plan(sources);
  for (const file of Object.keys(sources).filter(file => file !== "external.txt")) {
    assert.ok(result.edits.has(file), file);
    assert.ok(!result.edits.get(file)!.includes("b-b-photo"), file);
  }
  assert.ok(result.edits.get("index.html")!.includes('/media/images/b-photo-480.webp 2x'));
  assert.ok(result.edits.get("index.html")!.includes('http://www.site.test/media/images/b-photo.webp?x=1&amp;y=2#hi'));
  assert.equal(result.edits.get("scripts/app.js"), 'const x="\\/media\\/images\\/b-photo.webp?x=1#hi";');
  assert.equal(result.edits.get("sitemap.xml"), '<loc>https://site.test/media/images/b-photo.webp?a=1&amp;b=2#hi</loc>');
  assert.equal(result.edits.has("external.txt"), false);
});
test("resolved references beat ambiguity; unresolvable bare names and suffixes stay untouched", () => {
  const result = plan({ "notes.md": 'photo.webp images/photo.webp /media/images/photo.webp /other/photo.webp', "media/images/notes.md": 'photo.webp' }, { paths: [...paths, "other/photo.webp", "other/images/photo.webp"] });
  assert.equal(result.edits.get("notes.md"), 'photo.webp images/photo.webp /media/images/b-photo.webp /other/photo.webp');
  assert.equal(result.edits.get("media/images/notes.md"), 'b-photo.webp');
});
test("percent encoding, entities, dot segments and names with separators retain spelling", () => {
  const result = plan({ "notes.xml": '<a>/media&#47;images&#47;photo.webp?x=1&amp;y=2</a>', "notes.txt": '/media/images/../images/photo.webp' });
  assert.equal(result.edits.get("notes.xml"), '<a>/media&#47;images&#47;b-photo.webp?x=1&amp;y=2</a>');
  assert.equal(result.edits.get("notes.txt"), '/media/images/b-photo.webp');
  const encoded = plan({ "notes.txt": '/media/%E4%BA%AC%E9%83%BD.webp?ok#yes' }, { from: "media/京都.webp", to: "media/東京.webp", paths: ["media/京都.webp"] });
  assert.equal(encoded.edits.get("notes.txt"), '/media/%E6%9D%B1%E4%BA%AC.webp?ok#yes');
  const spaces = plan({ "notes.md": 'media/My Photo (1).webp' }, { from: "media/My Photo (1).webp", to: "media/new.webp", paths: ["media/My Photo (1).webp"] });
  assert.equal(spaces.edits.get("notes.md"), 'media/new.webp');
});
test("a.webp to b-a.webp never rescans inserted text or touches a different basename", () => {
  const result = plan({ "a.js": '"a.webp /a.webp /ba.webp /a-480.webp"' }, { from: "a.webp", to: "b-a.webp", paths: ["a.webp", "ba.webp", "a-480.webp"] });
  assert.equal(result.edits.get("a.js"), '"b-a.webp /b-a.webp /ba.webp /b-a-480.webp"');
});
test("numbered suggestion checks main, copies and originals, refusing the entire plan", () => {
  const result = planMediaRename({ from, to, paths: [...paths, "media/images/b-photo-480.webp", "media/originals/b-photo-2.HEIC", "media/images/b-photo-3-480w.webp"], sources: {}, records });
  assert.deepEqual(result, { taken: to, suggestion: "media/images/b-photo-4.webp" });
  assert.equal(suggestMediaName("lisbon-tram.webp", name => name === "lisbon-tram-2.webp"), "lisbon-tram-3.webp");
});
test("forwarding covers every member when ticked, absent when unticked, and retargets existing lines", () => {
  assert.equal(plan().redirects, undefined);
  const forwarding = plan({}, { keepOldAddress: true }).redirects!;
  for (const move of plan().moves) assert.ok(forwarding.includes(`/${move.from} /${move.to} 301\n`));
  const result = plan({ _redirects: `/ancient /${from} 301\n/${to} /away 301\n# ${from}\n` });
  assert.equal(result.edits.has("_redirects"), false);
  assert.equal(result.redirects, `/ancient /${to} 301\n# ${from}\n`);
});
test("component relative references resolve against their using page", () => {
  const result = plan({ "components/card.html": '<img src="images/photo.webp">', "media/index.html": '<site-card></site-card>' }, { site: { origins: [], pages: ["media/index.html"], components: { "site-card": "components/card.html" } } });
  assert.equal(result.edits.get("components/card.html"), '<img src="/media/images/b-photo.webp">');
});

test("structured CSS escapes resolve and replacement leaves unchanged escapes intact", () => {
  const result = plan({ "style.css": 'a{background:url(/media/images/\\70 hoto.webp)}' });
  assert.equal(result.edits.get("style.css"), 'a{background:url(/media/images/b-\\70 hoto.webp)}');
});

test("with no configured own host, full addresses stay untouched", () => {
  const result = plan({ "index.html": '<img src="https://other.test/media/images/photo.webp"><img src="/media/images/photo.webp">' }, { site: { origins: [] } });
  assert.equal(result.edits.get("index.html"), '<img src="https://other.test/media/images/photo.webp"><img src="/media/images/b-photo.webp">');
});

test("an own-domain redirect destination follows, keeping its query and hash; its source stays", () => {
  const result = plan({ _redirects: `/old https://site.test/${from}?v=2#top 301\n/${from} https://other.test/${from} 302\n` });
  assert.equal(result.redirects, `/old https://site.test/${to}?v=2#top 301\n/${from} https://other.test/${from} 302\n`);
});

test("a numeric entity without its semicolon is decoded, so the replacement lands on the name", () => {
  const result = plan({ "index.html": '<img src="/&#109edia/images/photo.webp">' });
  assert.equal(result.edits.get("index.html"), '<img src="/&#109edia/images/b-photo.webp">');
});

test("forwarding encodes names with spaces and reserved characters, for every family member", () => {
  const old = "media/My Photo (1).webp";
  const result = planMediaRename({ from: old, to: "media/new.webp", paths: [old, "media/My Photo (1)-480w.webp"], sources: {}, records, keepOldAddress: true });
  assert.ok(!("taken" in result));
  assert.equal(result.redirects, "/media/My%20Photo%20(1).webp /media/new.webp 301\n/media/My%20Photo%20(1)-480w.webp /media/new-480w.webp 301\n");
});

test("a named reference without its semicolon is decoded like the scanner does", () => {
  const old = "media/©.webp";
  const result = planMediaRename({ from: old, to: "media/new.webp", paths: [old], sources: { "index.html": '<img src="/media/&copy.webp">' }, records });
  assert.ok(!("taken" in result));
  assert.equal(result.edits.get("index.html"), '<img src="/media/new.webp">');
});

test("redirect destinations in literal Unicode or lowercase escapes follow without forwarding", () => {
  const old = "media/京都.webp";
  const result = planMediaRename({ from: old, to: "media/kyoto.webp", paths: [old], records,
    sources: { _redirects: "/a /media/京都.webp 301\n/b /media/%e4%ba%ac%e9%83%bd.webp?x=1 301\n" } });
  assert.ok(!("taken" in result));
  assert.equal(result.redirects, "/a /media/kyoto.webp 301\n/b /media/kyoto.webp?x=1 301\n");
});
