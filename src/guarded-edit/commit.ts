// The guarded edit's commit (src/guarded-edit.ts): a plan's writes over several
// files, or files created, moved and deleted, as one undo step through the
// draft receipt (prepareNativeTextHistory). It was main.ts's
// one-operation apply until sturdy-base slice 17.
//
// It hides: the branch reads a write needs (blobs of moved and deleted files,
// bases of edited ones, a created path's place on GitHub), re-proving the
// plan's reads and the stamp after each; .github left alone while an agent
// acts; the drafts each side of the step; the history step on the anchor page
// (or, with no page open, on the page it opens after); the files created or
// moved in sharing the anchor's history; panes mounted later adopted over the
// step's own bytes; reopening the page after the step and after its Undo and
// Redo; and the selection and announcement each way.
//
// Two shapes: edits only (no file created, moved, deleted or opened) stay on
// the open page with no refresh; anything else plans its drafts with
// planNativeStructuralDrafts and reopens the page after.

import { GITHUB_CONFIG_REFUSED, splitProtectedEdits, touchesGithubConfig } from "../../shared/protected-paths";
import { prepareNativeTextHistory } from "../page-builder/native-operation-history";
import { planNativeStructuralDrafts } from "../page-builder/native-structural-history";
import type { SavedDraft } from "../drafts";
import type { MovableFile } from "../file-changes";
import type { EditorWorkspace, NodeRef } from "../guarded-edit";

/** One step's writes, checked by the module (src/guarded-edit.ts `prepare`). */
export interface CommitRequest {
  /** Every source the plan read, absences too: the step's proof. A write of a path not among them throws. */
  reads: ReadonlyMap<string, string | undefined>;
  /** New text by the path a file has after the moves. */
  edits: Map<string, string>;
  creates: { path: string; content: string }[];
  deletes: string[];
  moves: { from: string; to: string }[];
  /** The open page whose history takes the step; undefined: the page opened after takes it. */
  anchor: string | undefined;
  /** The file to open after; else the anchor where it went (the home page when it went). */
  open?: string;
  /** The Pages tab's row to show and focus after, when the tab is open. */
  focus?: { file?: string; route?: string };
  done: string;
  undone: string;
  /** The stamp, guard, anchor, every read and the files' places still hold: checked after each wait. */
  current: () => boolean;
  /** Called once the drafts are written (an error after it is the page's refresh, not staleness). */
  recorded: () => void;
  /** Undo selects `before`, Redo `after`, each against the exact bytes the step restores. */
  selection: { before?: NodeRef; after?: NodeRef };
}

/** What a commit whose reads moved under it says (the module turns it into a stale Outcome). */
export const COMMIT_CHANGED = "The repository or source changed meanwhile. Review the latest files and try again.";
const OPENING_FAILED = "The files changed, but the editor changed while opening them. Review the current drafts.";

const isStylesheet = (path: string) => /\.css$/i.test(path);
const textOf = (record: SavedDraft) => record.deleted || record.opaque ? undefined : record.content;

export function createCommit(ws: EditorWorkspace) {
  // A file an editor pane mounts: during a step's own refresh it is that refresh's to prove
  // (`capturing`); otherwise every recorded step may adopt it over its exact bytes.
  let capturing: ((path: string, pane: boolean) => void) | undefined;
  const adopters = new Set<(path: string) => void>();
  ws.onMount((path, pane) => {
    if (capturing) capturing(path, pane);
    else for (const adopt of adopters) adopt(path);
  });

  return async function commit(op: CommitRequest): Promise<string | undefined> {
    // Pinned before awaiting: a step asked for in one repository, branch or account never lands
    // in another one opened meanwhile.
    const scope = ws.draftScope();
    if (!scope) return "Open a repository first.";
    const store = ws.store;
    const epoch = ws.generation(), scopeKey = ws.scope();
    const { moves, deletes, creates, anchor } = op;
    let edits = op.edits, done = op.done;
    // An agent's step, as planned (a folder's moves, links rewritten in other files, redirects),
    // never reaches .github: a protected file moved, deleted or created refuses it, and link
    // rewrites in protected files are left out.
    if (ws.agentActing()) {
      const protectedPath = [...moves.flatMap(move => [move.from, move.to]), ...deletes, ...creates.map(file => file.path)].find(touchesGithubConfig);
      if (protectedPath) return GITHUB_CONFIG_REFUSED;
      const { kept, left } = splitProtectedEdits(edits);
      if (left.length) {
        edits = kept;
        done += ` (${left.length} ${left.length === 1 ? "file" : "files"} in .github left unchanged.)`;
      }
    }
    // Every write proves the bytes its plan read; none is filled in here.
    const arriving = new Set([...moves.map(move => move.to), ...creates.map(file => file.path)]);
    for (const path of [...moves.map(move => move.from), ...deletes, ...[...edits.keys()].filter(path => !arriving.has(path))])
      if (!op.reads.has(path)) throw new Error(`Guarded edit: writes ${path}, which the plan never read through r.`);
    const expected = new Map(op.reads);
    const stale = () => epoch !== ws.generation() || scopeKey !== ws.scope() ||
      [...expected].some(([path, source]) => ws.source(path) !== source) || !op.current();
    if (stale()) return COMMIT_CHANGED;

    // The files moved and deleted, with their blobs and text; the base of each file edited.
    const movable = new Map<string, MovableFile>();
    const bases = new Map<string, { sha: string; text: string } | undefined>();
    try {
      const vacated = new Set([...moves.map(move => move.from), ...deletes]);
      for (const file of creates) {
        if (vacated.has(file.path)) continue;
        if (ws.exists(file.path)) return `${file.path} already exists. No files were changed.`;
        // On GitHub already, or a folder of the path a file there (a listing the snapshot has not read yet).
        const problem = await ws.createProblem(file.path);
        if (stale()) return COMMIT_CHANGED;
        if (problem) return `${problem} No files were changed.`;
      }
      for (const path of vacated) {
        const found = await ws.entry(path);
        if (stale()) return COMMIT_CHANGED;
        if (!found) return `${path} is not there any more.`;
        movable.set(path, found);
      }
      for (const path of edits.keys()) {
        if (arriving.has(path) || store.get(scope, path)) continue;
        bases.set(path, await ws.branchText(path));
        if (stale()) return COMMIT_CHANGED;
      }
    } catch (error) {
      return error instanceof Error ? error.message : "The files could not be read.";
    }
    if (stale()) return COMMIT_CHANGED;

    const touched = new Set<string>([...moves.flatMap(move => [move.from, move.to]), ...deletes, ...creates.map(file => file.path), ...edits.keys()]);
    for (const path of [...touched]) {
      const from = store.get(scope, path)?.movedFrom;
      if (from) touched.add(from);
    }
    const before = new Map([...touched].map(path => [path, store.get(scope, path)] as const));
    const live = () => epoch === ws.generation() && scopeKey === ws.scope() && !ws.versionView();

    // ---- Edits only: the open page's history, no refresh. ----
    if (!moves.length && !deletes.length && !creates.length && op.open === undefined) {
      if (anchor === undefined || !ws.mounted(anchor)) return "Open a page before changing these files.";
      const after = new Map(before);
      const beforeSources = new Map(expected);
      for (const path of touched) if (!beforeSources.has(path)) beforeSources.set(path, ws.source(path));
      if (!beforeSources.has(anchor)) beforeSources.set(anchor, ws.source(anchor));
      const afterSources = new Map(beforeSources);
      const now = Date.now();
      for (const [path, text] of edits) {
        const draft = before.get(path), base = bases.get(path);
        afterSources.set(path, text);
        if (draft && !draft.deleted && draft.baseSha !== null && !draft.movedFrom && text === draft.original) after.set(path, undefined);
        else if (draft && !draft.deleted) after.set(path, { ...draft, content: text, updatedAt: now });
        else if (base && text === base.text) continue;
        else if (draft?.deleted) after.set(path, { ...scope, version: 1, path, baseSha: draft.baseSha, original: draft.original, content: text, updatedAt: now });
        else if (base) after.set(path, { ...scope, version: 1, path, baseSha: base.sha, original: base.text, content: text, updatedAt: now });
        else after.set(path, { ...scope, version: 1, path, baseSha: null, original: "", content: text, updatedAt: now });
      }
      if ([...afterSources].every(([path, source]) => source === beforeSources.get(path))) return undefined;
      const receipt = prepareNativeTextHistory({ scope, store, persistentModels: true, isLive: live,
        source: path => ws.source(path), mounted: path => ws.mounted(path),
        retainModel: path => ws.retainModel(path), modelState: path => ws.model(path),
        evictModel: (path, proof) => ws.evictModel(path, proof), prepareSources: changes => ws.prepareSources(changes),
      }, { before, after, beforeSources, afterSources });
      if (!receipt?.apply()) { const error = receipt?.error() ?? store.error ?? COMMIT_CHANGED; receipt?.dispose(); return error; }
      // A read-only stylesheet mount over this step's exact bytes belongs to the step.
      const adoptPane = (path: string) => { if (live()) receipt.adoptOwnMount(path, ws.model(path), ws.mountedSource(path)); };
      adopters.add(adoptPane);
      const dispose = () => { adopters.delete(adoptPane); receipt.dispose(); };
      const transition = (direction: "undo" | "redo") => {
        // A file mounted since over this step's bytes is adopted now too: of several steps over a
        // page opened later (slot changes, then Done), only the latest matched it as it mounted.
        for (const path of edits.keys()) if (ws.mounted(path)) adoptPane(path);
        const select = direction === "undo" ? op.selection.before : op.selection.after;
        if (select) ws.select(select, undefined, direction === "redo");
        if (!receipt[direction]()) { if (select) ws.select(undefined); ws.refuse(receipt.error() ?? COMMIT_CHANGED, direction); return false; }
        ws.afterFileChanges();
        ws.announce(direction === "undo" ? op.undone : done);
        return true;
      };
      if (!ws.recordHistory(anchor, () => transition("undo"), () => transition("redo"), dispose)) {
        if (receipt.undo()) ws.afterFileChanges();
        dispose();
        return "The editor changed before this operation could be recorded. Review the current drafts.";
      }
      op.recorded();
      ws.afterFileChanges();
      ws.announce(done);
      return undefined;
    }

    // ---- Files created, moved, deleted or opened: planned drafts, the page reopened. ----
    if (anchor !== undefined && !ws.mounted(anchor)) return "Open an editable page before changing these files.";
    if (anchor !== undefined && !before.has(anchor)) before.set(anchor, store.get(scope, anchor));
    const after = planNativeStructuralDrafts({ scope, before, movable, bases, moves, deletes, creates, edits, now: Date.now() });
    const beforeSources = new Map(expected);
    if (anchor !== undefined && !beforeSources.has(anchor)) beforeSources.set(anchor, ws.source(anchor));
    // The branch's text of each file, as first seen by this step (the bases and blobs read above win).
    const baseSources = new Map<string, string | undefined>();
    for (const [path, base] of bases) if (base) baseSources.set(path, base.text);
    for (const [path, file] of movable) if (file.sha && file.text !== undefined) baseSources.set(path, file.text);
    const baseSource = (path: string) => {
      if (!baseSources.has(path)) baseSources.set(path, ws.base(path));
      return baseSources.get(path);
    };
    // A plain repository has no source index: the mounted anchor's unchanged text is its baseline.
    if (anchor !== undefined && !ws.site() && baseSource(anchor) === undefined) baseSources.set(anchor, ws.source(anchor));
    // Model proofs guard the text shown separately. During a deferred page reload, stored drafts
    // are the file graph's source truth.
    const storedSource = (path: string) => {
      const record = store.get(scope, path);
      return record ? textOf(record) : baseSource(path);
    };
    for (const path of after.keys()) beforeSources.set(path, storedSource(path));
    const afterSources = new Map(beforeSources);
    for (const [path, record] of after) afterSources.set(path, record ? textOf(record) : baseSource(path));
    const untouched = () => ws.files().filter(path => !after.has(path)).sort().join("\n");
    const untouchedFiles = untouched();
    const structuralLive = () => live() && untouched() === untouchedFiles;
    const retainedPaths = [...anchor === undefined ? [] : [anchor], ...[...touched].filter(path => ws.mounted(path) && afterSources.get(path) === undefined)];
    const changingTextPaths = [...touched].filter(path => beforeSources.get(path) !== afterSources.get(path) || retainedPaths.includes(path));
    // Opening a page may close and remount the stylesheet pane (its history scope follows the page).
    // The pane's file is not a changing path unless this step edits it: an unchanged pane keeps
    // its prepared proof, and a stylesheet the pane mounts during the transition is owned (proved at
    // that mount) only while its draft is still the one seen here.
    const stylesheetDraftsAtPrepare = new Map(ws.files().filter(isStylesheet).map(file => [file, store.get(scope, file)]));
    const receipt = prepareNativeTextHistory({ scope, store, persistentModels: true, isLive: structuralLive,
      source: storedSource, mounted: path => ws.mounted(path),
      retainModel: path => ws.retainModel(path), modelState: path => ws.model(path),
      evictModel: (path, proof) => ws.evictModel(path, proof), prepareSources: changes => ws.prepareSources(changes),
    }, { before, after, beforeSources, afterSources, retainPaths: retainedPaths });
    let releaseRefresh: (() => void) | undefined = anchor === undefined ? undefined : ws.holdRefresh(anchor);
    const release = () => { releaseRefresh?.(); releaseRefresh = undefined; };
    if (!receipt?.apply()) { const error = receipt?.error() ?? store.error ?? COMMIT_CHANGED; receipt?.dispose(); release(); return error; }
    // Files created or moved in keep the anchor's history while the step lives.
    let unshare = anchor === undefined ? () => {} : ws.shareHistory([...creates.map(file => file.path), ...moves.map(move => move.to)], anchor);
    const moved = new Map(moves.map(move => [move.from, move.to]));
    // With no page open, the page the step opens takes its history: what it says to open, else the
    // first text file it moves. Its Undo opens that file where it was.
    const next = op.open ?? (anchor === undefined
      ? (moves.find(move => expected.get(move.from) !== undefined || movable.get(move.from)?.text !== undefined) ?? moves[0])?.to
      : moved.get(anchor) ?? (deletes.includes(anchor) ? undefined : anchor));
    const home = anchor ?? moves.find(move => move.to === next)?.from;
    let refreshPending = false;
    // A pane remount over this step's exact bytes keeps Undo available; anything else still refuses.
    const adoptPane = (path: string) => { if (structuralLive()) receipt.adoptOwnMount(path, ws.model(path), ws.mountedSource(path)); };
    adopters.add(adoptPane);
    // The files the step reopens, mounted since it was prepared: their models are kept for its
    // Undo and Redo (a page left for the other one is proved again as it returns).
    const kept = new Map<string, () => void>();
    const keep = () => { for (const path of [home, next]) if (path !== undefined && !kept.has(path) && ws.mounted(path)) kept.set(path, ws.retainModel(path)); };
    const dispose = () => { adopters.delete(adoptPane); receipt.dispose(); unshare(); for (const release of kept.values()) release(); kept.clear(); };

    /** Opens `path` after the step, its Undo or its Redo, proving the step's files through the opening. */
    const refresh = (path: string | undefined, initial: boolean, message?: string, previousStatus = ws.status()): boolean | Promise<boolean> => {
      // An unchanged stylesheet pane is not declared here: it stays an unrelated proof, or is proved at its remount.
      const changing = [...new Set([anchor, ws.openFile(), next, path, ...changingTextPaths].filter((value): value is string => !!value))];
      const complete = receipt.beginOwnUITransition(changing);
      const settle = () => { refreshPending = false; release(); };
      const failed = () => { if (!initial) ws.refuse(receipt.error() ?? COMMIT_CHANGED); return false; };
      if (!complete || !structuralLive()) { settle(); return failed(); }
      const owned = new Map(changing.map(path => [path, ws.model(path)]));
      const capture = (path: string, pane = false) => {
        if (!structuralLive()) return;
        if (changing.includes(path) || pane && stylesheetDraftsAtPrepare.has(path) && store.get(scope, path) === stylesheetDraftsAtPrepare.get(path))
          owned.set(path, ws.model(path));
      };
      const end = () => { if (capturing === capture) capturing = undefined; settle(); };
      const finish = () => {
        try {
          if (!structuralLive() || !complete(owned)) return failed();
          keep();
          ws.afterFileChanges();
          ws.showRow(initial && op.focus ? op.focus : path ? { file: path } : undefined);
          if (message && structuralLive() && receipt.isCurrent() && ws.status() === previousStatus) ws.announce(message);
          return true;
        } finally { end(); }
      };
      capturing = capture;
      let opening: void | Promise<void>;
      try {
        // A removed stylesheet must not stay editable over its deleted marker. Its leased model
        // stays available to this receipt for Undo.
        const pane = ws.paneFile();
        if (pane && changing.includes(pane) && storedSource(pane) === undefined && !ws.exists(pane)) {
          ws.closePane();
          capture(pane);
        }
        // The route graph is found again before a restored or new page opens.
        ws.afterFileChanges();
        if (!structuralLive() || !receipt.isCurrent()) { end(); return false; }
        opening = ws.openAfter(path, !initial || op.open === undefined);
      } catch (error) { end(); throw error; }
      return opening ? opening.then(finish, error => { end(); throw error; }) : finish();
    };
    const transition = (direction: "undo" | "redo") => {
      if (refreshPending) { ws.refuse("The page is still refreshing. Try Undo or Redo when it is ready.", direction); return false; }
      const previousStatus = ws.status();
      const holder = ws.openFile() ?? anchor;
      releaseRefresh = holder === undefined ? undefined : ws.holdRefresh(holder);
      const select = direction === "undo" ? op.selection.before : op.selection.after;
      if (select) ws.select(select, undefined, direction === "redo");
      if (!receipt[direction]()) { if (select) ws.select(undefined); release(); ws.refuse(receipt.error() ?? COMMIT_CHANGED, direction); return false; }
      refreshPending = true;
      // The history must first accept this exact journal move; the refresh runs after it.
      ws.later(() => {
        try {
          const refreshed = refresh(direction === "undo" ? home : next, false, direction === "undo" ? op.undone : done, previousStatus);
          if (refreshed instanceof Promise) refreshed.catch(error => { refreshPending = false; ws.error(error); });
        } catch (error) { refreshPending = false; ws.error(error); }
      });
      return true;
    };
    const undo = () => transition("undo"), redo = () => transition("redo");

    if (anchor !== undefined) {
      if (!ws.recordHistory(anchor, undo, redo, dispose)) {
        receipt.undo(); dispose(); release(); ws.afterFileChanges();
        return "The editor changed before this operation could be recorded.";
      }
      op.recorded();
      refreshPending = true;
      ws.afterFileChanges();
      if (!await refresh(next, true, done)) return receipt.error() ?? OPENING_FAILED;
      return undefined;
    }
    // No page was open: the drafts are written; the page opened after takes the step (none: no
    // undo step, as a deletion's Restore brings the files back).
    op.recorded();
    refreshPending = true;
    ws.afterFileChanges();
    const opened = await refresh(next, true, done);
    if (next === undefined || ws.openFile() !== next || !ws.mounted(next) || !ws.recordHistory(next, undo, redo, dispose)) dispose();
    // The file where it was, reopened by Undo, keeps that history for Redo.
    else if (home !== undefined) unshare = ws.shareHistory([home], next);
    return opened ? undefined : receipt.error() ?? OPENING_FAILED;
  };
}
