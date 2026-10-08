import { nativeNewTarget, firstHeadingText, buildNativePagesTree, nativePageLabel, type NativeNewTarget, type NativePageNode, type NativeSiteTree } from "../native-pages";
import { nativePageTemplate, normalizeRoute, routeHeading, type Checked } from "../native-create";
import { editNavigation, readNavigation } from "../page-builder/site-navigation";
import { parentRoute, routeSlug, routeFolder, isRouteWithin, movedRoute, planPageMove, rewriteRouteLinks, editNativeRedirects, type PageMovePlan, type FileMove } from "../native-page-moves";
import { isFolderRoute, nativeRouteFile } from "../../shared/native-routes";
import { NATIVE_REDIRECTS_PATH, nativePageUrl, nativePageWithUrl, nativePageWithDetail, nativeSitePaths, type NativeSite } from "../../shared/native-project";
import type { NativeNewRequest, NativePagesTarget } from "../components/pages-tree";
import type { PagePickerItem } from "../components/page-picker";
import type { UrlPlan } from "../components/url-change";
import type { SavedDraft } from "../drafts";

export interface PagesOperation {
  expectedSources?: Map<string, string | undefined>;
  moves?: FileMove[];
  deletes?: string[];
  creates?: { path: string; content: string }[];
  edits?: Map<string, string>;
  open?: string;
  done: string;
  undone: string;
  focus?: { file?: string; route?: string };
  current?: () => boolean;
}

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
  site(): NativeSite | undefined;
  routeForPath(file: string): string | undefined;
  source(path: string): string | undefined;
  files(): string[];
  baseFiles(): string[];
  drafts(): SavedDraft[];
  hasDraftScope(): boolean;
  scope(): string;
  generation(): number;
  indexScope(): string;
  exists(path: string): boolean;
  routeInfo(route: string, site: NativeSite): { title?: string };
  titles(site: NativeSite): Record<string, string | undefined>;
  /** `.editor/config.json`'s `site.url`, read now. */
  siteUrl(): string | undefined;
  writeMeta(file: string, field: "title", value: string, flush: false): Promise<string | undefined>;
  commitPage(input: { file: string; route: string; title: string; content: string; done: string }): Promise<string | undefined>;
  operation(operation: PagesOperation): Promise<string | undefined>;
  ensureIndex(): Promise<string | undefined>;
  readRedirects(): Promise<string | undefined>;
  withMovedPageUrls(edits: Map<string, string>, pages: { file: string; moved?: string; from: string; to: string }[]): void;
  pageLinks(paths: string[], moves: Map<string, string>, action: "deleted"): string | undefined;
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
  navigationTarget(pagePath: string | undefined): { path: string; source: string; list: NonNullable<ReturnType<typeof readNavigation>>; shared: boolean } | undefined;
  restoreDeleted(file: string): void;
  announce(message: string): void;
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

export function pageDeleteDraftStamp(drafts: readonly SavedDraft[], path: string, prefix?: string): string {
  return JSON.stringify(drafts.filter((draft) => draft.path === path || (prefix && draft.path.startsWith(prefix))).sort((a, b) => a.path.localeCompare(b.path)));
}

export function createPagesController(ports: PagesPorts) {
  const changedMove = "The repository or source changed meanwhile. Review it and try again.";
  function moveProof(target: NativePagesTarget) {
    const site = ports.site(), epoch = ports.generation(), scope = ports.scope(), index = ports.indexScope();
    const files = JSON.stringify([...ports.files()].sort()), routes = JSON.stringify(site?.routes);
    const sources = new Map(Object.entries(nativeLinkSources()).filter(([, source]) => source !== undefined));
    const drafts = deleteTargetDraftStamp(target.file ?? "", isFolderRoute(target.route) ? routeFolder(target.route) : undefined);
    return () => site === ports.site() && epoch === ports.generation() && scope === ports.scope() && index === ports.indexScope()
      && routes === JSON.stringify(ports.site()?.routes) && files === JSON.stringify([...ports.files()].sort())
      && (!target.file || ports.routeForPath(target.file) === target.route)
      && [...sources].every(([path, source]) => ports.source(path) === source)
      && drafts === deleteTargetDraftStamp(target.file ?? "", isFolderRoute(target.route) ? routeFolder(target.route) : undefined);
  }

  // ---- The Pages tab's Rename, Duplicate and Delete. ----

  // A page's title in its head, as the Page block's Title field sets it.
  async function retitleNativePage(file: string, title: string): Promise<string | undefined> {
    const route = ports.routeForPath(file);
    if (!ports.site() || !route) return "This page has no URL in the site.";
    const epoch = ports.generation(), scope = ports.scope();
    const error = await ports.writeMeta(file, "title", title, false);
    if (error) return error;
    // The metadata write legitimately rebuilds the site; guard workspace and target URL.
    if (epoch !== ports.generation() || scope !== ports.scope() || ports.routeForPath(file) !== route) return "The repository changed meanwhile. Try again.";
    ports.refreshMeta();
    renderPagesTree();
    ports.refreshLabel();
    return undefined;
  }

  // A copy of a page beside it: `<slug>-copy/index.html` (then `-copy-2`, …),
  // its content as it is now, titled "… (copy)".
  async function duplicateNativePage(file: string) {
    const site = ports.site();
    const route = ports.routeForPath(file);
    if (!site || !route) return;
    const name = route === "/" ? "home" : routeSlug(route).replace(/\.html$/, "");
    const parent = route === "/" ? "/" : parentRoute(route);
    let target: Checked<NativeNewTarget> | undefined;
    for (let n = 1; n < 100; n++) {
      target = nativeNewTarget(parent, `${name}-copy${n > 1 ? `-${n}` : ""}`, { route: (r) => site.routes[r], exists: (path) => ports.exists(path) });
      if (target.ok) break;
    }
    if (!target?.ok) { ports.error(new Error(target?.error ?? "No name is free for the copy.")); return; }
    const original = ports.source(file);
    if (original === undefined) { ports.error(new Error("The page could not be read.")); return; }
    const label = ports.routeInfo(route, site).title?.trim() || (route === "/" ? "Home" : firstHeadingText(original)) || routeHeading(route);
    const title = `${label} (copy)`;
    const error = await ports.commitPage({
      file: target.value.file, route: target.value.route, title,
      content: nativePageWithUrl(nativePageWithDetail(original, "title", title), nativeAddress(target.value.route)),
      done: `Duplicated ${label} as ${title} at ${target.value.route}.`,
    });
    if (error) ports.error(new Error(error));
  }

  // Index loading fills source caches; draft mutations are independent evidence
  // that the target changed while its delete entry waited for that index.
  function deleteTargetDraftStamp(path: string, prefix?: string): string {
    return pageDeleteDraftStamp(ports.drafts(), path, prefix);
  }

  // Delete in the Pages tab. A page with subpages asks whether they go too
  // ("Delete About and its 2 subpages", with everything in its folder) or
  // stay ("Delete only this page": its folder is then a URL with no page).
  async function removeNativePagesTarget(target: NativePagesTarget) {
    const site = ports.site();
    if (!target.file || !site || !ports.confirmation()) return;
    const scope = ports.scope(), epoch = ports.generation(), indexScope = ports.indexScope();
    const source = ports.source(target.file), fileList = [...ports.files()].sort().join("\n");
    const targetDrafts = deleteTargetDraftStamp(target.file, isFolderRoute(target.route) ? routeFolder(target.route) : undefined);
    const stale = () => scope !== ports.scope() || epoch !== ports.generation() || indexScope !== ports.indexScope()
      || ports.site()?.routes[target.route] !== target.file || (source !== undefined && ports.source(target.file!) !== source) || [...ports.files()].sort().join("\n") !== fileList
      || deleteTargetDraftStamp(target.file!, isFolderRoute(target.route) ? routeFolder(target.route) : undefined) !== targetDrafts;
    const indexed = await ports.ensureIndex();
    if (stale()) { ports.error(new Error("The repository or source changed meanwhile. Try again.")); return; }
    if (indexed) { ports.error(new Error(indexed)); return; }
    const files = ports.files();
    const folder = isFolderRoute(target.route) ? routeFolder(target.route) : undefined;
    const inside = folder === undefined ? [] : files.filter((path) => path.startsWith(folder) && path !== target.file);
    const everything = [target.file, ...inside];
    const onGitHub = (paths: string[]) => paths.some((path) => ports.baseFiles().includes(path));
    const links = ports.pageLinks(everything, new Map(), "deleted");
    const saveNote = (paths: string[]) => onGitHub(paths)
      ? "It is removed from GitHub when you save. Until then, Restore brings it back."
      : "It is not on GitHub yet, so this discards it.";
    let paths = [target.file];
    // Its card in a grid listing pages (src/page-builder/cards.ts) can go with it.
    const card = ports.cardsLinkingTo(target.route, new Set(everything));
    const cardOption = card ? { label: card.label, checked: true } : undefined;
    // The card's edits and the deletes were computed from these sources: an
    // agent or resync write while the dialog is open refuses, never overwritten.
    const expectedSources = new Map([...everything, ...(card?.edits.keys() ?? [])].map((path) => [path, ports.source(path)] as const));
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
      if (!answer.value) { ports.announce(`Cancelled deleting ${target.label}`); return; }
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
      if (answer.value !== "confirm") { ports.announce(`Cancelled deleting ${target.file}`); return; }
      if (inside.length) paths = everything;
      removeCard = answer.option;
    }
    const parent = parentRoute(target.route);
    const what = paths.length > 1 && target.subpages
      ? `${target.label} and its ${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`
      : `the page ${target.label}`;
    if (scope !== ports.scope() || epoch !== ports.generation()) { ports.error(new Error("The repository changed meanwhile. Try again.")); return; }
    // Unless only the page goes, its folder goes as the dialog listed it: a file
    // added to it (or gone) while the dialog was open refuses, never left behind.
    const listed = (list: string[]) => [...list].sort().join("\n");
    if (paths.length > 1 || target.subpages === 0) {
      const insideNow = folder === undefined ? [] : ports.files().filter((path) => path.startsWith(folder) && path !== target.file);
      if (listed(insideNow) !== listed(inside)) { ports.error(new Error("The repository or source changed meanwhile. Review the latest files and try again.")); return; }
    }
    const error = await ports.operation({
      expectedSources,
      current: () => !stale(),
      deletes: paths,
      ...(removeCard && card ? { edits: card.edits } : {}),
      done: `Deleted ${what}${removeCard && card ? " and its card" : ""}.`,
      undone: `Undid deleting ${what}.`,
      focus: { route: parent === "/" ? undefined : parent },
    });
    if (error) ports.error(new Error(error));
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
  function planNativeUrlChange(file: string, value: string): Checked<NativeUrlChange> {
    const site = ports.site();
    const from = ports.routeForPath(file);
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
    for (const [path, source] of Object.entries(nativeLinkSources())) {
      if (source === undefined) { complete = false; continue; }
      const rewritten = rewriteRouteLinks(source, from, to);
      if (rewritten.count) links.push({ path: moved.get(path) ?? path, from: path, text: rewritten.text, count: rewritten.count });
    }
    const redirect = move.routes.filter(([route]) => onBranchHere(site.routes[route])).map(([route]) => route);
    return { ok: true, value: { from, to, label: nativePageLabelOf(file), move, links, complete, redirect, live: onBranchHere(file) } };
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
    const planned = planNativeUrlChange(file, value);
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
  async function changeNativeUrl(file: string, value: string, keep: boolean, openingSources?: Map<string, string | undefined>): Promise<string | undefined> {
    const site = ports.site(), index = ports.indexScope();
    const epoch = ports.generation(), scope = ports.scope(), paths = JSON.stringify([...ports.files()].sort()), routes = JSON.stringify(ports.site()?.routes);
    const expectedSources = new Map(openingSources ?? Object.entries(nativeLinkSources()).filter(([, source]) => source !== undefined));
    const stale = () => site !== ports.site() || index !== ports.indexScope() || epoch !== ports.generation() || scope !== ports.scope() || paths !== JSON.stringify([...ports.files()].sort()) || routes !== JSON.stringify(ports.site()?.routes) ||
      [...expectedSources].some(([path, source]) => ports.source(path) !== source);
    const changed = "The repository or source changed while preparing the URL change. Review it and try again.";
    if (stale()) return changed;
    const indexed = await ports.ensureIndex();
    if (stale()) return changed;
    if (indexed) return indexed;
    for (const [path, source] of Object.entries(nativeLinkSources())) if (!expectedSources.has(path)) expectedSources.set(path, source);
    expectedSources.set(NATIVE_REDIRECTS_PATH, ports.source(NATIVE_REDIRECTS_PATH));
    const planned = planNativeUrlChange(file, value);
    if (!planned.ok) return planned.error === UNCHANGED_URL ? undefined : planned.error;
    const change = planned.value;
    const edits = new Map(change.links.map((item) => [item.path, item.text]));
    const moved = new Map(change.move.moves.map((item) => [item.from, item.to]));
    ports.withMovedPageUrls(edits, change.move.routes.map(([from, to]) => ({ file: ports.site()!.routes[from], moved: moved.get(ports.site()!.routes[from]), from, to })));
    let redirects: string | undefined;
    try {
      redirects = await ports.readRedirects();
      if (stale()) return changed;
    } catch (error) {
      return error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.`;
    }
    const redirected = keep ? change.redirect : [];
    if (redirects !== undefined || redirected.length) {
      const next = editNativeRedirects(redirects, change.from, change.to, redirected);
      if (next !== (redirects ?? "")) edits.set(NATIVE_REDIRECTS_PATH, next);
    }
    const count = change.links.reduce((sum, item) => sum + item.count, 0);
    const summary = count
      ? `${count} ${count === 1 ? "link" : "links"} updated in ${change.links.length} ${change.links.length === 1 ? "file" : "files"}`
      : "no links to update";
    if (stale()) return changed;
    return ports.operation({
      expectedSources,
      current: () => !stale(),
      moves: change.move.moves,
      edits,
      done: `URL changed to ${change.to} — ${summary}${redirected.length ? `; ${change.from} redirects there` : ""}.`,
      undone: `Undid changing the URL of ${change.label} to ${change.to}.`,
      focus: { file: change.move.target },
    });
  }

  // The rows of Move to…: the top level, then every folder URL of the site,
  // the page itself, its subpages and where it is now not chosen.
  function nativeMoveChoices(target: NativePagesTarget): PagePickerItem[] {
    const site = ports.site();
    if (!site) return [];
    const tree = buildNativePagesTree({ routes: site.routes, titles: ports.titles(site), heading: (file) => firstHeadingText(ports.source(file)) });
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
  async function confirmNativeMove(source: NativePagesTarget, parent: string) {
    if (!source.file || !ports.confirmation()) return;
    let current = moveProof(source);
    const indexed = await ports.ensureIndex();
    if (!current()) { ports.error(new Error(changedMove)); return; }
    if (indexed) { ports.announce(indexed); ports.error(new Error(indexed)); return; }
    current = moveProof(source);
    const to = movedRoute(parent, source.route);
    const planned = planNativeUrlChange(source.file, to);
    if (!planned.ok) { ports.announce(planned.error); ports.error(new Error(planned.error)); return; }
    const change = planned.value;
    const openingSources = new Map(Object.entries(nativeLinkSources()).filter(([, source]) => source !== undefined));
    const answer = await ports.confirmation()!.choose({
      title: `Move ${change.label} to ${to}?`,
      notes: [`Its URL changes from ${change.from} to ${to}.`, describeUrlChange(change), ...change.move.warnings],
      actions: [{ label: "Move", value: "move" }],
      option: change.redirect.length ? { label: `Keep the old URL working (${change.from} redirects to ${to})`, checked: change.live } : undefined,
    });
    if (!current()) { ports.error(new Error(changedMove)); return; }
    if (!answer.value) { ports.announce(`Cancelled moving ${change.label}`); return; }
    const error = await changeNativeUrl(source.file, to, answer.option, openingSources);
    if (error) ports.error(new Error(error));
  }

  async function moveNativePageTo(target: NativePagesTarget) {
    if (!ports.picker() || !target.file) return;
    // The choices are labelled by page titles, which come with the site index.
    let current = moveProof(target);
    const problem = await ports.ensureIndex();
    if (!current()) { ports.error(new Error(changedMove)); return; }
    if (problem) { ports.error(new Error(problem)); return; }
    current = moveProof(target);
    const parent = await ports.picker()!.pick({ title: `Move ${target.label} to…`, items: nativeMoveChoices(target) });
    if (!current()) { ports.error(new Error(changedMove)); return; }
    if (parent === undefined) { ports.announce(`Cancelled moving ${target.label}`); return; }
    await confirmNativeMove(target, parent);
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
  function planNativeNew(request: NativeNewRequest, create = false): Checked<NativeNewPlan> {
    const site = ports.site();
    if (!site || !ports.hasDraftScope()) return { ok: false, error: "Open a native site first." };
    const title = request.title.trim();
    if (!title) return { ok: false, error: "Enter the page's title." };
    if (!request.slug.trim()) return { ok: false, error: "The title gives no URL: add letters or digits, or change the URL." };
    const target = nativeNewTarget(request.parent, request.slug, {
      route: (route) => site.routes[route],
      exists: (path) => ports.exists(path),
    });
    if (!target.ok) return target;
    const template = nativeHomeTemplate();
    if (!create) return { ok: true, value: { ...target.value, title, content: "" } };
    if (template === undefined) return { ok: false, error: NATIVE_HOME_UNREAD };
    return { ok: true, value: { ...target.value, title, content: nativePageTemplate(template, title, nativeAddress(target.value.route)) } };
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
  async function createNativeNew(request: NativeNewRequest): Promise<string | undefined> {
    // The page is made from the home page's document, so that is read first.
    const unread = await ports.siteReadForCreate();
    if (unread) return unread;
    const planned = planNativeNew(request, true);
    if (!planned.ok) return planned.error;
    const plan = planned.value;
    const epoch = ports.generation(), scope = ports.scope();
    const expectedSources = new Map([...nativeSitePaths(ports.site()!)].map((path) => [path, ports.source(path)] as const));
    // With its card in the grid that lists its siblings: the page made from a sibling's, as one operation.
    if (request.addCard) {
      const withCard = ports.createWithCard(request);
      if (withCard) return withCard;
    }
    if (request.addToNavigation && request.parent === "/") {
      const problem = await ports.ensureIndex();
      if (problem) return problem;
      if (epoch !== ports.generation() || scope !== ports.scope() || [...expectedSources].some(([path, source]) => ports.source(path) !== source)) return "The page template or repository changed. Create the page again.";
      const nav = ports.navigationTarget(ports.site()?.routes["/"]);
      if (!nav) return "No editable header navigation found. Uncheck Add to navigation to create only the page.";
      let navigation: string;
      try { navigation = editNavigation(nav.source, nav.list, [...nav.list.links, { href: plan.route, label: plan.title }]); }
      catch (error) { return error instanceof Error ? error.message : "Navigation could not be changed."; }
      // For a plain header, copy its updated navigation to the new page as well.
      let page = plan.content;
      if (!nav.shared) {
        const list = readNavigation(page);
        if (list) page = editNavigation(page, list, [...nav.list.links, { href: plan.route, label: plan.title }]);
      }
      return ports.operation({ expectedSources, creates: [{ path: plan.file, content: page }], edits: new Map([[nav.path, navigation]]), open: plan.file, done: `Created ${plan.title} and added it to navigation as drafts.`, undone: `Undid creating ${plan.title} and adding it to navigation.` });
    }
    return ports.commitPage({ file: plan.file, route: plan.route, title: plan.title, content: plan.content, done: `Created the page ${plan.title} at ${plan.route}.` });
  }

  // A URL with subpages and no page of its own gets its page, `index.html` in
  // its folder, made like a new page.
  async function createNativeFolderPage(route: string) {
    if (!ports.site() || !ports.hasDraftScope()) return;
    // Made from the home page's document, so that is read first.
    const unread = await ports.siteReadForCreate();
    if (unread) { ports.error(new Error(unread)); return; }
    const site = ports.site();
    if (!site || !ports.hasDraftScope()) return;
    const file = nativeRouteFile(route);
    // Its page deleted in the drafts: Create page brings it back.
    if (ports.drafts().find((draft) => draft.path === file)?.deleted) { ports.restoreDeleted(file); return; }
    if (site.routes[route] || ports.exists(file)) { ports.error(new Error(`The URL ${route} has a page already.`)); return; }
    const title = routeHeading(route);
    const content = nativePageTemplate(nativeHomeTemplate(), title, nativeAddress(route));
    const error = await ports.commitPage({ file, route, title, content, done: `Created the page ${title} at ${route}.` });
    if (error) ports.error(new Error(error));
  }

  return { retitle: retitleNativePage, duplicate: duplicateNativePage, remove: removeNativePagesTarget,
    urlPlan: nativeUrlPlan, changeUrl: changeNativeUrl, moveChoices: nativeMoveChoices,
    dropProblem: nativeDropProblem, confirmMove: confirmNativeMove, moveTo: moveNativePageTo,
    linkSources: nativeLinkSources, onBranchHere, deleteDraftStamp: deleteTargetDraftStamp,
    explorerTab: () => explorerTab, selectTab: selectExplorerTab, updateTabs: updateExplorerTabs, renderTree: renderPagesTree,
    planNew: planNativeNew, homeTemplate: nativeHomeTemplate, address: nativeAddress, pageLabel: nativePageLabelOf,
    createNew: createNativeNew, createFolderPage: createNativeFolderPage };
}
