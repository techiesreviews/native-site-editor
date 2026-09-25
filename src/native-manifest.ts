// Opt-in browser-native preview manifest (`.astro-editor/native.json`).
//
// A native project renders entirely in the browser from plain source files —
// pages under `src/pages/` (routed by where they are, see
// shared/native-routes.ts), custom-element templates under `src/components/`
// (either flat `<name>.html` or one folder per component, `<name>/<name>.html`),
// and `src/styles/*.css` — with no build step. The manifest is the explicit,
// versioned contract that names the components and stylesheets and adds page
// metadata; it is validated defensively because it comes from repository
// contents that the editor does not control.
import { deriveNativeRoutes, nativePageRoute } from "../shared/native-routes";

/** Per-route page metadata, used by the static exporter for the document head. */
export interface NativePageMeta {
  title?: string;
  description?: string;
  /** Structured data the export writes into the page as JSON-LD, as written. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

export interface NativeManifest {
  version: 1;
  /**
   * Route path (e.g. "/", "/about/") to its `src/pages/**.html` source file:
   * every page file by its place under `src/pages/` (`about.html` is
   * "/about/", `work/index.html` is "/work/"), plus each route the manifest
   * maps to a file itself, which wins. A file the manifest maps is routed only
   * where the manifest says.
   */
  routes: Record<string, string>;
  /**
   * Route path to its title and description. `routes` in the JSON is
   * optional and keyed by route; an entry is one of
   * - `{ "title": "About", "description": "…" }`: metadata for the page the
   *   route's file gives (ignored, with a warning, when no file does);
   * - `{ "file": "src/pages/about.html", "title": …, "description": … }`: the
   *   route mapped to that file explicitly, with its metadata;
   * - `"src/pages/about.html"`: the route mapped to that file, no metadata.
   * Either object form may carry a `jsonLd` object (or array of objects).
   * Only routes written as objects appear here.
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
  /** `warnings` name routes two files would give and metadata with no page. */
  | { ok: true; manifest: NativeManifest; warnings: string[] }
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

/** Whether `tag` can name a component: a valid custom-element name the spec does not reserve. */
export function isNativeComponentTag(tag: string): boolean {
  return TAG.test(tag) && !RESERVED_TAGS.has(tag);
}

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

/**
 * Parse and validate a native manifest from its raw JSON text, routing the
 * pages among `files` (repository paths, and drafts of new files; any path
 * outside `src/pages/` is ignored) by where they are.
 */
export function parseNativeManifest(text: string, files: Iterable<string> = []): NativeManifestResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "native.json is not valid JSON." };
  }
  if (!isRecord(value)) return { ok: false, error: "native.json must be a JSON object." };
  if (value.version !== 1)
    return { ok: false, error: `native.json version ${JSON.stringify(value.version)} is unsupported; expected 1.` };

  if (value.routes !== undefined && !isRecord(value.routes)) return { ok: false, error: "native.json \"routes\" must be an object." };
  const entries = isRecord(value.routes) ? Object.entries(value.routes) : [];
  const explicit: Record<string, string> = {};
  const pages: Record<string, NativePageMeta> = {};
  for (const [route, entry] of entries) {
    if (!ROUTE.test(route))
      return { ok: false, error: `native.json route ${JSON.stringify(route)} must start and end with "/".` };
    const path = isRecord(entry) ? entry.file : entry;
    if (!(isRecord(entry) && path === undefined)) {
      if (typeof path !== "string" || !safePath(path) || !PAGE_PATH.test(path))
        return { ok: false, error: `native.json route ${JSON.stringify(route)} must point to a src/pages/*.html file${isRecord(entry) ? ' in "file"' : ""}.` };
      explicit[route] = path;
    }
    if (isRecord(entry)) {
      const meta: NativePageMeta = {};
      for (const field of ["title", "description"] as const) {
        if (entry[field] === undefined) continue;
        if (typeof entry[field] !== "string" || entry[field].length > 1000)
          return { ok: false, error: `native.json route ${JSON.stringify(route)} "${field}" must be a string.` };
        meta[field] = entry[field];
      }
      if (entry.jsonLd !== undefined) {
        const items = Array.isArray(entry.jsonLd) ? entry.jsonLd : [entry.jsonLd];
        if (!items.length || !items.every(isRecord))
          return { ok: false, error: `native.json route ${JSON.stringify(route)} "jsonLd" must be an object or an array of objects.` };
        meta.jsonLd = entry.jsonLd as NativePageMeta["jsonLd"];
      }
      pages[route] = meta;
    }
  }
  // A file the manifest maps is routed only where the manifest says, so an
  // older manifest's `"/work/x/": "src/pages/work-x.html"` does not also
  // publish the page at /work-x/; a route the manifest maps is that file's
  // alone.
  const mapped = new Set(Object.values(explicit));
  const derived = deriveNativeRoutes([...files].filter((path) => {
    const route = nativePageRoute(path);
    return route !== undefined && !mapped.has(path) && !Object.hasOwn(explicit, route);
  }));
  const warnings = derived.warnings;
  const merged: Record<string, string> = { ...derived.routes, ...explicit };
  const routes: Record<string, string> = {};
  for (const route of Object.keys(merged).sort()) routes[route] = merged[route];
  for (const route of Object.keys(pages))
    if (!Object.hasOwn(routes, route))
      warnings.push(`native.json has metadata for ${route}, but no page gives that route; add ${route === "/" ? "src/pages/index.html" : `src/pages${route.slice(0, -1)}.html`} or give the entry a "file".`);
  if (!Object.hasOwn(routes, "/"))
    return { ok: false, error: "The site has no home page: add src/pages/index.html, or map the route \"/\" to a page in native.json." };

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

  return { ok: true, manifest: { version: 1, routes, pages, components, styles }, warnings };
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
