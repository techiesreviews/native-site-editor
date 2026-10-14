import { createSiteSettings, type SiteSettingsValues, type SiteLinkPreference } from "./components/site-settings";
import { escapeText, readHeadSettings, upsertHeadTag, withPageField, type HeadField } from "./page-builder/site-head";
import { readSiteIdentity, withSiteIdentityConfig, withSiteIdentityPage } from "./page-builder/site-identity";
import { editNavigation, readNavigation } from "./page-builder/site-navigation";
import { nativePageTemplate } from "./native-create";
import { NATIVE_HOME_UNREAD } from "./controllers/pages-controller";
import { resolveImportPath } from "../shared/css-imports";
import { isImagePath } from "./native-structure";
import { NATIVE_CONFIG_PATH, type NativeSite } from "../shared/native-project";
import type { Reads, Outcome, PlanResult, Stamp, GuardedEdits } from "./guarded-edit";
import type { AppStore } from "./app-store";
import type { UrlPlan } from "./components/url-change";

interface SettingsPorts {
  readonly nativeSite: NativeSite | undefined;
  readonly generation: number;
  appStore: AppStore;
  guardedEdits: GuardedEdits;
  nativeAssets: Map<string, string>;
  nativePageLabelOf: (path: string) => string;
  setupScope: () => string;
  nativeUrlPlan: (path: string, value: string) => UrlPlan;
  changeNativeUrl: (path: string, value: string, keep: boolean, since?: Stamp, baseline?: Map<string, string | undefined>) => Promise<string | undefined>;
  restoreFile: (path: string, epoch: number) => Promise<void>;
  nativeSiteReadForCreate: () => Promise<string | undefined>;
  /** The Media picker for an image setting; the chosen file's root path, or undefined on Cancel. */
  choosePath: (place: string) => Promise<string | undefined>;
  nativeEffectiveSource: (path: string) => string | undefined;
  loadNativeAssets: (sources: Record<string, string>, changed: () => void) => Promise<void>;
}

/** Settings orchestration is loaded with the first settings dialog. */
export function createNativeSettings(ports: SettingsPorts) {
  function nativeSitePageChoices() {
    return Object.entries(ports.nativeSite?.routes ?? {}).map(([route, file]) => ({ route, file, label: ports.nativePageLabelOf(file) }));
  }

  let siteLinkPreferenceScope = "";
  let siteLinkPreferences = new Map<string, SiteLinkPreference>();

  function nativeSettingsController({ createSiteSettings }: typeof import("./components/site-settings"), shown: string[] = []) {
    const scope = ports.setupScope();
    let since = ports.guardedEdits.stamp();
    if (siteLinkPreferenceScope !== scope) { siteLinkPreferenceScope = scope; siteLinkPreferences = new Map(); }
    let baseline = new Map(shown.map(path => [path, ports.guardedEdits.peek.source(path)] as const));
    const changed = "The repository or source changed meanwhile. Reopen settings and try again.";
    const stale = () => !since.holds();
    const sourcesChanged = () => [...baseline].some(([path, source]) => ports.guardedEdits.peek.source(path) !== source);
    const checkShown = (r: Reads) => [...baseline].some(([path, source]) => r.source(path) !== source);
    const applied = (outcome: Outcome) => {
      if (!outcome.ok) return outcome.reason === "stale" ? changed : outcome.message;
      since = ports.guardedEdits.stamp();
      baseline = new Map(shown.map(path => [path, ports.guardedEdits.peek.source(path)] as const));
      return outcome.message;
    };
    return createSiteSettings({
      async applyPage(path, fields) {
        // The element selected on the page as it was applied: its Undo and Redo select it again.
        const selected = ports.appStore.selection.value;
        const at = selected?.path === path && selected.node ? { path, node: [...selected.node] } : undefined;
        return applied(await ports.guardedEdits.run(r => {
          if (checkShown(r)) return { refuse: changed };
          const source = r.source(path), site = r.site();
          if (source === undefined || !site || !Object.values(site.routes).includes(path)) return { refuse: "The page could not be read." };
          let next = source;
          try { for (const [field, value] of Object.entries(fields)) next = upsertHeadTag(next, field as HeadField, value); }
          catch (error) { return { refuse: error instanceof Error ? error.message : "Page settings could not be changed." }; }
          return { edits: new Map([[path, next]]), ...at ? { select: { before: at, after: at } } : {}, done: "Page settings applied as a draft. Publish to keep them.", undone: "Undid page settings." };
        }, { since }));
      },
      planUrl: (path, value) => stale() || sourcesChanged() ? { ok: false, error: changed } : ports.nativeUrlPlan(path, value),
      async applyUrl(path, value, keep) {
        const error = await ports.changeNativeUrl(path, value, keep, since, baseline);
        if (!error) {
          since = ports.guardedEdits.stamp();
          // The page may have moved: the settings panel closes on URL Apply.
          baseline = new Map(shown.map(file => [file, ports.guardedEdits.peek.source(file)] as const));
        }
        return error;
      },
      async applySite(values) {
        return applied(await ports.guardedEdits.run(r => checkShown(r) ? { refuse: changed } : applyNativeSiteSettings(values, r), { since }));
      },
      async open404() {
        if (stale() || sourcesChanged() || !ports.nativeSite) return changed;
        if (ports.nativeSite.routes["/404.html"]) { await ports.restoreFile(ports.nativeSite.routes["/404.html"], ports.generation); return undefined; }
        return applied(await ports.guardedEdits.run(async r => {
          if (checkShown(r)) return { refuse: changed };
          const site = r.site();
          if (!site) return { refuse: changed };
          const unread = await ports.nativeSiteReadForCreate();
          if (unread) return { refuse: unread };
          const template = r.source(site.routes["/"]);
          if (template === undefined) return { refuse: NATIVE_HOME_UNREAD };
          r.exists("404.html");
          let source = nativePageTemplate(template, "Page not found");
          source = withPageField(source, "description", "There is nothing at this address. Try the home page.");
          source = upsertHeadTag(source, "robots", "noindex");
          source = source.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, '$1\n    <section>\n      <h1>Page not found</h1>\n      <p>There is nothing at this address. <a href="/">Go to the home page</a>.</p>\n    </section>\n  $2');
          return { creates: [{ path: "404.html", content: source }], open: "404.html", done: "Created the 404 page as a draft.", undone: "Undid creating the 404 page." };
        }, { since }));
      },
      async applyNavigation(path, original, links) {
        return applied(await ports.guardedEdits.run(r => {
          const source = r.source(path);
          if (source !== original) return { refuse: "Navigation changed while this panel was open. Reopen it to review the latest links." };
          const list = readNavigation(source, path.startsWith("components/"));
          if (!list) return { refuse: "This header's navigation is not a simple list of links." };
          try { return { edits: new Map([[path, editNavigation(source, list, links)]]), done: "Navigation applied as a draft. Publish to keep it.", undone: "Undid changing navigation." }; }
          catch (error) { return { refuse: error instanceof Error ? error.message : "Navigation could not be changed." }; }
        }, { since }));
      },
      async chooseImage(place) {
        const path = await ports.choosePath(`Site settings · ${place}`);
        if (stale()) throw new Error(changed);
        return path;
      },
      async imageUrl(value) {
        if (stale() || !value.trim()) return undefined;
        // An absolute URL is previewed only when it is this site's own address (its canonical
        // origin), from the repository file at that path; the editor never loads other sites' images.
        const page = ports.appStore.openFile.value ?? "index.html";
        let own: string | undefined;
        if (/^https?:\/\//i.test(value)) {
          let url: URL, origin: string | undefined;
          // Another site's image is not loaded: the preview says it is unavailable (the dialog shows that for a refusal).
          const unavailable = () => { throw new Error("Images from other sites are not previewed."); };
          try { url = new URL(value.trim()); origin = new URL(readHeadSettings(ports.nativeEffectiveSource(page) ?? "").canonical || "x:").origin; } catch { return unavailable(); }
          if (!origin || origin === "null" || url.origin !== origin) return unavailable();
          try { own = decodeURIComponent(url.pathname).replace(/^\//, ""); } catch { return unavailable(); }
        }
        const path = own ?? resolveImportPath(page, value);
        if (!path || !isImagePath(path)) return undefined;
        await ports.loadNativeAssets({ "index.html": `<img src="/${escapeText(path).replace(/"/g, "&quot;")}">` }, () => {});
        return stale() || sourcesChanged() ? undefined : ports.nativeAssets.get(path);
      },
    }, siteLinkPreferences);
  }


  function applyNativeSiteSettings(values: SiteSettingsValues, r: Reads): PlanResult {
    const site = r.site();
    if (!site) return { refuse: "Open a native site first." };
    const config = r.source(NATIVE_CONFIG_PATH);
    const before = readSiteIdentity(config, r.source(site.routes["/"]) ?? "");
    const edits = new Map<string, string>();
    try {
      const nextConfig = withSiteIdentityConfig(config, values);
      if (config !== nextConfig) edits.set(NATIVE_CONFIG_PATH, nextConfig);
      for (const path of new Set(Object.values(site.routes))) {
        const source = r.source(path);
        if (source === undefined) return { refuse: `${path} could not be read. No settings were applied.` };
        const next = withSiteIdentityPage(source, before, values);
        if (next !== source) edits.set(path, next);
      }
    } catch (error) { return { refuse: error instanceof Error ? error.message : "Site settings could not be changed." }; }
    const creates: { path: string; content: string }[] = [];
    if (config === undefined && edits.has(NATIVE_CONFIG_PATH)) { creates.push({ path: NATIVE_CONFIG_PATH, content: edits.get(NATIVE_CONFIG_PATH)! }); edits.delete(NATIVE_CONFIG_PATH); }
    return { creates, edits, done: `Site settings applied to ${edits.size + creates.length} files as drafts. Publish to keep them.`, undone: "Undid site settings on all affected pages." };
  }


  return { createSiteSettings, readSiteIdentity, nativeSitePageChoices, nativeSettingsController };
}
