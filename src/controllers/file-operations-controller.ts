import type { GuardedEdits, Reads, PlanResult } from "../guarded-edit";
import { pageLinkSources } from "./pages-controller";
import type { FileRowTarget } from "../components/file-row-actions";
import type { createConfirmDialog } from "../components/confirm-dialog";
import type { DraftScope, SavedDraft, draftStore } from "../drafts";
import type { TreeEntry } from "../../shared/types";
import type { FileChange, MovableFile } from "../file-changes";
import { copyPath, filesLinkingTo, linkNote, movedPath, protectedPathProblem, type FileOperation } from "../native-files";
import { editNativeRedirects, groupRouteChanges, isRouteWithin, rewriteRouteLinks, type RouteChange } from "../native-page-moves";
import { assetInUseProblem, assetMoves, assetUsers, planAssetReferenceRewrites } from "../page-builder/asset-references";
import { nativePageRoute } from "../../shared/native-routes";
import { NATIVE_HOME_PAGE, NATIVE_REDIRECTS_PATH, resolveNativeProject } from "../../shared/native-project";

export interface FileOperationsTreeState {
  changes: Map<string, FileChange>;
  deleted: Map<string, SavedDraft>;
  drafted: string[];
}
/** State getters read live host values; transactions and repository I/O stay in the host. */
export interface FileOperationsPorts {
  edits: Pick<GuardedEdits, "run" | "stamp" | "peek">;
  parentOf(path: string): string;
  draftScope(): DraftScope | undefined;
  engaged(): boolean;
  repository(): { full_name: string } | undefined;
  treeState(): FileOperationsTreeState;
  pathNow(path: string, state: FileOperationsTreeState): "file" | "folder" | "deleted" | undefined;
  branchFilesUnder(folder: string): Promise<TreeEntry[]>;
  findEntry(path: string): Promise<TreeEntry | undefined>;
  draftStore(): ReturnType<typeof draftStore>;
  baseSource(path: string): string | undefined;
  readFiles(repo: string, shas: string[]): Promise<Record<string, string>>;
  readFile(repo: string, sha: string): Promise<string>;
  nativeFiles(scope?: DraftScope): string[];
  ensureNativeTextIndex(): Promise<string | undefined>;
  branchPathProblem(path: string): Promise<string | undefined>;
  onBranchHere(path: string): boolean;
  withMovedPageUrls(edits: Map<string, string>, pages: { file: string; moved?: string; from: string; to: string }[], reader: Reads): void;
  readNativeRedirects(): Promise<string | undefined>;
  confirmDialog(): Pick<ReturnType<typeof createConfirmDialog>, "ask" | "choose"> | undefined;
  undoFileChanges(what: { restore?: string[]; moveBack?: string[] }): void;
  duplicateFile(scope: DraftScope, file: MovableFile, to: string): boolean;
  afterFileChanges(): void;
  announce(message: string): void;
  /** A refusal: said in #status and shown on screen. */
  refuse(reason: string): void;
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
  function pageLinks(paths: string[], moves: Map<string, string | undefined>, action: "deleted" | "moved", r: Reads = ports.edits.peek) {
    const site = r.site();
    if (!site) return undefined;
    const routes = paths.flatMap((path) => {
      const route = Object.entries(site.routes).find(([, file]) => file === path)?.[0];
      if (!route) return [];
      const to = moves.get(path);
      return to && (Object.entries(site.routes).find(([, file]) => file === to)?.[0] ?? nativePageRoute(to)) === route ? [] : [route];
    });
    if (!routes.length) return undefined;
    return linkNote(filesLinkingTo(pageLinkSources(ports.nativeFiles(), path => r.source(path)), routes, new Set(paths)), routes, action);
  }

  // Renames or moves a file or folder to `to`: the pages among them that other
  // pages link to are named in a confirmation first.
  async function moveFileTarget(source: FileRowTarget, to: string, operation: "rename" | "move"): Promise<string | undefined> {
    // The stamp, the file list and the target's drafts as the action began: held through the
    // index, the branch reads and the dialog (the guard is proved before the plan and at the write).
    const since = ports.edits.stamp(), key = ports.nativeFiles().sort().join("\n"), drafts = targetDrafts(source);
    const problem = moveProblem(source, to, operation);
    if (problem) return problem;
    if (to === source.path) return undefined;
    const indexed = await ports.ensureNativeTextIndex();
    if (!since.holds()) return "The repository changed meanwhile. Try again.";
    if (indexed) return indexed;
    let found: MovableFile[];
    try {
      const taken = await ports.branchPathProblem(to);
      if (!since.holds()) return "The repository changed meanwhile. Try again.";
      if (taken) return taken;
      found = await targetFiles(source, true);
    } catch (error) { return error instanceof Error ? error.message : "The files could not be read."; }
    if (!since.holds()) return "The repository changed meanwhile. Try again.";
    if (!found.length) return `${source.path} has no files to ${operation}.`;
    const ops = found.map(file => ({ file, to: movedPath(file.path, source.path, to) }));
    const cancel = `Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}`;
    let cancelled = false, urlDialog = false;
    const outcome = await ports.edits.run(async r => {
      for (const file of found) { r.exists(file.path); r.source(file.path); }
      const urls = planFileMoveUrls(ops, r);
      if (urls && ports.confirmDialog()) {
        // Fill the branch cache before the plan's tracked redirects read.
        try { await ports.readNativeRedirects(); }
        catch (error) { return { refuse: error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.` }; }
        urlDialog = true;
        const plan = await moveFilesWithUrls(source, to, operation, ops, urls, r);
        cancelled = "stayed" in plan;
        return plan;
      }
      const moves = ops.map(op => ({ from: op.file.path, to: op.to }));
      const references = r.site() ? nativeAssetReferences(moves, r) : {};
      if ("error" in references) return { refuse: references.error };
      const links = pageLinks(found.map(file => file.path), new Map(ops.map(op => [op.file.path, op.to])), "moved", r);
      if (links && ports.confirmDialog()) {
        const verb = operation === "rename" ? "Rename" : "Move";
        if (!await ports.confirmDialog()!.ask({ title: `${verb} ${source.path} to ${to}?`, notes: [`Its URL changes. ${links}`], action: verb })) {
          cancelled = true;
          return { stayed: cancel };
        }
      }
      const what = source.folder ? `the folder ${source.path}` : source.path;
      return { moves, ...references,
        done: operation === "rename" ? `Renamed ${what} to ${to}.` : `Moved ${what} to ${ports.parentOf(to) || "the top of the repository"}.`,
        undone: `Undid ${operation === "rename" ? "renaming" : "moving"} ${what} to ${to}.` };
    }, { since, guard: () => ports.nativeFiles().sort().join("\n") === key && targetDrafts(source) === drafts });
    if (cancelled) { if (!outcome.ok) ports.announce(cancel); return undefined; }
    if (!outcome.ok) return outcome.reason === "stale"
      ? urlDialog ? `The site changed while the ${operation === "rename" ? "Rename" : "Move"} dialog was open, so nothing was ${operation === "rename" ? "renamed" : "moved"}. Try again to see the latest links.` : "The repository changed meanwhile. Try again."
      : outcome.message;
    if (outcome.message) return outcome.message;
    focusMovedFile(to);
    return undefined;
  }

  function focusMovedFile(to: string) {
    ports.requestAnimationFrame(() => {
      for (let part = ports.parentOf(to); part; part = ports.parentOf(part)) ports.openFolder(part);
      if (!ports.fileRow(to)) ports.renderFileTree();
      if (ports.filesTabOpen()) ports.fileRow(to)?.focus();
    });
  }

  function nativeAssetSnapshot(action: "moved" | "deleted", r: Reads): { sources: Record<string, string>; files: string[] } | { error: string } {
    const linked = pageLinkSources(ports.nativeFiles(), path => r.source(path));
    const missing = Object.entries(linked).find(([, text]) => text === undefined);
    if (missing) return { error: `${missing[0]} is not loaded, so the files that use this cannot be checked; nothing was ${action}.` };
    return { sources: linked as Record<string, string>, files: ports.nativeFiles() };
  }

  function nativeAssetReferences(moves: { from: string; to: string }[], r: Reads, base: Map<string, string> = new Map()): { edits?: Map<string, string> } | { error: string } {
    if (!assetMoves(moves).length) return { edits: base };
    const snap = nativeAssetSnapshot("moved", r);
    if ("error" in snap) return snap;
    try { return { edits: planAssetReferenceRewrites(snap.sources, moves, base) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "The files that use this could not be updated, so nothing was moved." }; }
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
  function planFileMoveUrls(ops: { file: MovableFile; to: string }[], r: Reads): FileMoveUrls | undefined {
    const site = r.site();
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
    for (const [path, source] of Object.entries(pageLinkSources(ports.nativeFiles(), path => r.source(path)))) {
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

  async function moveFilesWithUrls(source: FileRowTarget, to: string, operation: "rename" | "move", ops: { file: MovableFile; to: string }[], urls: FileMoveUrls, r: Reads): Promise<PlanResult> {
    let edits = new Map(urls.links.map(item => [item.path, item.text]));
    ports.withMovedPageUrls(edits, urls.pages, r);
    const redirects = r.source(NATIVE_REDIRECTS_PATH);
    const references = nativeAssetReferences(ops.map(op => ({ from: op.file.path, to: op.to })), r, edits);
    if ("error" in references) return { refuse: references.error };
    edits = references.edits ?? edits;
    const verb = operation === "rename" ? "Rename" : "Move";
    const [first] = urls.changes;
    const single = urls.changes.length === 1;
    const count = urls.links.reduce((sum, item) => sum + item.count, 0);
    const least = urls.complete ? "" : "at least ";
    const linkText = count
      ? `Updates ${least}${count} ${count === 1 ? "link" : "links"} in ${urls.links.length} ${urls.links.length === 1 ? "file" : "files"}.`
      : urls.complete ? "No links to update." : "No links found in the pages read.";
    const redirected = [...urls.redirect.values()].flat();
    const gone = urls.gone.length ? pageLinks(urls.gone, new Map(), "moved", r) : undefined;
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
    if (!answer.value) return { stayed: `Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}` };
    if (redirects !== undefined || (answer.option && redirected.length)) {
      let next = redirects ?? "";
      for (const change of urls.changes)
        next = editNativeRedirects(next, change.from, change.to, answer.option ? urls.redirect.get(change) ?? [] : [], change.subtree);
      if (next !== (redirects ?? "")) edits.set(NATIVE_REDIRECTS_PATH, next);
    }
    const redirectCreate = redirects === undefined ? edits.get(NATIVE_REDIRECTS_PATH) : undefined;
    if (redirectCreate !== undefined) { edits.delete(NATIVE_REDIRECTS_PATH); references.edits?.delete(NATIVE_REDIRECTS_PATH); }
    const what = source.folder ? `the folder ${source.path}` : source.path;
    const summary = count ? `${count} ${count === 1 ? "link" : "links"} updated in ${urls.links.length} ${urls.links.length === 1 ? "file" : "files"}` : "no links to update";
    return {
      moves: ops.map((op) => ({ from: op.file.path, to: op.to })),
      edits: references.edits ?? edits,
      creates: redirectCreate === undefined ? undefined : [{ path: NATIVE_REDIRECTS_PATH, content: redirectCreate }],
      done: `${operation === "rename" ? "Renamed" : "Moved"} ${what} to ${to} — ${summary}${answer.option && redirected.length ? `; ${single ? `${first.from} redirects` : "the old URLs redirect"} there` : ""}.`,
      undone: `Undid ${operation === "rename" ? "renaming" : "moving"} ${what} to ${to}.`,
    };
  }

  // The target's drafts (its own and, for a folder, everything in it): an edit while its Delete
  // waits for the index is evidence even before the index has read the file.
  function targetDrafts(target: FileRowTarget) {
    const scope = ports.draftScope(), prefix = `${target.path}/`;
    const drafts = scope ? ports.draftStore().list(scope) : [];
    return JSON.stringify(drafts.filter(draft => draft.path === target.path || (target.folder && draft.path.startsWith(prefix))).sort((a, b) => a.path.localeCompare(b.path)));
  }

  // Deletes a file or folder after a confirmation naming it (and how many
  // pages link to the pages it takes).
  async function deleteFileTarget(target: FileRowTarget, wording?: { title: string; pages?: boolean }): Promise<string | undefined> {
    if (target.gone) return `${target.path} is deleted already.`;
    const guarded = protectedProblem(target, "delete");
    if (guarded) { ports.errorMessage(new Error(guarded)); ports.refuse(guarded); return guarded; }
    // The stamp, the file list and the target's drafts as the Delete was pressed: a change while
    // the index loads refuses before the dialog opens (the guard is proved before the plan runs).
    const since = ports.edits.stamp();
    const changed = "The repository or source changed meanwhile. Try again.";
    let cancelled = false;
    const cancel = `Cancelled deleting ${target.path}`;
    const key = ports.nativeFiles().sort().join("\n"), drafts = targetDrafts(target);
    const indexed = await ports.ensureNativeTextIndex();
    if (indexed && since.holds()) { ports.errorMessage(new Error(indexed)); return indexed; }
    const outcome = await ports.edits.run(async r => {
      r.exists(target.path);
      let found: MovableFile[];
      try { found = await targetFiles(target, false); }
      catch (error) { return { refuse: error instanceof Error ? error.message : "The files could not be read." }; }
      if (!found.length) return { refuse: `${target.path} has no files to delete.` };
      for (const file of found) { r.exists(file.path); r.source(file.path); }
      if (r.site() && found.some(file => !/\.html?$/i.test(file.path))) {
        const snap = nativeAssetSnapshot("deleted", r);
        if ("error" in snap) return { refuse: snap.error };
        try {
          const inUse = assetInUseProblem(assetUsers(snap.sources, found.map(file => file.path)));
          if (inUse) return { refuse: inUse };
        } catch (error) { return { refuse: error instanceof Error ? error.message : "The files that use this could not be checked, so nothing was deleted." }; }
      }
      const count = found.length, onGitHub = found.some(file => file.sha);
      const links = pageLinks(found.map(file => file.path), new Map(), "deleted", r);
      const title = wording?.title ?? (target.folder ? `Delete the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}?` : `Delete ${target.path}?`);
      const ok = await ports.confirmDialog()?.ask({ title, notes: [
        ...(links ? [links] : []),
        onGitHub ? count === 1 ? "It is removed from GitHub when you save. Until then, Restore brings it back." : "They are removed from GitHub when you save. Until then, Restore brings them back."
          : count === 1 ? "It is not on GitHub yet, so this discards it." : "They are not on GitHub yet, so this discards them.",
      ], action: "Delete" });
      if (!ok) { cancelled = true; return { stayed: cancel }; }
      return { deletes: found.map(file => file.path),
        done: target.folder ? `Deleted the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}.` : `Deleted ${target.path}.`,
        undone: `Undid deleting ${target.path}.` };
    }, { since, guard: () => ports.nativeFiles().sort().join("\n") === key && targetDrafts(target) === drafts });
    if (cancelled) { if (!outcome.ok) ports.announce(cancel); return "Cancelled."; }
    const error = !outcome.ok && outcome.reason === "stale" ? changed : outcome.message;
    if (error) { ports.errorMessage(new Error(error)); if (!outcome.ok && outcome.reason === "refused") ports.refuse(error); return error; }
    ports.requestAnimationFrame(() => { if (ports.filesTabOpen()) (ports.fileRow(target.path) ?? ports.fileRow(ports.parentOf(target.path)))?.focus(); });
    return undefined;
  }

  // A copy of a file beside it, `name-copy.ext`, as a new file.
  async function duplicateFileTarget(target: FileRowTarget) {
    const since = ports.edits.stamp();
    const scope = ports.draftScope();
    if (!scope || target.folder || target.gone) return;
    let found: MovableFile[];
    try {
      found = await targetFiles(target, true);
    } catch (error) {
      ports.errorMessage(error);
      return;
    }
    if (!since.holds()) { const message = "The repository changed meanwhile. Try again."; ports.errorMessage(new Error(message)); ports.refuse(message); return; }
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

  return { deleteFileTarget, duplicateFileTarget, restoreFileTarget, protectedProblem, moveProblem, targetFiles, pageLinks, moveFileTarget, nativeAssetSnapshot, nativeAssetReferences, planFileMoveUrls, moveFilesWithUrls };
}

export type FileOperationsController = ReturnType<typeof createFileOperationsController>;
