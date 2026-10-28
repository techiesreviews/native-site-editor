// The planning mock-ups (`docs/wayfinder/<map>/prototypes/*`), served by the preview site at
// `/mockups/<map>/<file>` with a generated `/mockups/index.html` listing them by map. Only the
// preview build turns this on (`MOCKUPS=1`, `npm run build:preview`); production builds and the
// editor's boot never see these files. The images a mock-up uses sit beside it and are copied too.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** One file in a map's `prototypes/` folder. */
export type Mockup = { map: string; file: string; path: string };

/** The mock-ups and the images beside them; notes or other files in the folder stay unpublished. */
const published = /^[^.].*\.(?:html|png|jpe?g|gif|webp|avif|svg)$/i;
const titlePrefix = /^PROTOTYPE \(throwaway\) · /;

export function mockupFiles(root: string): Mockup[] {
  const wayfinder = join(root, "docs/wayfinder");
  const isDir = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
  return readdirSync(wayfinder).sort().flatMap(map => {
    const folder = join(wayfinder, map, "prototypes");
    if (!isDir(folder)) return [];
    return readdirSync(folder).sort()
      .filter(file => published.test(file) && statSync(join(folder, file)).isFile())
      .map(file => ({ map, file, path: join(folder, file) }));
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
