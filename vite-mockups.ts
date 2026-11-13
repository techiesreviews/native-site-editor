// The planning mock-ups (`docs/wayfinder/<map>/prototypes/*`), served by the preview site at
// `/mockups/<map>/<file>`. `/mockups/` opens the catalogue board's mock-ups (`/catalogue.html#plans`) and
// `/mockups/board.json` gives the board each mock-up's card; the old plain list's address `/mockups/list/` leads to the
// board too. Only the preview build turns this on (`MOCKUPS=1`, `npm run build:preview`, always with the board);
// production builds and the editor's boot never see these files. The images a mock-up uses sit beside it and are
// copied too; images no mock-up uses (reference screenshots for planning) stay unpublished. Each card carries a label
// saying how far the build tickets linking to it have got (`mockupShipping`). A mock-up whose feature is released
// (Live or On preview) also has its picture, taken when it was released and then kept (`prototypes/agreed/<name>.webp`,
// made by `scripts/mockup-pictures.mjs`), and a link to the working mock-up.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

/** One file in a map's `prototypes/` folder. */
export type Mockup = { map: string; file: string; path: string };

/** An HTML mock-up. */
const mockupPage = /^[^.].*\.html$/i;
/** An image a mock-up may use. */
const image = /^[^.].*\.(?:png|jpe?g|gif|webp|avif|svg)$/i;
const titlePrefix = /^PROTOTYPE \(throwaway\) · /;
/** `src`, `href`, `poster`, `srcset` and `imagesrcset` values (quoted, backticked or bare, `data-src` too) and
 * `url(...)` arguments. Not counted: CSS `image-set("a.png" 1x)` without `url()`, and paths a script builds. */
const reference = /\b(src|href|poster|srcset|imagesrcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s"'<>`]+))|\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;

const namedCharacters: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeCharacters = (text: string) => text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, decimal?: string, hex?: string, name?: string) => {
  if (name) return namedCharacters[name.toLowerCase()] ?? match;
  const code = decimal ? Number(decimal) : parseInt(hex!, 16);
  return code <= 0x10ffff ? String.fromCodePoint(code) : match;
});

/** The file names in the same folder an HTML mock-up points at, e.g. `a.png` from `./a.png?v=2 2x`.
 * References inside HTML comments don't count, so a commented-out reference image stays unpublished. */
export function referencedFiles(html: string): Set<string> {
  const names = new Set<string>();
  const uncommented = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, (match, element?: string) => element ? match : "");
  for (const [, attribute, ...values] of uncommented.matchAll(reference)) {
    const value = decodeCharacters(values.find(part => part !== undefined) ?? "");
    const urls = attribute?.toLowerCase().endsWith("srcset") ? value.split(",").map(candidate => candidate.trim().split(/\s+/)[0]) : [value.trim()];
    for (const url of urls) {
      let name = url.replace(/[?#].*$/, "").replace(/^(?:\.\/)+/, "");
      try { name = decodeURIComponent(name); } catch { /* keep it as written */ }
      if (name && !name.includes("/")) names.add(name);
    }
  }
  return names;
}

const isDir = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;

/** Every HTML mock-up in each map's `prototypes/` folder, and the images beside them that one of
 * those mock-ups uses; unused images, notes and other files stay unpublished. */
export function mockupFiles(root: string): Mockup[] {
  const wayfinder = join(root, "docs/wayfinder");
  return readdirSync(wayfinder).sort().flatMap(map => {
    const folder = join(wayfinder, map, "prototypes");
    if (!isDir(folder)) return [];
    const files = readdirSync(folder).sort().filter(file => (mockupPage.test(file) || image.test(file)) && statSync(join(folder, file)).isFile());
    const used = new Set(files.filter(file => mockupPage.test(file)).flatMap(file => [...referencedFiles(readFileSync(join(folder, file), "utf8"))]));
    return files.filter(file => mockupPage.test(file) || used.has(file)).map(file => ({ map, file, path: join(folder, file) }));
  });
}

/** Whether a label means the feature is released: on `main` (Live) or on the dev preview. */
export const isReleased = (label: string | undefined) => label === "live" || label === "preview";

/** Where a mock-up's agreed picture sits, beside the mock-up: `prototypes/agreed/<name>.webp`. */
export function mockupPicturePath(root: string, { map, file }: { map: string; file: string }) {
  const path = join(root, "docs/wayfinder", map, "prototypes/agreed", `${file.replace(/\.html$/i, "")}.webp`);
  return { path, exists: statSync(path, { throwIfNoEntry: false })?.isFile() ?? false };
}

/** The published path of a mock-up's picture, from its map's folder in the build (`mockups/<map>/`). */
const pictureUrl = (file: string) => `agreed/${file.replace(/\.html$/i, "")}.webp`;

/** A mock-up's `<title>` without the shared "PROTOTYPE (throwaway)" prefix, or its file name. */
export function mockupTitle(html: string, file: string): string {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1].trim().replace(titlePrefix, "");
  return title || file;
}

/** A build ticket, its `path` from the repo root (`docs/wayfinder/<map>/build/tickets/*.md`, or
 * `docs/work/<work>/issues/*.md` with the work's name as its `map`), and the mock-ups it links to, as `<map>/<file>`. */
export type BuildTicket = { map: string; name: string; path: string; closed: boolean; claimed: boolean; mockups: string[] };

/** What a mock-up's label says, and what the legend says it means. */
export const SHIPPING_LABELS = {
  live: ["Live", "Built and released to editor.techies.tools."],
  preview: ["On preview", "Built and on preview-editor.techies.tools, not released yet."],
  building: ["Being built", "Some of its tickets are done or under way, others still open."],
  planned: ["Planned", "Build tickets are written; none started yet."],
  idea: ["Idea only", "No build ticket links to it: an exploration or an option not chosen."],
} as const;
export type Shipping = { label: keyof typeof SHIPPING_LABELS; tickets: BuildTicket[] };

/** A field of a ticket's front matter, `""` when it has none. */
const frontMatterField = (text: string, name: string) =>
  new RegExp(`^${name}:[ \\t]*(.*?)[ \\t]*$`, "m").exec(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "")?.[1] ?? "";

/** `prototypes/<file>.html` with the path before it, as a ticket links it (`../../prototypes/a.html`,
 * `../../../other-map/prototypes/b.html`) or names it (`prototypes/c.html`). */
const mockupLink = /((?:[\w.-]+\/)*)prototypes\/([\w.-]+\.html)/gi;

/** Every build ticket that links to one of `mockups`: closed by its `status`, claimed by its `assignee`. A link
 * counts relative to the ticket, the repo or the ticket's map, whichever names a published mock-up. The tickets
 * are each wayfinder map's `build/tickets` and each piece of work's `issues` under `docs/work/`. */
export function buildTickets(root: string, mockups: readonly Mockup[]): BuildTicket[] {
  const wayfinder = join(root, "docs/wayfinder");
  const known = new Set(mockups.map(({ map, file }) => `${map}/${file}`));
  const folders = (parent: string, below: string) => (isDir(parent) ? readdirSync(parent).sort() : []).map(map => ({ map, folder: join(parent, map, below) }));
  return [...folders(wayfinder, "build/tickets"), ...folders(join(root, "docs/work"), "issues")].flatMap(({ map, folder }) => {
    if (!isDir(folder)) return [];
    return readdirSync(folder).sort().filter(file => file.endsWith(".md")).flatMap(file => {
      const path = join(folder, file);
      const text = readFileSync(path, "utf8");
      const linked = new Set<string>();
      for (const [, before, page] of text.matchAll(mockupLink)) {
        const key = [dirname(path), root, join(wayfinder, map)]
          .map(base => relative(wayfinder, resolve(base, `${before}prototypes/${page}`)).split("\\").join("/").replace("/prototypes/", "/"))
          .find(candidate => known.has(candidate));
        if (key) linked.add(key);
      }
      if (!linked.size) return [];
      return [{ map, name: /^\d+/.exec(file)?.[0] ?? file.slice(0, -3), path: relative(root, path).split("\\").join("/"), closed: frontMatterField(text, "status") === "closed", claimed: frontMatterField(text, "assignee") !== "", mockups: [...linked] }];
    });
  });
}

/** Those of `tickets` closed in `origin/main`'s copy (or, without it, a local `main`'s). A ticket closes in the
 * same change as its work, so closed there means released. Only `main`'s tip is read, so a shallow clone works
 * once it has `main`; a ticket renamed since its release reads as not on `main` until the rename is released.
 * Undefined when git or `main` can't be read; `origin/main` is as fresh as the last fetch of `main`. */
export function ticketsOnMain(root: string, tickets: readonly BuildTicket[]): ReadonlySet<string> | undefined {
  const git = (args: string[], input?: string) =>
    execFileSync("git", ["-C", root, ...args], { input, stdio: ["pipe", "pipe", "ignore"], maxBuffer: 1 << 28 });
  let blobs: Buffer;
  try {
    const ref = ["origin/main", "main"].find(name => { try { return git(["rev-parse", "--verify", "--quiet", `${name}^{commit}`]).length > 0; } catch { return false; } });
    if (!ref) return undefined;
    blobs = git(["cat-file", "--batch"], tickets.map(({ path }) => `${ref}:./${path}\n`).join(""));
  } catch {
    return undefined;
  }
  // `<id> blob <size>`, the file and a newline per ticket; `<name> missing` for one `main` doesn't have.
  const onMain = new Set<string>();
  let offset = 0;
  for (const { path } of tickets) {
    const headerEnd = blobs.indexOf(10, offset);
    const [, kind, size] = blobs.subarray(offset, headerEnd).toString().split(" ");
    offset = headerEnd + 1;
    if (kind !== "blob") continue;
    if (frontMatterField(blobs.subarray(offset, offset + Number(size)).toString(), "status") === "closed") onMain.add(path);
    offset += Number(size) + 1;
  }
  return onMain;
}

/** Each HTML mock-up's label from the build tickets linking to it: Live when all are closed and on `main`
 * (`onMain` undefined counts as not), On preview when all are closed, Being built when some are closed
 * or claimed, Planned when none is, Idea only without any. */
export function mockupShipping(mockups: readonly Mockup[], tickets: readonly BuildTicket[], onMain?: ReadonlySet<string>): Map<string, Shipping> {
  return new Map(mockups.filter(({ file }) => file.endsWith(".html")).map(({ map, file }) => {
    const key = `${map}/${file}`;
    const linking = tickets.filter(ticket => ticket.mockups.includes(key))
      .sort((a, b) => Number(a.map !== map) - Number(b.map !== map) || a.map.localeCompare(b.map) || a.name.localeCompare(b.name, "en", { numeric: true }));
    const closed = linking.filter(ticket => ticket.closed);
    const label: Shipping["label"] = !linking.length ? "idea"
      : closed.length === linking.length ? (closed.every(ticket => onMain?.has(ticket.path)) ? "live" : "preview")
      : closed.length || linking.some(ticket => ticket.claimed) ? "building" : "planned";
    return [key, { label, tickets: linking }];
  }));
}

/** The tickets a mock-up came from: `tickets 21, 22, atomic-catalogue 66`; empty for none. */
function ticketsText(map: string, { tickets }: Shipping): string {
  const names = tickets.map(ticket => ticket.map === map ? ticket.name : `${ticket.map} ${ticket.name}`);
  return names.length ? `${names.length === 1 ? "ticket" : "tickets"} ${names.join(", ")}` : "";
}

/** One mock-up as the catalogue board draws its card: the label (`label`, and its words `labelName`), the tickets it
 * came from, where to open it and, for a released one with a picture, the picture. Every address starts at the site's root. */
export type MockupCard = { file: string; title: string; label: keyof typeof SHIPPING_LABELS; labelName: string; tickets: string; href: string; picture?: string };
/** `/mockups/board.json`: each map's mock-ups, in the order of the files. */
export type MockupBoard = { maps: { map: string; mockups: MockupCard[] }[] };

/** The cards of the board, by map, from each mock-up's label, title and picture. */
export function mockupBoard(mockups: readonly Mockup[], { read = path => readFileSync(path, "utf8"), shipping = new Map(), pictures = new Set() }: {
  read?: (path: string) => string;
  shipping?: ReadonlyMap<string, Shipping>;
  pictures?: ReadonlySet<string>;
} = {}): MockupBoard {
  const maps = new Map<string, MockupCard[]>();
  for (const { map, file, path } of mockups) {
    if (!file.endsWith(".html")) continue;
    const key = `${map}/${file}`;
    const state = shipping.get(key) ?? { label: "idea", tickets: [] };
    const base = `/mockups/${encodeURIComponent(map)}/`;
    const card: MockupCard = {
      file, title: decodeCharacters(mockupTitle(read(path), file)), label: state.label, labelName: SHIPPING_LABELS[state.label][0], tickets: ticketsText(map, state),
      href: `${base}${encodeURIComponent(file)}`,
    };
    if (isReleased(state.label) && pictures.has(key)) card.picture = `${base}${pictureUrl(file).split("/").map(encodeURIComponent).join("/")}`;
    const cards = maps.get(map);
    if (cards) cards.push(card);
    else maps.set(map, [card]);
  }
  return { maps: [...maps].map(([map, cards]) => ({ map, mockups: cards })) };
}

/** Where `/mockups/` leads when the board is built too: the board, opened on its mock-ups (src/catalogue/board.ts). */
export const BOARD_MOCKUPS = "/catalogue.html#plans";

/** `/mockups/` itself: it opens the board's mock-ups. A plain page with a link, for a browser that does not follow the redirect. */
export function mockupsRedirect(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${BOARD_MOCKUPS}">
<title>Mock-ups</title>
</head>
<body>
<a href="${BOARD_MOCKUPS}">Mock-ups</a>
</body>
</html>
`;
}

/** Mock-ups are single files with inline scripts (one imports Yjs from esm.sh), which the editor's policy
 * in `public/_headers` forbids. This rule, appended to the built `_headers`, swaps that policy for one
 * allowing them under `/mockups/` only: a rule's `!` removes the header earlier rules set. `sandbox`
 * (without allow-same-origin) runs them in an opaque origin, so they never see the editor's session
 * cookie or storage; their storage calls already fall back to memory. */
export const MOCKUPS_HEADERS = `
/mockups/*
  ! Content-Security-Policy
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://esm.sh; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; sandbox allow-scripts allow-forms allow-popups
  X-Robots-Tag: noindex
`;

/** Appends the mock-ups' rule to the built `_headers`, once. */
function appendMockupsHeaders(dir: string | undefined) {
  if (!dir) return;
  const headers = join(dir, "_headers");
  if (!existsSync(headers) || !readFileSync(headers, "utf8").includes(MOCKUPS_HEADERS)) appendFileSync(headers, MOCKUPS_HEADERS);
}

/** The header rule on its own, for a build that copies `public/` into the same folder after the mock-ups' build
 * (the catalogue board's second build, vite.config.ts): that copy writes the editor's `_headers` again and the rule
 * is gone, so every mock-up with a script was blocked by the editor's policy. */
export function mockupsHeaders(): Plugin {
  return { name: "ase-mockups-headers", apply: "build", writeBundle: ({ dir }) => appendMockupsHeaders(dir) };
}

/** The mock-up pages and their pictures, `/mockups/board.json` for the catalogue board's cards, and `/mockups/` (with the
 * old `/mockups/list/`) opening the board's mock-ups: the build that uses this plugin builds the board too. */
export function mockups(root: string): Plugin {
  return {
    name: "ase-mockups",
    apply: "build",
    generateBundle() {
      const files = mockupFiles(root);
      for (const { map, file, path } of files) this.emitFile({ type: "asset", fileName: `mockups/${map}/${file}`, source: readFileSync(path) });
      const tickets = buildTickets(root, files);
      const shipping = mockupShipping(files, tickets, ticketsOnMain(root, tickets));
      const pictures = new Set<string>();
      for (const mockup of files) {
        const picture = mockupPicturePath(root, mockup);
        if (!picture.exists || !isReleased(shipping.get(`${mockup.map}/${mockup.file}`)?.label)) continue;
        this.emitFile({ type: "asset", fileName: `mockups/${mockup.map}/${pictureUrl(mockup.file)}`, source: readFileSync(picture.path) });
        pictures.add(`${mockup.map}/${mockup.file}`);
      }
      // /mockups/ and the old plain list's address both open the board's mock-ups.
      this.emitFile({ type: "asset", fileName: "mockups/index.html", source: mockupsRedirect() });
      this.emitFile({ type: "asset", fileName: "mockups/list/index.html", source: mockupsRedirect() });
      this.emitFile({ type: "asset", fileName: "mockups/board.json", source: JSON.stringify(mockupBoard(files, { shipping, pictures })) });
    },
    // After Vite has copied public/_headers into the output folder; once, even across watch rebuilds.
    writeBundle: ({ dir }) => appendMockupsHeaders(dir),
  };
}
