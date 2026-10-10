// A memory VariantFiles (shared/variant-lookup.ts) for tests: the site is
// read from the file paths as the editor reads it (shared/native-project.ts),
// files can change between asks, and every read is counted.
import { resolveNativeProject } from "../shared/native-project.ts";
import { variantLookup, type VariantFiles, type VariantSite } from "../shared/variant-lookup.ts";

export function memoryVariantFiles(files: Record<string, string>): VariantFiles & { files: Record<string, string>; reads: string[] } {
  const reads: string[] = [];
  let shape: { key: string; site?: VariantSite } = { key: "\0" };
  return {
    files,
    reads,
    site() {
      const key = Object.keys(files).sort().join("\n");
      if (key !== shape.key) {
        const result = resolveNativeProject(Object.keys(files));
        shape = { key, site: result.ok ? { pages: Object.values(result.site.routes), components: result.site.components } : undefined };
      }
      return shape.site;
    },
    read(path) {
      reads.push(path);
      return Object.hasOwn(files, path) ? files[path] : undefined;
    },
  };
}

/** A page that links `sheets` and loads `scripts`. */
export function page(sheets: string[] = [], scripts: string[] = []) {
  return `<!doctype html><html><head>${sheets.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}${scripts.map((src) => `<script type="module" src="${src}"></script>`).join("")}</head><body></body></html>`;
}

/**
 * A one-page site's Variant lookup: its home page links each of `sheets`
 * and loads each of `scripts`; each component has `components[tag]` as its
 * own CSS.
 */
export function memorySiteVariants(input: { sheets?: Record<string, string>; components?: Record<string, string>; scripts?: Record<string, string> }) {
  const sheets = input.sheets ?? {}, scripts = input.scripts ?? {};
  const files: Record<string, string> = { "index.html": page(Object.keys(sheets).map((path) => `/${path}`), Object.keys(scripts).map((path) => `/${path}`)), ...sheets, ...scripts };
  for (const [tag, css] of Object.entries(input.components ?? {})) {
    files[`components/${tag}/${tag}.html`] = "<div><slot></slot></div>";
    files[`components/${tag}/${tag}.css`] = css;
  }
  return variantLookup(memoryVariantFiles(files));
}
