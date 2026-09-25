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

/** A replacement of `start`..`end` of a text by `text`. */
export interface NativeTextEdit {
  start: number;
  end: number;
  text: string;
}

export type NativePageDetail = "title" | "description";

const COMMENT_LINE = /^([ \t]*)([a-z-]+):[ \t]*(.*?)[ \t\r]*$/i;

/** A value as a comment line can carry it: one line, no `-->`, trimmed. */
function commentValue(value: string) {
  return value.replace(/--+>?/g, "-").replace(/[\r\n]+/g, " ").trim();
}

/** The smallest edit that turns `before` into `after`; null when they are the same. */
export function minimalTextEdit(before: string, after: string): NativeTextEdit | null {
  if (before === after) return null;
  let start = 0;
  const limit = Math.min(before.length, after.length);
  while (start < limit && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < limit - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { start, end: before.length - tail, text: after.slice(start, after.length - tail) };
}

/**
 * The edit that sets `field` in the page's leading metadata comment to
 * `value` (empty removes the line), as small as it can be:
 * - with no metadata comment (none, or a leading comment with no
 *   `key: value` line), one is put first: `<!--\ntitle: …\n-->\n`;
 * - an existing line has its value replaced; a new `title:` line goes first
 *   in the comment, a new `description:` line after the title (else last);
 *   other lines (`image: …`, notes) stay as they are;
 * - a one-line comment stays one line while it has one field, and is
 *   written one field per line when it gets a second;
 * - a comment left with nothing goes, with the line break after it.
 * Null when the page already says this.
 */
export function nativePageCommentEdit(html: string, field: NativePageDetail, value: string): NativeTextEdit | null {
  const wanted = commentValue(value);
  const newline = html.includes("\r\n") ? "\r\n" : "\n";
  const found = /^\s*<!--([\s\S]*?)-->/.exec(html);
  const bodyStart = found ? found[0].length - 3 - found[1].length : 0;
  const lines = found ? found[1].split("\n") : [];
  const keyed = lines.map((line) => COMMENT_LINE.exec(line));
  const isMeta = Boolean(found) && (keyed.some(Boolean) || !found![1].trim());
  if (!isMeta) {
    if (!wanted) return null;
    return { start: 0, end: 0, text: `<!--${newline}${field}: ${wanted}${newline}-->${newline}` };
  }
  const commentStart = bodyStart - 4;
  const commentEnd = found![0].length;
  const at = keyed.findIndex((match) => match?.[2].toLowerCase() === field);
  const indent = keyed.find((match, index) => match && index > 0)?.[1] ?? "";
  // A line followed by a break carries the file's `\r` before it.
  const cr = newline === "\r\n" ? "\r" : "";
  const next = [...lines];
  const last = lines.length - 1;
  if (at >= 0) {
    const match = keyed[at]!;
    if (match[3] === wanted) return null;
    if (wanted) {
      const colon = match[1].length + match[2].length + 1;
      const space = /^[ \t]*/.exec(lines[at].slice(colon))![0].length;
      next[at] = `${lines[at].slice(0, colon)}${space ? lines[at].slice(colon, colon + space) : " "}${wanted}${lines[at].slice(colon + space + match[3].length)}`;
    } else if (at === 0 || at === last) next[at] = at === last ? "" : cr;
    // The line after `<!--` or before `-->` keeps its break; any other line goes whole.
    else next.splice(at, 1);
  } else {
    if (!wanted) return null;
    const line = `${indent}${field}: ${wanted}`;
    if (!last) {
      // One line: one field keeps the one-line form, a second makes it one per line.
      if (!lines[0].trim()) next[0] = ` ${line.trimStart()} `;
      else {
        const other = lines[0].trim();
        next.splice(0, 1, cr, ...(field === "title" ? [line, other] : [other, line]).map((item) => `${item.trimStart()}${cr}`), "");
      }
    } else if (field === "title") {
      if (!lines[0].trim()) next.splice(1, 0, `${line}${cr}`);
      else next.splice(0, 1, cr, `${line}${cr}`, lines[0].trimStart());
    } else {
      const title = keyed.findIndex((match) => match?.[2].toLowerCase() === "title");
      if (title >= 0 && title < last) next.splice(title + 1, 0, `${line}${cr}`);
      else if (!lines[last].trim()) next.splice(last, 0, `${line}${cr}`);
      else next.splice(last, 1, `${lines[last].trimEnd()}${cr}`, `${line}${cr}`, "");
    }
  }
  const body = next.join("\n");
  // Nothing left: the comment goes, with the line break after it.
  if (!body.trim()) {
    const after = html.startsWith("\r\n", commentEnd) ? 2 : html.startsWith("\n", commentEnd) ? 1 : 0;
    return { start: commentStart, end: commentEnd + after, text: "" };
  }
  const edit = minimalTextEdit(found![1], body);
  return edit && { start: edit.start + bodyStart, end: edit.end + bodyStart, text: edit.text };
}

/** `html` with `edit` made. */
export function applyTextEdit(html: string, edit: NativeTextEdit | null): string {
  return edit ? html.slice(0, edit.start) + edit.text + html.slice(edit.end) : html;
}

/**
 * The page with the details given set in its leading comment (an empty
 * value removes the line): `nativePageCommentEdit` for each.
 */
export function nativePageWithDetails(html: string, details: Partial<Record<NativePageDetail, string>>): string {
  let text = html;
  for (const field of ["title", "description"] as const) {
    const value = details[field];
    if (value !== undefined) text = applyTextEdit(text, nativePageCommentEdit(text, field, value));
  }
  return text;
}

/**
 * The page with its leading comment's `title:` line set to `title`; the page
 * as it is when its leading comment has no title (or there is none).
 */
export function nativePageWithCommentTitle(html: string, title: string): string {
  if (!nativePageComment(html).meta.title) return html;
  return applyTextEdit(html, nativePageCommentEdit(html, "title", title));
}

/**
 * The page titled `title` in its leading comment, the comment made when it
 * has none: what a new page, a copy or a subpage carries.
 */
export function nativePageWithTitle(html: string, title: string): string {
  return applyTextEdit(html, nativePageCommentEdit(html, "title", title));
}
