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
}
/** The selected element as painted: its page, node and exact range in the painted page bytes. */
export interface MasterSelection { path: string; node: number[]; range: { start: number; end: number }; paintedSource: string }
export interface MasterControllerHost {
  snapshot(): MasterHostSnapshot;
  /** Opens a file in Code (a master keeps the preview on its page; a page shows it). */
  open(path: string): Promise<void>;
  /** Selects the element at `range` on the open page. */
  select(path: string, range: { start: number; end: number }): void;
  /**
   * Applies one operation atomically as one undo step after comparing every expected source and
   * the file graph. Returns false (and writes nothing) when anything no longer matches.
   */
  apply(operation: StaticSectionOperation, expectedFiles?: readonly string[]): boolean;
  announce(message: string): void;
}
/** What the edit bar shows on a whole saved section, and its explicit Edit. */
export interface MasterIdentity { recordId: string; label: string; master: boolean; linked: boolean; onEdit: () => Promise<void> }
export interface MasterContext { recordId: string; label: string; htmlPath: string; pagePath: string; masterError?: string }
export type CopiesUpdateResult = { changed: number; skipped: number } | { error: string };

interface Session { revision: string; recordId: string; label: string; htmlPath: string; pagePath: string; pageSource: string; range: { start: number; end: number } }

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

export function createNativeSectionMasterController(host: MasterControllerHost) {
  let session: Session | undefined;

  /** The saved section a whole selected section belongs to: its link, else its one matching rootClass. */
  function recordFor(selection: MasterSelection, snapshot: MasterHostSnapshot): { id: string; entry: StaticSectionEntry; linked: boolean } | undefined {
    const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
    if (json === undefined || snapshot.source(selection.path) !== selection.paintedSource) return undefined;
    const element = sectionAt(selection.paintedSource, selection.range);
    if (!element) return undefined;
    const catalog = readSectionCatalog(json);
    const links = readNativeSectionLinks(json);
    const resolved = resolveNativeSectionLinks({ documentText: json, sources: sources(snapshot, Object.keys(links)) });
    if (!("error" in resolved)) {
      const own = resolved.links.filter((link) => link.page === selection.path && link.start === element.start && link.end === element.end && Object.hasOwn(catalog, link.link.recordId));
      if (own.length === 1) return { id: own[0].link.recordId, entry: catalog[own[0].link.recordId], linked: true };
      if (own.length > 1) return undefined;
    }
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
    const found = (() => { try { return recordFor(selection, start); } catch { return undefined; } })();
    if (!found) { host.announce("Select the whole saved section to edit its master."); return; }
    const json = start.source(EDITOR_PAGE_BUILDER_PATH)!;
    let htmlPath = (found.entry as StaticSectionMasterEntry).htmlPath;
    if (htmlPath === undefined) {
      const made = planMakeSectionMaster({ documentText: json, files: start.files, id: found.id });
      if ("error" in made) { host.announce(made.error); return; }
      htmlPath = made.htmlPath;
      const operation = made.operation;
      const record = found.entry as StaticSectionRecord;
      const core = (() => { try { const at = sectionCore(record.html); return record.html.slice(at.start, at.end); } catch { return undefined; } })();
      // Link only a copy that is exactly the record's section: a customised copy stays unlinked,
      // so it is never treated as unchanged and overwritten by a later Update.
      if (!found.linked && core !== undefined && selection.paintedSource.slice(selection.range.start, selection.range.end) === core) {
        const link = planNativeSectionLink({ documentText: operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!, files: start.files, pagePath: selection.path, pageSource: selection.paintedSource, range: selection.range, record });
        if (!("error" in link)) {
          operation.edits.set(EDITOR_PAGE_BUILDER_PATH, link.operation.edits.get(EDITOR_PAGE_BUILDER_PATH)!);
          operation.expectedSources.set(selection.path, selection.paintedSource);
        }
      }
      if (!host.apply(operation, made.expectedFiles)) { host.announce("The page or its saved sections changed. Select the section again."); return; }
    }
    // After any operation, capture again: the master must now be readable from the graph.
    const after = host.snapshot();
    if (after.revision !== start.revision || after.source(selection.path) !== selection.paintedSource) { host.announce("The page changed. Select the section again."); return; }
    const entry = (() => { try { return readSectionCatalog(after.source(EDITOR_PAGE_BUILDER_PATH))[found.id]; } catch { return undefined; } })();
    if (!entry || (entry as StaticSectionMasterEntry).htmlPath !== htmlPath || !after.files.includes(htmlPath)) { host.announce("The saved section's master could not be found."); return; }
    session = { revision: start.revision, recordId: found.id, label: entry.label, htmlPath, pagePath: selection.path, pageSource: selection.paintedSource, range: { ...selection.range } };
    const opening = session;
    await host.open(htmlPath);
    if (session !== opening) return;
    if (host.snapshot().revision !== opening.revision) { session = undefined; host.announce("The repository changed. The master was not opened."); }
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
      await host.open(current.pagePath);
      const now = host.snapshot();
      if (now.revision !== current.revision) return;
      if (now.source(current.pagePath) === current.pageSource) host.select(current.pagePath, current.range);
      else host.announce("The page changed. Select the section again.");
    },
    /**
     * Explicit Update copies from the open master: only copies still equal to their basis change;
     * customised ones are counted as skipped. One operation; nothing is written on refusal.
     */
    updateCopies(): CopiesUpdateResult {
      const current = session;
      const fail = (error: string) => { host.announce(error); return { error }; };
      if (!current) return fail("Open a saved section's master first.");
      const snapshot = host.snapshot();
      if (snapshot.revision !== current.revision) { session = undefined; return fail("The repository changed. Open the master again."); }
      try {
        const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
        if (json === undefined) return fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
        const entry = readSectionCatalog(json)[current.recordId];
        if (!entry || (entry as StaticSectionMasterEntry).htmlPath !== current.htmlPath) return fail("The saved section no longer has this master.");
        const record = masterRecord(snapshot, entry);
        const pages = Object.keys(readNativeSectionLinks(json));
        const plan = planNativeSectionCopiesUpdate({ documentText: json, files: snapshot.files, sources: sources(snapshot, pages), record, master: { path: current.htmlPath, source: record.html } });
        if ("error" in plan) return fail(plan.error);
        if (!plan.operation) { host.announce(`No copies to update; ${plan.diverged.length} customised.`); return { changed: 0, skipped: plan.diverged.length }; }
        if (!host.apply(plan.operation, plan.expectedFiles)) return fail("The pages or the master changed. Nothing was updated.");
        host.announce(`Updated ${plan.updated.length}; ${plan.diverged.length} customised left as they are.`);
        return { changed: plan.updated.length, skipped: plan.diverged.length };
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
export type NativeSectionMasterController = ReturnType<typeof createNativeSectionMasterController>;
