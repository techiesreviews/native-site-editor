// Files, folders and pages created in the editor's file tree.
//
// A new file is a browser draft with no base blob, published like any other
// draft. This module decides what a creation writes, as plain text: the
// repository path a typed name gives (letters, digits, `_`, `.` and `-` per
// segment, a `/` for folders under it), the route a typed URL is, and a new
// page's document made from the home page's. It has no DOM and no I/O;
// whether a path is already taken is the caller's to say.
import { asciiLower, startTagAttribute, startTags } from "../shared/html-source";
import { nativePageHead, nativePageWithDetails, nativePageWithUrl } from "../shared/native-project";

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

/**
 * A page URL as typed (`/videos/intro/`, `videos/intro`, `/notes.html`,
 * `/videos/index.html`) as a route: a folder's (`/videos/intro/`) unless it
 * names an `.html` file.
 */
export function normalizeRoute(input: string): Checked<string> {
  let text = input.trim();
  if (!text) return { ok: false, error: "Enter the page's URL, such as /videos/intro/." };
  if (text.startsWith("/")) text = text.slice(1);
  if (text === "index.html") return { ok: true, value: "/" };
  if (text.endsWith("/index.html")) text = text.slice(0, -"index.html".length);
  const file = text.endsWith(".html");
  if (text.endsWith("/")) text = text.slice(0, -1);
  if (!text) return { ok: true, value: "/" };
  const parts = text.split("/");
  if (parts.some((part) => !part)) return { ok: false, error: "Leave no empty part between slashes." };
  if (parts.some((part) => !SEGMENT.test(part) || part === "." || part === ".."))
    return { ok: false, error: "Use letters, digits, -, _ and . in the URL, with / between parts." };
  if (parts.some((part) => part.startsWith("_") || part.startsWith(".")))
    return { ok: false, error: "A URL part cannot start with _ or . (such files are not pages)." };
  if (parts[0] === "components" || parts[0] === "node_modules")
    return { ok: false, error: `/${parts[0]}/ is not for pages.` };
  return { ok: true, value: file ? `/${parts.join("/")}` : `/${parts.join("/")}/` };
}

/** A route's last part as a heading: `/videos/my-first_clip/` is "My first clip". */
export function routeHeading(route: string): string {
  const last = route.split("/").filter(Boolean).at(-1)?.replace(/\.html$/, "");
  if (!last) return "Home";
  const words = last.replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : last;
}

const MINIMAL_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title></title>
  <meta name="description" content="">
</head>
<body>
  <main>
  </main>
</body>
</html>
`;

// What sets a site's name off in a title: "About · Larkspur Studio".
const TITLE_SEPARATORS = [" · ", " | ", " — ", " – ", " - ", " :: ", " • "];

/**
 * A new page's title in the form the home page's has: with the home page
 * titled "Small websites · Larkspur Studio", the page "New" is titled
 * "New · Larkspur Studio"; a title that already ends so, or a home page
 * title with no such part, leaves `title` as it is.
 */
export function nativeNewPageTitle(homeTitle: string | undefined, title: string): string {
  const typed = title.trim();
  if (!homeTitle || !typed) return typed;
  let at = -1;
  let separator = "";
  for (const candidate of TITLE_SEPARATORS) {
    const found = homeTitle.lastIndexOf(candidate);
    if (found > at) { at = found; separator = candidate; }
  }
  if (at <= 0) return typed;
  const suffix = homeTitle.slice(at);
  if (!homeTitle.slice(at + separator.length).trim() || typed.endsWith(suffix) || typed === suffix.slice(separator.length)) return typed;
  return `${typed}${suffix}`;
}

/** `html` without its structured data (`<script type="application/ld+json">`), each with its own lines. */
export function withoutStructuredData(html: string): string {
  let text = html;
  for (;;) {
    const tag = startTags(text).find((item) => item.name === "script" && startTagAttribute(text, item, "type")?.value.trim().toLowerCase() === "application/ld+json");
    if (!tag) return text;
    const close = /<\/script(?=[\t\n\f\r />])[^>]*>/i.exec(text.slice(tag.end));
    const end = close ? tag.end + close.index + close[0].length : text.length;
    const lineStart = text.lastIndexOf("\n", tag.start - 1) + 1;
    const own = /^[ \t]*$/.test(text.slice(lineStart, tag.start)) && /^[ \t]*(?:\r?\n|$)/.exec(text.slice(end));
    text = own ? text.slice(0, lineStart) + text.slice(end + own[0].length) : text.slice(0, tag.start) + text.slice(end);
  }
}

/**
 * A new page's document made from the home page's: the same head (its
 * stylesheets, scripts and meta tags, not its structured data) with the
 * new `title` in the home page's form (`nativeNewPageTitle`) and an empty
 * description (`og:title` and `og:description` along, when there), its own
 * address `url` in `<link rel="canonical">` and `og:url` when the home page
 * has them (both removed when the site has no address), the same body
 * outside `<main>` (the header and footer components), and `<main>` kept but
 * emptied, so "Add to the page" starts from nothing. A home page with no
 * `<main>` gives its body a `<main>` alone; no home page, a minimal
 * document.
 */
export function nativePageTemplate(home: string | undefined, title: string, url?: string): string {
  const source = withoutStructuredData(home ?? MINIMAL_PAGE);
  const full = nativeNewPageTitle(nativePageHead(source).title, title);
  const text = nativePageWithUrl(nativePageWithDetails(source, { title: full, description: "" }), url);
  const lower = asciiLower(text);
  const main = startTags(text).find((tag) => tag.name === "main");
  const mainClose = main ? /<\/main(?=[\t\n\f\r />])/.exec(lower.slice(main.end)) : undefined;
  const close = main && mainClose ? main.end + mainClose.index : -1;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  if (main && close >= 0) {
    const lead = text.slice(text.lastIndexOf("\n", main.start - 1) + 1, main.start);
    const indent = /^[ \t]*$/.test(lead) ? lead : "";
    return `${text.slice(0, main.end)}${newline}${indent}${text.slice(close)}`;
  }
  const body = startTags(text).find((tag) => tag.name === "body");
  const bodyClose = body ? [...lower.matchAll(/<\/body(?=[\t\n\f\r />])/g)].at(-1)?.index ?? -1 : -1;
  if (!body || bodyClose < body.end) return nativePageWithDetails(MINIMAL_PAGE, { title: full, description: "" });
  return `${text.slice(0, body.end)}${newline}  <main>${newline}  </main>${newline}${text.slice(bodyClose)}`;
}
