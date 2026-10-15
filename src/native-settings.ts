import { createSiteSettings, type SiteSettingsValues, type SiteLinkPreference } from "./components/site-settings";
import { escapeText, readHeadSettings, upsertHeadTag, withPageField, type HeadField } from "./page-builder/site-head";
import { readSiteAddress, readSiteIdentity, siteAddressInput, withSiteIdentityConfig, withSiteIdentityPage } from "./page-builder/site-identity";
import { editNavigation, readNavigation } from "./page-builder/site-navigation";
import { nativePageTemplate } from "./native-create";
import { NATIVE_HOME_UNREAD } from "./controllers/pages-controller";
import { isImagePath } from "./native-structure";
import { NATIVE_CONFIG_PATH, nativeSiteSettings, type NativeSite, nativeSitePrefix } from "../shared/native-project";
import type { Reads, Outcome, PlanResult, Stamp, GuardedEdits } from "./guarded-edit";
import type { AppStore } from "./app-store";
import { socialImageAddress, socialImagePath, SOCIAL_IMAGE_NOTE } from "./page-builder/social-image";
import { siteAddress, sitePathPrefix, routeAddress, sitePathOf } from "../shared/site-path-prefix";
import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords, type MediaTrim } from "../shared/media-records";
import type { SocialSharingRequest } from "./page-builder/social-sharing";
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
  /** The Media picker for an image setting (`accept`: which files fit); the chosen file's root path, or undefined on Cancel. */
  choosePath: (place: string, accept?: string) => Promise<string | undefined>;
  /** `reused`: the value is already a sharing copy; nothing was written, the caller writes `address`. */
  shareImage: (request: SocialSharingRequest) => Promise<{ address: string; missingAddress: boolean; reused?: true; path?: string } | undefined>;
  nativeEffectiveSource: (path: string) => string | undefined;
  loadNativeAssets: (sources: Record<string, string>, changed: () => void) => Promise<void>;
  /** Every file of the site now, and a text file read into the editor (a new Site address folder rewrites them). */
  nativeFiles: () => string[];
  readMediaText: (path: string) => Promise<unknown>;
}

/** A new Site address folder: its plan's module, and every file it was planned from (`read`, `list`), proved until written. */
interface AddressMove { module: typeof import("./page-builder/site-address-rewrite"); from: string; to: string; read: Map<string, string | undefined>; list: string }

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
    const refreshProof = () => {
      since = ports.guardedEdits.stamp();
      baseline = new Map(shown.map(path => [path, ports.guardedEdits.peek.source(path)] as const));
    };
    // `depends`: every file the edits were planned from (Site settings: config and every page), proved through preparation.
    // `siteUrl`: the address being applied with it (Site settings), else the config's.
    // `holds`: a further proof kept until the copy is written (a new address's file list).
    const share = async (value: string, previous: string, page: string, edits: SocialSharingRequest["edits"], depends: string[] = [], trim?: MediaTrim, siteUrl?: string, note?: () => string | undefined, holds = () => true) => {
      if (stale() || sourcesChanged() || !holds()) throw new Error(changed);
      const stamp = since, repository = ports.guardedEdits.stamp("repository");
      const expected = new Map([...baseline, ...[NATIVE_CONFIG_PATH, ...depends].map(path => [path, ports.guardedEdits.peek.source(path)] as const)]);
      const result = await ports.shareImage({ value, previous, page, ...trim ? { trim } : {}, ...note ? { note } : {},
        siteUrl: siteUrl ?? nativeSiteSettings(ports.nativeEffectiveSource(NATIVE_CONFIG_PATH)).url,
        canonical: readHeadSettings(ports.nativeEffectiveSource(page) ?? "").canonical,
        expectedSources: expected,
        live: () => stamp.holds() && holds() && [...expected].every(([path, source]) => ports.guardedEdits.peek.source(path) === source), edits });
      // A repository switched while the old one finished: never adopt the new one's proof.
      if (!repository.holds()) throw new Error(changed);
      // A framed picture is never linked in place of its copy (an animated one cannot be copied).
      if (trim && !result) throw new Error("This picture cannot be made into a sharing copy. Choose a still picture. Nothing was applied.");
      if (result && !result.reused) refreshProof();
      return result;
    };
    return createSiteSettings({
      prefix: () => nativeSitePrefix(ports.nativeEffectiveSource(NATIVE_CONFIG_PATH)),
      socialNote: () => socialImageAddress(nativeSiteSettings(ports.nativeEffectiveSource(NATIVE_CONFIG_PATH)).url, "").missingAddress ? SOCIAL_IMAGE_NOTE : undefined,
      async applyPage(path, fields, socialTrim) {
        const source = ports.guardedEdits.peek.source(path);
        // A reused sharing copy must still be there when the page is written.
        let reused: string | undefined;
        if (fields["og:image"] !== undefined && source !== undefined) {
          const shared = await share(fields["og:image"], readHeadSettings(source)["og:image"], path, address => {
            let next = source;
            for (const [field, value] of Object.entries({ ...fields, "og:image": address })) next = upsertHeadTag(next, field as HeadField, value);
            return new Map([[path, { source, text: next }]]);
          }, [], socialTrim);
          if (shared?.reused) { fields["og:image"] = shared.address; reused = shared.path; }
          else if (shared) {
            fields["og:image"] = shared.address;
            return undefined;
          }
        }
        // The element selected on the page as it was applied: its Undo and Redo select it again.
        const selected = ports.appStore.selection.value;
        const at = selected?.path === path && selected.node ? { path, node: [...selected.node] } : undefined;
        return applied(await ports.guardedEdits.run(r => {
          if (checkShown(r) || reused && !r.exists(reused)) return { refuse: changed };
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
      async applySite(typed, confirm) {
        const site = ports.nativeSite;
        let reused: string | undefined;
        // The address is checked and stored only when it changed: an untouched one stays byte for byte.
        const shownUrl = readSiteAddress(ports.guardedEdits.peek.source(NATIVE_CONFIG_PATH));
        const address = typed.url === shownUrl ? undefined : siteAddressInput(typed.url);
        if (address && "error" in address) return address.error;
        const values = { ...typed, url: address?.url };
        // A new folder in the address moves every root address in the site's text files, asked first.
        let move: AddressMove | undefined;
        if (site && address && sitePathPrefix(shownUrl) !== sitePathPrefix(address.url)) {
          const module = await import("./page-builder/site-address-rewrite");
          if (module.siteFolderChanges(shownUrl, address.url)) {
            const unread = await module.readSiteAddressFiles(ports.nativeFiles(), ports.readMediaText, () => since.holds());
            if (unread) return unread;
            if (stale() || sourcesChanged()) return changed;
            // The question's count holds only for these bytes: they are proved after it and when written.
            const files = ports.nativeFiles(), list = files.join("\n");
            const read = new Map(module.siteAddressFiles(files).map(path => [path, ports.guardedEdits.peek.source(path)] as const));
            const plan = await module.planSiteAddressRewriteInSlices({ from: shownUrl, to: address.url, paths: files,
              source: path => read.get(path), pause: () => new Promise(resolve => setTimeout(resolve)) });
            if (plan.missing) return siteAddressUnread(plan.missing);
            if (plan.count && !await confirm?.(module.siteAddressConfirm(plan))) return module.SITE_ADDRESS_KEPT;
            move = { module, from: shownUrl, to: address.url, read, list };
            if (stale() || sourcesChanged() || !moveHolds(move, path => ports.guardedEdits.peek.source(path))) return changed;
          }
        }
        if (site) {
          const home = site.routes["/"], config = ports.guardedEdits.peek.source(NATIVE_CONFIG_PATH);
          const before = readSiteIdentity(config, ports.guardedEdits.peek.source(home) ?? "");
          if (values.socialImage !== before.socialImage || values.socialImageChosen) {
            const moved = move ? move.module.siteAddressFiles(ports.nativeFiles()) : [];
            const expected = new Map([NATIVE_CONFIG_PATH, ...new Set([...Object.values(site.routes), ...moved])].map(path => [path, ports.guardedEdits.peek.source(path)] as const));
            let updated: string | undefined;
            const shared = await share(values.socialImage, before.socialImage, home, address => {
              const nextValues = { ...values, socialImage: address };
              const edits = new Map<string, { source: string | undefined; text: string }>();
              const pages = [...new Set(Object.values(site.routes))];
              const unread = pages.find(path => expected.get(path) === undefined);
              if (unread) throw new Error(`${unread} could not be read. No settings were applied.`);
              if (move) {
                // The sharing copy was made for the new address: only the rest moves.
                const plan = move.module.planSiteAddressRewrite({ from: move.from, to: move.to, paths: ports.nativeFiles(), source: path => expected.get(path) });
                if (plan.missing) throw new Error(siteAddressUnread(plan.missing));
                const next = move.module.siteSettingsWithMove({ from: move.from, to: move.to, paths: ports.nativeFiles(), plan, source: path => expected.get(path),
                  config, pages, before, values: nextValues, imageIsNew: true });
                edits.set(NATIVE_CONFIG_PATH, { source: config, text: next.config });
                for (const [path, text] of next.edits) edits.set(path, { source: expected.get(path), text });
                updated = plan.count ? move.module.siteAddressUpdated(plan) : undefined;
                return edits;
              }
              edits.set(NATIVE_CONFIG_PATH, { source: config, text: withSiteIdentityConfig(config, nextValues) });
              for (const path of pages) {
                const source = expected.get(path)!;
                const text = withSiteIdentityPage(source, before, nextValues);
                // Pages keeping their own image stay out of the batch.
                if (text !== source) edits.set(path, { source, text });
              }
              return edits;
            }, [...expected.keys()], values.socialImageTrim, values.url, () => updated, () => !move || ports.nativeFiles().join("\n") === move.list);
            if (shared) values.socialImage = shared.address;
            if (shared && !shared.reused) return undefined;
            reused = shared?.path;
          }
        }
        // The file list the plan read is proved after every wait, not only at the start.
        return applied(await ports.guardedEdits.run(r => checkShown(r) || reused && !r.exists(reused) || move && !moveHolds(move, path => r.source(path)) ? { refuse: changed } : applyNativeSiteSettings(values, r, move, Boolean(reused)),
          { since, ...move ? { guard: () => ports.nativeFiles().join("\n") === move!.list } : {} }));
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
          source = source.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, `$1\n    <section>\n      <h1>Page not found</h1>\n      <p>There is nothing at this address. <a href="${routeAddress("/", nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)))}">Go to the home page</a>.</p>\n    </section>\n  $2`);
          return { creates: [{ path: "404.html", content: source }], open: "404.html", done: "Created the 404 page as a draft.", undone: "Undid creating the 404 page." };
        }, { since }));
      },
      async applyNavigation(path, original, links) {
        return applied(await ports.guardedEdits.run(r => {
          const source = r.source(path);
          if (source !== original) return { refuse: "Navigation changed while this panel was open. Reopen it to review the latest links." };
          const list = readNavigation(source, path.startsWith("components/"), nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)));
          if (!list) return { refuse: "This header's navigation is not a simple list of links." };
          try { return { edits: new Map([[path, editNavigation(source, list, links, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)))]]), done: "Navigation applied as a draft. Publish to keep it.", undone: "Undid changing navigation." }; }
          catch (error) { return { refuse: error instanceof Error ? error.message : "Navigation could not be changed." }; }
        }, { since }));
      },
      async chooseImage(place, accept) {
        const path = await ports.choosePath(`Site settings · ${place}`, accept);
        if (stale()) throw new Error(changed);
        return path;
      },
      socialFrame(value, page = ports.nativeSite?.routes["/"] ?? "index.html") {
        const config = nativeSiteSettings(ports.nativeEffectiveSource(NATIVE_CONFIG_PATH));
        const path = socialImagePath(value, page, config.url, readHeadSettings(ports.nativeEffectiveSource(page) ?? "").canonical);
        if (!path || !/\.(?:jpe?g|png|webp|avif|bmp|gif)$/i.test(path)) return undefined;
        let records: MediaRecords | undefined;
        try { records = parseMediaRecords(ports.nativeEffectiveSource(MEDIA_RECORDS_PATH)); } catch { /* Opened centred. */ }
        let site = "";
        try { site = config.url ? new URL(config.url).host : ""; } catch { /* No usable address. */ }
        // A sharing copy re-opens on the picture it was made from, with its frame.
        const record = records?.files[path];
        if (!record?.sharing) return { file: path, value: siteAddress(path, sitePathPrefix(config.url)), site };
        const from = record.trimmedFrom;
        return from && /\.(?:jpe?g|png|webp|avif|bmp|gif)$/i.test(from.source) ? { file: from.source, value: siteAddress(from.source, sitePathPrefix(config.url)), trim: from.trim, site } : undefined;
      },
      async imageUrl(value) {
        if (stale() || !value.trim()) return undefined;
        // An absolute URL is previewed only when it is this site's own address (its canonical
        // origin), from the repository file at that path; the editor never loads other sites' images.
        const page = ports.appStore.openFile.value ?? "index.html";
        const siteUrl = nativeSiteSettings(ports.nativeEffectiveSource(NATIVE_CONFIG_PATH)).url;
        let own: string | undefined;
        if (/^https?:\/\//i.test(value)) {
          let url: URL, origin: string | undefined;
          // Another site's image is not loaded: the preview says it is unavailable (the dialog shows that for a refusal).
          const unavailable = () => { throw new Error("Images from other sites are not previewed."); };
          try { url = new URL(value.trim()); origin = new URL(readHeadSettings(ports.nativeEffectiveSource(page) ?? "").canonical || "x:").origin; } catch { return unavailable(); }
          let siteOrigin: string | undefined;
          try { siteOrigin = siteUrl ? new URL(siteUrl).origin : undefined; } catch { /* No usable publishing address. */ }
          if (url.origin !== origin && url.origin !== siteOrigin) return unavailable();
          // On the site's host but outside its folder is another site's image too.
          own = sitePathOf(url.href, { url: siteUrl, origins: [origin ?? ""] }) ?? unavailable();
        }
        const path = own ?? socialImagePath(value, page, siteUrl);
        if (!path || !isImagePath(path)) return undefined;
        await ports.loadNativeAssets({ "index.html": `<img src="${escapeText(siteAddress(path, sitePathPrefix(siteUrl))).replace(/"/g, "&quot;")}">` }, () => {});
        return stale() || sourcesChanged() ? undefined : ports.nativeAssets.get(path);
      },
    }, siteLinkPreferences);
  }


  const siteAddressUnread = (path: string) => `${path} could not be read, so the site's links cannot follow the new address. Nothing was applied.`;

  const moveHolds = (move: AddressMove, source: (path: string) => string | undefined) =>
    ports.nativeFiles().join("\n") === move.list && [...move.read].every(([path, text]) => source(path) === text);

  /**
   * `move`: the Site address's folder changes; every root address follows, in the same step, then the
   * settings are written in the new address's form. `imageIsNew`: the social image is a sharing copy's
   * address, made for the new address already.
   */
  async function applyNativeSiteSettings(values: Omit<SiteSettingsValues, "url"> & { url?: string }, r: Reads, move?: AddressMove, imageIsNew = false): Promise<PlanResult> {
    const site = r.site();
    if (!site) return { refuse: "Open a native site first." };
    const config = r.source(NATIVE_CONFIG_PATH);
    const before = readSiteIdentity(config, r.source(site.routes["/"]) ?? "");
    const pages = [...new Set(Object.values(site.routes))];
    const unread = pages.find(path => r.source(path) === undefined);
    if (unread) return { refuse: `${unread} could not be read. No settings were applied.` };
    let edits = new Map<string, string>();
    // Every read goes through `r`, so the step is proved against the very bytes it rewrote.
    const plan = move && await move.module.planSiteAddressRewriteInSlices({ from: move.from, to: move.to, paths: ports.nativeFiles(),
      source: path => r.source(path), pause: () => new Promise(resolve => setTimeout(resolve)) });
    if (plan?.missing) return { refuse: siteAddressUnread(plan.missing) };
    try {
      if (move && plan) {
        const next = move.module.siteSettingsWithMove({ from: move.from, to: move.to, paths: ports.nativeFiles(), plan, source: path => r.source(path), config, pages, before, values, imageIsNew });
        edits = next.edits;
        if (config !== next.config) edits.set(NATIVE_CONFIG_PATH, next.config);
      } else {
        const nextConfig = withSiteIdentityConfig(config, values);
        if (config !== nextConfig) edits.set(NATIVE_CONFIG_PATH, nextConfig);
        for (const path of pages) {
          const source = r.source(path)!;
          const next = withSiteIdentityPage(source, before, values);
          if (next !== source) edits.set(path, next);
        }
      }
    } catch (error) { return { refuse: error instanceof Error ? error.message : "Site settings could not be changed." }; }
    const creates: { path: string; content: string }[] = [];
    if (config === undefined && edits.has(NATIVE_CONFIG_PATH)) { creates.push({ path: NATIVE_CONFIG_PATH, content: edits.get(NATIVE_CONFIG_PATH)! }); edits.delete(NATIVE_CONFIG_PATH); }
    if (plan?.count) return { creates, edits, done: move!.module.siteAddressDone(plan), undone: "Undid site settings and the links updated to the new address." };
    return { creates, edits, done: `Site settings applied to ${edits.size + creates.length} files as drafts. Publish to keep them.`, undone: "Undid site settings on all affected pages." };
  }


  return { createSiteSettings, readSiteIdentity, nativeSitePageChoices, nativeSettingsController };
}
