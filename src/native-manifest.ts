// Opt-in browser-native preview manifest (`.astro-editor/native.json`).
//
// A native project renders entirely in the browser from plain source files —
// `src/pages/*.html` routes, custom-element templates under `src/components/`
// (either flat `<name>.html` or one folder per component, `<name>/<name>.html`),
// and `src/styles/*.css` — with no build step. The manifest is the explicit,
// versioned contract that maps those files; it is validated defensively because
// it comes from repository contents that the editor does not control.

/** Per-route page metadata, used by the static exporter for the document head. */
export interface NativePageMeta {
  title?: string;
  description?: string;
}

export interface NativeManifest {
  version: 1;
  /** Route path (e.g. "/", "/about/") to a `src/pages/*.html` source file. */
  routes: Record<string, string>;
  /**
   * Route path to its title and description. In the JSON a route may be
   * written either as the page path alone or as
   * `{ "file": "src/pages/about.html", "title": "About", "description": "…" }`;
   * only routes written the long way appear here.
   */
  pages: Record<string, NativePageMeta>;
  /**
   * Custom-element tag (e.g. "site-header") to an HTML file under
   * `src/components/`. The path may be flat (`src/components/<name>.html`) or
   * use one folder per component (`src/components/<name>/<name>.html`).
   */
  components: Record<string, string>;
  /** Shared stylesheet source files under `src/styles/`. */
  styles: string[];
}

export type NativeManifestResult =
  | { ok: true; manifest: NativeManifest }
  | { ok: false; error: string };

const ROUTE = /^\/(?:[\w.-]+\/)*$/;
const PAGE_PATH = /^src\/pages\/[\w./-]+\.html$/;
const COMPONENT_PATH = /^src\/components\/[\w./-]+\.html$/;
const STYLE_PATH = /^src\/styles\/[\w./-]+\.css$/;
// Custom element names: at least one dash, lowercase, starts with a letter.
const TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
// Names the spec reserves; `customElements.define` throws on these, so reject
// them at validation time rather than letting the runtime fail silently.
const RESERVED_TAGS = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

function safePath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.length <= 1024 &&
    !path.includes("\\") &&
    !path.split("/").some((part) => !part || part === "." || part === "..")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse and validate a native manifest from its raw JSON text. */
export function parseNativeManifest(text: string): NativeManifestResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "native.json is not valid JSON." };
  }
  if (!isRecord(value)) return { ok: false, error: "native.json must be a JSON object." };
  if (value.version !== 1)
    return { ok: false, error: `native.json version ${JSON.stringify(value.version)} is unsupported; expected 1.` };

  if (!isRecord(value.routes)) return { ok: false, error: "native.json \"routes\" must be an object." };
  const routeEntries = Object.entries(value.routes);
  if (!routeEntries.length) return { ok: false, error: "native.json \"routes\" must map at least one route." };
  const routes: Record<string, string> = {};
  const pages: Record<string, NativePageMeta> = {};
  for (const [route, entry] of routeEntries) {
    if (!ROUTE.test(route))
      return { ok: false, error: `native.json route ${JSON.stringify(route)} must start and end with "/".` };
    const path = isRecord(entry) ? entry.file : entry;
    if (typeof path !== "string" || !safePath(path) || !PAGE_PATH.test(path))
      return { ok: false, error: `native.json route ${JSON.stringify(route)} must point to a src/pages/*.html file${isRecord(entry) ? ' in "file"' : ""}.` };
    routes[route] = path;
    if (isRecord(entry)) {
      const meta: NativePageMeta = {};
      for (const field of ["title", "description"] as const) {
        if (entry[field] === undefined) continue;
        if (typeof entry[field] !== "string" || entry[field].length > 1000)
          return { ok: false, error: `native.json route ${JSON.stringify(route)} "${field}" must be a string.` };
        meta[field] = entry[field];
      }
      pages[route] = meta;
    }
  }
  if (!Object.hasOwn(routes, "/"))
    return { ok: false, error: "native.json \"routes\" must include a home route \"/\"." };

  const components: Record<string, string> = {};
  if (value.components !== undefined) {
    if (!isRecord(value.components)) return { ok: false, error: "native.json \"components\" must be an object." };
    for (const [tag, path] of Object.entries(value.components)) {
      if (!TAG.test(tag))
        return { ok: false, error: `native.json component tag ${JSON.stringify(tag)} must be a valid custom-element name (lowercase with a dash).` };
      if (RESERVED_TAGS.has(tag))
        return { ok: false, error: `native.json component tag ${JSON.stringify(tag)} is a reserved element name and cannot be defined.` };
      if (typeof path !== "string" || !safePath(path) || !COMPONENT_PATH.test(path))
        return { ok: false, error: `native.json component ${JSON.stringify(tag)} must point to an .html file under src/components/, either src/components/<name>.html or src/components/<name>/<name>.html.` };
      components[tag] = path;
    }
  }

  const styles: string[] = [];
  if (value.styles !== undefined) {
    if (!Array.isArray(value.styles)) return { ok: false, error: "native.json \"styles\" must be an array." };
    for (const path of value.styles) {
      if (typeof path !== "string" || !safePath(path) || !STYLE_PATH.test(path))
        return { ok: false, error: "native.json \"styles\" entries must be src/styles/*.css files." };
      styles.push(path);
    }
  }

  return { ok: true, manifest: { version: 1, routes, pages, components, styles } };
}

/** Every distinct source file the manifest references, for prefetching. */
export function nativeManifestPaths(manifest: NativeManifest): string[] {
  return [
    ...new Set([
      ...Object.values(manifest.routes),
      ...Object.values(manifest.components),
      ...manifest.styles,
    ]),
  ];
}

/** The default route to show when the open file is not itself a mapped page. */
export function nativeDefaultRoute(manifest: NativeManifest): string {
  return Object.hasOwn(manifest.routes, "/") ? "/" : Object.keys(manifest.routes)[0];
}
