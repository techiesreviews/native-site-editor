import { operationBinaryFiles } from "../../shared/media-kinds-policies";
import { onGithubPages, GITHUB_PAGES_REDIRECT_NOTE } from "../../shared/github-pages";
import { createFileOperationChecks } from "./file-operation-checks";
import { renamedFamily, familyMembers } from "../page-builder/media-families";
import { isRenamableMedia, mediaFileName, suggestMediaName } from "../page-builder/media-names";
import type { GuardedEdits, Reads, PlanResult } from "../guarded-edit";
import { pageLinkSources } from "./pages-controller";
import type { FileRowTarget } from "../components/file-row-actions";
import type { createConfirmDialog } from "../components/confirm-dialog";
import type { DraftScope, SavedDraft, draftStore } from "../drafts";
import type { TreeEntry } from "../../shared/types";
import type { FileChange, MovableFile } from "../file-changes";
import { copyPath, movedPath } from "../native-files";
import { editNativeRedirects, groupRouteChanges, isRouteWithin, rewriteRouteLinks, type RouteChange } from "../native-page-moves";
import { NATIVE_CONFIG_PATH, NATIVE_REDIRECTS_PATH, resolveNativeProject, nativeSitePrefix, nativeSiteSettings } from "../../shared/native-project";

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
  readMediaText?(path: string): Promise<string | undefined>;
  /** Byte stores for Recently removed's browser copies (tests); the browser's IndexedDB by default. */
  removalStores?: () => import("../page-builder/media-file-removal").RemovalStores;
  origins?(): string[];
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
  const { restoreFileTarget, protectedProblem, moveProblem, targetFamily, targetDrafts, pageLinks, isMediaTarget, mediaTaken, fileMoveProblem } = createFileOperationChecks(ports);

  const BINARY_FILE = operationBinaryFiles;
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

  async function familyFiles(target: FileRowTarget, withText: boolean): Promise<MovableFile[]> {
    const family = targetFamily(target);
    if (!family) return targetFiles(target, withText);
    const paths = familyMembers(family);
    const out: MovableFile[] = [];
    for (const path of paths) {
      const files = await targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, withText);
      if (!files.length) throw new Error(`${path} is no longer available. Try again.`);
      out.push(...files);
    }
    return out;
  }

  // Renames or moves a file or folder to `to`: the pages among them that other
  // pages link to are named in a confirmation first.
  async function moveFileTarget(source: FileRowTarget, to: string, operation: "rename" | "move", options?: { keepOldAddress?: boolean }): Promise<string | undefined> {
    // The stamp, the file list and the target's drafts as the action began: held through the
    // index, the branch reads and the dialog (the guard is proved before the plan and at the write).
    const since = ports.edits.stamp(), key = ports.nativeFiles().sort().join("\n"), drafts = targetDrafts(source);
    // Media files (what the Media screen lists) rename by the media plan; fonts, archives and the rest keep the file rename.
    const media = isMediaTarget(source);
    if (media && operation === "rename") to = to.slice(0, to.lastIndexOf("/") + 1) + mediaFileName(source.path, to.split("/").at(-1)!);
    const problem = fileMoveProblem(source, to, operation);
    if (problem) return problem;
    if (to === source.path) return undefined;
    const rename = media ? await import("../page-builder/media-rename") : undefined;
    if (!since.holds()) return "The repository changed meanwhile. Try again.";
    const takenMessage = (destination: string) => `${to} is taken. Try ${suggestMediaName(to, candidate => candidate === destination || mediaTaken(source, candidate))}.`;
    const indexed = await ports.ensureNativeTextIndex();
    if (!since.holds()) return "The repository changed meanwhile. Try again.";
    if (indexed) return indexed;
    const family = targetFamily(source);
    const familyMoves = family ? renamedFamily(family, to).filter(move => move.from !== move.to) : undefined;
    let found: MovableFile[];
    try {
      for (const move of familyMoves ?? [{ from: source.path, to }]) {
        const target = { path: move.from, name: move.from, folder: source.folder };
        const problem = moveProblem(target, move.to, operation);
        if (problem) return problem;
        const taken = await ports.branchPathProblem(move.to);
        if (!since.holds()) return "The repository changed meanwhile. Try again.";
        if (taken) return rename ? takenMessage(move.to) : taken;
      }
      found = await familyFiles(source, true);
    } catch (error) { return error instanceof Error ? error.message : "The files could not be read."; }
    if (!since.holds()) return "The repository changed meanwhile. Try again.";
    if (!found.length) return `${source.path} has no files to ${operation}.`;
    if (rename && ports.readMediaText) {
      const unread = await rename.readMediaRenameSources(ports.nativeFiles(), path => ports.readMediaText!(path), () => since.holds());
      if (unread) return unread;
    }
    const destinations = new Map(familyMoves?.map(move => [move.from, move.to]));
    const ops = found.filter(file => !familyMoves || destinations.has(file.path))
      .map(file => ({ file, to: destinations.get(file.path) ?? movedPath(file.path, source.path, to) }));
    const cancel = `Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}`;
    let cancelled = false, urlDialog = false;
    const outcome = await ports.edits.run(async r => {
      for (const file of found) { r.exists(file.path); r.source(file.path); }
      if (rename) return rename.filesMediaRenamePlan({ from: source.path, to, operation, paths: ports.nativeFiles(),
        source: path => r.source(path), exists: path => r.exists(path), site: r.site(), origins: ports.origins?.() ?? [], keepOldAddress: options?.keepOldAddress });
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
      const references = r.site() ? await nativeAssetReferences(moves, r) : {};
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

  async function nativeAssetReferences(moves: { from: string; to: string }[], r: Reads, base: Map<string, string> = new Map()): Promise<{ edits?: Map<string, string> } | { error: string }> {
    const { assetMoves, planAssetReferenceRewrites } = await import("../page-builder/asset-references");
    if (!assetMoves(moves).length) return { edits: base };
    const snap = nativeAssetSnapshot("moved", r);
    if ("error" in snap) return snap;
    try { return { edits: planAssetReferenceRewrites(snap.sources, moves, base, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH))) }; }
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
        const rewritten = rewriteRouteLinks(text, change.from, change.to, change.subtree, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)));
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
    const references = await nativeAssetReferences(ops.map(op => ({ from: op.file.path, to: op.to })), r, edits);
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
        ...(redirected.length && onGithubPages(nativeSiteSettings(r.source(NATIVE_CONFIG_PATH)).url, r.exists("CNAME")) ? [GITHUB_PAGES_REDIRECT_NOTE] : []),
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
        next = editNativeRedirects(next, change.from, change.to, answer.option ? urls.redirect.get(change) ?? [] : [], change.subtree, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)));
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

  // Deletes a file or folder after a confirmation naming it (and how many
  // pages link to the pages it takes).
  async function deleteFileTarget(target: FileRowTarget, wording?: { title: string; pages?: boolean }, agent = false): Promise<string | undefined> {
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
    // Uploaded and moved files hold no source to record: their draft revisions are the proof.
    const opaqueDrafts = () => {
      const scope = ports.draftScope();
      return JSON.stringify(scope ? ports.draftStore().list(scope).filter(draft => draft.opaque).map(draft => [draft.path, draft.sourceSha, Boolean(draft.deleted)]).sort() : []);
    };
    const opaque = opaqueDrafts();
    const readTexts = new Map<string, string | undefined>();
    // A change meanwhile stops the reading; the guarded run below then refuses it as stale.
    if (ports.readMediaText && since.holds()) {
      const { isMediaTextFile } = await import("../page-builder/media-mentions");
      const textFiles = since.holds() ? [...ports.nativeFiles().filter(isMediaTextFile), ...(agent || target.folder || isRenamableMedia(target.path)) && ports.nativeFiles().includes(".editor/media.json") ? [".editor/media.json"] : []] : [];
      try {
        for (let at = 0; at < textFiles.length && since.holds(); at += 12)
          await Promise.all(textFiles.slice(at, at + 12).map(async path => { readTexts.set(path, await ports.readMediaText!(path)); }));
      } catch (error) { ports.errorMessage(error); return "The files that use this could not be read."; }
    }
    const outcome = await ports.edits.run(async r => {
      r.exists(target.path);
      let found: MovableFile[];
      try {
        found = await familyFiles(target, false);
        if (agent) {
          const { agentRemovalPaths } = await import("../page-builder/agent-media-removal");
          const expanded = agentRemovalPaths(found.map(file => file.path), ports.nativeFiles());
          const known = new Set(found.map(file => file.path));
          for (const path of expanded) if (!known.has(path)) {
            const members = await targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, false);
            if (!members.length) return { refuse: `${path} is no longer available. Try again.` };
            found.push(...members);
          }
        }
      }
      catch (error) { return { refuse: error instanceof Error ? error.message : "The files could not be read." }; }
      if (!found.length) return { refuse: `${target.path} has no files to delete.` };
      for (const file of found) { r.exists(file.path); r.source(file.path); }
      let recordsPlan: { deletes?: string[]; edits?: Map<string, string>; creates?: { path: string; content: string }[]; keep?: () => Promise<void> } = {};
      if (agent || found.some(file => isRenamableMedia(file.path))) {
        const { filesRemovalPlan } = await import("../page-builder/media-file-removal");
        const plan = await filesRemovalPlan(ports, r, found, since, ports.removalStores, agent);
        if ("refuse" in plan) return plan;
        recordsPlan = plan;
      }
      if (r.site() && found.some(file => !/\.html?$/i.test(file.path))) {
        const { isMediaTextFile } = await import("../page-builder/media-mentions");
        if (!since.holds()) return { refuse: changed };
        const sources = Object.fromEntries(ports.nativeFiles().filter(isMediaTextFile).map(path => [path, r.source(path) ?? readTexts.get(path)]));
        const missing = Object.keys(sources).find(path => sources[path] === undefined);
        if (missing) return { refuse: `${missing} is not loaded, so the files that use this cannot be checked; nothing was deleted.` };
        const snap = { sources };
        try {
          const { assetInUseProblem, assetUsers } = await import("../page-builder/asset-references");
          const site = r.site();
          const inUse = assetInUseProblem(assetUsers(snap.sources, found.map(file => file.path), { prefix: nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)), origins: ports.origins?.() ?? [], pages: Object.values(site?.routes ?? {}), components: site?.components }));
          if (inUse) return { refuse: inUse };
        } catch (error) { return { refuse: error instanceof Error ? error.message : "The files that use this could not be checked, so nothing was deleted." }; }
      }
      const count = found.length, onGitHub = found.some(file => file.sha);
      const links = pageLinks(found.map(file => file.path), new Map(), "deleted", r);
      const title = wording?.title ?? (target.folder ? `Delete the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}?` : `Delete ${target.path}?`);
      const family = targetFamily(target);
      const members = family ? [
        ...(family.copies.length ? [`${family.copies.length} smaller ${family.copies.length === 1 ? "copy" : "copies"}`] : []),
        ...(family.originals.length ? [`${family.originals.length} kept ${family.originals.length === 1 ? "original" : "originals"}`] : []),
        ...(family.sharing ? ["sharing picture"] : []),
        ...(family.still ? [/\.pdf$/i.test(family.main) ? "first-page picture" : "still picture"] : []),
        ...(family.subtitles.length ? [family.subtitles.length === 1 ? "subtitles file" : `${family.subtitles.length} subtitles files`] : []),
      ] : [];
      const ok = await ports.confirmDialog()?.ask({ title, notes: [
        ...(members.length ? [`Its ${members.join(" and ")} ${familyMembers(family!).length === 2 ? "is" : "are"} deleted with it.`] : []),
        ...(links ? [links] : []),
        onGitHub ? count === 1 ? "It is removed from GitHub when you save. Until then, Restore brings it back." : "They are removed from GitHub when you save. Until then, Restore brings them back."
          : count === 1 ? "It is not on GitHub yet, so this discards it." : "They are not on GitHub yet, so this discards them.",
      ], action: "Delete" });
      if (!ok) { cancelled = true; return { stayed: cancel }; }
      // Browser copies for Recently removed are written only once Delete is confirmed.
      const { keep, ...recorded } = recordsPlan;
      try { await keep?.(); } catch { return { refuse: "This browser could not keep a copy for Recently removed, so nothing was deleted." }; }
      return { ...recorded, deletes: [...found.map(file => file.path), ...recordsPlan.deletes ?? []],
        done: target.folder ? `Deleted the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}.` : `Deleted ${target.path}.`,
        undone: `Undid deleting ${target.path}.` };
    }, { since, guard: () => ports.nativeFiles().sort().join("\n") === key && targetDrafts(target) === drafts && opaqueDrafts() === opaque });
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

  return { deleteFileTarget, duplicateFileTarget, restoreFileTarget, protectedProblem, moveProblem, fileMoveProblem, targetFiles, pageLinks, moveFileTarget, nativeAssetSnapshot, nativeAssetReferences, planFileMoveUrls, moveFilesWithUrls };
}

export type FileOperationsController = ReturnType<typeof createFileOperationsController>;
