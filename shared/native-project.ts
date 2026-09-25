// A native project's effective manifest: what `.astro-editor/native.json`
// says, completed by convention, so a site needs no manifest at all. The
// editor, the static exporter and the agent context all read a site through
// `resolveNativeProject`:
//
// - a repository is a native project when it has `.astro-editor/native.json`
//   or a home page, `src/pages/index.html` (`isNativeProject`);
// - pages are routed by where they are under `src/pages/`
//   (shared/native-routes.ts); a manifest route mapped to a file wins;
// - every `src/components/<name>/<name>.html` (or flat
//   `src/components/<name>.html`) whose `<name>` is a valid, unreserved
//   custom-element tag is the component `<name>`; a manifest `components`
//   entry wins for its tag and for its file;
// - the shared stylesheets are the manifest's `styles` when it lists them,
//   else `src/styles/site.css` when there is one (it may `@import` the
//   others), else every `.css` file directly in `src/styles/`, in name order;
// - a page's title and description are the manifest's for its route, else
//   the page's leading `<!-- title: …\ndescription: … -->` comment
//   (`nativePageComment`, `nativePageInfo`).
//
// The module takes plain path lists and text; it has no DOM and no I/O.
import {
  isNativeComponentTag,
  parseNativeManifest,
  type NativeManifest,
  type NativeManifestResult,
  type NativePageMeta,
} from "../src/native-manifest";

export const NATIVE_MANIFEST_PATH = ".astro-editor/native.json";
export const NATIVE_HOME_PAGE = "src/pages/index.html";
/** Site settings for the exporter, in the order they are looked for: the first that exists is used. */
export const NATIVE_SITE_PATHS = [".astro-editor/site.json", "src/site.json"] as const;
/** The shared stylesheet that, when present and the manifest names none, is the only one. */
export const NATIVE_SITE_STYLESHEET = "src/styles/site.css";

const FOLDER_COMPONENT = /^src\/components\/([\w.-]+)\/([\w.-]+)\.html$/;
const FLAT_COMPONENT = /^src\/components\/([\w.-]+)\.html$/;
const STYLESHEET = /^src\/styles\/[\w.-]+\.css$/;

/** Whether the repository paths make a native project: a manifest, or a home page. */
export function isNativeProject(paths: Iterable<string>): boolean {
  for (const path of paths) if (path === NATIVE_MANIFEST_PATH || path === NATIVE_HOME_PAGE) return true;
  return false;
}

/**
 * The components among `paths` by convention, tag to template file: each
 * `src/components/<tag>/<tag>.html`, and each flat `src/components/<tag>.html`
 * whose tag has no folder, for a tag `isNativeComponentTag` accepts.
 */
export function nativeConventionComponents(paths: Iterable<string>): { components: Record<string, string>; warnings: string[] } {
  const folder = new Map<string, string>();
  const flat = new Map<string, string>();
  for (const path of new Set(paths)) {
    const nested = FOLDER_COMPONENT.exec(path);
    if (nested && nested[1] === nested[2] && isNativeComponentTag(nested[1])) folder.set(nested[1], path);
    const single = FLAT_COMPONENT.exec(path);
    if (single && isNativeComponentTag(single[1])) flat.set(single[1], path);
  }
  const warnings: string[] = [];
  const components: Record<string, string> = {};
  for (const tag of [...new Set([...folder.keys(), ...flat.keys()])].sort()) {
    const chosen = folder.get(tag) ?? flat.get(tag)!;
    components[tag] = chosen;
    if (folder.has(tag) && flat.has(tag))
      warnings.push(`${flat.get(tag)} and ${chosen} both give the component <${tag}>; ${chosen} is used. Rename one, or name the component's file in native.json.`);
  }
  return { components, warnings };
}

/**
 * The shared stylesheets among `paths` by convention: `src/styles/site.css`
 * alone when it exists, else every `.css` file directly in `src/styles/` in
 * name order.
 */
export function nativeConventionStyles(paths: Iterable<string>): string[] {
  const styles = [...new Set(paths)].filter((path) => STYLESHEET.test(path)).sort();
  return styles.includes(NATIVE_SITE_STYLESHEET) ? [NATIVE_SITE_STYLESHEET] : styles;
}

/**
 * The effective manifest of the project whose repository paths (and new files
 * drafted in the browser) are `paths`, from the manifest's text when there is
 * one (`undefined` when there is not): routes, page metadata, components and
 * styles, with the warnings to show. `explicit` on the manifest says what the
 * manifest gave itself.
 */
export function resolveNativeProject(paths: Iterable<string>, manifestText?: string): NativeManifestResult {
  const files = [...new Set(paths)];
  const parsed = parseNativeManifest(manifestText ?? '{"version":1}', files);
  if (!parsed.ok) {
    if (manifestText === undefined && /no home page/.test(parsed.error))
      return { ok: false, error: `The site has no home page: add ${NATIVE_HOME_PAGE}.` };
    return parsed;
  }
  const declared = manifestText === undefined ? {} : (JSON.parse(manifestText) as Record<string, unknown>);
  const manifest: NativeManifest = parsed.manifest;
  const warnings = [...parsed.warnings];

  const conventional = nativeConventionComponents(files);
  const named = new Set(Object.values(manifest.components));
  const components = { ...manifest.components };
  for (const [tag, path] of Object.entries(conventional.components)) {
    if (Object.hasOwn(components, tag) || named.has(path)) continue;
    components[tag] = path;
  }
  // A two-files warning matters only when the manifest left the tag to convention.
  warnings.push(...conventional.warnings.filter((warning) => {
    const tag = /<([^>]+)>/.exec(warning)?.[1];
    return tag === undefined || !Object.hasOwn(manifest.components, tag);
  }));

  const listsStyles = Object.hasOwn(declared, "styles");
  return {
    ok: true,
    manifest: {
      ...manifest,
      components,
      styles: listsStyles ? manifest.styles : nativeConventionStyles(files),
      explicit: { manifest: manifestText !== undefined, styles: listsStyles },
    },
    warnings,
    orphans: parsed.orphans,
  };
}

/**
 * A page's leading `<!-- key: value -->` comment (keys lowercased), and the
 * page without it. Any comment that leads the page counts; lines that are not
 * `key: value` are ignored.
 */
export function nativePageComment(html: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  const match = /^\s*<!--([\s\S]*?)-->\s*/.exec(html);
  if (!match) return { meta, body: html };
  for (const line of match[1].split("\n")) {
    const kv = /^\s*([a-z-]+):\s*(.+?)\s*$/i.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2];
  }
  return { meta, body: html.slice(match[0].length) };
}

/**
 * The title and description of the page at `route` whose source is `source`:
 * the manifest's for the route, else the page comment's.
 */
export function nativePageInfo(pages: Record<string, NativePageMeta>, route: string, source: string | undefined): { title?: string; description?: string } {
  const entry = pages[route] ?? {};
  const comment = source === undefined ? {} : nativePageComment(source).meta;
  const out: { title?: string; description?: string } = {};
  for (const field of ["title", "description"] as const) {
    const value = entry[field] || comment[field];
    if (value) out[field] = value;
  }
  return out;
}

/**
 * The page with its leading comment's `title:` line set to `title`; the page
 * as it is when its leading comment has no title (or there is none).
 */
export function nativePageWithCommentTitle(html: string, title: string): string {
  const comment = /^\s*<!--[\s\S]*?-->/.exec(html);
  if (!comment || !nativePageComment(html).meta.title) return html;
  const safe = title.replace(/--+>?/g, "-").replace(/[\r\n]+/g, " ");
  const edited = comment[0].replace(/^(\s*(?:<!--)?\s*title:[ \t]*).*?([ \t]*(?:-->)?)$/im, (_, start: string, end: string) => `${start}${safe}${end}`);
  return edited + html.slice(comment[0].length);
}
