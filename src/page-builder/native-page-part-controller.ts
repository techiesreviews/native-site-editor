import { nativePageRoute } from "../../shared/native-routes";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import {
  pagePartCore, planSavePagePart, planLinkPagePartCopies, planUpdatePagePartCopies,
  readPagePartCatalog, readPagePartMaster, resolvePagePartLinks,
  type SavePagePartInput, type LinkPagePartInput, type PagePartRecord,
} from "./native-page-parts";
import type { MasterControllerHost, MasterHostSnapshot, MasterSelection, CopiesUpdateResult } from "./native-section-master-controller";
import type { NativePagePartEditInput } from "../components/native-page-part-preview";

interface Session {
  token: string; revision: string; recordId: string; record: string; files: string[];
  htmlPath: string; pagePath: string; pageSource: string;
  range: { start: number; end: number }; key: string;
}
let sessions = 0;
const graph = (snapshot: MasterHostSnapshot) => [...snapshot.files].sort();
const sources = (snapshot: MasterHostSnapshot) => Object.fromEntries(snapshot.files.map(path => [path, snapshot.source(path)]));
const selected = (snapshot: MasterHostSnapshot, selection: MasterSelection) => snapshot.currentPath === selection.path
  && snapshot.source(selection.path) === selection.paintedSource && snapshot.selection?.path === selection.path && snapshot.selection.paintedSource === selection.paintedSource
  && snapshot.selection.range.start === selection.range.start && snapshot.selection.range.end === selection.range.end
  && JSON.stringify(snapshot.selection.node) === JSON.stringify(selection.node);

/** Explicit linked-copy sessions. The host supplies atomic operations and bounded Undo history. */
export function createNativePagePartController(host: MasterControllerHost) {
  let session: Session | undefined;
  const fail = (error: string) => { host.announce(error); return { error }; };
  function own(snapshot: MasterHostSnapshot, selection: MasterSelection) {
    if (!selected(snapshot, selection)) return undefined;
    const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
    const resolved = resolvePagePartLinks({ documentText: json, sources: sources(snapshot) });
    if ("error" in resolved) return undefined;
    const links = resolved.links.filter(link => link.page === selection.path && link.start === selection.range.start && link.end === selection.range.end);
    if (links.length !== 1) return undefined;
    const record = readPagePartCatalog(json)[links[0].link.recordId];
    return record ? { record, link: links[0] } : undefined;
  }
  function activeRecord(active: Session, snapshot: MasterHostSnapshot): PagePartRecord {
    if (snapshot.revision !== active.revision || snapshot.currentPath !== active.htmlPath
      || JSON.stringify(graph(snapshot)) !== JSON.stringify(active.files)) throw new Error("The page part session changed. Open it again.");
    const record = readPagePartCatalog(snapshot.source(EDITOR_PAGE_BUILDER_PATH))[active.recordId];
    if (!record || JSON.stringify(record) !== active.record) throw new Error("The page part record changed. Open it again.");
    return record;
  }
  async function edit(selection: MasterSelection): Promise<void> {
    const snapshot = host.snapshot();
    let opening: Session | undefined;
    try {
      const found = own(snapshot, selection);
      if (!found) { fail("Select a whole linked header or footer to edit its master."); return; }
      readPagePartMaster(found.record, { files: snapshot.files, sources: sources(snapshot) });
      const active: Session = { token: `page-part-session-${++sessions}`, revision: snapshot.revision,
        recordId: found.record.id, record: JSON.stringify(found.record), files: graph(snapshot), htmlPath: found.record.htmlPath,
        pagePath: selection.path, pageSource: selection.paintedSource, range: { ...selection.range }, key: found.link.key };
      session = active;
      opening = active;
      const opened = await host.open(active.htmlPath, active.revision);
      if (session !== active) return;
      if (!opened) { session = undefined; fail("The master was not opened."); return; }
      activeRecord(active, host.snapshot());
      if (host.snapshot().source(active.pagePath) !== active.pageSource) throw new Error("The original page changed. Open the page part again.");
    } catch (error) {
      if (opening && session !== opening) return;
      if (opening) session = undefined;
      fail(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    edit,
    identity(selection: MasterSelection) {
      try {
        const found = own(host.snapshot(), selection);
        return found && { recordId: found.record.id, label: found.record.label, rootTag: found.record.rootTag,
          master: true, linked: true, onEdit: () => edit(selection) };
      } catch { return undefined; }
    },
    async save(selection: MasterSelection, options: Pick<SavePagePartInput, "id" | "label" | "rootClass" | "stylesheetPath" | "key">): Promise<boolean> {
      const snapshot = host.snapshot();
      if (!selected(snapshot, selection)) { fail("Select the header or footer again."); return false; }
      const plan = planSavePagePart({ ...options, documentText: snapshot.source(EDITOR_PAGE_BUILDER_PATH), files: snapshot.files,
        sources: sources(snapshot), pagePath: selection.path, pageSource: selection.paintedSource, range: selection.range });
      if ("error" in plan) { fail(plan.error); return false; }
      return host.apply(plan.operation, plan.expectedFiles, () => host.snapshot().revision === snapshot.revision && selected(host.snapshot(), selection));
    },
    async link(recordId: string, copies: LinkPagePartInput["copies"]): Promise<boolean> {
      const snapshot = host.snapshot();
      const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
      if (json === undefined) { fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`); return false; }
      const plan = planLinkPagePartCopies({ documentText: json, files: snapshot.files, sources: sources(snapshot), recordId, copies });
      if ("error" in plan) { fail(plan.error); return false; }
      return host.apply(plan.operation, plan.expectedFiles, () => host.snapshot().revision === snapshot.revision);
    },
    previewInput(): (NativePagePartEditInput & { kind: "page-part"; rootTag: "header" | "footer" }) | undefined {
      const active = session;
      if (!active) return undefined;
      try {
        const snapshot = host.snapshot();
        const record = activeRecord(active, snapshot);
        if (snapshot.source(active.pagePath) !== active.pageSource) return undefined;
        const located = host.locateCopy?.(active.pageSource, active.range);
        if (!located || located.range.start !== active.range.start || located.range.end !== active.range.end
          || !located.node.length || !located.node.every(index => Number.isSafeInteger(index) && index >= 0)) return undefined;
        const basis = active.pageSource.slice(active.range.start, active.range.end);
        if (pagePartCore(basis).rootTag !== record.rootTag) return undefined;
        return { kind: "page-part", rootTag: record.rootTag, session: active.token, pagePath: active.pagePath, pageSource: active.pageSource, node: [...located.node], basis,
          masterPath: active.htmlPath, masterSource: readPagePartMaster(record, { files: snapshot.files, sources: sources(snapshot) }) };
      } catch { return undefined; }
    },
    context() {
      const active = session;
      if (!active) return undefined;
      if (host.snapshot().revision !== active.revision) { session = undefined; return undefined; }
      try {
        const snapshot = host.snapshot();
        const record = activeRecord(active, snapshot);
        readPagePartMaster(record, { files: snapshot.files, sources: sources(snapshot) });
        return { kind: "page-part" as const, rootTag: record.rootTag, recordId: record.id, label: record.label, htmlPath: active.htmlPath, pagePath: active.pagePath };
      } catch (error) {
        const original = JSON.parse(active.record) as PagePartRecord;
        return { kind: "page-part" as const, rootTag: original.rootTag, label: original.label, recordId: active.recordId, htmlPath: active.htmlPath, pagePath: active.pagePath,
          masterError: error instanceof Error ? error.message : String(error) };
      }
    },
    async done(): Promise<void> {
      const active = session;
      session = undefined;
      if (!active) return;
      const snapshot = host.snapshot();
      if (snapshot.revision !== active.revision || nativePageRoute(active.pagePath) === undefined || !snapshot.files.includes(active.pagePath)) { fail("Open the original page again."); return; }
      if (!await host.open(active.pagePath, active.revision)) return;
      const after = host.snapshot();
      if (after.revision !== active.revision || after.currentPath !== active.pagePath) return;
      if (after.source(active.pagePath) === active.pageSource) host.select(active.pagePath, active.range);
      else fail("The page changed. Select the header or footer again.");
    },
    async updateCopies(): Promise<CopiesUpdateResult> {
      const active = session;
      if (!active) return fail("Open a shared header or footer first.");
      try {
        const snapshot = host.snapshot();
        activeRecord(active, snapshot);
        const json = snapshot.source(EDITOR_PAGE_BUILDER_PATH);
        if (json === undefined) return fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
        const plan = planUpdatePagePartCopies({ documentText: json, files: snapshot.files, sources: sources(snapshot), recordId: active.recordId });
        if ("error" in plan) return fail(plan.error);
        if (!plan.operation) return { changed: 0, skipped: plan.skipped.length };
        const current = () => {
          if (session !== active) return false;
          try { activeRecord(active, host.snapshot()); return true; } catch { return false; }
        };
        if (!await host.apply(plan.operation, plan.expectedFiles, current)) return fail("The pages or master changed. Nothing was updated.");
        const after = host.snapshot();
        const page = plan.operation.edits.get(active.pagePath);
        if (session === active && after.revision === active.revision && page !== undefined
          && active.pageSource === plan.operation.expectedSources.get(active.pagePath)
          && [...plan.operation.edits].every(([path, text]) => after.source(path) === text)) {
          const resolved = resolvePagePartLinks({ documentText: after.source(EDITOR_PAGE_BUILDER_PATH), sources: sources(after) });
          if (!("error" in resolved)) {
            const link = resolved.links.find(link => link.page === active.pagePath && link.key === active.key && link.link.recordId === active.recordId);
            if (link) session = { ...active, pageSource: page, range: { start: link.start, end: link.end } };
          }
        }
        host.announce(`Updated ${plan.updated.length}; ${plan.skipped.length} customised left as they are.`);
        return { changed: plan.updated.length, skipped: plan.skipped.length };
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    },
  };
}
export type NativePagePartController = ReturnType<typeof createNativePagePartController>;
