// The planning mock-ups (`docs/wayfinder/<map>/prototypes/*`), served by the preview site at
// `/mockups/<map>/<file>` with a generated `/mockups/index.html` listing them by map. Only the
// preview build turns this on (`MOCKUPS=1`, `npm run build:preview`); production builds and the
// editor's boot never see these files. The images a mock-up uses sit beside it and are copied too;
// images no mock-up uses (reference screenshots for planning) stay unpublished. Each mock-up on the
// index carries a label saying how far the build tickets linking to it have got (`mockupShipping`).
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
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

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, char => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" })[char]};`);

/** A mock-up's `<title>` without the shared "PROTOTYPE (throwaway)" prefix, or its file name. */
export function mockupTitle(html: string, file: string): string {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1].trim().replace(titlePrefix, "");
  return title || file;
}

/** A build ticket, its `path` from the repo root (`docs/wayfinder/<map>/build/tickets/*.md`), and the mock-ups it
 * links to, as `<map>/<file>`. */
export type BuildTicket = { map: string; name: string; path: string; closed: boolean; claimed: boolean; mockups: string[] };

/** What a mock-up's label says, and what the legend says it means. */
export const SHIPPING_LABELS = {
  live: ["Live", "Built and released to editor.techies.tools."],
  preview: ["On preview", "Built and on preview-editor.techies.tools, not released yet."],
  building: ["Being built", "Some of its tickets are done or under way, others not started."],
  planned: ["Planned", "Build tickets are written; none started yet."],
  idea: ["Idea only", "No build ticket links to it: an exploration or an option not chosen."],
} as const;
export type Shipping = { label: keyof typeof SHIPPING_LABELS; tickets: BuildTicket[] };

/** `prototypes/<file>.html` with the path before it, as a ticket links it (`../../prototypes/a.html`,
 * `../../../other-map/prototypes/b.html`) or names it (`prototypes/c.html`). */
const mockupLink = /((?:[\w.-]+\/)*)prototypes\/([\w.-]+\.html)/gi;

/** Every build ticket that links to one of `mockups`: closed by its `status`, claimed by its `assignee`. A link
 * counts relative to the ticket, the repo or the ticket's map, whichever names a published mock-up. */
export function buildTickets(root: string, mockups: readonly Mockup[]): BuildTicket[] {
  const wayfinder = join(root, "docs/wayfinder");
  const known = new Set(mockups.map(({ map, file }) => `${map}/${file}`));
  return readdirSync(wayfinder).sort().flatMap(map => {
    const folder = join(wayfinder, map, "build/tickets");
    if (!isDir(folder)) return [];
    return readdirSync(folder).sort().filter(file => file.endsWith(".md")).flatMap(file => {
      const path = join(folder, file);
      const text = readFileSync(path, "utf8");
      const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
      const field = (name: string) => new RegExp(`^${name}:[ \\t]*(.*?)[ \\t]*$`, "m").exec(frontMatter)?.[1] ?? "";
      const linked = new Set<string>();
      for (const [, before, page] of text.matchAll(mockupLink)) {
        const key = [dirname(path), root, join(wayfinder, map)]
          .map(base => relative(wayfinder, resolve(base, `${before}prototypes/${page}`)).split("\\").join("/").replace("/prototypes/", "/"))
          .find(candidate => known.has(candidate));
        if (key) linked.add(key);
      }
      if (!linked.size) return [];
      return [{ map, name: /^\d+/.exec(file)?.[0] ?? file.slice(0, -3), path: `docs/wayfinder/${map}/build/tickets/${file}`, closed: field("status") === "closed", claimed: field("assignee") !== "", mockups: [...linked] }];
    });
  });
}

/** The build tickets (paths from `root`, as in `BuildTicket`) whose closing commit, the newest one adding
 * their `status: closed` line, is on `origin/main` (or, without it, a local `main`), so their work is released.
 * A commit counts by its id or, rewritten by a rebase merge, by its author time and subject. A ticket moved or
 * renamed since keeps its closing commit. Undefined when git or `main` can't be read, or in a shallow clone
 * (its oldest commit would look like every ticket's closing one); `origin/main` is as fresh as the last fetch of `main`. */
export function ticketsOnMain(root: string): ReadonlySet<string> | undefined {
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });
  let top: string, main: Set<string>, log: string;
  try {
    const ref = ["origin/main", "main"].find(name => { try { return Boolean(git("rev-parse", "--verify", "--quiet", `${name}^{commit}`)); } catch { return false; } });
    if (!ref) return undefined;
    if (git("rev-parse", "--is-shallow-repository").trim() === "true") return undefined;
    top = git("rev-parse", "--show-toplevel").trim();
    main = new Set(git("log", "--format=%H%n%at %s", ref).split("\n"));
    // Every change under docs/wayfinder, newest first, so renames are seen before the older commits they affect.
    log = git("log", "-p", "-M", "--unified=0", "--no-color", "--no-ext-diff", "--format=commit %H%nsubject %at %s", "--", "docs/wayfinder");
  } catch {
    return undefined;
  }
  /** A ticket's path today, and its closing commit's id and `<author time> <subject>`. */
  const closing = new Map<string, string[]>();
  /** An older path of a ticket, mapped to its path today. */
  const renamed = new Map<string, string>();
  let commit: string[] = [], file = "", from = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) commit = [line.slice(7)];
    else if (line.startsWith("subject ")) commit.push(line.slice(8));
    else if (line.startsWith("rename from ")) from = line.slice(12);
    else if (line.startsWith("rename to ")) renamed.set(from, renamed.get(line.slice(10)) ?? line.slice(10));
    else if (line.startsWith("+++ ")) file = line.slice(4).replace(/^b\//, "");
    else if (/^\+status:\s*closed\s*$/.test(line)) {
      const today = renamed.get(file) ?? file;
      if (!closing.has(today)) closing.set(today, commit);
    }
  }
  const base = realpathSync(root);
  return new Set([...closing].filter(([, ids]) => ids.some(id => main.has(id))).map(([path]) => relative(base, resolve(top, path)).split("\\").join("/")));
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

/** The editor's palette and type tokens, light and dark, so the index looks like the editor's chrome. */
const editorTheme = () => readFileSync(new URL("./src/theme.css", import.meta.url), "utf8");

/** A mock-up's label and, after it, the tickets it came from: `tickets 21, 22, atomic-catalogue 66`. */
function shippingBadge(map: string, { label, tickets }: Shipping): string {
  const names = tickets.map(ticket => ticket.map === map ? ticket.name : `${ticket.map} ${ticket.name}`);
  const from = names.length ? ` <span class="tickets">${names.length === 1 ? "ticket" : "tickets"} ${escapeHtml(names.join(", "))}</span>` : "";
  return `<span class="shipping shipping--${label}">${SHIPPING_LABELS[label][0]}</span>${from}`;
}

/** The index page: a legend of the labels, then one section per map, one link per HTML mock-up with its label. */
export function mockupIndex(mockups: readonly Mockup[], { read = path => readFileSync(path, "utf8"), shipping = new Map() }: {
  read?: (path: string) => string;
  shipping?: ReadonlyMap<string, Shipping>;
} = {}): string {
  const maps = new Map<string, Mockup[]>();
  for (const mockup of mockups) {
    if (!mockup.file.endsWith(".html")) continue;
    const pages = maps.get(mockup.map);
    if (pages) pages.push(mockup);
    else maps.set(mockup.map, [mockup]);
  }
  const sections = [...maps].map(([map, pages]) => `<section>
<h2>${escapeHtml(map)}</h2>
<ul>
${pages.map(page => `<li><a href="${escapeHtml(`${encodeURIComponent(map)}/${encodeURIComponent(page.file)}`)}">${escapeHtml(mockupTitle(read(page.path), page.file))}</a> ${shippingBadge(map, shipping.get(`${map}/${page.file}`) ?? { label: "idea", tickets: [] })}</li>`).join("\n")}
</ul>
</section>`);
  const legend = Object.entries(SHIPPING_LABELS).map(([label, [name, meaning]]) => `<dt><span class="shipping shipping--${label}">${name}</span></dt><dd>${escapeHtml(meaning)}</dd>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Mock-ups</title>
<style>
${editorTheme()}
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { max-inline-size: 48rem; margin-inline: auto; padding: 1rem; background: var(--background); color: var(--text); }
a { color: var(--link); }
ul { padding-inline-start: 0; list-style: none; }
li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem; margin-block: 0.375rem; }
.legend { display: grid; grid-template-columns: max-content 1fr; align-items: baseline; gap: 0.375rem 0.75rem; margin-block: 0; }
.legend dd { margin: 0; }
.shipping { padding: 0 6px; border-radius: 999px; font-size: var(--type-small); font-weight: 600; line-height: 18px; white-space: nowrap; }
.shipping--live { background: var(--success-bg); color: var(--success-fg); }
.shipping--preview { background: var(--current); color: var(--link); }
.shipping--building { background: var(--warning-bg); color: var(--warning-fg); }
.shipping--planned { background: var(--component-surface); color: var(--component-text); }
.shipping--idea { box-shadow: inset 0 0 0 1px var(--control-line); color: var(--muted); }
.tickets, .legend-note { color: var(--muted); font-size: var(--type-small); }
</style>
</head>
<body>
<h1>Mock-ups</h1>
<dl class="legend">
${legend.join("\n")}
</dl>
<p class="legend-note">The numbers after a label are the build tickets linking to the mock-up, in docs/wayfinder/&lt;map&gt;/build/tickets/.</p>
${sections.join("\n") || "<p>No mock-ups yet.</p>"}
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

export function mockups(root: string): Plugin {
  return {
    name: "ase-mockups",
    apply: "build",
    generateBundle() {
      const files = mockupFiles(root);
      for (const { map, file, path } of files) this.emitFile({ type: "asset", fileName: `mockups/${map}/${file}`, source: readFileSync(path) });
      const shipping = mockupShipping(files, buildTickets(root, files), ticketsOnMain(root));
      this.emitFile({ type: "asset", fileName: "mockups/index.html", source: mockupIndex(files, { shipping }) });
    },
    // After Vite has copied public/_headers into the output folder; once, even across watch rebuilds.
    writeBundle({ dir }) {
      if (!dir) return;
      const headers = join(dir, "_headers");
      if (!existsSync(headers) || !readFileSync(headers, "utf8").includes(MOCKUPS_HEADERS)) appendFileSync(headers, MOCKUPS_HEADERS);
    },
  };
}
