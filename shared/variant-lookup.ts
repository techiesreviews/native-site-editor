// The Variants of a tag on the site, for the edit bar, the card looks, the
// code pane and the Worker's get_site alike (wayfinder sturdy-base 50).
//
// Which files count is decided here, once:
// - the stylesheets the site's pages link in their heads, each with its
//   `@import`s (`page` narrows them to the page on show, as it renders);
// - each component's own stylesheet, its template's sibling `.css`, with its
//   `@import`s;
// - the scripts the pages link (`<script src>`), with their static imports:
//   the attributes they set are no Variants where the component's own CSS
//   reads them (shared/variants.ts `scriptSetAttributes`).
//
// Files come through `VariantFiles`: the editor's drafts (src/main.ts) or the
// Worker's SiteFiles (`readVariants`, worker/site-variants.ts). Answers are
// cached by the texts they read and recomputed when one changes, so callers
// ask on every render; the Variant objects are shared and must not change.

import { expandStyleImports, resolveImportPath } from "./css-imports";
import { startTagAttribute, startTags } from "./html-source";
import { nativeComponentCssPath, nativePageStylesheets } from "./native-project";
import { globalVariants, scriptImports, scriptSetAttributes, siteVariants, variantsForClass, variantsForComponent, type SiteVariants, type Variant, type VariantWarning } from "./variants";

/** The site as the lookup needs it: page files and component templates. */
export interface VariantSite {
  /** Page files, in route order (the home page first). */
  readonly pages: readonly string[];
  /** Component tag to template file. */
  readonly components: Readonly<Record<string, string>>;
}

/** The seam: the site's files, drafts applied. */
export interface VariantFiles {
  /** Undefined when there is no site to read (no Variants). */
  site(): VariantSite | undefined;
  /** A file's text; undefined when there is no such file or it is not read yet (the adapter reads it, and its owner asks again). */
  read(path: string): string | undefined;
}

export interface TagVariants { variants: Variant[]; warnings: VariantWarning[] }

/** `page`: the site sheets that page links; by default every page's. */
export interface VariantScope { page?: string }

export interface VariantLookup {
  /** A component's Variants and its own CSS's warnings; undefined for a tag that is no component. */
  forTag(tag: string, scope?: VariantScope): TagVariants | undefined;
  /** A class's Variants from the site sheets (`btn` for Buttons). */
  forClass(className: string, scope?: VariantScope): Variant[];
  /** Attribute-only site rules, which style any element (Tone on a page band). */
  global(scope?: VariantScope): Variant[];
  /** Whether `path` is a component's own stylesheet. */
  isComponentCss(path: string): boolean;
}

/** Rounds of reads `readVariants` makes at most: pages, what they link, then one level of imports each. */
const READ_ROUNDS = 12;
/** Scripts read for the attributes they set, at most. */
const SCRIPT_LIMIT = 100;
const JS_TYPE = /^(?:module|(?:text|application)\/(?:x-)?(?:java|ecma)script)$/i;

const lookups = new WeakMap<VariantFiles, VariantLookup>();

/** The lookup over `files`; the same files give the same lookup, and its cache. */
export function variantLookup(files: VariantFiles): VariantLookup {
  let lookup = lookups.get(files);
  if (!lookup) lookups.set(files, lookup = createLookup(files));
  return lookup;
}

/**
 * For files read asynchronously in batches (the Worker): asks `ask` again
 * after each round of reads until it read nothing new; a path is asked for
 * once. `load` gives the texts it found (missing files left out); its
 * failure, or more rounds than `READ_ROUNDS`, fails the answer. `likely`
 * paths (the stylesheets the tab says the pages link) are read in the first
 * round with the pages, which saves a round when they are right; if that
 * round fails, it is read again without them.
 */
export async function readVariants<T>(site: VariantSite, load: (paths: string[]) => Promise<ReadonlyMap<string, string>>, ask: (lookup: VariantLookup) => T, likely: readonly string[] = []): Promise<T> {
  const texts = new Map<string, string>(), asked = new Set<string>(), wanted = new Set<string>();
  const lookup = variantLookup({
    site: () => site,
    read: (path) => {
      if (!asked.has(path)) wanted.add(path);
      return texts.get(path);
    },
  });
  for (let round = 0; ; round++) {
    wanted.clear();
    const answer = ask(lookup);
    if (!wanted.size) return answer;
    if (round === READ_ROUNDS) throw new Error(`The site's stylesheets and scripts link deeper than ${READ_ROUNDS} rounds of reads.`);
    const needed = [...wanted];
    needed.forEach((path) => asked.add(path));
    const extra = round ? [] : likely.filter((path) => !asked.has(path));
    const read = extra.length ? await load([...needed, ...new Set(extra)]).catch(() => load(needed)) : await load(needed);
    for (const [path, text] of read) texts.set(path, text);
    // A likely path read is not asked again; one that failed is asked for if needed.
    for (const path of extra) if (texts.has(path)) asked.add(path);
  }
}

/** The scripts `html` (at `path`) loads by `src`, as repository paths. */
function pageScripts(html: string, path: string) {
  return startTags(html).flatMap((tag) => {
    if (tag.name !== "script") return [];
    const type = startTagAttribute(html, tag, "type")?.value.trim() ?? "";
    const src = startTagAttribute(html, tag, "src")?.value;
    const resolved = src === undefined || (type && !JS_TYPE.test(type)) ? undefined : resolveImportPath(path, src);
    return resolved ? [resolved] : [];
  });
}

/** The site's modules a script imports (relative or root specifiers; bare ones are packages), as repository paths. */
function importedScripts(source: string, path: string) {
  return scriptImports(source).flatMap((specifier) => {
    const resolved = /^\.{0,2}\//.test(specifier) ? resolveImportPath(path, specifier) : undefined;
    return resolved ? [resolved] : [];
  });
}

interface Memo { reads: Map<string, string | undefined>; value: unknown }

function createLookup(files: VariantFiles): VariantLookup {
  const memos = new Map<string, Memo>();
  // The reads of each answer being computed, innermost last.
  const recording: Map<string, string | undefined>[] = [];
  let shapeKey = "";

  const record = (path: string, text: string | undefined) => {
    for (const reads of recording) if (!reads.has(path)) reads.set(path, text);
  };
  const read = (path: string) => {
    const text = files.read(path);
    record(path, text);
    return text;
  };
  // An answer stays while every file it read reads the same.
  function memo<T>(key: string, compute: () => T): T {
    const hit = memos.get(key);
    if (hit && [...hit.reads].every(([path, text]) => files.read(path) === text)) {
      hit.reads.forEach((text, path) => record(path, text));
      return hit.value as T;
    }
    const reads = new Map<string, string | undefined>();
    recording.push(reads);
    let value: T;
    try { value = compute(); } finally { recording.pop(); }
    memos.set(key, { reads, value });
    reads.forEach((text, path) => record(path, text));
    return value;
  }
  // The site's pages and components; other ones drop every answer.
  function site() {
    const now = files.site();
    const key = now ? JSON.stringify([now.pages, now.components]) : "";
    if (key !== shapeKey) memos.clear();
    shapeKey = key;
    return now;
  }

  const sheets = (site: VariantSite, page: string | undefined): SiteVariants => memo(`sheets\n${page ?? ""}`, () => {
    const linked = new Set<string>();
    for (const file of page === undefined ? site.pages : [page])
      for (const path of nativePageStylesheets(read(file) ?? "", file)) linked.add(path);
    return siteVariants(expandStyleImports([...linked], read).sheets);
  });
  const scriptNames = (path: string) => memo(`script\n${path}`, () => scriptSetAttributes(read(path) ?? ""));
  const scriptAttributes = (site: VariantSite) => memo("scripts", () => {
    const queue = [...new Set(site.pages.flatMap((page) => pageScripts(read(page) ?? "", page)))];
    const names = new Set<string>();
    for (let index = 0; index < queue.length && index < SCRIPT_LIMIT; index++) {
      const source = read(queue[index]);
      if (source === undefined) continue;
      scriptNames(queue[index]).forEach((name) => names.add(name));
      for (const path of importedScripts(source, queue[index])) if (!queue.includes(path)) queue.push(path);
    }
    return names;
  });
  const ownCss = (template: string) => memo(`own\n${template}`, () =>
    expandStyleImports([nativeComponentCssPath(template)], read).sheets.map((sheet) => sheet.source).join("\n"));

  return {
    forTag(name, scope = {}) {
      const current = site(), tag = name.toLowerCase();
      if (!current || !Object.hasOwn(current.components, tag)) return undefined;
      return memo(`tag\n${tag}\n${scope.page ?? ""}`, () =>
        variantsForComponent(tag, { css: ownCss(current.components[tag]), site: sheets(current, scope.page), scriptAttributes: scriptAttributes(current) }));
    },
    forClass(className, scope = {}) {
      const current = site();
      return current ? memo(`class\n${className}\n${scope.page ?? ""}`, () => variantsForClass(className, sheets(current, scope.page))) : [];
    },
    global(scope = {}) {
      const current = site();
      return current ? memo(`global\n${scope.page ?? ""}`, () => globalVariants(sheets(current, scope.page))) : [];
    },
    isComponentCss(path) {
      const current = site();
      return Boolean(current && Object.values(current.components).some((template) => nativeComponentCssPath(template) === path));
    },
  };
}
