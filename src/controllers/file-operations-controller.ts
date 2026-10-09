import type { FileRowTarget } from "../components/file-row-actions";
import type { createConfirmDialog } from "../components/confirm-dialog";
import type { DraftScope, SavedDraft, draftStore } from "../drafts";
import type { TreeEntry } from "../../shared/types";
import type { FileChange, MovableFile } from "../file-changes";
import { copyPath, filesLinkingTo, linkNote, movedPath, protectedPathProblem, type FileOperation } from "../native-files";
import { editNativeRedirects, groupRouteChanges, isRouteWithin, rewriteRouteLinks, type RouteChange } from "../native-page-moves";
import { assetInUseProblem, assetMoves, assetUsers, planAssetReferenceRewrites } from "../page-builder/asset-references";
import { nativePageRoute } from "../../shared/native-routes";
import { NATIVE_HOME_PAGE, NATIVE_CONFIG_PATH, NATIVE_REDIRECTS_PATH, resolveNativeProject, type NativeSite } from "../../shared/native-project";

export interface FileOperationsTreeState {
  changes: Map<string, FileChange>;
  deleted: Map<string, SavedDraft>;
  drafted: string[];
}
/** State getters read live host values; transactions and repository I/O stay in the host. */
export interface FileOperationsPorts {
  parentOf(path: string): string;
  generation(): number;
  setupScope(): string;
  draftScope(): DraftScope | undefined;
  site(): NativeSite | undefined;
  engaged(): boolean;
  repository(): { full_name: string } | undefined;
  treeState(): FileOperationsTreeState;
  treeSignature(state: FileOperationsTreeState): string;
  pathNow(path: string, state: FileOperationsTreeState): "file" | "folder" | "deleted" | undefined;
  branchFilesUnder(folder: string): Promise<TreeEntry[]>;
  findEntry(path: string): Promise<TreeEntry | undefined>;
  draftStore(): ReturnType<typeof draftStore>;
  baseSource(path: string): string | undefined;
  readFiles(repo: string, shas: string[]): Promise<Record<string, string>>;
  readFile(repo: string, sha: string): Promise<string>;
  nativeLinkSources(): Record<string, string | undefined>;
  nativeRouteForPath(path: string): string | undefined;
  nativeFiles(scope?: DraftScope): string[];
  nativeEffectiveSource(path: string, scope?: DraftScope): string | undefined;
  nativeTextIndexScopeKey(): string;
  deleteTargetDraftStamp(path: string, prefix?: string): string;
  ensureNativeTextIndex(): Promise<string | undefined>;
  branchPathProblem(path: string): Promise<string | undefined>;
  onBranchHere(path: string): boolean;
  withMovedPageUrls(edits: Map<string, string>, pages: { file: string; moved?: string; from: string; to: string }[]): void;
  readNativeRedirects(): Promise<string | undefined>;
  confirmDialog(): Pick<ReturnType<typeof createConfirmDialog>, "ask" | "choose"> | undefined;
  applyNativeOperation(operation: {
    moves?: { from: string; to: string }[]; deletes?: string[]; edits?: Map<string, string>;
    expectedSources?: Map<string, string | undefined>; current?: () => boolean;
    done: string; undone: string;
  }): Promise<string | undefined>;
  applyFileOperation(operations: { file: MovableFile; to?: string }[]): Promise<string | undefined>;
  undoFileChanges(what: { restore?: string[]; moveBack?: string[] }): void;
  duplicateFile(scope: DraftScope, file: MovableFile, to: string): boolean;
  afterFileChanges(): void;
  announce(message: string): void;
  errorMessage(error: unknown): void;
  requestAnimationFrame(callback: () => void): void;
  openFolder(path: string): void;
  fileRow(path: string): { focus(): void } | undefined;
  renderFileTree(): void;
  filesTabOpen(): boolean;
}

export function createFileOperationsController(ports: FileOperationsPorts) {
  function restoreFileTarget(target: FileRowTarget) {
    const state = ports.treeState();
    const paths = target.folder
      ? [...state.deleted.keys()].filter((path) => path.startsWith(`${target.path}/`))
      : [target.path];
    ports.undoFileChanges({ restore: paths });
    ports.requestAnimationFrame(() => ports.fileRow(target.path)?.focus());
  }

  const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|tgz|tar|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|webm|mov|wav|ogg)$/i;
  // The protected file a target takes: the home page.
  function protectedProblem(target: FileRowTarget, operation: FileOperation) {
    const home = ports.engaged() ? NATIVE_HOME_PAGE : undefined;
    const inside = (path: string | undefined) => path !== undefined && (path === target.path || (target.folder && path.startsWith(`${target.path}/`)));
    return protectedPathProblem([home].filter(inside) as string[], operation, home, ports.engaged());
  }

  // Why `source` cannot be renamed or moved to `to`, as known without asking GitHub.
  function moveProblem(source: FileRowTarget, to: string, operation: FileOperation): string | undefined {
    if (to === source.path) return undefined;
    const guarded = protectedProblem(source, operation);
    if (guarded) return guarded;
    if (source.folder && to.startsWith(`${source.path}/`)) return `A folder cannot go inside itself.`;
    const state = ports.treeState();
    const now = ports.pathNow(to, state);
    if (now === "file" || now === "folder") return `${to} already exists.`;
    if (now === "deleted") {
      // Only what was renamed away from there may go back.
      const back = source.folder
        ? [...state.deleted.values()].filter((draft) => draft.path.startsWith(`${to}/`)).every((draft) => draft.movedTo?.startsWith(`${source.path}/`))
        : state.deleted.get(to)?.movedTo === source.path;
      if (!back) return `${to} is deleted in your changes. Restore it, or choose another name.`;
    }
    const parts = to.split("/");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      if (ports.pathNow(parent, state) === "file") return `${parent} is a file, so nothing can go in it.`;
    }
    return undefined;
  }

  // The files a target takes: its branch files not deleted in the drafts and
  // its new ones; with `withText`, the text of each branch file that has no
  // draft (a binary or large one goes as its blob).
  async function targetFiles(target: FileRowTarget, withText: boolean): Promise<MovableFile[]> {
    const state = ports.treeState();
    const scope = ports.draftScope();
    if (!scope || !ports.repository()) return [];
    const branch = target.folder ? await ports.branchFilesUnder(target.path) : await (async () => {
      const entry = await ports.findEntry(target.path);
      return entry ? [{ ...entry, path: target.path }] : [];
    })();
    const odd = branch.find((entry) => entry.type === "commit" || entry.mode === "120000");
    if (odd) throw new Error(`${odd.path} is a ${odd.type === "commit" ? "submodule" : "symbolic link"}; change it on GitHub.`);
    const live = branch.filter((entry) => !state.deleted.has(entry.path));
    const out: MovableFile[] = live.map((entry) => ({ path: entry.path, sha: entry.sha, mode: entry.mode }));
    const known = new Set(out.map((file) => file.path));
    for (const path of state.drafted)
      if (!known.has(path) && (target.folder ? path.startsWith(`${target.path}/`) : path === target.path)) out.push({ path });
    if (!withText) return out;
    const wanted = live.filter((entry) => !ports.draftStore().get(scope, entry.path) && (entry.size ?? 0) <= 1024 * 1024 && !BINARY_FILE.test(entry.path));
    const texts = new Map<string, string>();
    for (const entry of wanted) {
      const loaded = ports.baseSource(entry.path);
      if (loaded !== undefined) texts.set(entry.sha, loaded);
    }
    const unread = wanted.filter((entry) => !texts.has(entry.sha));
    if (unread.length) {
      try {
        const read = await ports.readFiles(ports.repository()!.full_name, unread.map((entry) => entry.sha));
        for (const [sha, text] of Object.entries(read)) texts.set(sha, text);
      } catch {
        // One unreadable file (binary, not UTF-8) fails the batch: read each alone.
        const results = await Promise.allSettled(unread.map((entry) => ports.readFile(ports.repository()!.full_name, entry.sha)));
        results.forEach((result, index) => { if (result.status === "fulfilled") texts.set(unread[index].sha, result.value); });
      }
    }
    for (const file of out) if (file.sha && texts.has(file.sha)) file.text = texts.get(file.sha);
    return out;
  }

  // For a confirmation: the pages, components and stylesheets that link to
  // the pages among `paths` whose URL goes away.
  function pageLinks(paths: string[], moves: Map<string, string | undefined>, action: "deleted" | "moved") {
    if (!ports.site()) return undefined;
    const routes = paths.flatMap((path) => {
      const route = ports.nativeRouteForPath(path);
      if (!route) return [];
      const to = moves.get(path);
      return to && (ports.nativeRouteForPath(to) ?? nativePageRoute(to)) === route ? [] : [route];
    });
    if (!routes.length) return undefined;
    return linkNote(filesLinkingTo(ports.nativeLinkSources(), routes, new Set(paths)), routes, action);
  }

  // Renames or moves a file or folder to `to`: the pages among them that other
  // pages link to are named in a confirmation first.
  async function moveFileTarget(source: FileRowTarget, to: string, operation: "rename" | "move"): Promise<string | undefined> {
    const problem = moveProblem(source, to, operation);
    if (problem) return problem;
    if (to === source.path) return undefined;
    const indexed = await ports.ensureNativeTextIndex();
    if (indexed) return indexed;
    const epoch = ports.generation();
    let found: MovableFile[];
    try {
      const taken = await ports.branchPathProblem(to);
      if (taken) return taken;
      found = await targetFiles(source, true);
    } catch (error) {
      return error instanceof Error ? error.message : "The files could not be read.";
    }
    if (epoch !== ports.generation()) return "The repository changed meanwhile. Try again.";
    if (!found.length) return `${source.path} has no files to ${operation}.`;
    const ops = found.map((file) => ({ file, to: movedPath(file.path, source.path, to) }));
    // Pages whose URL changes: their links are updated, as Change URL does.
    // The URL plan reads the site as it is now: pin that, so an edit made while
    // the dialog is open (another tab, an agent) refuses the move instead of
    // being written over with these older texts.
    const pins = nativeMovePins();
    const urls = planFileMoveUrls(ops);
    if (urls && ports.confirmDialog()) return moveFilesWithUrls(source, to, operation, ops, urls, pins);
    const links = pageLinks(found.map((file) => file.path), new Map(ops.map((op) => [op.file.path, op.to])), "moved");
    if (links && ports.confirmDialog()) {
      const verb = operation === "rename" ? "Rename" : "Move";
      const ok = await ports.confirmDialog()!.ask({
        title: `${verb} ${source.path} to ${to}?`,
        notes: [`Its URL changes. ${links}`],
        action: verb,
      });
      if (!ok) { ports.announce(`Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}`); return undefined; }
    }
    const what = source.folder ? `the folder ${source.path}` : source.path;
    const done = operation === "rename" ? `Renamed ${what} to ${to}.` : `Moved ${what} to ${ports.parentOf(to) || "the top of the repository"}.`;
    const native = !!ports.site();
    const moves = ops.map(op => ({ from: op.file.path, to: op.to }));
    const references = native ? nativeAssetReferences(moves) : {};
    if ("error" in references) return references.error;
    const error = native ? await ports.applyNativeOperation({ moves, ...references, done,
      undone: `Undid ${operation === "rename" ? "renaming" : "moving"} ${what} to ${to}.` }) : await ports.applyFileOperation(ops);
    if (error) return error;
    if (!native) ports.announce(done);
    ports.requestAnimationFrame(() => {
      for (let part = ports.parentOf(to); part; part = ports.parentOf(part)) ports.openFolder(part);
      if (!ports.fileRow(to)) ports.renderFileTree();
      if (ports.filesTabOpen()) ports.fileRow(to)?.focus();
    });
    return undefined;
  }

  /**
   * The site's text files as one pinned snapshot for a Files-tab move or
   * delete: every page and stylesheet must be loaded. The file list,
   * generation and repository scope are pinned too. `current` holds while
   * none of them changed.
   */
  function nativeAssetSnapshot(action: "moved" | "deleted"): { sources: Record<string, string>; files: string[]; expectedSources: Map<string, string | undefined>; current: () => boolean } | { error: string } {
    const scope = ports.draftScope(), epoch = ports.generation(), setup = ports.setupScope();
    const linked = ports.nativeLinkSources();
    const missing = Object.entries(linked).find(([, text]) => text === undefined);
    if (missing) return { error: `${missing[0]} is not loaded, so the files that use this cannot be checked; nothing was ${action}.` };
    const sources = linked as Record<string, string>;
    const files = ports.nativeFiles(scope).sort();
    const expectedSources = new Map<string, string | undefined>(Object.entries(sources));
    const key = files.join("\n");
    return { sources, files, expectedSources,
      current: () => ports.generation() === epoch && ports.setupScope() === setup && ports.nativeFiles(ports.draftScope()).sort().join("\n") === key };
  }

  /**
   * A Files-tab move of images or other site files rewrites the pages and
   * stylesheets that use them in the same operation and Undo step, on top of `base`
   * (page link edits of the same move, keyed by the paths after it). Every
   * text file read is pinned, with the file list, so a
   * change in between refuses. With no site files moving: nothing is read.
   */
  function nativeAssetReferences(moves: { from: string; to: string }[], base: Map<string, string> = new Map()): { edits?: Map<string, string>; expectedSources?: Map<string, string | undefined>; current?: () => boolean } | { error: string } {
    const assets = assetMoves(moves);
    if (!assets.length) return {};
    const snap = nativeAssetSnapshot("moved");
    if ("error" in snap) return snap;
    try {
      const edits = planAssetReferenceRewrites(snap.sources, moves, base);
      if (!edits.size) return {};
      return { edits, expectedSources: snap.expectedSources, current: snap.current };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The files that use this could not be updated, so nothing was moved." };
    }
  }

  // What a Files-tab rename or move does to the site's URLs: each page among
  // the files whose route is different where it lands (a page moved with all
  // its subpages is one change of the subtree), the links that then point at
  // the new URLs, and the old URLs on GitHub that could redirect. Undefined
  // when no page's URL changes.
  interface FileMoveUrls {
    changes: RouteChange[];
    links: { path: string; text: string; count: number }[];
    complete: boolean;
    /** Per change, the old URLs on GitHub to keep working. */
    redirect: Map<RouteChange, string[]>;
    live: boolean;
    /** Pages among the files that stop being pages (their links lead nowhere). */
    gone: string[];
    /** Pages whose URL changes: the file, where it goes, its old and new URL. */
    pages: { file: string; moved: string; from: string; to: string }[];
  }
  function planFileMoveUrls(ops: { file: MovableFile; to: string }[]): FileMoveUrls | undefined {
    const site = ports.site();
    if (!site) return undefined;
    const moved = new Map(ops.map((op) => [op.file.path, op.to]));
    const files = ports.nativeFiles().map((path) => moved.get(path) ?? path);
    const after = resolveNativeProject(files);
    if (!after.ok) return undefined;
    const routeOf = new Map(Object.entries(after.site.routes).map(([route, file]) => [file, route]));
    const pairs: [string, string][] = [];
    const gone: string[] = [];
    const pages: FileMoveUrls["pages"] = [];
    for (const [route, file] of Object.entries(site.routes)) {
      const to = moved.get(file);
      if (!to) continue;
      const next = routeOf.get(to);
      if (!next) gone.push(file);
      else if (next !== route) {
        pairs.push([route, next]);
        pages.push({ file, moved: to, from: route, to: next });
      }
    }
    if (!pairs.length) return undefined;
    const changes = groupRouteChanges(Object.keys(site.routes), pairs);
    const links: FileMoveUrls["links"] = [];
    let complete = true;
    for (const [path, source] of Object.entries(ports.nativeLinkSources())) {
      let text = source;
      if (text === undefined) { complete = false; continue; }
      let count = 0;
      for (const change of changes) {
        const rewritten = rewriteRouteLinks(text, change.from, change.to, change.subtree);
        count += rewritten.count;
        text = rewritten.text;
      }
      if (count) links.push({ path: moved.get(path) ?? path, text, count });
    }
    const redirect = new Map<RouteChange, string[]>();
    for (const change of changes) {
      const routes = change.subtree ? Object.keys(site.routes).filter((route) => isRouteWithin(route, change.from)) : [change.from];
      redirect.set(change, routes.filter((route) => pairs.some(([from]) => from === route) && ports.onBranchHere(site.routes[route])));
    }
    const live = pairs.some(([route]) => ports.onBranchHere(site.routes[route]));
    return { changes, links, complete, redirect, live, gone, pages };
  }

  /**
   * Every text the URL plan of a Files-tab move reads (pages, stylesheets, the
   * editor data, the site settings, redirects), with the file list, generation
   * and repository, as they are before its confirmation dialog.
   */
  function nativeMovePins(): { expectedSources: Map<string, string | undefined>; current: () => boolean } {
    const scope = ports.draftScope(), epoch = ports.generation(), setup = ports.setupScope();
    const expectedSources = new Map<string, string | undefined>(Object.entries(ports.nativeLinkSources()));
    for (const path of [NATIVE_CONFIG_PATH, NATIVE_REDIRECTS_PATH]) expectedSources.set(path, ports.nativeEffectiveSource(path, scope));
    const key = ports.nativeFiles(scope).sort().join("\n");
    return { expectedSources, current: () => ports.generation() === epoch && ports.setupScope() === setup && ports.nativeFiles(ports.draftScope()).sort().join("\n") === key
      && [...expectedSources].every(([path, text]) => ports.nativeEffectiveSource(path) === text) };
  }

  async function moveFilesWithUrls(source: FileRowTarget, to: string, operation: "rename" | "move", ops: { file: MovableFile; to: string }[], urls: FileMoveUrls, pins = nativeMovePins()): Promise<string | undefined> {
    const verb = operation === "rename" ? "Rename" : "Move";
    const [first] = urls.changes;
    const single = urls.changes.length === 1;
    const count = urls.links.reduce((sum, item) => sum + item.count, 0);
    const least = urls.complete ? "" : "at least ";
    const linkText = count
      ? `Updates ${least}${count} ${count === 1 ? "link" : "links"} in ${urls.links.length} ${urls.links.length === 1 ? "file" : "files"}.`
      : urls.complete ? "No links to update." : "No links found in the pages read.";
    const redirected = [...urls.redirect.values()].flat();
    const gone = urls.gone.length ? pageLinks(urls.gone, new Map(), "moved") : undefined;
    const answer = await ports.confirmDialog()!.choose({
      title: `${verb} ${source.path} to ${to}?`,
      notes: [
        single ? `Its URL changes from ${first.from} to ${first.to}.` : `URLs change: ${urls.changes.map((change) => `${change.from} → ${change.to}`).join(", ")}.`,
        linkText,
        ...(gone ? [gone] : []),
      ],
      actions: [{ label: verb, value: "go" }],
      option: redirected.length
        ? { label: single ? `Keep the old URL working (${first.from} redirects to ${first.to})` : "Keep the old URLs working (they redirect to the new ones)", checked: urls.live }
        : undefined,
    });
    if (!answer.value) { ports.announce(`Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}`); return undefined; }
    const changedWhileAsked = `The site changed while the ${operation === "rename" ? "Rename" : "Move"} dialog was open, so nothing was ${operation === "rename" ? "renamed" : "moved"}. Try again to see the latest links.`;
    if (!pins.current()) return changedWhileAsked;
    const edits = new Map(urls.links.map((item) => [item.path, item.text]));
    ports.withMovedPageUrls(edits, urls.pages);
    let redirects: string | undefined;
    try {
      redirects = await ports.readNativeRedirects();
    } catch (error) {
      return error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.`;
    }
    if (redirects !== undefined || (answer.option && redirected.length)) {
      let next = redirects ?? "";
      for (const change of urls.changes)
        next = editNativeRedirects(next, change.from, change.to, answer.option ? urls.redirect.get(change) ?? [] : [], change.subtree);
      if (next !== (redirects ?? "")) edits.set(NATIVE_REDIRECTS_PATH, next);
    }
    if (!pins.current()) return changedWhileAsked;
    const references = nativeAssetReferences(ops.map((op) => ({ from: op.file.path, to: op.to })), edits);
    if ("error" in references) return references.error;
    // The write is checked against the texts the plan was made from, before the dialog.
    const expectedSources = new Map([...(references.expectedSources ?? []), ...pins.expectedSources]);
    const current = () => pins.current() && (references.current?.() ?? true);
    const what = source.folder ? `the folder ${source.path}` : source.path;
    const summary = count ? `${count} ${count === 1 ? "link" : "links"} updated in ${urls.links.length} ${urls.links.length === 1 ? "file" : "files"}` : "no links to update";
    const error = await ports.applyNativeOperation({
      moves: ops.map((op) => ({ from: op.file.path, to: op.to })),
      edits,
      ...references,
      expectedSources,
      current,
      done: `${operation === "rename" ? "Renamed" : "Moved"} ${what} to ${to} — ${summary}${answer.option && redirected.length ? `; ${single ? `${first.from} redirects` : "the old URLs redirect"} there` : ""}.`,
      undone: `Undid ${operation === "rename" ? "renaming" : "moving"} ${what} to ${to}.`,
    });
    if (error) return error;
    ports.requestAnimationFrame(() => {
      for (let part = ports.parentOf(to); part; part = ports.parentOf(part)) ports.openFolder(part);
      if (!ports.fileRow(to)) ports.renderFileTree();
      if (ports.filesTabOpen()) ports.fileRow(to)?.focus();
    });
    return undefined;
  }

  // Deletes a file or folder after a confirmation naming it (and how many
  // pages link to the pages it takes).
  async function deleteFileTarget(target: FileRowTarget, wording?: { title: string; pages?: boolean }): Promise<string | undefined> {
    if (target.gone) return `${target.path} is deleted already.`;
    const guarded = protectedProblem(target, "delete");
    if (guarded) { ports.errorMessage(new Error(guarded)); ports.announce(guarded); return guarded; }
    const epoch = ports.generation(), scope = ports.setupScope(), indexScope = ports.nativeTextIndexScopeKey();
    const files = ports.treeSignature(ports.treeState()), source = ports.nativeEffectiveSource(target.path);
    const targetDrafts = ports.deleteTargetDraftStamp(target.path, target.folder ? `${target.path}/` : undefined);
    const stale = () => epoch !== ports.generation() || scope !== ports.setupScope() || indexScope !== ports.nativeTextIndexScopeKey()
      || ports.treeSignature(ports.treeState()) !== files || (source !== undefined && ports.nativeEffectiveSource(target.path) !== source)
      || ports.deleteTargetDraftStamp(target.path, target.folder ? `${target.path}/` : undefined) !== targetDrafts;
    const indexed = await ports.ensureNativeTextIndex();
    if (stale()) { const error = "The repository or source changed meanwhile. Try again."; ports.errorMessage(new Error(error)); return error; }
    if (indexed) { ports.errorMessage(new Error(indexed)); return indexed; }
    let found: MovableFile[];
    try {
      found = await targetFiles(target, false);
    } catch (error) {
      ports.errorMessage(error);
      return error instanceof Error ? error.message : "The files could not be read.";
    }
    if (stale()) return "The repository or source changed meanwhile. Try again.";
    if (!found.length) return `${target.path} has no files to delete.`;
    // A file still in use is not deleted: no page or stylesheet is left pointing at nothing.
    // The snapshot checked here is pinned through the dialog to the write.
    let pins: { expectedSources?: Map<string, string | undefined>; current?: () => boolean } = {};
    if (ports.site() && found.some((file) => !/\.html?$/i.test(file.path))) {
      const snap = nativeAssetSnapshot("deleted");
      let inUse = "error" in snap ? snap.error : undefined;
      if (!("error" in snap)) {
        try { inUse = assetInUseProblem(assetUsers(snap.sources, found.map((file) => file.path))); }
        catch (error) { inUse = error instanceof Error ? error.message : "The files that use this could not be checked, so nothing was deleted."; }
        pins = { expectedSources: snap.expectedSources, current: snap.current };
      }
      if (inUse) { ports.errorMessage(new Error(inUse)); ports.announce(inUse); return inUse; }
    }
    const count = found.length;
    const onGitHub = found.some((file) => file.sha);
    const links = pageLinks(found.map((file) => file.path), new Map(), "deleted");
    const title = wording?.title ?? (target.folder ? `Delete the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}?` : `Delete ${target.path}?`);
    const ok = await ports.confirmDialog()?.ask({
      title,
      notes: [
        ...(links ? [links] : []),
        onGitHub
          ? count === 1 ? "It is removed from GitHub when you save. Until then, Restore brings it back." : "They are removed from GitHub when you save. Until then, Restore brings them back."
          : count === 1 ? "It is not on GitHub yet, so this discards it." : "They are not on GitHub yet, so this discards them.",
      ],
      action: "Delete",
    });
    if (!ok) { ports.announce(`Cancelled deleting ${target.path}`); return "Cancelled."; }
    if (stale()) { const error = "The repository or source changed meanwhile. Try again."; ports.errorMessage(new Error(error)); return error; }
    const done = target.folder ? `Deleted the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}.` : `Deleted ${target.path}.`;
    const native = !!ports.site();
    const error = native ? await ports.applyNativeOperation({ deletes: found.map(file => file.path), ...pins, done, undone: `Undid deleting ${target.path}.` }) : await ports.applyFileOperation(found.map((file) => ({ file })));
    if (error) { ports.errorMessage(new Error(error)); return error; }
    if (!native) ports.announce(done);
    ports.requestAnimationFrame(() => { if (ports.filesTabOpen()) (ports.fileRow(target.path) ?? ports.fileRow(ports.parentOf(target.path)))?.focus(); });
    return undefined;
  }

  // A copy of a file beside it, `name-copy.ext`, as a new file.
  async function duplicateFileTarget(target: FileRowTarget) {
    const scope = ports.draftScope();
    if (!scope || target.folder || target.gone) return;
    let found: MovableFile[];
    try {
      found = await targetFiles(target, true);
    } catch (error) {
      ports.errorMessage(error);
      return;
    }
    const [file] = found;
    if (!file) return;
    const state = ports.treeState();
    const to = copyPath(target.path, (path) => ports.pathNow(path, state) !== undefined);
    if (!ports.duplicateFile(scope, file, to)) { ports.errorMessage(new Error(`${target.path} could not be copied.`)); return; }
    if (ports.draftStore().error) { ports.errorMessage(new Error(ports.draftStore().error!)); return; }
    ports.afterFileChanges();
    ports.announce(`Duplicated ${target.path} as ${to}.`);
    ports.requestAnimationFrame(() => ports.fileRow(to)?.focus());
  }

  return { deleteFileTarget, duplicateFileTarget, restoreFileTarget, protectedProblem, moveProblem, targetFiles, pageLinks, moveFileTarget, nativeAssetSnapshot, nativeAssetReferences, planFileMoveUrls, nativeMovePins, moveFilesWithUrls };
}

export type FileOperationsController = ReturnType<typeof createFileOperationsController>;
