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

// Dropped from a typed address: all but letters, digits and what joins words (spaces, dashes, dots, underscores, …), which become a dash.
const NOT_ADDRESS = /[^a-z0-9\s._,:;/\\|+&\p{Pd}]+/gu;

/**
 * `text` made a page address the rule takes: lowercase, accents dropped,
 * every run of spaces, dashes, dots, underscores and other separators one
 * `-` (none at the start or end), anything else dropped, at most 80.
 * "About Us!" is "about-us", "Don't stop" is "dont-stop", "!!!" is "".
 * While `typing`, a separator at the end stays one dash, so the next word
 * joins it.
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
    .replace(NOT_ADDRESS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80);
  // Full, a dash at the end would only stop the next letter.
  return typing && address.length < 80 ? address : address.replace(/-+$/, "");
}

export interface TypedRouteSite {
  /** Every file of the site (`Old_Folder/index.html`, `notes.html`). */
  files: readonly string[];
  /** The last part of the page's URL now (`first-note`, `notes.html`). */
  own?: string | undefined;
}

/**
 * A typed page URL made to meet the rule part by part, as the move planner
 * checks it: `/Notes/About Us/` is `/notes/about-us/`. A folder the site has
 * at the converted path so far stays as it is (`/Old_Folder/x/`), and so do
 * the page's own last part and a `.html` at the end. While `typing`, a dash
 * at the end of a part stays, and so do the start of `.html` and a last part
 * that begins the name of a folder there, so `Old_Folder` can be typed out.
 */
export function toPageRoute(text: string, site: TypedRouteSite, { typing = false }: { typing?: boolean } = {}): string {
  const parts = text.split("/");
  // The page's own name: the last part, before a closing `/` for a folder URL.
  const named = parts.length - 1 - [...parts].reverse().findIndex(Boolean);
  const folder = (path: string) => site.files.some((file) => file.startsWith(`${path}/`));
  const beginsFolder = (path: string) => site.files.some((file) => file.startsWith(path) && file.includes("/", path.length));
  let above = "";
  return parts.map((part, index) => {
    if (!part) return part;
    const path = `${above}${part}`;
    const kept = index === named ? part === site.own || (typing && beginsFolder(path)) : folder(path);
    const last = index === parts.length - 1;
    const suffix = !kept && last ? ((typing ? /\.(?:h(?:t(?:ml?)?)?)?$/i : /\.html$/i).exec(part)?.[0] ?? "") : "";
    const made = kept ? part : toPageAddress(part.slice(0, part.length - suffix.length), { typing }) + suffix.toLowerCase();
    above = `${above}${made}/`;
    return made;
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
