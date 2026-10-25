import { RESERVED_CUSTOM_ELEMENT_NAMES } from "./custom-element-names";
import { touchesGithubConfig, GITHUB_CONFIG_REFUSED, touchesMediaRecords, MEDIA_RECORDS_REFUSED } from "./protected-paths";

// The rules a new page address, a new component and a path follow, with one
// wording per refusal, so the Pages and Files tabs, Change URL, media, the
// page builder and the agent refuse the same cases alike (ticket 05, item 4).
// Existing addresses stay: only an address someone makes or changes meets the
// rule. No DOM, no I/O.

const PAGE_ADDRESS = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** The one refusal of a new page address, also for a typed URL part no page can have. */
export const PAGE_ADDRESS_RULE = "Use lowercase letters, digits and dashes in the URL, at most 80, starting with a letter or digit.";

/** Why `slug` cannot be a new page's address (the last part of its URL), or nothing. */
export function pageAddressProblem(slug: string): string | undefined {
  return PAGE_ADDRESS.test(slug) ? undefined : PAGE_ADDRESS_RULE;
}

/**
 * `text` made a page address the rule takes: lowercase, accents dropped,
 * every run of anything but letters and digits one `-`, none at the start
 * or end, at most 80. "About Us!" is "about-us"; "!!!" is "". While
 * `typing`, a space, dash, dot or underscore at the end stays one dash, so
 * the next word joins it.
 */
export function toPageAddress(text: string, { typing = false }: { typing?: boolean } = {}): string {
  const address = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80);
  return typing && /[\s._\p{Pd}]$/u.test(text) ? address : address.replace(/-+$/, "");
}

/**
 * A typed page URL made to meet the rule part by part: `/Notes/About Us/` is
 * `/notes/about-us/`. Parts in `kept` (the page's URL now) stay as they are,
 * and so does a `.html` at the end; while `typing`, so does a dash at the
 * end of a part, or the start of `.html` at the end of the last.
 */
export function toPageRoute(text: string, { kept = [], typing = false }: { kept?: Iterable<string>; typing?: boolean } = {}): string {
  const stays = new Set(kept);
  const parts = text.split("/");
  return parts.map((part, index) => {
    if (!part || stays.has(part)) return part;
    const last = index === parts.length - 1;
    const suffix = last ? ((typing ? /\.(?:h(?:t(?:ml?)?)?)?$/i : /\.html$/i).exec(part)?.[0] ?? "") : "";
    return toPageAddress(part.slice(0, part.length - suffix.length), { typing }) + suffix.toLowerCase();
  }).join("/");
}

/** The element Make component would turn into a component, as far as the caller knows it. */
export interface ComponentSource {
  /** Its tag name, lowercase. */
  tag: string;
}

/** Why `tag` cannot name a new component while the components `taken` exist, or nothing. */
export function componentTagProblem(tag: string, taken: Iterable<string>): string | undefined {
  if (!tag) return "Type a name with a dash, such as section-intro.";
  if (!/^[a-z]/.test(tag)) return "A component's name starts with a lowercase letter.";
  if (!tag.includes("-")) return "A component's name has a dash in it, such as section-intro.";
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag)) return "Use lowercase letters, digits and single dashes between words.";
  if (RESERVED_CUSTOM_ELEMENT_NAMES.has(tag)) return `${tag} is reserved by HTML.`;
  // The name is taken; not the element's "<x> is a component already." (it is an instance), so the two stay apart.
  if ([...taken].includes(tag)) return `There is a component <${tag}> already.`;
  return undefined;
}

/** Why the element `source` cannot become a component whatever its name, or nothing. */
export function componentSourceProblem(source: ComponentSource): string | undefined {
  const element = source.tag.toLowerCase();
  if (["main", "body", "html", "head"].includes(element)) return `A <${element}> cannot be a component.`;
  if (/^site-(?:header|footer)$/.test(element)) return `<${element}> is the site's ${element.slice(5)} component already.`;
  if (element.includes("-")) return `<${element}> is a component already.`;
  return undefined;
}

/**
 * Why the element `source` cannot become the new component `tag` while the
 * components `taken` exist, or nothing: the name first, then the element.
 * Without `source`, only the name is checked.
 */
export function makeComponentProblem(source: ComponentSource | undefined, tag: string, taken: Iterable<string>): string | undefined {
  return componentTagProblem(tag, taken) ?? (source ? componentSourceProblem(source) : undefined);
}

/** The one refusal of a path under a file: "X is a file, so nothing can go in it." */
export function fileInTheWay(file: string): string {
  return `${file} is a file, so nothing can go in it.`;
}

/** The folders `path` sits in, outermost first: `a/b/c.html` is in `a` and `a/b`. Not normalised: a leading `/` adds no folder, `a//b` gives `a` and `a/`. */
export function foldersAbove(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/")).filter(Boolean);
}

/** Why nothing can go in `folder`: it, or a folder it sits in, is a file as far as `isFile` knows; or nothing. */
export function folderProblem(folder: string, isFile: (path: string) => boolean): string | undefined {
  const file = [...foldersAbove(folder), folder].find((path) => path && isFile(path));
  return file === undefined ? undefined : fileInTheWay(file);
}

/** Why nothing can go at `path`: a folder it needs is a file as far as `isFile` knows; or nothing. */
export function parentProblem(path: string, isFile: (path: string) => boolean): string | undefined {
  const file = foldersAbove(path).find(isFile);
  return file === undefined ? undefined : fileInTheWay(file);
}

/** Paths agents may write; read-only opening also permits the media records. */
export function writablePathProblem(path: string, { readOnly = false }: { readOnly?: boolean } = {}): string | undefined {
  if (touchesGithubConfig(path)) return GITHUB_CONFIG_REFUSED;
  if (!readOnly && touchesMediaRecords(path)) return MEDIA_RECORDS_REFUSED;
  if (
    !path ||
    path.length > 1024 ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      ) ||
    /[\\\u0000-\u001f]/.test(path)
  )
    return "Invalid path. Use a repository path such as about/index.html.";
  return undefined;
}
