// The open site's routes and the preview's sources: which page a file is, a
// page's title and description, the stylesheets pages link, the sources the
// preview shows and its updates, and the page shown after one is gone. The
// host (src/main.ts) keeps the runtime, the preview and the version on show,
// and hands them in as live ports.

import { rootRoute } from "../shared/site-path-prefix";
import { expandStyleImports } from "../shared/css-imports";
import { NATIVE_CONFIG_PATH, nativeDefaultRoute, nativePageHead, nativePageStylesheets, type NativeSite } from "../shared/native-project";
import type { AppStore } from "./app-store";
import { routeStylesheets, type createNativePreview } from "./components/native-preview";
import type { createNativeSiteRuntime } from "./native-site-runtime";

export interface SitePreviewPorts {
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  appStore: Pick<AppStore, "openFile">;
  /** Host state, read at call time. */
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "update" | "setAssets"> | undefined;
  readonly versions: { check(): void; readonly view?: { path: string; content: string } };
  readonly previewSelection: { editableTemplatePath(): string | undefined };
  nativePreviewUnreadable: () => ReadonlyMap<string, string>;
  loadNativeAssets: () => Promise<unknown>;
  loadNativeStyleFiles: () => Promise<unknown>;
  loadNativeShownFiles: () => Promise<unknown>;
}

export function createSitePreview(ports: SitePreviewPorts) {
  // Consts and functions main.ts never reassigns, read once; its `let` state and later consts stay `ports.` reads.
  const { runtime, appStore, nativePreviewUnreadable, loadNativeAssets, loadNativeStyleFiles, loadNativeShownFiles } = ports;

  function nativeModeActive() {
    return Boolean(runtime.site);
  }

  // The route whose page file is `path`; undefined when the file is not a page.
  function nativeRouteForPath(path: string | undefined) {
    if (!runtime.site || !path) return undefined;
    return Object.entries(runtime.site.routes).find(([, file]) => file === path)?.[0];
  }

  // The title and description the page at `route` has, from its head.
  function nativeRouteInfo(route: string, site = runtime.site) {
    if (!site || !Object.hasOwn(site.routes, route)) return {};
    const source = runtime.source(site.routes[route]);
    return source === undefined ? {} : nativePageHead(source);
  }

  // The titles of the site's pages by route, for the Pages tab.
  function nativeTitles(site: NativeSite) {
    return Object.fromEntries(Object.keys(site.routes).map((route) => [route, nativeRouteInfo(route, site).title]));
  }

  // The stylesheets any page links, in page order: what the style loader reads.
  function nativeLinkedSheets(site: NativeSite, sources: Record<string, string>) {
    const out = new Set<string>();
    const prefix = runtime.prefix();
    for (const file of Object.values(site.routes))
      for (const path of nativePageStylesheets(sources[file] ?? "", file, prefix)) out.add(path);
    return [...out];
  }

  // The shared stylesheets of the page the preview shows (the home page's
  // when it shows no page), with every file they import.
  function nativePageStyles() {
    if (!runtime.site) return [];
    const sources = runtime.sources();
    const route = nativeRouteForPath(appStore.openFile.value) ?? nativeDefaultRoute(runtime.site);
    const linked = routeStylesheets(runtime.site, sources, route, runtime.prefix());
    return [...new Set([...linked, ...expandStyleImports(linked, (path) => sources[path], undefined, runtime.prefix()).imported])];
  }

  // A page selection: the preview follows the newly opened page's route. Opening
  // a non-page file (CSS, component) leaves the preview's current route untouched.
  // The preview's sources: the effective ones, with History's earlier version
  // of the open file in its place while one is on show.
  // The preview's sources also carry the site's settings: its Site address
  // places the site in a sub-folder (shared/site-path-prefix.ts).
  function withSiteConfig(sources: Record<string, string>) {
    const config = runtime.source(NATIVE_CONFIG_PATH);
    if (config !== undefined) sources[NATIVE_CONFIG_PATH] = config;
    return sources;
  }
  function nativePreviewSources() {
    ports.versions.check();
    const sources = withSiteConfig(runtime.sources());
    if (ports.versions.view) sources[ports.versions.view.path] = ports.versions.view.content;
    return sources;
  }

  function updateNativePreview() {
    if (!runtime.site || !ports.nativePreview) return;
    nativePreviewBehind = false;
    ports.nativePreview.update({
      sources: nativePreviewSources(),
      componentStyles: Object.fromEntries(runtime.state.componentStyles),
      unreadable: nativePreviewUnreadable(),
      route: nativeRouteForPath(appStore.openFile.value),
      component: appStore.openFile.value ? nativeComponentTagForPath(appStore.openFile.value) : undefined,
      editableTemplatePath: ports.previewSelection.editableTemplatePath(),
    });
  }

  // A source edit: push new sources but never change the route, so an edit while
  // the preview is on About (with a different file open) does not snap it Home.
  // The preview holds sources older than the editor's (the text index read
  // pages it does not show): the next update or route shown brings them.
  let nativePreviewBehind = false;
  function updateNativePreviewSources() {
    if (!runtime.site || !ports.nativePreview) return;
    nativePreviewBehind = false;
    ports.nativePreview.update({ sources: nativePreviewSources(), componentStyles: Object.fromEntries(runtime.state.componentStyles), assets: Object.fromEntries(runtime.state.assets), unreadable: nativePreviewUnreadable(), editableTemplatePath: ports.previewSelection.editableTemplatePath() });
    void loadNativeAssets();
    void loadNativeStyleFiles();
    void loadNativeShownFiles();
  }

  // Images and fonts that arrived after the page was drawn: the preview shows
  // them in place, without drawing the page again.
  function updateNativePreviewAssets() {
    if (!runtime.site || !ports.nativePreview) return;
    ports.nativePreview.setAssets(Object.fromEntries(runtime.state.assets));
  }

  // The component whose template is `path`.
  function nativeComponentTagForPath(path: string) {
    if (!runtime.site) return undefined;
    return Object.entries(runtime.site.components).find(([, file]) => file === path)?.[0];
  }

  // The page shown after the page `path` is gone: the nearest page above it
  // (by folder) that has one, else the home page.
  function nativeFallbackPage(path: string) {
    if (!runtime.site) return undefined;
    const parts = path.split("/").slice(0, -1);
    for (let length = parts.length; length > 0; length--) {
      const file = runtime.site.routes[rootRoute(`${parts.slice(0, length).join("/")}/`)];
      if (file && file !== path) return file;
    }
    return runtime.site.routes["/"];
  }

  return {
    nativeModeActive, nativeRouteForPath, nativeRouteInfo, nativeTitles, nativeLinkedSheets, nativePageStyles, withSiteConfig,
    updateNativePreview, updateNativePreviewSources, updateNativePreviewAssets, nativeComponentTagForPath, nativeFallbackPage,
    get nativePreviewBehind() { return nativePreviewBehind; }, set nativePreviewBehind(value: boolean) { nativePreviewBehind = value; },
  };
}
