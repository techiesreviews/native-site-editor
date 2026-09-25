// File-based routing for native projects: where a page file is under
// `src/pages/` is its URL. The editor, the static exporter and the agent
// context all route pages through this one rule:
//
// - `src/pages/index.html` is `/`;
// - `src/pages/<dir>/index.html` is `/<dir>/`;
// - `src/pages/<path>.html` is `/<path>/` (`about.html` is `/about/`,
//   `work/fern-and-kettle.html` is `/work/fern-and-kettle/`, `404.html` is
//   `/404/`);
// - a file or folder whose name starts with `_` is not a page, nor is a name
//   outside the manifest's safe path characters (letters, digits, `_`, `.`,
//   `-`).
//
// When a file and a folder's index give the same route (`work.html` and
// `work/index.html`), the folder's index wins and a warning says so. The
// module takes a plain list of paths, so repository files and new files
// drafted in the browser route alike; it has no DOM and no I/O.

export const NATIVE_PAGES_DIR = "src/pages/";

const SEGMENT = /^[\w.-]+$/;

/** The route `path` serves under file-based routing; undefined when it is not a page. */
export function nativePageRoute(path: string): string | undefined {
  if (typeof path !== "string" || path.length > 1024 || !path.startsWith(NATIVE_PAGES_DIR) || !path.endsWith(".html")) return undefined;
  const parts = path.slice(NATIVE_PAGES_DIR.length, -".html".length).split("/");
  if (parts.some((part) => !SEGMENT.test(part) || part.startsWith("_") || part === "." || part === "..")) return undefined;
  if (parts[parts.length - 1] === "index") parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}

export interface NativeDerivedRoutes {
  /** Route to page file, in route order. */
  routes: Record<string, string>;
  /** One line per route two files would give, naming the file used. */
  warnings: string[];
}

/** Every page among `paths` by the route its place under `src/pages/` gives it. */
export function deriveNativeRoutes(paths: Iterable<string>): NativeDerivedRoutes {
  const byRoute = new Map<string, string[]>();
  for (const path of [...new Set(paths)].sort()) {
    const route = nativePageRoute(path);
    if (route === undefined) continue;
    byRoute.set(route, [...(byRoute.get(route) ?? []), path]);
  }
  const routes: Record<string, string> = {};
  const warnings: string[] = [];
  for (const [route, files] of [...byRoute].sort(([a], [b]) => (a < b ? -1 : 1))) {
    // Only `<dir>.html` and `<dir>/index.html` can meet on one route.
    const chosen = files.find((file) => file.endsWith("/index.html")) ?? files[0];
    routes[route] = chosen;
    if (files.length > 1)
      warnings.push(`${files.filter((file) => file !== chosen).join(", ")} and ${chosen} both give the route ${route}; ${chosen} is used. Rename one, or map "${route}" to a file in native.json.`);
  }
  return { routes, warnings };
}
