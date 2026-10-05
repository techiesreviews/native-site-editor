import { nativePageRoute } from "../../shared/native-routes";
import { parseSource, type SourceElement } from "./component-model";
import { attribute } from "./collection-model";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { planNativeSectionCopiesUpdate, planNativeSectionLink, readNativeSectionLinks, resolveNativeSectionLinks, sectionCore } from "./native-section-links";
import {
  planMakeSectionMaster, readSectionCatalog, resolveStaticSection,
  type StaticSectionEntry, type StaticSectionMasterEntry, type StaticSectionOperation, type StaticSectionRecord,
} from "./static-sections";

/**
 * The editor's session around saved-section masters, between the pure models and the host.
 *
 * - A page selection is always the page's own copy. Only the explicit Edit of a whole saved
 *   section (`identity(...).onEdit`) opens its master: a v1 record first becomes a master
 *   (`.editor/sections/<id>.html` and editor JSON only; pages and CSS are not written), and the
 *   selected copy is linked in the same operation only when it is exactly the record's section.
 * - Typing in the master never changes pages. Done only returns to the page (no writes).
 * - Update copies is explicit: one multi-file operation for the pages and the link JSON, pinned
 *   to the loaded master, JSON, pages and file graph.
 *
 * Everything the host owns is behind `MasterControllerHost`. Every step pins the snapshot it
 * started from (revision, file graph, sources) and refuses when it changed across an await.
 */
export interface MasterHostSnapshot {
  /** Repository, branch and editor session identity (scope and epoch). Any change ends a session. */
  revision: string;
  /** The complete file graph. */
  files: readonly string[];
  /** Effective source of a file (drafts included, `.editor/` files too); undefined when not loaded or absent. */
  source(path: string): string | undefined;
  /** The file open now (Code and preview): a page, or a master or other file. */
  currentPath: string;
  /**
   * What is selected now on the open page, as painted, or undefined. An Edit built for an older
   * selection refuses unless this still equals it (path, node, range and painted bytes).
   */
  selection: MasterSelection | undefined;
}
/** The selected element as painted: its page, node and exact range in the painted page bytes. */
export interface MasterSelection { path: string; node: number[]; range: { start: number; end: number }; paintedSource: string }
export interface MasterControllerHost {
  snapshot(): MasterHostSnapshot;
  /**
   * Opens a file in Code (a master keeps the preview on its page; a page shows it), only while
   * the host's revision still equals `revision`, checked before and while opening. Resolves to
   * false when it did not open.
   */
  open(path: string, revision: string): Promise<boolean>;
  /** Selects the element at `range` on the open page. */
  select(path: string, range: { start: number; end: number }): void;
  /**
   * Applies one operation atomically as one undo step, as the editor's transaction does: it compares
   * every expected source and the file graph, and calls `current()` after each await and right
   * before the final write. Resolves to true once committed; false (nothing written) when anything
   * no longer matches or `current()` is false. The controller waits for it before going on.
   */
  apply(operation: StaticSectionOperation, expectedFiles: readonly string[] | undefined, current: () => boolean): Promise<boolean>;
  /**
   * Optional: the element at exactly `range` of `source`, as the browser builds the page, with its
   * element-child path from `<body>` and its exact source range (the editor's own locator, such as
   * `elementPathAt` and `locateNativeElementRange`). Only needed by `previewInput`, which refuses
   * without it: this module's source parser can place elements differently from the browser
   * (an implied `</p>` before a `<section>`), so it never computes the node itself.
   */
  locateCopy?(source: string, range: { start: number; end: number }): { node: number[]; range: { start: number; end: number } } | undefined;
  announce(message: string): void;
}
/** What the edit bar shows on a whole saved section, and its explicit Edit. */
export interface MasterIdentity { recordId: string; label: string; master: boolean; linked: boolean; onEdit: () => Promise<void> }
export interface MasterContext { recordId: string; label: string; htmlPath: string; pagePath: string; masterError?: string }
export type CopiesUpdateResult = { changed: number; skipped: number } | { error: string };

/**
 * What a master preview needs, read-only: the session it belongs to (an opaque token, the same for
 * the whole session), the page and its exact bytes, the selected copy's body-relative node and
 * outer HTML, and the master's path and current source.
 */
export interface MasterPreviewInput { session: string; pagePath: string; pageSource: string; node: number[]; basis: string; masterPath: string; masterSource: string }

interface Session {
  token: string; revision: string; recordId: string; label: string; htmlPath: string;
  /** The page bytes the session knows (painted at Edit, or as its own Update left them) and the copy's range there. */
  pagePath: string; pageSource: string; range: { start: number; end: number };
  /** The selected copy's link, only when proven (resolved, or created by this Edit). */
  linkKey?: string;
}
let sessions = 0;

const sameSelection = (a: MasterSelection | undefined, b: MasterSelection) => Boolean(a) && a!.path === b.path && a!.paintedSource === b.paintedSource
  && a!.range.start === b.range.start && a!.range.end === b.range.end && JSON.stringify(a!.node) === JSON.stringify(b.node);
/** The selection is still the one the action was built for, on the page open now. */
const stillSelected = (snapshot: MasterHostSnapshot, selection: MasterSelection) =>
  snapshot.currentPath === selection.path && sameSelection(snapshot.selection, selection) && snapshot.source(selection.path) === selection.paintedSource;
const sources = (snapshot: MasterHostSnapshot, paths: Iterable<string>) => Object.fromEntries([...paths].map((path) => [path, snapshot.source(path)]));

/** The ordinary, complete `<section>` at exactly `range`, at the page level (not in a component or template). */
function sectionAt(source: string, range: { start: number; end: number }): SourceElement | undefined {
  const stack = parseSource(source);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type !== "element") continue;
    if (node.start === range.start && node.end === range.end) {
      if (node.name !== "section" || !node.close) return undefined;
      for (let parent = node.parent; parent; parent = parent.parent) {
        const name = parent.name.toLowerCase();
        if (name.includes("-") || ["template", "noscript", "slot", "svg", "math"].includes(name)) return undefined;
      }
      return node;
    }
    if (node.start <= range.start && node.end >= range.end) stack.push(...node.children);
  }
  return undefined;
}

/** The range of link `key` (to `recordId`) on `page`, resolving every link with `page` given as `pageSource`. */
function linkRange(snapshot: MasterHostSnapshot, json: string | undefined, page: string, pageSource: string, key: string, recordId: string, override: Record<string, string> = {}): { start: number; end: number } | undefined {
  if (json === undefined) return undefined;
  try {
    const all = sources(snapshot, Object.keys(readNativeSectionLinks(json)));
    const resolved = resolveNativeSectionLinks({ documentText: json, sources: { ...all, ...override, [page]: pageSource } });
    if ("error" in resolved) return undefined;
    const found = resolved.links.filter((link) => link.page === page && link.key === key && link.link.recordId === recordId);
    return found.length === 1 ? { start: found[0].start, end: found[0].end } : undefined;
  } catch { return undefined; }
}
function linkedAt(snapshot: MasterHostSnapshot, json: string | undefined, page: string, pageSource: string, key: string, recordId: string, range: { start: number; end: number }) {
  const at = linkRange(snapshot, json, page, pageSource, key, recordId);
  return Boolean(at) && at!.start === range.start && at!.end === range.end;
}
export function createNativeSectionMasterController(host: MasterControllerHost) {
  let session: Session | undefined;

  /** The saved section a whole selected section belongs to: its link, else its one matching rootClass. */
  function recordFor(selection: MasterSelection, snapshot: MasterHostSnapshot): { id: string; entry: StaticSectionEntry; linked: boolean; key?: string } | undefined {
    const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
    if (json === undefined || snapshot.source(selection.path) !== selection.paintedSource) return undefined;
    const element = sectionAt(selection.paintedSource, selection.range);
    if (!element) return undefined;
    const catalog = readSectionCatalog(json);
    const links = readNativeSectionLinks(json);
    // Links that can't all be resolved prove nothing about this section: no identity rather
    // than wrongly treating it as unlinked.
    const resolved = resolveNativeSectionLinks({ documentText: json, sources: sources(snapshot, Object.keys(links)) });
    if ("error" in resolved) return undefined;
    const own = resolved.links.filter((link) => link.page === selection.path && link.start === element.start && link.end === element.end && Object.hasOwn(catalog, link.link.recordId));
    if (own.length === 1) return { id: own[0].link.recordId, entry: catalog[own[0].link.recordId], linked: true, key: own[0].key };
    if (own.length > 1) return undefined;
    const classes = new Set((attribute(selection.paintedSource, element, "class") ?? "").split(/[\t\n\f\r ]+/).filter(Boolean).map((name) => name.toLowerCase()));
    const matches = Object.entries(catalog).filter(([, entry]) => classes.has(entry.rootClass.toLowerCase()));
    return matches.length === 1 ? { id: matches[0][0], entry: matches[0][1], linked: false } : undefined;
  }

  /** The master's current record, read from its loaded source (a draft included); refuses when it can't. */
  function masterRecord(snapshot: MasterHostSnapshot, entry: StaticSectionEntry): StaticSectionRecord {
    const path = (entry as StaticSectionMasterEntry).htmlPath;
    return resolveStaticSection(entry, { sources: { [path]: snapshot.source(path) }, files: snapshot.files });
  }

  /**
   * The explicit Edit of a whole saved section. Pins the painted page and the snapshot; makes a v1
   * record a master (linking the copy only when it is exactly the record's section); opens the
   * master; refuses if anything changed meanwhile.
   */
  async function edit(selection: MasterSelection): Promise<void> {
    const start = host.snapshot();
    if (!stillSelected(start, selection)) { host.announce("Select the section again to edit its master."); return; }
    const found = (() => { try { return recordFor(selection, start); } catch { return undefined; } })();
    if (!found) { host.announce("Select the whole saved section to edit its master."); return; }
    const json = start.source(EDITOR_PAGE_BUILDER_PATH)!;
    let htmlPath = (found.entry as StaticSectionMasterEntry).htmlPath;
    let linkKey = found.key;
    if (htmlPath === undefined) {
      const made = planMakeSectionMaster({ documentText: json, files: start.files, id: found.id });
      if ("error" in made) { host.announce(made.error); return; }
      htmlPath = made.htmlPath;
      // The controller opens the master itself, behind its own checks; the operation never does.
      const operation = { ...made.operation };
      delete operation.open;
      const record = found.entry as StaticSectionRecord;
      const core = (() => { try { const at = sectionCore(record.html); return record.html.slice(at.start, at.end); } catch { return undefined; } })();
      // Link only a copy that is exactly the record's section: a customised copy stays unlinked,
      // so it is never treated as unchanged and overwritten by a later Update.
      if (!found.linked && core !== undefined && selection.paintedSource.slice(selection.range.start, selection.range.end) === core) {
        const link = planNativeSectionLink({ documentText: operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!, files: start.files, pagePath: selection.path, pageSource: selection.paintedSource, range: selection.range, record });
        if (!("error" in link)) {
          linkKey = link.key;
          operation.edits.set(EDITOR_PAGE_BUILDER_PATH, link.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!);
          operation.expectedSources.set(selection.path, selection.paintedSource);
        }
      }
      // Still this selection, on this page, in this repository, at every step of the write.
      const current = () => { const now = host.snapshot(); return now.revision === start.revision && stillSelected(now, selection); };
      if (!await host.apply(operation, made.expectedFiles, current)) { host.announce("The page or its saved sections changed. Select the section again."); return; }
    }
    // After any operation, capture again: the master must now be readable from the graph.
    // A committed operation stays (it is one Undo); only the open is refused.
    const after = host.snapshot();
    if (after.revision !== start.revision || !stillSelected(after, selection)) { host.announce("The selection or page changed. Select the section again."); return; }
    const entry = (() => { try { return readSectionCatalog(after.source(EDITOR_PAGE_BUILDER_PATH))[found.id]; } catch { return undefined; } })();
    if (!entry || (entry as StaticSectionMasterEntry).htmlPath !== htmlPath || !after.files.includes(htmlPath)) { host.announce("The saved section's master could not be found."); return; }
    // The key stays only if this copy is still exactly that link's copy now.
    if (linkKey !== undefined && !linkedAt(after, after.source(EDITOR_PAGE_BUILDER_PATH), selection.path, selection.paintedSource, linkKey, found.id, selection.range)) linkKey = undefined;
    session = { token: `master-session-${++sessions}`, revision: start.revision, recordId: found.id, label: entry.label, htmlPath, pagePath: selection.path, pageSource: selection.paintedSource, range: { ...selection.range }, ...(linkKey !== undefined ? { linkKey } : {}) };
    const opening = session;
    const opened = await host.open(htmlPath, opening.revision);
    if (session !== opening) return;
    if (!opened || host.snapshot().revision !== opening.revision) { session = undefined; host.announce("The repository changed. The master was not opened."); }
  }

  return {
    /**
     * The saved section of a whole selected section, for the edit bar's label and its purple Edit
     * (wire `onEdit` as the component edit). Undefined for anything else: children never get it.
     */
    identity(selection: MasterSelection): MasterIdentity | undefined {
      try {
        const snapshot = host.snapshot();
        const found = recordFor(selection, snapshot);
        if (!found) return undefined;
        return { recordId: found.id, label: found.entry.label, master: Object.hasOwn(found.entry, "htmlPath"), linked: found.linked, onEdit: () => edit(selection) };
      } catch { return undefined; }
    },
    edit,
    /**
     * The input of a master preview, only while it is exact: same revision, the master open and
     * valid, the page loaded with the very bytes the session knows (painted at Edit, or as its own
     * verified Update left them), and the copy at its range an ordinary section under `<body>`.
     * Any other page change is not adopted. Returns fresh objects.
     */
    previewInput(): MasterPreviewInput | undefined {
      const current = session;
      if (!current) return undefined;
      const snapshot = host.snapshot();
      if (snapshot.revision !== current.revision || snapshot.currentPath !== current.htmlPath) return undefined;
      try {
        const entry = readSectionCatalog(snapshot.source(EDITOR_PAGE_BUILDER_PATH))[current.recordId];
        if (!entry || (entry as StaticSectionMasterEntry).htmlPath !== current.htmlPath) return undefined;
        const master = masterRecord(snapshot, entry);
        if (snapshot.source(current.pagePath) !== current.pageSource || !sectionAt(current.pageSource, current.range)) return undefined;
        // The node comes from the host's canonical locator, and only when it maps back to exactly this range.
        const located = host.locateCopy?.(current.pageSource, { ...current.range });
        if (!located || located.range.start !== current.range.start || located.range.end !== current.range.end) return undefined;
        if (!Array.isArray(located.node) || !located.node.length || !located.node.every((index) => Number.isSafeInteger(index) && index >= 0)) return undefined;
        const node = [...located.node];
        return { session: current.token, pagePath: current.pagePath, pageSource: current.pageSource, node, basis: current.pageSource.slice(current.range.start, current.range.end), masterPath: current.htmlPath, masterSource: master.html };
      } catch { return undefined; }
    },
    /** The open master session for a banner, or undefined. `masterError` when the master can't be read now. */
    context(): MasterContext | undefined {
      if (!session) return undefined;
      const snapshot = host.snapshot();
      if (snapshot.revision !== session.revision) { session = undefined; return undefined; }
      const { recordId, label, htmlPath, pagePath } = session;
      try {
        const entry = readSectionCatalog(snapshot.source(EDITOR_PAGE_BUILDER_PATH))[recordId];
        if (!entry) throw new Error("The saved section no longer exists.");
        masterRecord(snapshot, entry);
        return { recordId, label, htmlPath, pagePath };
      } catch (error) {
        return { recordId, label, htmlPath, pagePath, masterError: error instanceof Error ? error.message : String(error) };
      }
    },
    /** Back to the page, re-selecting the copy only while the page bytes are unchanged. Never writes. */
    async done(): Promise<void> {
      const current = session;
      session = undefined;
      if (!current) return;
      const snapshot = host.snapshot();
      if (snapshot.revision !== current.revision) { host.announce("The repository changed. Open the page again."); return; }
      if (nativePageRoute(current.pagePath) === undefined || !snapshot.files.includes(current.pagePath)) { host.announce("The page is gone."); return; }
      if (!await host.open(current.pagePath, current.revision)) return;
      const now = host.snapshot();
      if (now.revision !== current.revision) return;
      if (now.source(current.pagePath) === current.pageSource) host.select(current.pagePath, current.range);
      else host.announce("The page changed. Select the section again.");
    },
    /**
     * Explicit Update copies from the open master: only copies still equal to their basis change;
     * customised ones are counted as skipped. One operation; nothing is written on refusal.
     */
    async updateCopies(): Promise<CopiesUpdateResult> {
      const active = session;
      const fail = (error: string) => { host.announce(error); return { error }; };
      if (!active) return fail("Open a saved section's master first.");
      const snapshot = host.snapshot();
      if (snapshot.revision !== active.revision) { session = undefined; return fail("The repository changed. Open the master again."); }
      try {
        const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
        if (json === undefined) return fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
        const entry = readSectionCatalog(json)[active.recordId];
        if (!entry || (entry as StaticSectionMasterEntry).htmlPath !== active.htmlPath) return fail("The saved section no longer has this master.");
        const record = masterRecord(snapshot, entry);
        const pages = Object.keys(readNativeSectionLinks(json));
        const plan = planNativeSectionCopiesUpdate({ documentText: json, files: snapshot.files, sources: sources(snapshot, pages), record, master: { path: active.htmlPath, source: record.html } });
        if ("error" in plan) return fail(plan.error);
        if (!plan.operation) { host.announce(`No copies to update; ${plan.diverged.length} customised.`); return { changed: 0, skipped: plan.diverged.length }; }
        const current = () => session === active && host.snapshot().revision === active.revision;
        if (!await host.apply(plan.operation, plan.expectedFiles, current)) return fail("The pages or the master changed. Nothing was updated.");
        // The session follows its page only through this operation's own, verified output: every
        // written file holds exactly the planned text, and the selected copy is found again by its
        // link. Anything else keeps the old page bytes, so the mapping is not adopted.
        const after = host.snapshot();
        const exact = after.revision === active.revision && [...plan.operation.edits].every(([path, text]) => after.source(path) === text);
        const newPage = plan.operation.edits.get(active.pagePath);
        if (exact && session === active && newPage !== undefined && active.linkKey !== undefined && active.pageSource === plan.operation.expectedSources.get(active.pagePath)) {
          const range = linkRange(after, plan.operation.edits.get(EDITOR_PAGE_BUILDER_PATH), active.pagePath, newPage, active.linkKey, active.recordId, Object.fromEntries(plan.operation.edits));
          if (range) session = { ...active, pageSource: newPage, range };
        }
        host.announce(`Updated ${plan.updated.length}; ${plan.diverged.length} customised left as they are.`);
        return { changed: plan.updated.length, skipped: plan.diverged.length };
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
export type NativeSectionMasterController = ReturnType<typeof createNativeSectionMasterController>;
