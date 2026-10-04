import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { applyCollectionEdits, planBake } from "../src/page-builder/collection-bake.ts";
import { planSidecarRecipe } from "../src/page-builder/collection-origins.ts";
import { planNativeCollectionOperation, type NativeCollectionOrigin } from "../src/page-builder/native-collection-host.ts";
import { NativePageFieldError, planLegacyPageFieldMigration } from "../src/page-builder/native-page-fields.ts";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument } from "../src/page-builder/page-builder-document.ts";
import { deriveNativeRoutes } from "../shared/native-routes.ts";

const starter = "fixtures/actual-starter";
const fern = "work/fern-and-kettle/index.html";
const pottery = "work/harbour-lane-pottery/index.html";
const identity = { name: "Larkspur Studio" };

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const rel = prefix + name;
    return statSync(`${dir}/${name}`).isDirectory() ? walk(`${dir}/${name}`, `${rel}/`) : [rel];
  });
}
function load(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json|css|js)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  return sources;
}
const meta = (field: string, value: string) => `  <meta name="field:${field}" content="${value}">\n`;
const withMeta = (source: string, lines: string) => source.replace("</head>", `${lines}</head>`);

/** Applies a host plan to a source map exactly as the operation writes it. */
function plan(sources: Record<string, string>, origin: NativeCollectionOrigin) {
  const files = Object.keys(sources).sort();
  const planned = planNativeCollectionOperation({ sources, routes: deriveNativeRoutes(files), files, revision: "r", identity, origin });
  if ("error" in planned) throw new Error(planned.error);
  const next = { ...sources };
  for (const file of planned.operation.creates ?? []) next[file.path] = file.content;
  for (const [path, text] of planned.operation.edits ?? []) next[path] = text;
  return { next, planned };
}
function bakeLegacy(sources: Record<string, string>) {
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity);
  if ("error" in baked) throw new Error(baked.error);
  const next = { ...sources };
  for (const [path, edits] of Object.entries(baked.edits)) next[path] = applyCollectionEdits(next[path], edits);
  return next;
}
function migrate(sources: Record<string, string>, pagePath: string) {
  const files = Object.keys(sources).sort();
  const result = planLegacyPageFieldMigration({ files, pagePath, source: sources[pagePath], sidecarText: sources[EDITOR_PAGE_BUILDER_PATH] });
  assert.equal(result.noop, false);
  if (result.noop) throw new Error("noop");
  assert.deepEqual([...result.expectedFiles].sort(), files);
  const edits = new Map(result.edits), creates: { path: string; content: string }[] = [];
  if (sources[EDITOR_PAGE_BUILDER_PATH] === undefined) {
    creates.push({ path: EDITOR_PAGE_BUILDER_PATH, content: edits.get(EDITOR_PAGE_BUILDER_PATH)! });
    edits.delete(EDITOR_PAGE_BUILDER_PATH);
  }
  return plan(sources, { expectedSources: result.expectedSources, edits, creates, done: "", undone: "" });
}

const legacyList = '<ul class="legacy-list" data-each="/work/" data-sort="client"><template><li><a href="{url}">{title}</a> for {client}</li></template></ul>';
const jsonGrid = '<div class="json-grid"></div>';

/** Starter with old field metas, a JSON recipe on About and an inline recipe on Home, both baked. */
function site(withJson = true) {
  let sources = load();
  sources[fern] = withMeta(sources[fern], meta("client", "Fern Co"));
  sources[pottery] = withMeta(sources[pottery], meta("client", "Harbour Ltd") + meta("year", "2024"));
  sources["work/meadow-row-allotments/index.html"] = withMeta(sources["work/meadow-row-allotments/index.html"], meta("client", "Meadow Trust"));
  if (withJson) {
    sources["about/index.html"] = sources["about/index.html"].replace("</main>", `${jsonGrid}\n</main>`);
    const start = sources["about/index.html"].indexOf(jsonGrid);
    const origin = planSidecarRecipe({ sources, routes: deriveNativeRoutes(Object.keys(sources)), identity }, "about/index.html", start,
      { folders: ["/work/"], sort: "-client", filter: "", limit: 6, template: "<p>{title}: {client}</p>", fields: ["client"] });
    sources = plan(sources, { ...origin, done: "", undone: "" }).next;
    // Unknown JSON data is the user's: it survives the migration byte for byte in meaning.
    const document = JSON.parse(sources[EDITOR_PAGE_BUILDER_PATH]);
    document.future = { keep: [1, 2] };
    document.pages["index.html"] = { fields: { tone: "warm" }, custom: true };
    sources[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify(document, null, 2) + "\n";
  }
  sources["index.html"] = sources["index.html"].replace("</main>", `${legacyList}\n</main>`);
  return bakeLegacy(sources);
}
const between = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)) + to.length);

test("migrating keeps legacy and JSON cards identical and removes only the field metas", () => {
  const before = site();
  assert.match(before["index.html"], /Fern &amp; Kettle<\/a> for Fern Co/);
  assert.match(before["about/index.html"], /Fern &amp; Kettle: Fern Co/);
  const { next, planned } = migrate(before, pottery);
  assert.equal(next["index.html"], before["index.html"]);
  assert.equal(next["about/index.html"], before["about/index.html"]);
  assert.equal(next[pottery], before[pottery].replace(meta("client", "Harbour Ltd") + meta("year", "2024"), ""));
  assert.doesNotMatch(next[pottery], /field:/);
  assert.equal(next[fern], before[fern]);
  const document = readPageBuilderDocument(next[EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual({ ...document.pages[pottery].fields }, { client: "Harbour Ltd", year: "2024" });
  const raw = JSON.parse(next[EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual(raw.future, { keep: [1, 2] });
  assert.deepEqual(raw.pages["index.html"], { fields: { tone: "warm" }, custom: true });
  // The whole step is one operation: page and JSON (plus any cards) in one write set.
  assert.deepEqual([...planned.operation.edits!.keys()].sort(), [EDITOR_PAGE_BUILDER_PATH, pottery].sort());
  assert.equal(planned.operation.expectedSources.get(pottery), before[pottery]);
  assert.equal(planned.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), before[EDITOR_PAGE_BUILDER_PATH]);
});

test("every page migrated: cards stay identical and no published page keeps editor fields", () => {
  let sources = site();
  const cards = [between(sources["index.html"], '<ul class="legacy-list"', "</ul>"), between(sources["about/index.html"], '<div class="json-grid"', "</div>")];
  for (const page of [fern, pottery, "work/meadow-row-allotments/index.html"]) sources = migrate(sources, page).next;
  assert.deepEqual([between(sources["index.html"], '<ul class="legacy-list"', "</ul>"), between(sources["about/index.html"], '<div class="json-grid"', "</div>")], cards);
  for (const [path, text] of Object.entries(sources)) if (path.endsWith(".html") && !path.startsWith("components/")) assert.doesNotMatch(text, /name="field:/, path);
  // Deleting the editor's JSON leaves ready HTML: the cards are already in the pages.
  const { [EDITOR_PAGE_BUILDER_PATH]: _json, ...published } = sources;
  assert.match(published["index.html"], /Fern &amp; Kettle<\/a> for Fern Co/);
});

test("a missing JSON is created by the migration, and cards are unchanged", () => {
  const before = site(false);
  assert.equal(before[EDITOR_PAGE_BUILDER_PATH], undefined);
  const { next, planned } = migrate(before, fern);
  assert.deepEqual(planned.operation.creates?.map((file) => file.path), [EDITOR_PAGE_BUILDER_PATH]);
  assert.equal(planned.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), undefined);
  assert.ok(planned.operation.expectedSources.has(EDITOR_PAGE_BUILDER_PATH));
  assert.deepEqual({ ...readPageBuilderDocument(next[EDITOR_PAGE_BUILDER_PATH]).pages[fern].fields }, { client: "Fern Co" });
  assert.equal(next["index.html"], before["index.html"]);
});

test("a JSON value that differs from the page refuses, naming the field", () => {
  const before = site();
  const document = JSON.parse(before[EDITOR_PAGE_BUILDER_PATH]);
  document.pages[fern] = { fields: { client: "Other" } };
  const sidecarText = JSON.stringify(document, null, 2) + "\n";
  assert.throws(() => planLegacyPageFieldMigration({ files: Object.keys(before).sort(), pagePath: fern, source: before[fern], sidecarText }),
    (error: unknown) => error instanceof NativePageFieldError && error.code === "native-page-fields/conflict" && /client/.test(error.message));
});

test("legacy listings read JSON page fields over the page's own, as JSON recipes do", () => {
  const sources = site(false);
  sources[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify({ version: 1, pages: { [fern]: { fields: { client: "Zed Cafe" } } }, collections: {} }) + "\n";
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity);
  if ("error" in baked) throw new Error(baked.error);
  const output = baked.collections.find((item) => item.path === "index.html")!.output;
  assert.match(output, /Fern &amp; Kettle<\/a> for Zed Cafe/);
  // JSON values sort too: Zed Cafe now comes last.
  assert.ok(output.indexOf("Zed Cafe") > output.indexOf("Meadow Trust"));
});

test("an invalid JSON refuses a legacy rebuild instead of guessing", () => {
  const sources = site(false);
  sources[EDITOR_PAGE_BUILDER_PATH] = "{ not json";
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity);
  assert.ok("error" in baked && /not valid/.test(baked.error));
  // A page without legacy listings never reads it.
  const plain = load();
  plain[EDITOR_PAGE_BUILDER_PATH] = "{ not json";
  assert.ok(!("error" in planBake(plain, deriveNativeRoutes(Object.keys(plain)), identity)));
});

test("a page without old field metas is a no-op", () => {
  const sources = load();
  assert.deepEqual(planLegacyPageFieldMigration({ files: Object.keys(sources).sort(), pagePath: fern, source: sources[fern] }), { noop: true });
});
