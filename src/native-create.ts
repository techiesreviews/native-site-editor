// Files, folders and pages created in the editor's file tree.
//
// A new file is a browser draft with no base blob, published like any other
// draft. This module decides what a creation writes, as plain text: the
// repository path a typed name gives (letters, digits, `_`, `.` and `-` per
// segment, a `/` for folders under it), the file a new page's URL gives under
// file-based routing (shared/native-routes.ts), the new page's source made
// from the home page, and what a new file adds to the manifest. It has no DOM
// and no I/O; whether a path is already taken is the caller's to say.
import { NATIVE_PAGES_DIR, nativePageRoute } from "../shared/native-routes";
import { VOID_ELEMENTS, startTagAttribute, startTags, type StartTag } from "../shared/html-source";
import { nativePageComment } from "../shared/native-project";
import { isNativeComponentTag } from "./native-manifest";
import type { NativeRegistration } from "./native-page-meta";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const SEGMENT = /^[\w.-]+$/;
// Files a text editor cannot make: images, fonts, media and archives are uploaded on GitHub.
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|tgz|tar|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|webm|mov|wav|ogg)$/i;

/** `name` (a name, or a path with `/`) under `folder` ("" is the root), as a repository path. */
function joinPath(folder: string, name: string, what: "file" | "folder"): Checked<string> {
  let relative = name.trim();
  if (what === "folder" && relative.endsWith("/")) relative = relative.slice(0, -1);
  if (!relative) return { ok: false, error: `Enter a ${what} name.` };
  const parts = relative.split("/");
  if (parts.some((part) => !part))
    return { ok: false, error: "Leave no empty part between slashes." };
  if (parts.some((part) => part === "." || part === ".."))
    return { ok: false, error: "A name cannot be . or .." };
  if (parts.some((part) => !SEGMENT.test(part)))
    return { ok: false, error: "Use letters, digits, -, _ and . only, with / between folders." };
  if (parts.some((part) => part.toLowerCase() === ".git"))
    return { ok: false, error: ".git is reserved by git." };
  const path = folder ? `${folder}/${relative}` : relative;
  if (path.length > 1024) return { ok: false, error: "That path is too long." };
  if (`${path}/`.startsWith(".github/workflows/"))
    return { ok: false, error: "Create GitHub Actions workflows on GitHub; this editor does not write them." };
  return { ok: true, value: path };
}

/** The path of a new text file named `name` in `folder`. */
export function newFilePath(folder: string, name: string): Checked<string> {
  const path = joinPath(folder, name, "file");
  if (path.ok && BINARY.test(path.value))
    return { ok: false, error: "Only text files can be created here. Add images, fonts and other binary files on GitHub." };
  return path;
}

/** The path `name` gives in `folder` for a file or folder renamed or moved there (any extension). */
export function renamedPath(folder: string, name: string, what: "file" | "folder"): Checked<string> {
  return joinPath(folder, name, what);
}

/** The path of a new folder named `name` in `folder`. */
export function newFolderPath(folder: string, name: string): Checked<string> {
  return joinPath(folder, name, "folder");
}

/** A page URL as typed (`/videos/intro/`, `videos/intro`, `#/videos/intro`) as a route. */
export function normalizeRoute(input: string): Checked<string> {
  let text = input.trim();
  if (text.startsWith("#")) text = text.slice(1);
  if (!text) return { ok: false, error: "Enter the page's URL, such as /videos/intro/." };
  if (text.startsWith("/")) text = text.slice(1);
  if (text.endsWith("/")) text = text.slice(0, -1);
  if (!text) return { ok: true, value: "/" };
  const parts = text.split("/");
  if (parts.some((part) => !part)) return { ok: false, error: "Leave no empty part between slashes." };
  if (parts.some((part) => !SEGMENT.test(part) || part === "." || part === ".."))
    return { ok: false, error: "Use letters, digits, -, _ and . in the URL, with / between parts." };
  if (parts.some((part) => part.startsWith("_") || part.startsWith(".")))
    return { ok: false, error: "A URL part cannot start with _ or . (such files are not pages)." };
  return { ok: true, value: `/${parts.join("/")}/` };
}

/**
 * The file a new page at `route` goes in: `/a/b/` is `src/pages/a/b.html`,
 * or `src/pages/a/b/index.html` when the folder `src/pages/a/b` already
 * exists (on the branch or as drafts), so the page sits with its folder.
 */
export function nativeNewPagePath(route: string, folderExists: (folder: string) => boolean): Checked<string> {
  if (route === "/") return { ok: true, value: `${NATIVE_PAGES_DIR}index.html` };
  const folder = `${NATIVE_PAGES_DIR}${route.slice(1, -1)}`;
  const path = folderExists(folder) ? `${folder}/index.html` : `${folder}.html`;
  // `/a/index/` would be `src/pages/a/index.html`, which is `/a/`.
  if (nativePageRoute(path) !== route) return { ok: false, error: `No page file can give the URL ${route}.` };
  return { ok: true, value: path };
}

/** A route's last part as a heading: `/videos/my-first_clip/` is "My first clip". */
export function routeHeading(route: string): string {
  const last = route.split("/").filter(Boolean).at(-1);
  if (!last) return "Home";
  const words = last.replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : last;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The start tag of the first `<section>` element directly in `<main>`, whose
 * content runs from `from` to `to`: tags are followed by nesting depth (an
 * unclosed element only makes later sections look nested, so none is found
 * rather than a wrong one).
 */
function firstChildSection(html: string, from: number, to: number): StartTag | undefined {
  const inner = html.slice(from, to);
  const events = [
    ...startTags(inner).map((tag) => ({ at: tag.start, tag, close: "" })),
    ...[...inner.matchAll(/<\/([a-zA-Z][^\s/>]*)[^>]*>/g)].map((match) => ({ at: match.index, tag: undefined, close: match[1].toLowerCase() })),
  ].sort((a, b) => a.at - b.at);
  const open: string[] = [];
  for (const { tag, close } of events) {
    if (tag) {
      if (!open.length && tag.name === "section")
        return { name: tag.name, start: from + tag.start, nameEnd: from + tag.nameEnd, end: from + tag.end };
      if (!VOID_ELEMENTS.has(tag.name) && !inner.slice(tag.start, tag.end).endsWith("/>")) open.push(tag.name);
    } else {
      const index = open.lastIndexOf(close);
      if (index >= 0) open.length = index;
    }
  }
  return undefined;
}

/** A copy of the `<section>` start tag `tag` in `html` without its `id` and `data-key`, keyed `hero` when `keyed`. */
function sectionStartTag(html: string, tag: StartTag, keyed: boolean) {
  const drop = ["id", "data-key"]
    .map((name) => startTagAttribute(html, tag, name))
    .filter((found) => found !== undefined)
    .sort((a, b) => b.start - a.start);
  let text = html.slice(tag.start, tag.end);
  for (const found of drop) text = text.slice(0, found.start - tag.start) + text.slice(found.end - tag.start);
  const attributes = text.slice(tag.nameEnd - tag.start, -1).replace(/\s*\/$/, "").trimEnd();
  return `<section${attributes}${keyed ? ' data-key="hero"' : ""}>`;
}

/**
 * A new page's source made from the home page's: everything outside its
 * `<main>` (the header and footer components) as it is, the `<main>` start
 * tag kept, and its content replaced by one `<section>` holding one `<h1>`,
 * so "Add to the page" has sections to add others beside. The section copies
 * the start tag of the home page's first `<section>` directly in `<main>`
 * (its class and other attributes, but no `id`, which would repeat), else it
 * is a bare `<section>`. A page keyed for the editor (its `<main>` has a
 * `data-key`) keys the section `hero` and the heading `title`. A home page
 * with no `<main>` gives a page of just `<main id="main">`, the section and
 * the heading. The home page's leading `<!-- title: … -->` comment is its
 * own and is left out.
 */
export function nativePageTemplate(source: string | undefined, heading: string): string {
  const home = source === undefined ? undefined : nativePageComment(source).body;
  const text = escapeHtml(heading);
  const start = home ? startTags(home).find((tag) => tag.name === "main") : undefined;
  const close = home && start ? home.toLowerCase().indexOf("</main>", start.end) : -1;
  if (!home || !start || close < 0) return `<main id="main">\n  <section>\n    <h1>${text}</h1>\n  </section>\n</main>\n`;
  const lineIndent = (at: number) => {
    const lead = home.slice(home.lastIndexOf("\n", at - 1) + 1, at);
    return /^[ \t]*$/.test(lead) ? lead : undefined;
  };
  const indent = lineIndent(start.start) ?? "";
  // A page keyed for the editor keeps keying its elements.
  const keyed = startTagAttribute(home, start, "data-key") !== undefined;
  const section = firstChildSection(home, start.end, close);
  // One level of indentation as the home page has it under <main>.
  const sectionIndent = section ? lineIndent(section.start) : undefined;
  const step = sectionIndent && sectionIndent.length > indent.length && sectionIndent.startsWith(indent)
    ? sectionIndent.slice(indent.length)
    : "  ";
  const open = section ? sectionStartTag(home, section, keyed) : `<section${keyed ? ' data-key="hero"' : ""}>`;
  const h1 = `<h1${keyed ? ' data-key="title"' : ""}>${text}</h1>`;
  const inner = [`${indent}${step}${open}`, `${indent}${step}${step}${h1}`, `${indent}${step}</section>`].join("\n");
  return `${home.slice(0, start.end)}\n${inner}\n${indent}${home.slice(close)}`;
}

/**
 * What a new file at `path` adds to the manifest: a stylesheet directly in
 * `src/styles/` is one of the site's styles; a template
 * `src/components/<tag>/<tag>.html` with a valid custom-element tag is that
 * component. Other files add nothing.
 */
export function nativeRegistration(path: string): NativeRegistration | undefined {
  if (/^src\/styles\/[\w.-]+\.css$/.test(path)) return { kind: "style", path };
  const component = /^src\/components\/([\w.-]+)\/([\w.-]+)\.html$/.exec(path);
  if (component && component[1] === component[2] && isNativeComponentTag(component[1]))
    return { kind: "component", tag: component[1], path };
  return undefined;
}
