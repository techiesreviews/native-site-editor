import type { GuardedEdits, Reads, Stamp, PlanResult, Outcome } from "../guarded-edit";
import { nativeNewTarget, firstHeadingText, buildNativePagesTree, nativePageLabel, type NativeNewTarget, type NativePageNode, type NativeSiteTree } from "../native-pages";
import { nativePageTemplate, normalizeRoute, routeHeading, type Checked } from "../native-create";
import { editNavigation, readNavigation } from "../page-builder/site-navigation";
import { parentRoute, routeSlug, routeFolder, isRouteWithin, movedRoute, planPageMove, rewriteRouteLinks, editNativeRedirects, type PageMovePlan } from "../native-page-moves";
import { isFolderRoute, nativeRouteFile } from "../../shared/native-routes";
import { NATIVE_REDIRECTS_PATH, nativePageUrl, nativePageWithUrl, nativePageWithDetail, nativePageHead, nativeSiteSettings, NATIVE_CONFIG_PATH, type NativeSite } from "../../shared/native-project";
import type { NativeNewRequest, NativePagesTarget } from "../components/pages-tree";
import type { PagePickerItem } from "../components/page-picker";
import type { UrlPlan } from "../components/url-change";
import type { SavedDraft } from "../drafts";

export interface PagesConfirmation {
  ask(question: { title: string; notes: string[]; action: string }): Promise<boolean>;
  choose(question: { title: string; notes: string[]; actions: { label: string; value: string }[]; option?: { label: string; checked: boolean } }): Promise<{ value?: string; option: boolean }>;
}

/** The explorer's tabs: a native site shows all three, any other project only its files. */
export type ExplorerTab = "pages" | "files" | "images";
export const explorerTabNames: ExplorerTab[] = ["pages", "files", "images"];

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
  cardsLinkingTo(route: string, excluding: Set<string>): { label: string; edits: Map<string, string> } | undefined;
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
  showImages(): void;
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

export function createPagesController(ports: PagesPorts) {
  const changedMove = "The repository or source changed meanwhile. Review it and try again.";
  const fileKey = () => [...ports.files()].sort().join("\n");
  function message(outcome: Outcome, changed: string): string | undefined {
    return !outcome.ok && outcome.reason === "stale" ? changed : outcome.message;
  }
  // ---- The Pages tab's Rename, Duplicate and Delete. ----

  // A page's title in its head, as the Page block's Title field sets it.
  async function retitleNativePage(file: string, title: string): Promise<string | undefined> {
    const route = ports.routeForPath(file);
    if (!ports.site() || !route) return "This page has no URL in the site.";
    const since = ports.edits.stamp();
    const error = await ports.writeMeta(file, "title", title, false);
    if (error) return error;
    // The metadata write legitimately rebuilds the site; guard workspace and target URL.
    if (!since.holds() || ports.routeForPath(file) !== route) return "The repository changed meanwhile. Try again.";
    ports.refreshMeta();
    renderPagesTree();
    ports.refreshLabel();
    return undefined;
  }

  // A copy of a page beside it: `<slug>-copy/index.html` (then `-copy-2`, …),
  // its content as it is now, titled "… (copy)".
  async function duplicateNativePage(file: string) {
    const since = ports.edits.stamp();
    const outcome = await ports.edits.run(r => {
      const site = r.site(), route = site && Object.entries(site.routes).find(([, path]) => path === file)?.[0];
      if (!site || !route) return { refuse: "This page has no URL in the site." };
      const name = route === "/" ? "home" : routeSlug(route).replace(/\.html$/, "");
      const parent = route === "/" ? "/" : parentRoute(route);
      let target: Checked<NativeNewTarget> | undefined;
      for (let n = 1; n < 100; n++) {
        target = nativeNewTarget(parent, `${name}-copy${n > 1 ? `-${n}` : ""}`, { route: route => site.routes[route], exists: path => r.exists(path) });
        if (target.ok) break;
      }
      if (!target?.ok) return { refuse: target?.error ?? "No name is free for the copy." };
      const original = r.source(file);
      if (original === undefined) return { refuse: "The page could not be read." };
      const label = nativePageHead(original).title?.trim() || (route === "/" ? "Home" : firstHeadingText(original)) || routeHeading(route);
      const title = `${label} (copy)`;
      return { creates: [{ path: target.value.file, content: nativePageWithUrl(nativePageWithDetail(original, "title", title), address(target.value.route, r)) }],
        open: target.value.file, done: `Duplicated ${label} as ${title} at ${target.value.route}.`, undone: `Undid creating the page ${title}.` };
    }, { since });
    const error = message(outcome, "The repository changed meanwhile. Try again.");
    if (error) ports.error(new Error(error));
  }

  // The drafts of a page and, for a folder page, of everything in its folder: an edit while its
  // Delete waits for the index is evidence even before the index has read the file.
  function targetDrafts(target: NativePagesTarget) {
    const folder = isFolderRoute(target.route) ? routeFolder(target.route) : undefined;
    return JSON.stringify(ports.drafts().filter(draft => draft.path === target.file || (folder && draft.path.startsWith(folder))).sort((a, b) => a.path.localeCompare(b.path)));
  }

  // Delete in the Pages tab. A page with subpages asks whether they go too
  // ("Delete About and its 2 subpages", with everything in its folder) or
  // stay ("Delete only this page": its folder is then a URL with no page).
  async function removeNativePagesTarget(target: NativePagesTarget) {
    const site = ports.site();
    if (!target.file || !site || !ports.confirmation()) return;
    const file = target.file;
    // The stamp, the file list and the target's drafts as Delete was pressed: a change while the
    // index loads refuses before the dialog opens (the guard is proved before the plan runs).
    const since = ports.edits.stamp(), key = fileKey(), drafts = targetDrafts(target);
    let cancelled = false, cancel = `Cancelled deleting ${target.label}`;
    const indexed = await ports.ensureIndex();
    if (indexed && since.holds()) { ports.error(new Error(indexed)); return; }
    const outcome = await ports.edits.run(async r => {
      if (r.site()?.routes[target.route] !== target.file) return { refuse: "The repository or source changed meanwhile. Try again." };
      const files = ports.files();
      const folder = isFolderRoute(target.route) ? routeFolder(target.route) : undefined;
      const inside = folder === undefined ? [] : files.filter((path) => path.startsWith(folder) && path !== target.file);
      const everything = [file, ...inside];
      const onGitHub = (paths: string[]) => paths.some((path) => ports.baseFiles().includes(path));
      const links = ports.pageLinks(everything, new Map(), "deleted", r);
      const saveNote = (paths: string[]) => onGitHub(paths)
        ? "It is removed from GitHub when you save. Until then, Restore brings it back."
        : "It is not on GitHub yet, so this discards it.";
      let paths = [file];
      // Its card in a grid listing pages (src/page-builder/cards.ts) can go with it.
      const card = ports.cardsLinkingTo(target.route, new Set(everything));
      const cardOption = card ? { label: card.label, checked: true } : undefined;
      // The card's edits and the deletes were computed from these sources: an
      // agent or resync write while the dialog is open refuses, never overwritten.
      for (const path of [...everything, ...(card?.edits.keys() ?? [])]) { r.exists(path); r.source(path); }
      let removeCard = false;
      if (target.subpages > 0) {
        const count = `${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`;
        const answer = await ports.confirmation()!.choose({
          title: `Delete ${target.label}?`,
          notes: [
            `${target.label} (${target.route}) has ${count}. Delete them too, with everything in ${folder}, or only this page: its subpages then stay at their URLs, under ${target.route} with no page of its own.`,
            ...(links ? [links] : []),
            saveNote(everything),
          ],
          actions: [
            { label: "Delete only this page", value: "only" },
            { label: `Delete ${target.label} and its ${count}`, value: "all" },
          ],
          option: cardOption,
        });
        if (!answer.value) { cancelled = true; return { stayed: cancel }; }
        if (answer.value === "all") paths = everything;
        removeCard = answer.option;
      } else {
        const question = {
          title: `Delete the page ${target.label} (${target.file})?`,
          notes: [...(links ? [links] : []), ...(inside.length ? [`Everything else in ${folder} goes with it.`] : []), saveNote(everything)],
          action: "Delete",
        };
        const answer = cardOption
          ? await ports.confirmation()!.choose({ ...question, actions: [{ label: question.action, value: "confirm" }], option: cardOption })
          : { value: (await ports.confirmation()!.ask(question)) ? "confirm" : undefined, option: false };
        if (answer.value !== "confirm") { cancelled = true; cancel = `Cancelled deleting ${target.file}`; return { stayed: cancel }; }
        if (inside.length) paths = everything;
        removeCard = answer.option;
      }
      const parent = parentRoute(target.route);
      const what = paths.length > 1 && target.subpages
        ? `${target.label} and its ${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`
        : `the page ${target.label}`;
      return {
        deletes: paths,
        ...(removeCard && card ? { edits: card.edits } : {}),
        done: `Deleted ${what}${removeCard && card ? " and its card" : ""}.`,
        undone: `Undid deleting ${what}.`,
        focus: { route: parent === "/" ? undefined : parent },
      };
    }, { since, guard: () => fileKey() === key && targetDrafts(target) === drafts });
    if (cancelled) { if (!outcome.ok) ports.announce(cancel); return; }
    const error = message(outcome, "The repository or source changed meanwhile. Try again.");
    if (error) { ports.error(new Error(error)); if (!outcome.ok && outcome.reason === "refused") ports.refuse(error); }
  }

  // ---- Changing a page's URL, Move to… and dragging in the Pages tab. ----

  // Whether the file is on GitHub at this path (not a new or moved draft).
  function onBranchHere(path: string) {
    return pageOnBranchHere(path, ports.baseFiles(), ports.drafts());
  }

  const UNCHANGED_URL = "That is the page's URL now.";

  // Every HTML and CSS file of the site with its text as edited (undefined
  // when it was not read): where links to a page are looked for.
  function nativeLinkSources(): Record<string, string | undefined> {
    return pageLinkSources(ports.files(), (path) => ports.source(path));
  }

  // What changing the URL of the page `file` to the typed `value` does: the
  // files that move (the page, and for a folder page its whole folder), the
  // links that change, the old URLs that could redirect; or why it cannot.
  function planNativeUrlChange(file: string, value: string, r: Reads): Checked<NativeUrlChange> {
    const site = r.site();
    const from = site && Object.entries(site.routes).find(([, path]) => path === file)?.[0];
    if (!site || !from || !ports.hasDraftScope()) return { ok: false, error: "This page has no URL in the site." };
    const normalized = normalizeRoute(value);
    if (!normalized.ok) return normalized;
    const to = normalized.value;
    if (to === from) return { ok: false, error: UNCHANGED_URL };
    const planned = planPageMove({ files: ports.files(), routes: site.routes, from, to });
    if (!planned.ok) return planned;
    const move = planned.value;
    const moved = new Map(move.moves.map((item) => [item.from, item.to]));
    const links: NativeUrlChange["links"] = [];
    let complete = true;
    for (const [path, source] of Object.entries(pageLinkSources(ports.files(), path => r.source(path)))) {
      if (source === undefined) { complete = false; continue; }
      const rewritten = rewriteRouteLinks(source, from, to);
      if (rewritten.count) links.push({ path: moved.get(path) ?? path, from: path, text: rewritten.text, count: rewritten.count });
    }
    const redirect = move.routes.filter(([route]) => onBranchHere(site.routes[route])).map(([route]) => route);
    return { ok: true, value: { from, to, label: nativePageLabel(file, { routes: site.routes, titles: { [from]: nativePageHead(r.source(file) ?? "").title }, heading: path => firstHeadingText(r.source(path)) }) ?? file, move, links, complete, redirect, live: onBranchHere(file) } };
  }

  // A change's summary, as the URL field and the confirmation say it.
  function describeUrlChange(change: NativeUrlChange) {
    const { move } = change;
    const subpages = move.routes.length - 1;
    const others = move.moves.length - move.routes.length;
    const along = [
      subpages ? `its ${subpages} ${subpages === 1 ? "subpage" : "subpages"}` : "",
      others > 0 ? `${others} other ${others === 1 ? "file" : "files"} in its folder` : "",
    ].filter(Boolean).join(" and ");
    const parts = [`Moves ${move.file} to ${move.target}${along ? ` with ${along}` : ""}`];
    const count = change.links.reduce((sum, item) => sum + item.count, 0);
    const least = change.complete ? "" : "at least ";
    parts.push(count
      ? `updates ${least}${count} ${count === 1 ? "link" : "links"} in ${change.links.length} ${change.links.length === 1 ? "file" : "files"}`
      : change.complete ? "no links to update" : "no links found in the files read");
    return `${parts.join("; ")}.`;
  }

  function nativeUrlPlan(file: string, value: string): UrlPlan {
    const planned = planNativeUrlChange(file, value, ports.edits.peek);
    if (!planned.ok) return planned.error === UNCHANGED_URL ? { ok: false, error: "", unchanged: true } : planned;
    const change = planned.value;
    return {
      ok: true,
      route: change.to,
      message: describeUrlChange(change),
      warnings: change.move.warnings,
      redirect: change.redirect.length ? { checked: change.live, label: `Keep the old URL working (${change.from} redirects to ${change.to})` } : undefined,
    };
  }

  // Changes the URL of the page `file` to `value` as one operation, all as
  // drafts: the files move (a folder page's whole folder along), every root
  // link to the old URL and under it, in every page, template and stylesheet,
  // points at the new one, and with `keep` the old URLs redirect there
  // (`_redirects`, which is also kept free of chains to the old URLs and of
  // redirects away from the new ones). The open page stays open where it
  // went. Undo right after takes it all back.
  function urlChangePlan(r: Reads, change: NativeUrlChange, keep: boolean): PlanResult {
    const site = r.site()!;
    for (const move of change.move.moves) { r.exists(move.from); r.source(move.from); }
    const edits = new Map(change.links.map(item => [item.path, item.text]));
    const moved = new Map(change.move.moves.map(item => [item.from, item.to]));
    ports.withMovedPageUrls(edits, change.move.routes.map(([from, to]) => ({ file: site.routes[from], moved: moved.get(site.routes[from]), from, to })), r);
    const redirects = r.source(NATIVE_REDIRECTS_PATH), redirected = keep ? change.redirect : [];
    const creates: { path: string; content: string }[] = [];
    if (redirects !== undefined || redirected.length) {
      const next = editNativeRedirects(redirects, change.from, change.to, redirected);
      if (next !== (redirects ?? "")) {
        if (redirects === undefined) creates.push({ path: NATIVE_REDIRECTS_PATH, content: next });
        else edits.set(NATIVE_REDIRECTS_PATH, next);
      }
    }
    const count = change.links.reduce((sum, item) => sum + item.count, 0);
    const summary = count ? `${count} ${count === 1 ? "link" : "links"} updated in ${change.links.length} ${change.links.length === 1 ? "file" : "files"}` : "no links to update";
    return { moves: change.move.moves, edits, creates,
      done: `URL changed to ${change.to} — ${summary}${redirected.length ? `; ${change.from} redirects there` : ""}.`,
      undone: `Undid changing the URL of ${change.label} to ${change.to}.`, focus: { file: change.move.target } };
  }

  async function changeNativeUrl(file: string, value: string, keep: boolean, since: Stamp = ports.edits.stamp(), baseline?: ReadonlyMap<string, string | undefined>): Promise<string | undefined> {
    const key = fileKey();
    const outcome = await ports.edits.run(async r => {
      if (baseline && [...baseline].some(([path, source]) => r.source(path) !== source)) return { refuse: "The repository or source changed meanwhile. Reopen settings and try again." };
      const indexed = await ports.ensureIndex();
      if (indexed) return { refuse: indexed };
      const planned = planNativeUrlChange(file, value, r);
      if (!planned.ok) return planned.error === UNCHANGED_URL ? { stayed: "That is the page's URL now." } : { refuse: planned.error };
      // Read the plan before the asynchronous redirects fetch too.
      for (const move of planned.value.move.moves) { r.exists(move.from); r.source(move.from); }
      try { await ports.readRedirects(); }
      catch (error) { return { refuse: error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.` }; }
      return urlChangePlan(r, planned.value, keep);
    }, { since, guard: () => fileKey() === key });
    return message(outcome, baseline ? "The repository or source changed meanwhile. Reopen settings and try again." : "The repository or source changed while preparing the URL change. Review it and try again.");
  }

  // The rows of Move to…: the top level, then every folder URL of the site,
  // the page itself, its subpages and where it is now not chosen.
  function nativeMoveChoices(target: NativePagesTarget, r: Reads = ports.edits.peek): PagePickerItem[] {
    const site = r.site();
    if (!site) return [];
    const titles = Object.fromEntries(Object.entries(site.routes).map(([route, file]) => [route, nativePageHead(r.source(file) ?? "").title]));
    const tree = buildNativePagesTree({ routes: site.routes, titles, heading: file => firstHeadingText(r.source(file)) });
    const parent = parentRoute(target.route);
    const items: PagePickerItem[] = [{ route: "/", label: "Top level", level: 1, disabled: parent === "/" ? "It is there now." : undefined }];
    const walk = (page: NativePageNode, level: number) => {
      const disabled = isRouteWithin(page.route, target.route) ? "It is this page or one of its subpages."
        : page.route === parent ? "It is there now."
        : !isFolderRoute(page.route) ? "A single-file page has no subpages." : undefined;
      items.push({ route: page.route, label: page.file ? page.label : `${page.label} (no page)`, level, disabled });
      for (const child of page.children) walk(child, level + 1);
    };
    for (const page of tree.children) walk(page, 2);
    return items;
  }

  // Why a dragged page cannot go under `parent`, said as it is dragged.
  function nativeDropProblem(source: NativePagesTarget, parent: string): string | undefined {
    if (!source.file || source.home) return "This page cannot move.";
    if (isRouteWithin(parent, source.route)) return "A page cannot go under itself or its own subpages.";
    if (parent === parentRoute(source.route)) return "It is already there.";
    if (!isFolderRoute(parent)) return "A single-file page has no subpages.";
    const to = movedRoute(parent, source.route);
    const taken = ports.site()?.routes[to];
    return taken ? `The URL ${to} is taken by ${taken}.` : undefined;
  }

  // Moves a page under `parent` ("/" the top level) after a confirmation that
  // says its new URL, what else moves, the links updated, and offers to keep
  // the old URL working: Move to… and a drop in the Pages tab.
  async function confirmNativeMove(source: NativePagesTarget, parent?: string, since: Stamp = ports.edits.stamp()) {
    if (!source.file || !ports.confirmation()) return;
    const key = fileKey(), drafts = targetDrafts(source), cancel = `Cancelled moving ${source.label}`;
    let cancelled = false;
    // The picker's titles and the move's links come with the site index: loaded first, and a change
    // meanwhile refuses before the picker or the dialog opens (the guard is proved before the plan).
    const indexed = await ports.ensureIndex();
    if (indexed && since.holds()) { ports.error(new Error(indexed)); ports.refuse(indexed); return; }
    const outcome = await ports.edits.run(async r => {
      if (r.site()?.routes[source.route] !== source.file) return { refuse: changedMove };
      if (parent === undefined) {
        parent = await ports.picker()!.pick({ title: `Move ${source.label} to…`, items: nativeMoveChoices(source, r) });
        if (parent === undefined) { cancelled = true; return { stayed: cancel }; }
      }
      const to = movedRoute(parent, source.route);
      const planned = planNativeUrlChange(source.file!, to, r);
      if (!planned.ok) return { refuse: planned.error };
      try { await ports.readRedirects(); }
      catch (error) { return { refuse: error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.` }; }
      // The entire plan is read before asking, including metadata and redirects.
      const preview = urlChangePlan(r, planned.value, false);
      const change = planned.value;
      const answer = await ports.confirmation()!.choose({
        title: `Move ${change.label} to ${to}?`,
        notes: [`Its URL changes from ${change.from} to ${to}.`, describeUrlChange(change), ...change.move.warnings],
        actions: [{ label: "Move", value: "move" }],
        option: change.redirect.length ? { label: `Keep the old URL working (${change.from} redirects to ${to})`, checked: change.live } : undefined,
      });
      if (!answer.value) { cancelled = true; return { stayed: cancel }; }
      return answer.option ? urlChangePlan(r, change, true) : preview;
    }, { since, guard: () => fileKey() === key && targetDrafts(source) === drafts });
    if (cancelled) { if (!outcome.ok) ports.announce(cancel); return; }
    const error = message(outcome, changedMove);
    if (error) { ports.error(new Error(error)); if (!outcome.ok && outcome.reason === "refused") ports.refuse(error); }
  }

  async function moveNativePageTo(target: NativePagesTarget) {
    if (!ports.picker() || !target.file) return;
    const since = ports.edits.stamp();
    await confirmNativeMove(target, undefined, since);
  }

  // ---- The explorer's Pages | Files | Images tabs and the Pages tree. ----

  let explorerTab: ExplorerTab = "pages";

  function selectExplorerTab(name: ExplorerTab) {
    explorerTab = name;
    updateExplorerTabs();
    if (name === "pages") renderPagesTree();
    if (name === "images") ports.showImages();
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
    const drafted = new Set(ports.hasDraftScope() ? ports.drafts().filter((draft) => draft.baseSha === null && !draft.deleted && !draft.movedFrom).map((draft) => draft.path) : []);
    const tree = buildNativePagesTree({
      routes: site.routes,
      titles: ports.titles(site),
      heading: (file) => firstHeadingText(ports.source(file)),
      isNew: (file) => drafted.has(file),
    });
    view.render(tree, ports.openFile(), focus);
  }

  // ---- New pages. ----

  // Typing in the Pages tab checks the target only; creating (`create`) needs
  // the home page's document read (siteReadForCreate) and makes the page from it.
  function planNativeNew(request: NativeNewRequest, create = false, r: Reads = ports.edits.peek): Checked<NativeNewPlan> {
    const site = r.site();
    if (!site || !ports.hasDraftScope()) return { ok: false, error: "Open a native site first." };
    const title = request.title.trim();
    if (!title) return { ok: false, error: "Enter the page's title." };
    if (!request.slug.trim()) return { ok: false, error: "The title gives no URL: add letters or digits, or change the URL." };
    const target = nativeNewTarget(request.parent, request.slug, {
      route: (route) => site.routes[route],
      exists: (path) => r.exists(path),
    });
    if (!target.ok) return target;
    const template = site ? r.source(site.routes["/"]) : undefined;
    if (!create) return { ok: true, value: { ...target.value, title, content: "" } };
    if (template === undefined) return { ok: false, error: NATIVE_HOME_UNREAD };
    return { ok: true, value: { ...target.value, title, content: nativePageTemplate(template, title, address(target.value.route, r)) } };
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

  // Creates a new page as a new draft; routes are found again, the tree drawn
  // and the page opened (the explorer closes). Undo in the editor right after
  // takes it back, as Discard changes on the new file does.
  function address(route: string, r: Reads) {
    return nativePageUrl(nativeSiteSettings(r.source(NATIVE_CONFIG_PATH)).url, route);
  }

  async function createNativeNew(request: NativeNewRequest): Promise<string | undefined> {
    const since = ports.edits.stamp();
    const unread = await ports.siteReadForCreate();
    if (!since.holds()) return "The page template or repository changed. Create the page again.";
    if (unread) return unread;
    if (request.addCard) { const withCard = ports.createWithCard(request); if (withCard) return withCard; }
    const outcome = await ports.edits.run(async r => {
      const planned = planNativeNew(request, true, r);
      if (!planned.ok) return { refuse: planned.error };
      const plan = planned.value;
      if (request.addToNavigation && request.parent === "/") {
        const problem = await ports.ensureIndex();
        if (problem) return { refuse: problem };
        const nav = ports.navigationTarget(r.site()?.routes["/"], r);
        if (!nav) return { refuse: "No editable header navigation found. Uncheck Add to navigation to create only the page." };
        const source = r.source(nav.path);
        if (source === undefined) return { refuse: "Navigation could not be read." };
        let navigation: string, page = plan.content;
        try {
          navigation = editNavigation(source, nav.list, [...nav.list.links, { href: plan.route, label: plan.title }]);
          if (!nav.shared) {
            const list = readNavigation(page);
            if (list) page = editNavigation(page, list, [...nav.list.links, { href: plan.route, label: plan.title }]);
          }
        } catch (error) { return { refuse: error instanceof Error ? error.message : "Navigation could not be changed." }; }
        return { creates: [{ path: plan.file, content: page }], edits: new Map([[nav.path, navigation]]), open: plan.file,
          done: `Created ${plan.title} and added it to navigation as drafts.`, undone: `Undid creating ${plan.title} and adding it to navigation.` };
      }
      return { creates: [{ path: plan.file, content: plan.content }], open: plan.file,
        done: `Created the page ${plan.title} at ${plan.route}.`, undone: `Undid creating the page ${plan.title}.` };
    }, { since });
    return message(outcome, "The page template or repository changed. Create the page again.");
  }

  async function createNativeFolderPage(route: string) {
    const since = ports.edits.stamp();
    if (!ports.site() || !ports.hasDraftScope()) return;
    const unread = await ports.siteReadForCreate();
    if (!since.holds()) { ports.error(new Error("The repository changed meanwhile. Try again.")); return; }
    if (unread) { ports.error(new Error(unread)); return; }
    const file = nativeRouteFile(route);
    if (ports.drafts().find(draft => draft.path === file)?.deleted) { ports.restoreDeleted(file); return; }
    const outcome = await ports.edits.run(r => {
      const site = r.site();
      if (!site || !ports.hasDraftScope()) return { refuse: "Open a native site first." };
      if (site.routes[route] || r.exists(file)) return { refuse: `The URL ${route} has a page already.` };
      const template = r.source(site.routes["/"]);
      if (template === undefined) return { refuse: NATIVE_HOME_UNREAD };
      const title = routeHeading(route), content = nativePageTemplate(template, title, address(route, r));
      return { creates: [{ path: file, content }], open: file, done: `Created the page ${title} at ${route}.`, undone: `Undid creating the page ${title}.` };
    }, { since });
    const error = message(outcome, "The repository changed meanwhile. Try again.");
    if (error) ports.error(new Error(error));
  }

  return { retitle: retitleNativePage, duplicate: duplicateNativePage, remove: removeNativePagesTarget,
    urlPlan: nativeUrlPlan, changeUrl: changeNativeUrl, moveChoices: nativeMoveChoices,
    dropProblem: nativeDropProblem, confirmMove: confirmNativeMove, moveTo: moveNativePageTo,
    linkSources: nativeLinkSources, onBranchHere,
    explorerTab: () => explorerTab, selectTab: selectExplorerTab, updateTabs: updateExplorerTabs, renderTree: renderPagesTree,
    planNew: planNativeNew, homeTemplate: nativeHomeTemplate, address: nativeAddress, pageLabel: nativePageLabelOf,
    createNew: createNativeNew, createFolderPage: createNativeFolderPage };
}
