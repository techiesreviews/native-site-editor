import type { GuardedEdits, Reads } from "../guarded-edit";
import { firstHeadingText, buildNativePagesTree, nativePageLabel, type NativeNewTarget, type NativeSiteTree } from "../native-pages";
import type { readNavigation } from "../page-builder/site-navigation";
import type { PageMovePlan } from "../native-page-moves";
import { nativePageUrl, type NativeSite } from "../../shared/native-project";
import { newDraftPaths } from "../../shared/site-overlay";
import type { NativeNewRequest } from "../components/pages-tree";
import type { PagePickerItem } from "../components/page-picker";
import type { SavedDraft } from "../drafts";

export interface PagesConfirmation {
  ask(question: { title: string; notes: string[]; action: string }): Promise<boolean>;
  choose(question: { title: string; notes: string[]; actions: { label: string; value: string }[]; option?: { label: string; checked: boolean } }): Promise<{ value?: string; option: boolean }>;
}

/** The explorer's tabs: a native site shows all three, any other project only its files. */
export type ExplorerTab = "pages" | "media" | "files";
export const explorerTabNames: ExplorerTab[] = ["pages", "media", "files"];

export const NATIVE_HOME_UNREAD = "The home page is not read yet. Try again in a moment.";

/** What a new page typed in the Pages tab writes, or why it cannot. */
export interface NativeNewPlan extends NativeNewTarget {
  title: string;
  content: string;
  note?: string;
}

export interface PagesPorts {
  edits: Pick<GuardedEdits, "run" | "stamp" | "peek">;
  site(): NativeSite | undefined;
  routeForPath(file: string): string | undefined;
  source(path: string): string | undefined;
  files(): string[];
  baseFiles(): string[];
  drafts(): SavedDraft[];
  hasDraftScope(): boolean;
  routeInfo(route: string, site: NativeSite): { title?: string };
  titles(site: NativeSite): Record<string, string | undefined>;
  /** `.editor/config.json`'s `site.url`, read now. */
  siteUrl(): string | undefined;
  writeMeta(file: string, field: "title", value: string, flush: false): Promise<string | undefined>;
  ensureIndex(): Promise<string | undefined>;
  readRedirects(): Promise<string | undefined>;
  withMovedPageUrls(edits: Map<string, string>, pages: { file: string; moved?: string; from: string; to: string }[], reader: Reads): void;
  pageLinks(paths: string[], moves: Map<string, string>, action: "deleted", reader: Reads): string | undefined;
  cardsLinkingTo(route: string, excluding: Set<string>, r: Reads): { label: string; edits: Map<string, string> } | undefined;
  confirmation(): PagesConfirmation | undefined;
  picker(): { pick(question: { title: string; items: PagePickerItem[] }): Promise<string | undefined> } | undefined;
  refreshMeta(): void;
  refreshLabel(): void;
  /** The drawn Pages tree; DOM mounting stays in the host. */
  tree(): { render(tree: NativeSiteTree, currentFile: string | undefined, focus?: { file?: string; route?: string }): void } | undefined;
  pagesHidden(): boolean;
  openFile(): string | undefined;
  /** Rendering consumes queued title work. */
  clearPendingTitles(): void;
  tabsMounted(): boolean;
  paintTabs(tab: ExplorerTab, native: boolean): void;
  /** Without a native site: reset the Pages tree and dispose the images gallery. */
  resetExplorer(): void;
  showMedia(): void;
  /** The whole site read for the repository open now (host guards): an error message, or nothing. */
  siteReadForCreate(): Promise<string | undefined>;
  /** Creates the page with its card, when card grids are mounted; else undefined. */
  createWithCard(request: NativeNewRequest): Promise<string | undefined> | undefined;
  navigationTarget(pagePath: string | undefined, reader: Reads): { path: string; source: string; list: NonNullable<ReturnType<typeof readNavigation>>; shared: boolean } | undefined;
  restoreDeleted(file: string): void;
  announce(message: string): void;
  /** A refusal: said in #status and shown on screen. */
  refuse(reason: string): void;
  error(error: Error): void;
}

export interface NativeUrlChange {
  from: string;
  to: string;
  label: string;
  move: PageMovePlan;
  /** Files whose links change, by the path they have after the move. */
  links: { path: string; from: string; text: string; count: number }[];
  /** Whether every page, template and stylesheet was read (else the count is a lower bound). */
  complete: boolean;
  /** The moved routes on the live site: an old URL to keep working. */
  redirect: string[];
  /** The page itself is on the live site (not new in this browser). */
  live: boolean;
}

/** Live callers supply their current files and sources; no cache is retained. */
export function pageLinkSources(files: readonly string[], source: (path: string) => string | undefined): Record<string, string | undefined> {
  return Object.fromEntries(files.filter((path) => /\.(?:html|css)$/i.test(path) && !path.startsWith("node_modules/")).map((path) => [path, source(path)]));
}

export function pageOnBranchHere(path: string, baseFiles: readonly string[], drafts: readonly SavedDraft[]): boolean {
  if (!baseFiles.includes(path)) return false;
  const draft = drafts.find((item) => item.path === path);
  return !draft || (draft.baseSha !== null && !draft.deleted);
}

/** Boot labels and tab state do not load page mutation code. */
export function createPagesState(ports: PagesPorts) {
  // ---- The explorer's Pages | Media | Files tabs and the Pages tree. ----

  let explorerTab: ExplorerTab = "pages";

  function selectExplorerTab(name: ExplorerTab) {
    explorerTab = name;
    updateExplorerTabs();
    if (name === "pages") renderPagesTree();
    if (name === "media") ports.showMedia();
  }

  function updateExplorerTabs(reset = false) {
    if (!ports.tabsMounted()) return;
    const native = Boolean(ports.site());
    if (reset) explorerTab = "pages";
    ports.paintTabs(native ? explorerTab : "files", native);
    if (!native) ports.resetExplorer();
  }

  // The site's pages as a tree, from its routes (new drafts included); labels
  // read each page's `<title>`, else its first heading, from its source.
  function renderPagesTree(focus?: { file?: string; route?: string }) {
    const view = ports.tree(), site = ports.site();
    if (!view || !site || ports.pagesHidden()) return;
    ports.clearPendingTitles();
    // New pages are marked; a renamed or moved one is the same page.
    const drafted = new Set(ports.hasDraftScope() ? newDraftPaths(ports.drafts(), { moved: false }) : []);
    const tree = buildNativePagesTree({
      routes: site.routes,
      titles: ports.titles(site),
      heading: (file) => firstHeadingText(ports.source(file)),
      isNew: (file) => drafted.has(file),
    });
    view.render(tree, ports.openFile(), focus);
  }

  // The home page's document, which new pages copy (its stylesheets, scripts,
  // header and footer): undefined while it is not read yet, so no page is made
  // from nothing.
  function nativeHomeTemplate() {
    const site = ports.site();
    return site ? ports.source(site.routes["/"]) : undefined;
  }

  // The address of the page at `route` on the live site, from
  // `.editor/config.json`'s `site.url`; none without one.
  function nativeAddress(route: string) {
    return nativePageUrl(ports.siteUrl(), route);
  }

  // The Pages tab's label of the page file `file`.
  function nativePageLabelOf(file: string) {
    const site = ports.site();
    const route = ports.routeForPath(file);
    if (!site || !route) return file;
    return nativePageLabel(file, {
      routes: site.routes,
      titles: { [route]: ports.routeInfo(route, site).title },
      heading: (path) => firstHeadingText(ports.source(path)),
    }) ?? file;
  }

  return { explorerTab: () => explorerTab, selectTab: selectExplorerTab, updateTabs: updateExplorerTabs, renderTree: renderPagesTree,
    homeTemplate: nativeHomeTemplate, address: nativeAddress, pageLabel: nativePageLabelOf };
}
