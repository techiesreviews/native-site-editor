// Preview links (slice 35; CONTEXT.md "Preview link"): the real site on a separate
// preview address, live while Lex's editor is open, with nothing stored on the way.
//
// A link is `<preview origin>/s/<site>-<token>/#k=<key>`. The token is 128 random
// bits, the link's end (seconds, 8 hex digits) and a 128-bit tag the editor's
// Worker made over both with its own secret, so a made-up or expired link is
// refused before any relay instance wakes. The room key travels after `#`, so no
// server sees it. The preview Worker (worker/preview-host.ts) serves the page that
// opens the room; Lex's tab (src/preview-serve.ts) answers each file the site asks
// for from the editor's copy, unsaved changes included, and says when one changed.

/** The token: nonce (32 hex), end in seconds (8 hex), tag (32 hex). */
export const PREVIEW_TOKEN = /^[a-f\d]{72}$/;
/** The sharing tab's own proof for a token (its sign-in and repository; never in the link). */
export const PREVIEW_HOST = /^[a-f\d]{64}$/;
/** How long a link lasts unless turned off first. */
export const PREVIEW_DAYS = 30;
/** The one room inside a preview link's relay instance. */
export const PREVIEW_ROOM = "preview-link";
/** The relay closes every socket of a preview with this when it is turned off. */
export const PREVIEW_TURNED_OFF = 4410;
/** A file larger than this is not sent through the room (it would not fit 64 parts of a message). */
export const PREVIEW_FILE_LIMIT = 20 * 1024 * 1024;

/** When a token's link ends, in milliseconds; NaN for a malformed token. */
export const previewTokenEnds = (token: string) => PREVIEW_TOKEN.test(token) ? parseInt(token.slice(32, 40), 16) * 1000 : NaN;

/** The site's name as the link shows it: lower case letters, digits and dashes, at most 40. */
export function previewSlug(site: string) {
  return site.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "site";
}

/** A preview address's parts: its token, the link's own path (`/s/<site>-<token>`) and what follows it. */
export function readPreviewPath(pathname: string): { token: string; base: string; rest: string } | undefined {
  const match = /^\/s\/(?:[a-z0-9-]{1,40}-)?([a-f\d]{72})(?=\/|$)(.*)$/.exec(pathname);
  return match ? { token: match[1], base: pathname.slice(0, pathname.length - match[2].length), rest: match[2] } : undefined;
}

/** How a static server answers a path: a file (200, or 404 with the site's own 404 page), a move to the folder's
 * address (301), or a refusal of a malformed path (400). `file` is the repository path served. */
export type PreviewAnswer = { status: 200 | 404; file?: string } | { status: 301; location: string } | { status: 400 };

/**
 * What a static host does for `path` (the site's URL path, from "/"): a folder's `index.html`, the file itself, a
 * folder named without its slash moved to it, or `<path>.html`; else the site's `404.html` with a 404. Hidden files and
 * folders (`.editor/`, `.github/`, `.env`), which are the repository's and not the site's, are never shown; only
 * `.well-known/` is.
 */
export function resolvePreviewPath(path: string, has: (file: string) => boolean): PreviewAnswer {
  if (!path.startsWith("/")) return { status: 400 };
  let parts: string[];
  try { parts = path.slice(1).split("/").map((part) => decodeURIComponent(part)); } catch { return { status: 400 }; }
  const last = parts.length - 1;
  // An encoded slash (`%2F`) would make one part of two folders and slip past the hidden-file check: refused.
  if (parts.some((part, index) => (part === "" && index !== last) || part === "." || part === ".." || /[/\\\x00-\x1f\x7f]/.test(part)))
    return { status: 400 };
  const file = parts.join("/");
  if (parts.some((part) => part.startsWith(".") && part !== ".well-known")) return notFound(has);
  if (file === "" || file.endsWith("/")) {
    const index = `${file}index.html`;
    return has(index) ? { status: 200, file: index } : notFound(has);
  }
  if (has(file)) return { status: 200, file };
  if (has(`${file}/index.html`)) return { status: 301, location: `${path}/` };
  if (has(`${file}.html`)) return { status: 200, file: `${file}.html` };
  return notFound(has);
}
const notFound = (has: (file: string) => boolean): PreviewAnswer => has("404.html") ? { status: 404, file: "404.html" } : { status: 404 };

/**
 * A visitor to Lex's tab: "I am here" (answered with `hello`), or the file at `path` (the site's URL path), asked of
 * one serving tab (`host`, from its hello) for this visitor (`me`, a random id), so the answer is for it alone.
 */
export type VisitorMessage = { t: "hi" } | { t: "get"; path: string; host: string; me: string };
/**
 * Lex's tab to visitors. `hello`: this serving tab's id, the page to start on and the site's version, for a visitor that
 * said `hi`. `file`: the answer for `path` at `version`, its bytes in base64, for the visitors who asked (`to`); others
 * drop it. `changed`: some file answered before changed (a new version): visitors forget what they hold and draw again.
 */
export type HostMessage =
  | { t: "hello"; host: string; version: string; start: string }
  | { t: "file"; version: string; path: string; to: string[]; status: number; type?: string; body?: string; location?: string }
  | { t: "changed"; version: string };
