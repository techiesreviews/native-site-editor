// Opt-in browser-native preview manifest (`.astro-editor/native.json`).
//
// A native project renders entirely in the browser from plain source files —
// `src/pages/*.html` routes, `src/components/*.html` custom-element templates,
// and `src/styles/*.css` — with no Astro build. The manifest is the explicit,
// versioned contract that maps those files; it is validated defensively because
// it comes from repository contents that the editor does not control.

export interface NativeManifest {
  version: 1;
  /** Route path (e.g. "/", "/about/") to a `src/pages/*.html` source file. */
  routes: Record<string, string>;
  /** Custom-element tag (e.g. "site-header") to a `src/components/*.html` file. */
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
  for (const [route, path] of routeEntries) {
    if (!ROUTE.test(route))
      return { ok: false, error: `native.json route ${JSON.stringify(route)} must start and end with "/".` };
    if (typeof path !== "string" || !safePath(path) || !PAGE_PATH.test(path))
      return { ok: false, error: `native.json route ${JSON.stringify(route)} must point to a src/pages/*.html file.` };
    routes[route] = path;
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
        return { ok: false, error: `native.json component ${JSON.stringify(tag)} must point to a src/components/*.html file.` };
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

  return { ok: true, manifest: { version: 1, routes, components, styles } };
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
