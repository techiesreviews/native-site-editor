// The planning mock-ups (`docs/wayfinder/<map>/prototypes/*`), served by the preview site at
// `/mockups/<map>/<file>` with a generated `/mockups/index.html` listing them by map. Only the
// preview build turns this on (`MOCKUPS=1`, `npm run build:preview`); production builds and the
// editor's boot never see these files. The images a mock-up uses sit beside it and are copied too;
// images no mock-up uses (reference screenshots for planning) stay unpublished.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

/** Every HTML mock-up in each map's `prototypes/` folder, and the images beside them that one of
 * those mock-ups uses; unused images, notes and other files stay unpublished. */
export function mockupFiles(root: string): Mockup[] {
  const wayfinder = join(root, "docs/wayfinder");
  const isDir = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
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

/** The index page: one section per map, one link per HTML mock-up. */
export function mockupIndex(mockups: readonly Mockup[], read: (path: string) => string = path => readFileSync(path, "utf8")): string {
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
${pages.map(page => `<li><a href="${escapeHtml(`${encodeURIComponent(map)}/${encodeURIComponent(page.file)}`)}">${escapeHtml(mockupTitle(read(page.path), page.file))}</a></li>`).join("\n")}
</ul>
</section>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Mock-ups</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { max-inline-size: 48rem; margin-inline: auto; padding: 1rem; }
</style>
</head>
<body>
<h1>Mock-ups</h1>
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
      this.emitFile({ type: "asset", fileName: "mockups/index.html", source: mockupIndex(files) });
    },
    // After Vite has copied public/_headers into the output folder; once, even across watch rebuilds.
    writeBundle({ dir }) {
      if (!dir) return;
      const headers = join(dir, "_headers");
      if (!existsSync(headers) || !readFileSync(headers, "utf8").includes(MOCKUPS_HEADERS)) appendFileSync(headers, MOCKUPS_HEADERS);
    },
  };
}
