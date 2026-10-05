import { expandStyleImports } from "../../shared/css-imports";
import { nativePageStylesheets } from "../../shared/native-project";
import { nativePageRoute } from "../../shared/native-routes";
import { attribute } from "./collection-model";
import { descendants, parseSource, type SourceElement } from "./component-model";
import { planNativeSectionLink, readNativeSectionLinks } from "./native-section-links";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import {
  planMakeSectionMaster, planStaticSectionSave, readSectionCatalog, resolveStaticSection, sectionMasterPath,
  type StaticSectionOperation, type StaticSectionRecord,
} from "./static-sections";

/**
 * Save an ordinary `<section>` already on a page as a new shared section, in one operation:
 * - `.editor/sections/<id>.html` is created with the section's exact bytes (the only HTML authority);
 * - `.editor/page-builder.json` gains one record (`htmlPath`, no `html`, empty `css` seed) and a
 *   link from the selected copy to it, whose basis is exactly that copy.
 *
 * The page and every stylesheet stay byte for byte: nothing is added to the published site. The
 * plan composes `planStaticSectionSave`, `planMakeSectionMaster` and `planNativeSectionLink` over
 * intermediate text, then pins only the ORIGINAL state: the editor JSON as loaded (or proven
 * absent), the master path proven absent, the page bytes, and the loaded stylesheet with every
 * sheet that links or imports it on the way from the page. The host applies
 * it as one Undo step and compares `expectedFiles` and every expected source right before writing.
 *
 * The caller chooses `id`, `label`, `rootClass` (a class already on the section's root) and
 * `stylesheetPath` (an existing, loaded stylesheet the page links or imports). Nothing is chosen,
 * captured or overwritten implicitly. Header and footer (and anything that isn't a `<section>`)
 * are refused; supporting them would need a separate extension, not a wrapper.
 */
export interface NativeSharedSectionInput {
  /** Editor JSON as loaded; undefined only when `files` proves it absent. */
  documentText: string | undefined;
  /** Complete file graph. */
  files: readonly string[];
  /** Loaded sources: the page and the stylesheet (and anything it is imported through) at least. */
  sources: Readonly<Record<string, string | undefined>>;
  pagePath: string;
  /** The page's exact bytes the range was taken from; must equal `sources[pagePath]`. */
  pageSource: string;
  /** The selected section's exact outer range in `pageSource`. */
  range: { start: number; end: number };
  id: string;
  label: string;
  rootClass: string;
  stylesheetPath: string;
  /** Optional link key (default `<id>-<n>`). */
  key?: string;
}
export interface NativeSharedSectionPlan {
  operation: StaticSectionOperation;
  /** The graph the plan was made from; compare it right before applying. */
  expectedFiles: readonly string[];
  htmlPath: string;
  key: string;
}

function reject(message: string): never { throw new Error(message); }

/**
 * How the page applies `sheet`: the loaded chain from a stylesheet the page links, through each
 * importing sheet, to `sheet` itself (outermost first). Undefined when no loaded chain reaches it.
 */
function stylesheetChain(pagePath: string, pageSource: string, sources: NativeSharedSectionInput["sources"], sheet: string): string[] | undefined {
  const linked = nativePageStylesheets(pageSource, pagePath);
  const read = (path: string) => (Object.hasOwn(sources, path) && typeof sources[path] === "string" ? sources[path] : undefined);
  const expanded = expandStyleImports(linked.filter((path) => read(path) !== undefined), read);
  const importer = new Map<string, string | undefined>();
  for (const item of expanded.sheets) if (item.kind === "sheet" && !importer.has(item.path)) importer.set(item.path, item.importer);
  if (!importer.has(sheet)) return undefined;
  const chain = [sheet];
  for (let at = importer.get(sheet); at !== undefined; at = importer.get(at)) {
    if (chain.includes(at)) return undefined;
    chain.unshift(at);
  }
  return linked.includes(chain[0]) ? chain : undefined;
}

export function planNativeSharedSection(input: NativeSharedSectionInput): NativeSharedSectionPlan | { error: string } {
  try {
    if (!Array.isArray(input.files)) reject("A complete file graph is needed.");
    const files = [...input.files];
    const graph = new Set(files);
    if (typeof input.pagePath !== "string" || nativePageRoute(input.pagePath) === undefined || !graph.has(input.pagePath)) reject("Choose a page of this site.");
    if (typeof input.pageSource !== "string" || !Object.hasOwn(input.sources, input.pagePath) || input.sources[input.pagePath] !== input.pageSource) reject("The page changed; select the section again.");
    if (input.documentText === undefined ? graph.has(EDITOR_PAGE_BUILDER_PATH) : !graph.has(EDITOR_PAGE_BUILDER_PATH)) reject(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);

    // The stylesheet: safe, existing, loaded and applied to this page. Its current source is the
    // authority, so the record's seed stays empty and nothing is copied from it.
    const sheet = input.stylesheetPath;
    if (typeof sheet !== "string" || !graph.has(sheet)) reject("Choose an existing stylesheet for the section.");
    if (!Object.hasOwn(input.sources, sheet) || typeof input.sources[sheet] !== "string") reject(`Load ${sheet} first.`);
    const chain = stylesheetChain(input.pagePath, input.pageSource, input.sources, sheet);
    if (!chain) reject(`${input.pagePath} does not use ${sheet}.`);
    // Every sheet the proof read is pinned, so a removed link or import makes the plan stale.
    for (const path of chain) if (!graph.has(path)) reject(`${path} is not in the site's file list.`);

    const range = input.range;
    if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end > input.pageSource.length || range.end <= range.start) reject("Select a section on the page.");
    const html = input.pageSource.slice(range.start, range.end);
    if (![...descendants(parseSource(input.pageSource))].some((element) => element.start === range.start && element.end === range.end)) reject("Select a section on the page.");

    // The root class must be one the section already has and that nothing else on the page uses.
    const others = [...descendants(parseSource(input.pageSource))].filter((element: SourceElement) =>
      (element.start < range.start || element.start >= range.end) && (attribute(input.pageSource, element, "class") ?? "").split(/[\t\n\f\r ]+/).includes(input.rootClass));
    if (others.length) reject(`Another element on ${input.pagePath} also uses ${input.rootClass}; choose a class only this section has.`);

    // Master path: free in the graph, in any case.
    const htmlPath = sectionMasterPath(input.id);
    if (files.some((path) => path.toLowerCase() === htmlPath.toLowerCase())) reject(`${htmlPath} already exists.`);

    const record: StaticSectionRecord = { id: input.id, label: input.label, rootClass: input.rootClass, html, css: "", stylesheetPath: sheet };
    // 1. Record (explicit, no overwrite): validates the HTML, identity, path and rootClass collisions.
    const saved = planStaticSectionSave({ documentText: input.documentText, files, record });
    if ("error" in saved) reject(saved.error);
    const afterSave = saved.operation.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? saved.operation.creates![0].content;
    const filesWithJson = graph.has(EDITOR_PAGE_BUILDER_PATH) ? files : [...files, EDITOR_PAGE_BUILDER_PATH];
    // 2. Master: the HTML moves to its file; the record keeps htmlPath only.
    const made = planMakeSectionMaster({ documentText: afterSave, files: filesWithJson, id: input.id });
    if ("error" in made) reject(made.error);
    const afterMaster = made.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
    const masterContent = made.operation.creates![0].content;
    if (masterContent !== html) reject("The master would not hold the section's exact bytes.");
    // 3. Link the selected copy; its basis is the master's section, which is this copy.
    const entry = readSectionCatalog(afterMaster)[input.id];
    const resolved = resolveStaticSection(entry, { files: [...filesWithJson, htmlPath], sources: { [htmlPath]: masterContent } });
    const linked = planNativeSectionLink({ documentText: afterMaster, files: filesWithJson, pagePath: input.pagePath, pageSource: input.pageSource, range, record: resolved, key: input.key });
    if ("error" in linked) reject(linked.error);
    const finalText = linked.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!;

    // The result reads back: one master entry without html, and a link whose basis is the copy.
    const final = readSectionCatalog(finalText)[input.id];
    if (!final || Object.hasOwn(final, "html") || (final as { htmlPath?: string }).htmlPath !== htmlPath) reject("The saved section did not read back.");
    const link = readNativeSectionLinks(finalText)[input.pagePath]?.[linked.key];
    if (!link || link.basis !== html || link.recordId !== input.id) reject("The section link did not read back.");

    const absent = input.documentText === undefined;
    return {
      htmlPath,
      key: linked.key,
      expectedFiles: files.sort(),
      operation: {
        expectedSources: new Map<string, string | undefined>([
          [EDITOR_PAGE_BUILDER_PATH, input.documentText],
          [htmlPath, undefined],
          [input.pagePath, input.pageSource],
          ...chain.map((path): [string, string | undefined] => [path, input.sources[path]]),
        ]),
        edits: absent ? new Map() : new Map([[EDITOR_PAGE_BUILDER_PATH, finalText]]),
        creates: [...(absent ? [{ path: EDITOR_PAGE_BUILDER_PATH, content: finalText }] : []), { path: htmlPath, content: html }],
        done: `Saved ${input.label} as a shared section`,
        undone: `Removed shared section ${input.label}`,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
