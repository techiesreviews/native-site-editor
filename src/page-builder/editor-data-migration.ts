// One-time move of every inline editor-only recipe and field out of the
// site's pages into the editor's JSON (.editor/page-builder.json). Pure: it
// reads a whole-site snapshot and returns one operation for the host to apply
// (one draft write, one Undo). It reuses the existing importers; it does not
// parse recipes or fields itself.
import { startTags } from "../../shared/html-source";
import { nativePageRoute } from "../../shared/native-routes";
import { startTagAttributes } from "./component-model";
import { decodeHtmlEntities } from "./html-entities";
import { readCollections } from "./collection-model";
import { withLegacyImported } from "./collection-origins";
import { planNativeCollectionOperation, type NativeCollectionOrigin, type NativeCollectionSnapshot } from "./native-collection-host";
import { NativePageFieldError, planLegacyPageFieldMigration, readEditorFieldMetas } from "./native-page-fields";
import { EDITOR_PAGE_BUILDER_PATH, writePageBuilderDocument } from "./page-builder-document";

/** What the site's pages still carry inline: pages that will change, listing recipes and field tags. */
export interface InlineEditorData { pages: string[]; listings: number; fields: number }

export interface EditorDataMigration extends InlineEditorData {
  origin: NativeCollectionOrigin & { expectedSources: Map<string, string | undefined>; edits: Map<string, string>; creates: { path: string; content: string }[] };
}

const pages = (sources: Readonly<Record<string, string>>) => Object.keys(sources).filter((path) => nativePageRoute(path) !== undefined).sort();

/**
 * Counts inline editor data without trusting it: a recipe or field tag the
 * importers cannot read still counts (from its raw attribute), so the action
 * is offered and then refuses with the importer's reason.
 */
export function findInlineEditorData(sources: Readonly<Record<string, string>>): InlineEditorData {
  const found: InlineEditorData = { pages: [], listings: 0, fields: 0 };
  for (const [path, { listings, fields }] of survey(sources)) { found.pages.push(path); found.listings += listings; found.fields += fields; }
  return found;
}
function survey(sources: Readonly<Record<string, string>>): Map<string, { listings: number; fields: number }> {
  const found = new Map<string, { listings: number; fields: number }>();
  for (const path of pages(sources)) {
    const source = sources[path];
    let listings = 0, fields = 0;
    if (/\sdata-each\b/i.test(source)) {
      try { listings = readCollections(source).length; } catch { listings = source.match(/\sdata-each\b/gi)!.length; }
    }
    // Field names are read decoded (field&#58;x is a field), as the importer reads them.
    if (/<meta\b/i.test(source)) {
      try { fields = readEditorFieldMetas(source).length; }
      catch { fields = startTags(source).filter((tag) => tag.name === "meta" && decodeHtmlEntities(source.slice(tag.start, tag.end), true).includes("field:")).length; }
    }
    if (listings || fields) found.set(path, { listings, fields });
  }
  return found;
}

/**
 * A field tag is removed whole, so it must hold nothing but its field: a tag
 * that also has http-equiv (a redirect, a security policy), charset, itemprop,
 * property or any other attribute does something for the page and refuses.
 */
function assertOnlyEditorData(path: string, source: string) {
  let metas: ReturnType<typeof readEditorFieldMetas>;
  try { metas = readEditorFieldMetas(source); } catch { return; } // The field importer refuses it with its own reason.
  const tags = startTags(source);
  for (const meta of metas) {
    const tag = tags.find((item) => item.start === meta.start);
    const extra = tag ? [...new Set(startTagAttributes(source, tag).map((item) => item.name.toLowerCase()).filter((name) => name !== "name" && name !== "content"))] : ["unreadable markup"];
    if (extra.length) refuse(`${path}: The field tag “field:${meta.field}” also has ${extra.join(", ")}, which the page itself may use, so it is neither moved nor removed. In Code, move that attribute to a tag of its own or take the field name off this tag, then try again.`);
  }
}

const refuse = (reason: string): never => { throw new Error(`${reason.trim().replace(/([^.!?])$/, "$1.")} Nothing was changed.`); };

/**
 * Plans the whole move against one snapshot (every page and the JSON loaded).
 * Listing recipes go first (their private card fields with them), then every
 * page's remaining field tags, chained through the same JSON text. The plan
 * is then checked with the host planner: if any page would change beyond
 * losing its editor data (cards rebuilt, other pages touched), it refuses.
 * Throws a user-facing message on any refusal; returns undefined when there
 * is nothing inline.
 */
export function planEditorDataMigration(snapshot: NativeCollectionSnapshot): EditorDataMigration | undefined {
  const { sources, routes, identity } = snapshot;
  const files = [...new Set(snapshot.files)].sort();
  if (files.includes(EDITOR_PAGE_BUILDER_PATH) && sources[EDITOR_PAGE_BUILDER_PATH] === undefined) refuse(`${EDITOR_PAGE_BUILDER_PATH} is not loaded yet.`);
  for (const path of Object.values(routes)) if (sources[path] === undefined) refuse(`${path} is not loaded yet.`);
  const found = survey(sources), inline = findInlineEditorData(sources);
  if (!inline.pages.length) return undefined;
  const before = sources[EDITOR_PAGE_BUILDER_PATH];
  // Name the page whose recipe cannot be read; the importer would refuse it without saying where.
  for (const path of inline.pages) {
    try { readCollections(sources[path]); } catch (error) { refuse(`${path}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  let imported: ReturnType<typeof withLegacyImported>;
  try { imported = withLegacyImported({ sources, routes, identity }); }
  catch (error) { return refuse(error instanceof Error ? error.message.replace(/, so nothing was changed: /, ": ") : "The listings already on this site could not be read."); }
  const texts = new Map(imported.texts);
  let sidecar: string;
  try { sidecar = writePageBuilderDocument(imported.document, before); }
  catch (error) { return refuse(`The editor's data could not be written: ${error instanceof Error ? error.message : String(error)}`); }

  // Field tags: each page that has them, in turn, against the JSON as the previous step left it.
  const graph = [...new Set([...files, EDITOR_PAGE_BUILDER_PATH])].sort();
  for (const [path, { fields }] of found) {
    if (!fields) continue;
    const source = texts.get(path) ?? sources[path];
    assertOnlyEditorData(path, source);
    let plan: ReturnType<typeof planLegacyPageFieldMigration>;
    try { plan = planLegacyPageFieldMigration({ files: graph, pagePath: path, source, sidecarText: sidecar }); }
    catch (error) {
      if (error instanceof NativePageFieldError && error.code === "native-page-fields/conflict")
        refuse(`${path}: ${error.message} Open its Page settings › Fields and choose which value to keep first.`);
      return refuse(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (plan.noop) continue;
    texts.set(path, plan.edits.get(path)!);
    sidecar = plan.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? sidecar;
  }

  const edits = new Map<string, string>();
  for (const [path, text] of texts) if (text !== sources[path]) edits.set(path, text);
  const creates: { path: string; content: string }[] = [];
  if (before === undefined) creates.push({ path: EDITOR_PAGE_BUILDER_PATH, content: sidecar });
  else if (sidecar !== before) edits.set(EDITOR_PAGE_BUILDER_PATH, sidecar);
  // Every page is pinned (listings read all of them), with the JSON's bytes or absence.
  const expectedSources = new Map<string, string | undefined>(imported.expected);
  for (const path of pages(sources)) expectedSources.set(path, sources[path]);
  expectedSources.set(EDITOR_PAGE_BUILDER_PATH, before);
  const changed = [...edits.keys()].filter((path) => path !== EDITOR_PAGE_BUILDER_PATH).sort();
  const count = `${changed.length} ${changed.length === 1 ? "page" : "pages"}`;
  const origin = {
    expectedSources, edits, creates,
    done: `Moved editor data out of ${count} into ${EDITOR_PAGE_BUILDER_PATH}. Save to GitHub to keep it.`,
    undone: `Undid moving editor data out of ${count}.`,
  };

  // The host bakes stored listings in the same step: prove it changes nothing else.
  const checked = planNativeCollectionOperation({ ...snapshot, files, origin });
  if ("error" in checked) return refuse(checked.error);
  for (const [path, text] of checked.operation.edits ?? []) {
    if (path === EDITOR_PAGE_BUILDER_PATH) continue;
    if (edits.get(path) !== text) refuse(`The cards in ${path} would change, not only lose their recipe. Select the listing and rebuild its cards, or choose “Use manual cards”, first.`);
  }
  for (const path of changed) if (!checked.operation.edits?.has(path)) refuse(`${path} could not be cleaned exactly.`);
  if ((checked.operation.moves ?? []).length || (checked.operation.deletes ?? []).length || (checked.operation.creates ?? []).some((file) => file.path !== EDITOR_PAGE_BUILDER_PATH))
    refuse("Moving the editor data would change other files.");
  return { pages: changed, listings: inline.listings, fields: inline.fields, origin };
}
