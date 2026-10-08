// What a native site's first preview paint reads (docs/wayfinder/lean-fast-editor
// tickets 05 and 15, task 4g): the page on show, the stylesheets it links with
// their `@import`s, and the component templates it uses (with their own
// stylesheets), followed a level at a time as each level's sources arrive.
// Every other page and template is the site's text index, read after the paint.
import { expandStyleImports } from "../shared/css-imports";
import { asciiLower, startTags } from "../shared/html-source";
import { nativeComponentCssPath, nativePageStylesheets, type NativeSite } from "../shared/native-project";

export interface NativeShownFiles {
  /** Every file the pages need, read or not: pages, templates, stylesheets. */
  files: Set<string>;
  /** Component stylesheets that exist, by tag. */
  componentCss: Map<string, string>;
  /** Components the pages use whose stylesheet is not a file. */
  missingComponentCss: Set<string>;
}

/** The component tags `html` uses, as the site names them. */
export function usedComponentTags(html: string, site: NativeSite): string[] {
  const out = new Set<string>();
  for (const tag of startTags(html)) {
    const name = asciiLower(tag.name);
    if (name.includes("-") && Object.hasOwn(site.components, name)) out.add(name);
  }
  return [...out];
}

/**
 * The files the pages `pages` show, as far as the sources read so far tell:
 * a source not read yet (`source` undefined) is listed but not followed, so
 * calling this again once it is read finds the next level.
 */
export function nativeShownFiles(
  site: NativeSite,
  pages: readonly string[],
  source: (path: string) => string | undefined,
  isFile: (path: string) => boolean,
): NativeShownFiles {
  const files = new Set<string>();
  const componentCss = new Map<string, string>();
  const missingComponentCss = new Set<string>();
  const sheets = new Set<string>();
  const seenTags = new Set<string>();
  const queue: { path: string; page: boolean }[] = pages.map((path) => ({ path, page: true }));
  while (queue.length) {
    const { path, page } = queue.shift()!;
    if (files.has(path)) continue;
    files.add(path);
    const html = source(path);
    if (html === undefined) continue;
    if (page) for (const sheet of nativePageStylesheets(html, path)) sheets.add(sheet);
    for (const tag of usedComponentTags(html, site)) {
      if (seenTags.has(tag)) continue;
      seenTags.add(tag);
      const template = site.components[tag];
      const css = nativeComponentCssPath(template);
      if (isFile(css)) componentCss.set(tag, css);
      else missingComponentCss.add(tag);
      queue.push({ path: template, page: false });
    }
  }
  const linked = [...sheets, ...componentCss.values()];
  for (const sheet of linked) files.add(sheet);
  const read = linked.filter((sheet) => source(sheet) !== undefined);
  for (const sheet of expandStyleImports(read, source).imported) files.add(sheet);
  return { files, componentCss, missingComponentCss };
}

/** At most this many bytes of component templates come with the page in one read. */
export const NATIVE_BOOT_EXTRA_BYTES = 128 * 1024;

/**
 * Every component template of the site with its stylesheet, read with the
 * page in the first request when together they are small (most sites): the
 * levels of nested components then need no request of their own. Nothing
 * when they are larger than `limit`, or a size is unknown. The site's other
 * stylesheets are predicted separately (nativeBootStyleExtras).
 */
export function nativeBootExtras(
  site: NativeSite,
  files: readonly string[],
  sizeOf: (path: string) => number | undefined,
  limit = NATIVE_BOOT_EXTRA_BYTES,
): string[] {
  const present = new Set(files);
  const out = new Set<string>();
  for (const template of Object.values(site.components)) {
    out.add(template);
    const css = nativeComponentCssPath(template);
    if (present.has(css)) out.add(css);
  }
  let total = 0;
  for (const path of out) {
    const size = sizeOf(path);
    if (size === undefined) return [];
    total += size;
    if (total > limit) return [];
  }
  return [...out];
}

/** The site's text index as something that waits for it (main.ts). */
export interface SiteIndexGate {
  /** Names the repository, branch, commit and site load: it changes when any of them does. */
  key(): string;
  /** Whether the whole site is read for the current key (or there is no site to read). */
  indexed(): boolean;
  /** Waits for the read under way: whether it read the whole site. */
  settled(): Promise<boolean>;
  /** Reads the site now (again, after a failure): an error message, or nothing. */
  ensure(): Promise<string | undefined>;
}

/**
 * `build` run once the whole site is read, for the repository and branch
 * still open when it is done: a change meanwhile (another repository, a new
 * commit) waits again for that one's index; a read that failed is tried once
 * more and then refused. Never builds from a partly read site.
 */
export async function withSiteIndexed<T>(gate: SiteIndexGate, build: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const key = gate.key();
    if (!gate.indexed()) {
      const done = await gate.settled();
      if (gate.key() !== key) continue;
      if (!done || !gate.indexed()) {
        const problem = await gate.ensure();
        if (gate.key() !== key) continue;
        if (problem) throw new Error(problem);
        if (!gate.indexed()) throw new Error("The site's pages could not all be read. Refresh the repository and try again.");
      }
    }
    const value = await build();
    if (gate.key() === key) return value;
  }
  throw new Error("The repository changed meanwhile. Try again.");
}

/** At most this many bytes of the site's own stylesheets come with the page in one read. */
export const NATIVE_BOOT_STYLE_BYTES = 24 * 1024;

/**
 * Every stylesheet of the site that is not a component's, read with the page
 * in the first request when together they are small, so the sheets the page
 * links and their imports need no serial reads of their own before the
 * paint. Skips dot-folders (.editor, .github) and node_modules. Nothing when
 * they are larger than `limit`, or a size is unknown. A predicted sheet the
 * page does not link is only read: it never reaches the preview.
 */
export function nativeBootStyleExtras(
  site: NativeSite,
  files: readonly string[],
  sizeOf: (path: string) => number | undefined,
  limit = NATIVE_BOOT_STYLE_BYTES,
): string[] {
  const componentCss = new Set(Object.values(site.components).map(nativeComponentCssPath));
  const out = files.filter((path) => /\.css$/i.test(path) && !componentCss.has(path) &&
    !path.split("/").some((part) => part.startsWith(".") || part === "node_modules"));
  let total = 0;
  for (const path of out) {
    const size = sizeOf(path);
    if (size === undefined) return [];
    total += size;
    if (total > limit) return [];
  }
  return out;
}
