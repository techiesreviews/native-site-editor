import type { parseCssImports } from "../../shared/css-imports";
import type { nativePageStylesheets } from "../../shared/native-project";
import type { isSectionTemplate } from "../native-insert";
import { expandStyleImports, resolveImportPath } from "../../shared/css-imports";
import type { NativeSite } from "../../shared/native-project";
import { nativeDefaultRoute } from "../../shared/native-project";
import type { createAppStore } from "../app-store";
import type { EditBarControl } from "../components/edit-bar";
import type { InsertChoice, InsertPoint } from "../components/insert-controls";
import type { createNativePreview, NativePreviewSelection, NativeStructureItem } from "../components/native-preview";
import type { NativeSharedMetadata } from "../components/native-shared-authoring";
import type { NativeSharedRoot } from "../components/page-structure";
import type * as sourceEditor from "../components/source-editor";
import type { DraftScope } from "../drafts";
import { componentLabel, nativeInsertEdit } from "../native-insert";
import type { locateNativeElement, locateNativeElementRange, startTagAttribute } from "../native-source-location";
import type { AddChoice } from "../page-builder/add-catalog";
import { decodeHtmlEntities } from "../page-builder/html-entities";
import { positionText } from "../page-builder/insert-target";
import { nativeChoiceMarkup } from "../page-builder/native-elements";
import { nativeDestinations, nativeMarkupInsertEdit } from "../page-builder/native-operations";
import type { createNativePagePartController } from "../page-builder/native-page-part-controller";
import type { readPagePartCatalog } from "../page-builder/native-page-parts";
import { PAGE_PART_FOLDER, planLinkPagePartCopies, planSavePagePart, planUnlinkPagePart, resolvePagePartLinks } from "../page-builder/native-page-parts";
import { deleteNativeSectionLink, planNativeSectionLink, registerInsertedNativeSection, resolveNativeSectionLinks, sectionCore } from "../page-builder/native-section-links";
import type { createNativeSectionMasterController, MasterControllerHost, MasterSelection } from "../page-builder/native-section-master-controller";
import { planSelectedStaticSectionSave } from "../page-builder/native-section-save";
import { planNativeSharedSection } from "../page-builder/native-shared-section";
import { EDITOR_PAGE_BUILDER_PATH } from "../page-builder/page-builder-document";
import { DEFAULT_SECTION_CHOICE_PREFIX, DEFAULT_STATIC_SECTIONS, planDefaultStaticSectionInsert, previewDefaultStaticSection } from "../page-builder/static-section-defaults";
import type { listSectionChoices, readSectionCatalog } from "../page-builder/static-sections";
import { planStaticSectionInsert, previewStaticSection, resolveStaticSection, SECTION_MASTER_FOLDER, type SectionMasterContext, type StaticSectionInsertPlan, type StaticSectionMasterEntry, type StaticSectionOperation } from "../page-builder/static-sections";
import type { ThumbnailInputs } from "../page-builder/thumbnail-doc";
import type { createCodePanesController } from "./code-panes-controller";

export interface SharedSectionsPorts {
  generation(): number;
  fileGeneration(): number;
  setupScope(): string;
  draftScope(): DraftScope | undefined;
  versionView(): unknown;
  site(): NativeSite | undefined;
  textIndexed(): boolean;
  store: Pick<ReturnType<typeof createAppStore>, "openFile" | "selection">;
  editor(): typeof sourceEditor | undefined;
  preview(): ReturnType<typeof createNativePreview> | undefined;
  codePanes(): Pick<ReturnType<typeof createCodePanesController>, "heightResize">;
  masterController(): ReturnType<typeof createNativeSectionMasterController>;
  pagePartController(): ReturnType<typeof createNativePagePartController>;
  nativeFiles(): string[];
  nativeSources(): Record<string, string>;
  nativeEffectiveSource(path: string): string | undefined;
  ensureNativeTextIndex(): Promise<string | undefined>;
  wantNativeTextIndex(): void;
  restoreFile(path: string, epoch: number, options: { linkDefaultStyle?: boolean; beforeMount?: () => boolean }): Promise<unknown>;
  applyNativeOperation(operation: StaticSectionOperation & { current?: () => boolean; selection?: { before?: { path: string; node: number[] }; after?: { path: string; node: number[] } } }): Promise<string | undefined>;
  announce(message: string): void;
  errorMessage(error: unknown): void;
  status(message: string): void;
  codeCollapsed(): boolean;
  renderNativeEditBar(selection: NativePreviewSelection): void;
  renderMasterBanner(): void;
  updateNativePreviewSources(): void;
  renderNativeShownStructure(): void;
  nativeStructureEdit(path: string, node: number[], painted: string, part: boolean): Promise<void>;
  paintedSource(item: NativeStructureItem): string | undefined;
  selectionEpoch(): number;
  nativeClassCount(source: string, name: string): number;
  nativeSharedCatalogs(text: string | undefined): { sections: ReturnType<typeof readSectionCatalog>; parts: ReturnType<typeof readPagePartCatalog> } | undefined;
  nativeCanonicalCopy(source: string, range: { start: number; end: number }): { node: number[]; range: { start: number; end: number } } | undefined;
  locateNativeElement: typeof locateNativeElement;
  locateNativeElementRange: typeof locateNativeElementRange;
  startTagAttribute: typeof startTagAttribute;
  readSectionCatalog: typeof readSectionCatalog;
  listSectionChoices: typeof listSectionChoices;
  isNativeSectionTag(tag: string): boolean;
  parseCssImports: typeof parseCssImports;
  nativePageStylesheets: typeof nativePageStylesheets;
  isSectionTemplate: typeof isSectionTemplate;
  setTimer(callback: () => void): unknown;
}

/** Coordinates sharing using live host ports; captured proofs belong to their original operation. */
export function createSharedSectionsController(ports: SharedSectionsPorts) {
  function nativeSectionSavePlan(selection: NativePreviewSelection) {
    if (!ports.site() || ports.versionView() || selection.tag !== "section" || selection.host || !selection.path || !selection.node?.length) return undefined;
    if (!Object.values(ports.site()!.routes).includes(selection.path) || ports.store.openFile.value !== selection.path || !ports.editor()?.isMounted(selection.path)) return undefined;
    const source = ports.nativeEffectiveSource(selection.path);
    const range = source === undefined ? undefined : ports.locateNativeElementRange(source, selection.node);
    const docText = ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH);
    // An editor JSON whose saved sections can't be read offers no save action; the bar stays plain.
    const catalogs = docText === undefined ? undefined : ports.nativeSharedCatalogs(docText);
    if (source === undefined || !range || docText === undefined || !catalogs) return undefined;
    const plan = planSelectedStaticSectionSave({ pagePath: selection.path, pageSource: source, range: { start: range.start, end: range.end }, documentText: docText, files: ports.nativeFiles().sort(), master: nativeSaveMaster(docText, source, selection.node) });
    if ("error" in plan) return undefined;
    const entry = catalogs.sections[plan.recordId];
    return entry ? { plan, label: entry.label, master: Object.hasOwn(entry, "htmlPath") } : undefined;
  }
  // The loaded master of the one saved section with a master file whose rootClass the selected
  // section carries: Save then writes into that master. Undefined otherwise (a v1 save, or none).
  // Classes come from the parsed, decoded class attribute; names compare exactly, as CSS does.
  function nativeSaveMaster(docText: string, source: string, node: number[]): string | undefined {
    const tag = ports.locateNativeElement(source, node);
    if (!tag) return undefined;
    const classes = new Set(decodeHtmlEntities(ports.startTagAttribute(source, tag, "class")?.value ?? "", true).split(/[\t\n\f\r ]+/).filter(Boolean));
    const masters = Object.values(ports.nativeSharedCatalogs(docText)?.sections ?? {}).filter((entry): entry is StaticSectionMasterEntry => Object.hasOwn(entry, "htmlPath") && classes.has(entry.rootClass));
    return masters.length === 1 ? ports.nativeEffectiveSource(masters[0].htmlPath) : undefined;
  }
  let nativeSectionSaveLoading: Promise<unknown> | undefined;
  function nativeSectionSaveControls(selection: NativePreviewSelection): EditBarControl[] {
    const eligible = nativeSectionSavePlan(selection);
    if (!eligible) {
      // The editor JSON exists but is not read yet: read it once, then redraw
      // whichever section is selected by then (it may differ from this one).
      if (selection.tag === "section" && !nativeSectionSaveLoading && ports.nativeFiles().includes(EDITOR_PAGE_BUILDER_PATH) && ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH) === undefined) {
        const epoch = ports.generation(), scope = ports.setupScope();
        const loading = ports.ensureNativeTextIndex().catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
        nativeSectionSaveLoading = loading;
        void loading.then((error) => {
          if (nativeSectionSaveLoading === loading) nativeSectionSaveLoading = undefined;
          if (ports.versionView() || ports.generation() !== epoch || ports.setupScope() !== scope) return;
          const current = ports.store.selection.value;
          if (error) {
            // Only tell about it while a section is still selected that wanted it.
            if (current?.tag === "section") ports.announce(`Saved sections could not be read. ${error}`);
            return;
          }
          if (current?.tag === "section" && ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH) !== undefined && nativeSectionSavePlan(current)) ports.renderNativeEditBar(current);
        });
      }
      return [];
    }
    const label = eligible.label.length > 24 ? "Update saved section" : `Update ${eligible.label}`;
    return [{ kind: "button", label, className: "edit-bar__component-action",
      title: eligible.master
        ? `Save this section's HTML into the “${eligible.label}” master. Copies on pages change only with Update copies.`
        : `Update the saved section “${eligible.label}” with this section's HTML, for future inserts only. This page and copies already on pages stay as they are.`,
      onPress: () => void saveNativeStaticSection(selection) }];
  }
  async function saveNativeStaticSection(selection: NativePreviewSelection) {
    // Everything the plan reads is pinned here, before the first await.
    const path = selection.path, node = selection.node ? [...selection.node] : undefined;
    const scope = ports.draftScope(), epoch = ports.generation(), scopeKey = ports.setupScope();
    if (!path || !node || !scope || ports.versionView() || ports.store.openFile.value !== path || !ports.editor()?.isMounted(path)) { ports.announce("Open the page and select its section again."); return; }
    if (ports.store.selection.value?.path !== path || ports.store.selection.value.node?.join(".") !== node.join(".")) { ports.announce("Select the section again."); return; }
    const proof = ports.editor()!.captureFileModelState(scope, path);
    const source = ports.nativeEffectiveSource(path);
    const files = ports.nativeFiles().sort();
    const filesKey = files.join("\n");
    const docText = ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH);
    const range = source === undefined ? undefined : ports.locateNativeElementRange(source, node);
    if (source === undefined || !range) { ports.announce("The section could not be matched to its source. Select it again."); return; }
    if (files.includes(EDITOR_PAGE_BUILDER_PATH) && docText === undefined) {
      // Read the editor JSON, then let the person choose again rather than saving from a stale choice.
      const error = await ports.ensureNativeTextIndex();
      if (error) ports.errorMessage(new Error(error));
      else ports.status("Saved sections have loaded. Select the section again to update it.");
      return;
    }
    // Saved sections that can't be read are refused here, as an error, before anything is planned.
    if (docText !== undefined && !ports.nativeSharedCatalogs(docText)) { ports.errorMessage(new Error(`Section not saved: ${EDITOR_PAGE_BUILDER_PATH} can't be read. Fix it in Code first.`)); return; }
    const masterSource = docText === undefined ? undefined : nativeSaveMaster(docText, source, node);
    const plan = planSelectedStaticSectionSave({ pagePath: path, pageSource: source, range: { start: range.start, end: range.end }, documentText: docText, files, master: masterSource });
    if ("error" in plan) { ports.errorMessage(new Error(`Section not saved: ${plan.error}`)); return; }
    const savedEntry = docText === undefined ? undefined : ports.nativeSharedCatalogs(docText)?.sections[plan.recordId];
    const label = savedEntry?.label;
    const intoMaster = savedEntry !== undefined && Object.hasOwn(savedEntry, "htmlPath");
    if (plan.noop) { ports.announce(intoMaster ? `The ${label} master already matches this section.` : `${label ?? "The saved section"} already matches this section; future inserts use it.`); return; }
    const expectedFiles = (plan.expectedFiles ?? files).join("\n");
    const current = () => !ports.versionView() && ports.generation() === epoch && ports.setupScope() === scopeKey && proof.isCurrent()
      && ports.store.openFile.value === path && Boolean(ports.editor()?.isMounted(path)) && ports.nativeEffectiveSource(path) === source
      && ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH) === docText && ports.nativeFiles().sort().join("\n") === expectedFiles && expectedFiles === filesKey
      && ports.store.selection.value?.path === path && ports.store.selection.value.node?.join(".") === node.join(".");
    if (!current()) { ports.errorMessage(new Error("The page or the editor's JSON changed. Select the section and save again.")); return; }
    const { open: _open, creates: _creates, ...operation } = plan.operation;
    const done = intoMaster
      ? `Saved this section into the ${label} master. Copies on pages change only with Update copies.`
      : `Updated ${label ?? "the saved section"} for future inserts. This page and copies already on pages stay as they are.`;
    const error = await ports.applyNativeOperation({ ...operation, ...(label ? { done } : {}), current });
    if (error) ports.errorMessage(new Error(error));
  }

  // Saved-section masters (src/page-builder/native-section-master-controller.ts). A page click
  // always selects the page's own copy; only the explicit purple Edit on a whole saved section
  // opens its master. The host below gives the controller this editor's state and transactions.
  const masterRevision = () => `${ports.setupScope()}:${ports.generation()}`;
  // The selected page's source model as it was when the edit bar offered Edit (persistent: it
  // survives the page leaving Code for its master), checked before and through the transaction.
  let masterPageProof: { isCurrent(): boolean } | undefined;
  // Code was collapsed when Edit opened a master and was revealed for it: the pane's state right
  // after that reveal. Done folds Code back only while that state is unchanged; a resize or fold the
  // person made meanwhile is theirs and stays.
  let masterRevealedCode: { collapsed: boolean; height: number } | undefined;
  function nativeMasterSelection(selection = ports.store.selection.value): MasterSelection | undefined {
    if (!selection?.path || !selection.node || selection.host) return undefined;
    const source = ports.nativeEffectiveSource(selection.path);
    const range = source === undefined ? undefined : ports.locateNativeElementRange(source, selection.node);
    if (!range || source === undefined) return undefined;
    const painted = selection.paintedSource ?? source;
    return { path: selection.path, node: [...selection.node], range: { start: range.start, end: range.end }, paintedSource: painted };
  }
  // The private master files a live controller session may open: saved sections and page parts only.
  const isPrivateMasterPath = (path: string) => path.startsWith(SECTION_MASTER_FOLDER) || path.startsWith(PAGE_PART_FOLDER);
  // The last private master an Edit's own open mounted, with the file generation it left; a failed
  // check after that open restores the opening page only while nothing has navigated since.
  let masterOpened: { path: string; fileGeneration: number } | undefined;
  const masterHost: MasterControllerHost = {
    snapshot: () => ({
      revision: masterRevision(), files: ports.nativeFiles().sort(), source: (path) => ports.nativeEffectiveSource(path),
      currentPath: ports.store.openFile.value ?? "", selection: ports.store.openFile.value && ports.store.selection.value?.path === ports.store.openFile.value ? nativeMasterSelection() : undefined,
    }),
    async open(path, revision) {
      if (ports.versionView() || masterRevision() !== revision) return false;
      const epoch = ports.generation(), master = isPrivateMasterPath(path);
      // A private master mounts only while a live session still wants it: an open that resolves after
      // Done, or after its session was refused, never takes the Code pane.
      const owned = () => !master || ports.masterController().context()?.htmlPath === path || ports.pagePartController().context()?.htmlPath === path;
      await ports.restoreFile(path, epoch, { linkDefaultStyle: false, beforeMount: () => masterRevision() === revision && owned() });
      const opened = masterRevision() === revision && ports.store.openFile.value === path;
      if (opened && master) masterOpened = { path, fileGeneration: ports.fileGeneration() };
      return opened;
    },
    // The editor's own browser-built locator: the node only when it maps back to exactly `range`.
    locateCopy: (source, range) => ports.nativeCanonicalCopy(source, range),
    select(path, range) {
      // Recomputed on the page as it is now, never from a remembered node.
      const source = ports.nativeEffectiveSource(path);
      const located = source === undefined ? undefined : ports.nativeCanonicalCopy(source, range);
      if (located) ports.preview()?.selectNode({ path, node: located.node });
    },
    async apply(operation, expectedFiles, current) {
      const files = expectedFiles?.join("\n");
      const proof = masterPageProof;
      const error = await ports.applyNativeOperation({
        ...operation,
        current: () => !ports.versionView() && current() && (files === undefined || ports.nativeFiles().sort().join("\n") === files) && (!proof || proof.isCurrent()),
      });
      if (error) { ports.errorMessage(new Error(error)); return false; }
      return true;
    },
    announce: ports.announce,
  };
  // The one live master session (a saved section or a shared header/footer), or none. A session
  // left by navigation keeps its context (it resumes when its master is opened again), so two may
  // exist: the one whose master is open, then the one whose preview input is still live, wins.
  function activeMaster() {
    const all = [
      { controller: ports.masterController(), context: ports.masterController().context(), input: () => ports.masterController().previewInput() },
      { controller: ports.pagePartController(), context: ports.pagePartController().context(), input: () => ports.pagePartController().previewInput() },
    ].filter(item => item.context);
    const pick = (found: typeof all) => found.length === 1 ? { controller: found[0].controller, context: found[0].context!, input: found[0].input } : undefined;
    return all.length < 2 ? pick(all) : pick(all.filter(item => item.context!.htmlPath === ports.store.openFile.value)) ?? pick(all.filter(item => item.input()));
  }
  // The master session the preview shows, as the controller proves it now, or none.
  function nativeMasterEdit() {
    if (ports.versionView()) return undefined;
    return activeMaster()?.input();
  }
  // The open master's path while its session is live and it is the open file; otherwise undefined.
  function nativeOpenMaster() {
    const master = nativeMasterEdit();
    return master && ports.store.openFile.value === master.masterPath ? master : undefined;
  }
  // The source the bar and Style edit for `path`: the public source, or, for the open master
  // during its own live session, the master file (editor-private, so not among public sources).
  function nativeEditableSource(path: string): string | undefined {
    if (isPrivateMasterPath(path)) return nativeOpenMaster()?.masterPath === path ? ports.nativeEffectiveSource(path) : undefined;
    return ports.nativeSources()[path];
  }

  // The edit bar's label and purple Edit for a whole saved section or linked header/footer, or nothing.
  function nativeMasterIdentity(selection: NativePreviewSelection) {
    if (ports.versionView()) return undefined;
    const part = selection.tag === "header" || selection.tag === "footer";
    if (!part && (!ports.isNativeSectionTag(selection.tag) || selection.tag.includes("-"))) return undefined;
    const at = nativeMasterSelection(selection);
    const identity = at && (part ? ports.pagePartController().identity(at) : ports.masterController().identity(at));
    if (!identity) return undefined;
    const scope = ports.draftScope(), revision = masterRevision();
    // Captured as the bar renders: an Edit pressed later on a replaced model (even with the same
    // bytes) or in another scope refuses before anything is written.
    const proof = scope && ports.editor() ? ports.editor()!.captureFileModelState(scope, at.path, true) : undefined;
    return {
      kind: identity.label,
      component: {
        tag: part ? selection.tag : "section",
        onEdit: () => {
          if (!proof || !proof.isCurrent() || masterRevision() !== revision) { ports.announce("The page changed. Select the section again."); return; }
          runMasterEdit(part ? ports.pagePartController() : ports.masterController(), identity.onEdit, proof, at.path, revision);
        },
      },
    };
  }
  // Opens a master through its controller with the page's proof pinned for the transaction. Code is
  // revealed for it (and remembered, so Done can fold it back). A master this Edit mounted whose
  // session was then refused is replaced by the opening page, only while no later navigation took over.
  function runMasterEdit(controller: { context(): { htmlPath: string } | undefined }, edit: () => Promise<void>, proof: { isCurrent(): boolean }, pagePath: string, revision: string) {
    masterPageProof = proof;
    masterOpened = undefined;
    const collapsed = ports.codeCollapsed();
    void edit().finally(() => {
      masterPageProof = undefined;
      const opened = masterOpened;
      masterOpened = undefined;
      // Only this Edit's own session decides: another session kept from earlier (left by navigation,
      // resumable when its master is opened again) neither reveals Code nor keeps a refused master open.
      const own = controller.context();
      if (own && ports.store.openFile.value === own.htmlPath) {
        // The master is usable only with Code showing: reveal it, and remember to fold it back.
        const codeResize = ports.codePanes().heightResize();
        if (collapsed && ports.codeCollapsed() && codeResize) {
          codeResize.toggle();
          masterRevealedCode = codeResize.state();
        }
      } else if (opened && opened.fileGeneration === ports.fileGeneration() && ports.store.openFile.value === opened.path && masterRevision() === revision) {
        // A master this Edit mounted, whose session was refused after: the opening page comes back.
        // restoreFile's own file generation drops it when anything navigates meanwhile.
        void ports.restoreFile(pagePath, ports.generation(), { linkDefaultStyle: false, beforeMount: () => activeMaster()?.context.htmlPath !== opened.path && masterRevision() === revision });
      }
      ports.renderMasterBanner();
    });
  }

  function nativeSectionChoices(): InsertChoice[] {
    if (!ports.site()) return [];
    // The Add panel lists every section component: their templates are the text index.
    if (!ports.textIndexed()) ports.wantNativeTextIndex();
    const sources = ports.nativeSources();
    return Object.entries(ports.site()!.components)
      .filter(([, path]) => ports.isSectionTemplate(sources[path] ?? ""))
      .map(([tag]) => ({ tag, label: componentLabel(tag) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // Puts a new instance of a section component into the page at `point`, as
  // one undo step, and selects it. The page file opens first when another
  // file is in the editor, since edits go through the mounted editor.
  const nativeAddPoints = new WeakMap<InsertPoint, { source: string; epoch: number; scope: string; description: string; doc?: string; files?: string; css?: string }>();
  function nativeElementAddPoint(choice: InsertChoice, fallback: InsertPoint | undefined, mode: "click" | "drop" | "gap" = "click"): InsertPoint | undefined {
    const isStatic = isStaticSectionTag(choice.tag);
    const staticPreview = isStatic ? nativeStaticSectionPreview(choice.tag) : undefined;
    if (isStatic && !staticPreview) return;
    const markup = staticPreview?.html ?? nativeChoiceMarkup(choice.tag);
    if (/native:(?:grid|columns)$/.test(choice.tag)) return;
    if (!markup) return fallback;
    if (ports.versionView() || !ports.site()) return;
    const selected = ports.store.selection.value;
    const path = selected?.path && Object.values(ports.site()!.routes).includes(selected.path) ? selected.path : fallback?.path;
    const source = path && ports.nativeEffectiveSource(path);
    if (!path || source === undefined) return;
    const destinations = selected?.path === path && selected.node ? nativeDestinations(source, path, selected.node) : [];
    // A whole section goes where a section component would (the page's section gap); never inside the selected element's parent.
    const candidates = mode !== "click" || isStatic ? [] : [...destinations.filter(item => item.placement === "inside"), ...destinations.filter(item => item.placement === "after")];
    if (fallback?.path === path) candidates.push({ point: fallback, description: isStatic ? positionText(fallback) : `Inside ${fallback.tag || "page"}, at this gap`, placement: "inside", selection: [] });
    const found = candidates.find(item => nativeMarkupInsertEdit(source, item.point.parent, item.point.index, markup));
    if (!found) return;
    const point = { ...found.point, parent: [...found.point.parent] };
    nativeAddPoints.set(point, { source, epoch: ports.generation(), scope: ports.setupScope(), description: found.description,
      ...(isStatic ? { doc: ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH), files: ports.nativeFiles().sort().join("\n"), css: nativeStaticCssSnapshot() } : {}) });
    return point;
  }
  async function insertNativeComponent(point: InsertPoint, choice: InsertChoice) {
    if (isStaticSectionTag(choice.tag)) { await insertStaticSection(point, choice); return; }
    const path = point.path;
    const native = nativeChoiceMarkup(choice.tag);
    const captured = nativeAddPoints.get(point);
    const sourceBefore = captured?.source ?? ports.nativeEffectiveSource(path);
    const epochBefore = captured?.epoch ?? ports.generation(), scopeBefore = captured?.scope ?? ports.setupScope();
    const current = () => !ports.versionView() && ports.generation() === epochBefore && ports.setupScope() === scopeBefore && ports.nativeEffectiveSource(path) === sourceBefore;
    if (native && !current()) { ports.errorMessage(new Error("The insertion source changed. Choose the destination again.")); return; }
    if (!ports.preview() || !ports.site() || !Object.values(ports.site()!.routes).includes(path)) return;
    if (ports.store.openFile.value !== path || !ports.editor()?.isMounted(path)) {
      const epoch = ports.generation();
      await ports.restoreFile(path, epoch, { linkDefaultStyle: false });
      if (epoch !== ports.generation() || ports.store.openFile.value !== path || !ports.editor()?.isMounted(path)) return;
    }
    const editor = ports.editor();
    const preview = ports.preview();
    if (!editor || !preview) return;
    const template = ports.nativeSources()[ports.site()!.components[choice.tag] ?? ""] ?? "";
    const source = ports.nativeSources()[path] ?? "";
    if (native && !current()) { ports.errorMessage(new Error("The insertion source changed. Choose the destination again.")); return; }
    const edit = native ? nativeMarkupInsertEdit(source, point.parent, point.index, native) : nativeInsertEdit(source, point.parent, point.index, choice.tag, template);
    if (!edit) {
      ports.errorMessage(new Error(`${choice.label} was not added: the HTML around that spot could not be located exactly in ${path}.`));
      return;
    }
    preview.selectAfterUpdate({ path, node: [...point.parent, point.index] });
    try {
      editor.replaceActiveRanges([{ path, ...edit, expected: source.slice(edit.start, edit.end) }]);
      ports.status(`${choice.label} added`);
    } catch (error) {
      preview.selectAfterUpdate(undefined);
      ports.errorMessage(error);
    }
  }

  // Plain HTML/CSS sections (src/page-builder/static-sections.ts): saved records
  // from the editor's JSON and the curated defaults not saved yet, in the same
  // Add catalogue. The published page gets ordinary HTML and a stylesheet link.
  const SAVED_SECTION_PREFIX = "saved-section:";
  const STATIC_SECTION_GROUP = "Plain HTML sections";
  const isStaticSectionTag = (tag: string) => tag.startsWith(SAVED_SECTION_PREFIX) || tag.startsWith(DEFAULT_SECTION_CHOICE_PREFIX);
  // The editor JSON as it is now; `loaded: false` when the file exists but its text is not read yet.
  function nativeSectionDocument(): { loaded: boolean; text: string | undefined } {
    const text = ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH);
    return { loaded: text !== undefined || !ports.nativeFiles().includes(EDITOR_PAGE_BUILDER_PATH), text };
  }
  function nativeStaticSectionChoices(): AddChoice[] {
    if (!ports.site() || ports.versionView()) return [];
    const { loaded, text } = nativeSectionDocument();
    if (!loaded) return [];
    try {
      const saved = ports.listSectionChoices(text).map(choice => ({ tag: SAVED_SECTION_PREFIX + choice.id, label: choice.label, group: STATIC_SECTION_GROUP, kind: "native" as const }));
      return saved;
    } catch { return []; }
  }
  // Why the plain sections are missing from Add, when the editor JSON keeps them out.
  function nativeStaticSectionNotice(): string | undefined {
    if (!ports.site() || ports.versionView()) return undefined;
    const { loaded, text } = nativeSectionDocument();
    if (!loaded) return `Plain HTML sections appear once ${EDITOR_PAGE_BUILDER_PATH} has loaded. Reopen Add in a moment.`;
    let error: string | undefined;
    try {
      ports.listSectionChoices(text);
    } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    return error === undefined ? undefined : `Plain HTML sections are hidden: ${EDITOR_PAGE_BUILDER_PATH} can't be read (${error}). Fix that file, then reopen Add.`;
  }
  // Every loaded stylesheet, the designated one proven absent when it is not a file.
  function nativeStaticStylesheetSources(stylesheetPath: string): { sources: Record<string, string | undefined>; unloaded: boolean } {
    const files = ports.nativeFiles();
    const sources: Record<string, string | undefined> = {};
    let unloaded = false;
    for (const path of files) {
      // Editor-private files (under a dot folder such as .editor/) are never public styles.
      if (!/\.css$/i.test(path) || path.split("/").some(part => part.startsWith("."))) continue;
      const source = ports.nativeEffectiveSource(path);
      if (source === undefined) unloaded = true;
      else sources[path] = source;
    }
    if (!files.includes(stylesheetPath)) sources[stylesheetPath] = undefined;
    return { sources, unloaded };
  }
  // Every public stylesheet's loaded bytes (or "unloaded"), to pin a chosen insertion point.
  function nativeStaticCssSnapshot(): string {
    const { sources, unloaded } = nativeStaticStylesheetSources("");
    return JSON.stringify([unloaded, Object.entries(sources).sort(([a], [b]) => a < b ? -1 : 1)]);
  }
  // Saved sections' master files (.editor/sections/), as loaded now (drafts included), with the graph.
  function nativeMasterContext(files = ports.nativeFiles()): SectionMasterContext {
    return { sources: Object.fromEntries(files.filter(path => path.startsWith(SECTION_MASTER_FOLDER)).map(path => [path, ports.nativeEffectiveSource(path)])), files };
  }
  // One saved section, resolved on its own: a broken master refuses only that section.
  function nativeSavedRecord(id: string, text: string | undefined) {
    const catalog = ports.readSectionCatalog(text);
    return Object.hasOwn(catalog, id) ? resolveStaticSection(catalog[id], nativeMasterContext()) : undefined;
  }
  function nativeStaticRecord(tag: string, text: string | undefined) {
    if (tag.startsWith(SAVED_SECTION_PREFIX)) return nativeSavedRecord(tag.slice(SAVED_SECTION_PREFIX.length), text);
    const id = tag.slice(DEFAULT_SECTION_CHOICE_PREFIX.length);
    return nativeSavedRecord(id, text) ?? DEFAULT_STATIC_SECTIONS.find(section => section.id === id);
  }
  // What adding `tag` would insert now: the saved record with the live public CSS, or a default's seed.
  function nativeStaticSectionPreview(tag: string): { html: string; css: string; stylesheetPath: string; seed: boolean } | undefined {
    const { loaded, text } = nativeSectionDocument();
    if (!loaded) return;
    try {
      const record = nativeStaticRecord(tag, text);
      if (!record) return;
      const { sources } = nativeStaticStylesheetSources(record.stylesheetPath);
      const live = { cssPolicy: "reuse-current" as const, stylesheetSources: sources, files: ports.nativeFiles() };
      const shown = tag.startsWith(SAVED_SECTION_PREFIX)
        ? previewStaticSection(text, record.id, live, nativeMasterContext())
        : previewDefaultStaticSection(text, tag, live, nativeMasterContext());
      const seed = !tag.startsWith(SAVED_SECTION_PREFIX) && !Object.hasOwn(ports.readSectionCatalog(text), record.id);
      return "error" in shown ? undefined : { html: shown.html, css: shown.css, stylesheetPath: record.stylesheetPath, seed };
    } catch { return; }
  }
  // The thumbnail renders through the usual document: the page on show with the section stylesheet linked.
  function nativeStaticSectionThumbnail(tag: string, inputs: ThumbnailInputs): { markup: string; inputs: ThumbnailInputs } | undefined {
    if (!isStaticSectionTag(tag)) return;
    const shown = nativeStaticSectionPreview(tag);
    if (!shown) return;
    const file = inputs.site.routes[inputs.route] ?? inputs.site.routes[nativeDefaultRoute(inputs.site)];
    // A new default appends its seed to the stylesheet as it is; a saved section shows the live stylesheet.
    const current = ports.nativeEffectiveSource(shown.stylesheetPath) ?? "";
    const css = shown.seed ? current.includes(shown.css) ? current : current + (current && !current.endsWith("\n") ? "\n" : "") + shown.css : shown.css;
    const sources = { ...inputs.sources, [shown.stylesheetPath]: css };
    if (file && sources[file] !== undefined && !nativeStaticStylesheetReached(sources, file, shown.stylesheetPath)) {
      const from = file.split("/").slice(0, -1), to = shown.stylesheetPath.split("/");
      while (from.length && from[0] === to[0]) { from.shift(); to.shift(); }
      const link = `<link rel="stylesheet" href="${"../".repeat(from.length) + to.join("/")}">`;
      const page = sources[file];
      const head = page.search(/<\/head\s*>/i);
      sources[file] = head < 0 ? link + page : page.slice(0, head) + link + page.slice(head);
    }
    return { markup: shown.html, inputs: { ...inputs, sources } };
  }
  // Whether the page's stylesheets, with their imports, already load `target`.
  function nativeStaticStylesheetReached(sources: Record<string, string>, file: string, target: string): boolean {
    const queue = ports.nativePageStylesheets(sources[file] ?? "", file), seen = new Set(queue);
    while (queue.length) {
      const path = queue.shift()!;
      if (path === target) return true;
      for (const item of ports.parseCssImports(sources[path] ?? "").imports) {
        const next = resolveImportPath(path, item.url);
        if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return false;
  }
  async function insertStaticSection(point: InsertPoint, choice: InsertChoice) {
    const path = point.path;
    // What its Undo selects again: the element selected for this Add, else the insertion's parent.
    const selectedBefore = ports.store.selection.value?.path === path && ports.store.selection.value.node ? [...ports.store.selection.value.node] : [...point.parent];
    const captured = nativeAddPoints.get(point);
    // Everything the plan reads is pinned here, before the first await.
    const sourceBefore = captured?.source ?? ports.nativeEffectiveSource(path);
    const epochBefore = captured?.epoch ?? ports.generation(), scopeBefore = captured?.scope ?? ports.setupScope();
    const filesBefore = captured?.files ?? ports.nativeFiles().sort().join("\n");
    const docBefore = captured ? captured.doc : ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH);
    const cssBefore = captured?.css ?? nativeStaticCssSnapshot();
    const unchanged = () => !ports.versionView() && ports.generation() === epochBefore && ports.setupScope() === scopeBefore && ports.nativeEffectiveSource(path) === sourceBefore
      && ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH) === docBefore && ports.nativeFiles().sort().join("\n") === filesBefore && nativeStaticCssSnapshot() === cssBefore;
    const changed = () => ports.errorMessage(new Error("The page, its stylesheets or the editor's JSON changed. Choose the section again."));
    if (!unchanged()) { changed(); return; }
    if (!ports.site() || sourceBefore === undefined || !Object.values(ports.site()!.routes).includes(path)) return;
    const filesList = filesBefore.split("\n").filter(Boolean);
    // Unread files are read now; the choice was made without them, so it is made again.
    if (filesList.includes(EDITOR_PAGE_BUILDER_PATH) && docBefore === undefined || nativeStaticStylesheetSources("").unloaded) {
      const error = await ports.ensureNativeTextIndex();
      // Nothing is added from a choice made before the sources were read; a successful read is news, not an error.
      if (error) ports.errorMessage(new Error(error));
      else ports.status(`The site's styles have loaded. Choose ${choice.label} again to add it.`);
      return;
    }
    if (ports.store.openFile.value !== path || !ports.editor()?.isMounted(path)) {
      const epoch = ports.generation();
      await ports.restoreFile(path, epoch, { linkDefaultStyle: false });
      if (epoch !== ports.generation() || ports.store.openFile.value !== path || !ports.editor()?.isMounted(path)) return;
      if (!unchanged()) { changed(); return; }
    }
    const preview = ports.preview();
    if (!preview) return;
    let plan: StaticSectionInsertPlan | { error: string };
    let docText: string | undefined;
    let recordId = "";
    try {
      docText = ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH);
      const record = nativeStaticRecord(choice.tag, docText);
      if (!record) { ports.errorMessage(new Error(`${choice.label} is no longer available. Choose a section again.`)); return; }
      recordId = record.id;
      const { sources, unloaded } = nativeStaticStylesheetSources(record.stylesheetPath);
      if (unloaded) { ports.errorMessage(new Error("Some stylesheets could not be read. Refresh the repository and try again.")); return; }
      const input = { documentText: docText, pagePath: path, pageSource: sourceBefore, parent: point.parent, index: point.index, stylesheetSources: sources, files: filesList };
      plan = choice.tag.startsWith(SAVED_SECTION_PREFIX)
        ? planStaticSectionInsert({ ...input, sectionId: record.id, cssPolicy: "reuse-current", masters: nativeMasterContext(filesList).sources })
        : planDefaultStaticSectionInsert({ ...input, sectionId: choice.tag, masters: nativeMasterContext(filesList).sources });
    } catch (error) { ports.errorMessage(error); return; }
    if ("error" in plan) { ports.errorMessage(new Error(`${choice.label} was not added: ${plan.error}`)); return; }
    const pageAfter = plan.operation.edits.get(path);
    if (pageAfter === undefined) { ports.errorMessage(new Error(`${choice.label} was not added: The page could not be changed.`)); return; }
    const expectedFiles = (plan.expectedFiles ?? filesList).join("\n");
    const current = () => !ports.versionView() && ports.generation() === epochBefore && ports.setupScope() === scopeBefore && [...ports.nativeFiles()].sort().join("\n") === expectedFiles;
    if (!current()) { changed(); return; }
    const { open: _open, ...operation } = plan.operation;
    // Link the new copy to its saved section in the same operation (editor JSON only), from the
    // page and editor JSON as this operation leaves them. A copy that can't be told apart from
    // another on the page is added unlinked.
    const linked = registerNativeCopy(path, pageAfter!, plan.selection.node, operation, docText, filesList, recordId);
    if (linked.error) ports.announce(`${choice.label} is added without a link to its saved section: ${linked.error}`);
    preview.selectAfterUpdate({ path, node: plan.selection.node }, { reveal: "center" });
    const error = await ports.applyNativeOperation({ ...operation, current, selection: { before: { path, node: selectedBefore }, after: { path, node: plan.selection.node } } });
    if (error) { preview.selectAfterUpdate(undefined); ports.errorMessage(new Error(error)); }
  }

  function registerNativeCopy(path: string, pageAfter: string, node: number[], operation: { edits: Map<string, string>; creates?: { path: string; content: string }[]; expectedSources: Map<string, string | undefined> }, docText: string | undefined, files: string[], recordId: string): { error?: string } {
    try {
      const created = operation.creates?.find(file => file.path === EDITOR_PAGE_BUILDER_PATH);
      const jsonAfter = operation.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? created?.content ?? docText;
      if (jsonAfter === undefined) return { error: "there is no editor JSON" };
      const filesAfter = [...new Set([...files, ...(operation.creates ?? []).map(file => file.path)])].sort();
      const range = ports.locateNativeElementRange(pageAfter, node);
      if (!range) return { error: "the new section was not found" };
      const catalog = ports.readSectionCatalog(jsonAfter);
      if (!Object.hasOwn(catalog, recordId)) return { error: "its saved section is not in the editor JSON" };
      const record = resolveStaticSection(catalog[recordId], nativeMasterContext(filesAfter));
      const registered = record && registerInsertedNativeSection({ documentText: jsonAfter, files: filesAfter, pagePath: path, pageSourceAfter: pageAfter, range, record });
      if ("error" in registered) return { error: registered.error };
      // The copy was made from the master as loaded now: pin it with the page and the JSON.
      const htmlPath = (catalog[recordId] as StaticSectionMasterEntry).htmlPath;
      if (htmlPath !== undefined) operation.expectedSources.set(htmlPath, record.html);
      if (created) created.content = registered.documentText;
      else operation.edits.set(EDITOR_PAGE_BUILDER_PATH, registered.documentText);
      if (!operation.expectedSources.has(EDITOR_PAGE_BUILDER_PATH)) operation.expectedSources.set(EDITOR_PAGE_BUILDER_PATH, docText);
      return {};
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }


  // ---- Shared native roots in Structure: Save shared, linked Edit and Disconnect ------------------
  // What sharing reads, beyond the page: the file graph, editor JSON, private masters and every
  // loaded public source (pages and stylesheets), the scope, the open file and master session, and
  // the open page's model. Any change is a new revision; a replaced model (same bytes) is one too.
  let nativeSharedToken = 0;
  let nativeSharedSnapshot: { key: string; proofs: { isCurrent(): boolean }[] } | undefined;
  // Authoring contexts offered under the current revision, by key; a new revision drops them all.
  const nativeSharedContexts = new Map<string, { current: () => boolean; records: readonly string[];
    link: (id: string) => { operation: StaticSectionOperation; expectedFiles: readonly string[]; customised: boolean } | { error: string };
    plan: (metadata: NativeSharedMetadata) => { operation: StaticSectionOperation; expectedFiles: readonly string[] } | { error: string } }>();
  function nativeSharedFieldsRevision() {
    const scope = ports.draftScope(), files = ports.nativeFiles().sort();
    const privateSources = files.filter(isPrivateMasterPath).map(path => [path, ports.nativeEffectiveSource(path) ?? null]);
    const key = JSON.stringify([ports.generation(), ports.setupScope(), ports.versionView() ? "history" : "", ports.store.openFile.value ?? "", nativeMasterEdit()?.session ?? "", ports.textIndexed(), files, ports.nativeSources(),
      ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH) ?? null, privateSources, Boolean(ports.store.openFile.value && ports.editor()?.isMounted(ports.store.openFile.value)), Boolean(scope && ports.editor())]);
    if (nativeSharedSnapshot?.key === key && nativeSharedSnapshot.proofs.every(proof => proof.isCurrent())) return `shared-${nativeSharedToken}`;
    nativeSharedSnapshot = { key, proofs: scope && ports.editor() && ports.store.openFile.value ? [ports.editor()!.captureFileModelState(scope, ports.store.openFile.value)] : [] };
    nativeSharedContexts.clear();
    return `shared-${++nativeSharedToken}`;
  }
  const nativeSharedClassPattern = /^[a-z][a-z0-9_-]*$/;
  function nativeSharedRoot(path: string, item: NativeStructureItem): NativeSharedRoot | undefined {
    const tag = item.tag;
    if (tag !== "section" && tag !== "header" && tag !== "footer") return undefined;
    if (!ports.site() || ports.versionView() || nativeMasterEdit() || ports.store.openFile.value !== path || !ports.editor()?.isMounted(path) || !Object.values(ports.site()!.routes).includes(path)) return undefined;
    // Shared sections span every page: until the text index has read them all, other pages look
    // empty, so nothing is offered. The index is not asked for here (that would read it before the
    // first paint); Structure is drawn again when it lands.
    if (!ports.textIndexed()) return undefined;
    const scope = ports.draftScope(), painted = ports.paintedSource(item);
    if (!scope || painted === undefined || ports.nativeEffectiveSource(path) !== painted) return undefined;
    const range = ports.locateNativeElementRange(painted, item.node);
    if (!range || range.tag.name.toLowerCase() !== tag) return undefined;
    const canonical = ports.nativeCanonicalCopy(painted, range);
    if (!canonical || canonical.node.join(".") !== item.node.join(".")) return undefined;
    const files = ports.nativeFiles().sort();
    const docText = ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH);
    if (docText === undefined && files.includes(EDITOR_PAGE_BUILDER_PATH)) return undefined;
    // An editor JSON whose shared catalogs can't be read offers no shared actions; the row stays plain.
    const catalogs = ports.nativeSharedCatalogs(docText);
    if (!catalogs) return undefined;
    const revision = nativeSharedFieldsRevision(), epoch = ports.generation(), scopeKey = ports.setupScope();
    const proof = ports.editor()!.captureFileModelState(scope, path);
    const sources: Record<string, string | undefined> = { ...ports.nativeSources(), [path]: painted };
    for (const file of files.filter(isPrivateMasterPath)) sources[file] = ports.nativeEffectiveSource(file);
    const pinned = JSON.stringify([files, docText ?? null, files.filter(isPrivateMasterPath).map(file => sources[file] ?? null)]);
    // Everything this row was offered for, checked again after every await and before the write.
    const current = () => !ports.versionView() && !nativeMasterEdit() && epoch === ports.generation() && scopeKey === ports.setupScope() && ports.store.openFile.value === path
      && ports.editor()?.isMounted(path) === true && proof.isCurrent() && ports.nativeEffectiveSource(path) === painted && nativeSharedFieldsRevision() === revision
      && JSON.stringify([ports.nativeFiles().sort(), ports.nativeEffectiveSource(EDITOR_PAGE_BUILDER_PATH) ?? null, files.filter(isPrivateMasterPath).map(file => ports.nativeEffectiveSource(file) ?? null)]) === pinned;
    const exact = { start: range.start, end: range.end };
    const at = (link: { page: string; start: number; end: number }) => link.page === path && link.start === exact.start && link.end === exact.end;
    if (tag === "section") {
      const resolved = resolveNativeSectionLinks({ documentText: docText, sources });
      if ("error" in resolved) return undefined;
      const own = resolved.links.filter(at);
      if (own.length > 1) return undefined;
      if (own.length === 1) {
        const record = catalogs.sections[own[0].link.recordId];
        if (!record) return undefined;
        return { state: "linked", label: record.label, recordId: own[0].link.recordId,
          edit: () => { if (current()) void ports.nativeStructureEdit(path, item.node, painted, false); else ports.announce("The page changed. Select the element again."); },
          disconnect: () => void nativeSharedDisconnect(current, () => {
            const next = deleteNativeSectionLink(docText!, path, own[0].key);
            return typeof next === "string" ? { expectedFiles: files, operation: { expectedSources: new Map([[EDITOR_PAGE_BUILDER_PATH, docText], [path, painted]]),
              edits: new Map([[EDITOR_PAGE_BUILDER_PATH, next]]), creates: [], done: `Disconnected this copy of ${record.label}`, undone: `Reconnected this copy of ${record.label}` } } : next;
          }) };
      }
    } else {
      const resolved = resolvePagePartLinks({ documentText: docText, sources });
      if ("error" in resolved) return undefined;
      const own = resolved.links.filter(at);
      if (own.length > 1) return undefined;
      if (own.length === 1) {
        const record = catalogs.parts[own[0].link.recordId];
        if (!record || record.rootTag !== tag) return undefined;
        return { state: "linked", label: record.label, recordId: record.id,
          edit: () => { if (current()) void ports.nativeStructureEdit(path, item.node, painted, true); else ports.announce("The page changed. Select the element again."); },
          disconnect: () => void nativeSharedDisconnect(current, () => {
            const plan = planUnlinkPagePart({ documentText: docText!, files, pagePath: path, key: own[0].key });
            if ("error" in plan) return plan;
            plan.operation.expectedSources.set(path, painted);
            return { ...plan, operation: { ...plan.operation, done: `Disconnected this ${tag} from ${record.label}`, undone: `Reconnected this ${tag} to ${record.label}` } };
          }) };
      }
    }
    // Save shared: classes the root itself has that nothing else on the page uses, and the public
    // stylesheets the page applies (linked, or imported through a loaded chain).
    const classes = decodeHtmlEntities(ports.startTagAttribute(painted, range.tag, "class")?.value ?? "", true).split(/[\t\n\f\r ]+/)
      .filter((name, index, all) => name && all.indexOf(name) === index && nativeSharedClassPattern.test(name) && ports.nativeClassCount(painted, name) === 1);
    const linked = ports.nativePageStylesheets(painted, path).filter(sheet => !sheet.startsWith(".") && sources[sheet] !== undefined);
    const sheets = [...new Set([...linked, ...expandStyleImports(linked, (sheet) => sources[sheet]).imported])]
      .filter(sheet => !sheet.startsWith(".") && /\.css$/i.test(sheet) && sources[sheet] !== undefined);
    // Existing shared items this exact copy may use: a loaded master of this kind whose root class the
    // copy carries and whose stylesheet the page applies, and whose link plan succeeds as offered.
    const rootClasses = new Set(decodeHtmlEntities(ports.startTagAttribute(painted, range.tag, "class")?.value ?? "", true).split(/[\t\n\f\r ]+/).filter(Boolean));
    type LinkPlan = { operation: StaticSectionOperation; expectedFiles: readonly string[]; customised: boolean } | { error: string };
    const linkPlan = (id: string): LinkPlan => {
      try {
        if (tag === "section") {
          const entry = catalogs.sections[id];
          if (!entry || !Object.hasOwn(entry, "htmlPath") || !rootClasses.has(entry.rootClass) || !sheets.includes(entry.stylesheetPath)) return { error: "That shared section does not fit this section." };
          const record = resolveStaticSection(entry, { files, sources });
          const plan = planNativeSectionLink({ documentText: docText, files, pagePath: path, pageSource: painted, range: exact, record });
          if ("error" in plan) return plan;
          const core = sectionCore(record.html);
          return { operation: plan.operation, expectedFiles: files, customised: painted.slice(exact.start, exact.end) !== record.html.slice(core.start, core.end) };
        }
        const record = catalogs.parts[id];
        if (!record || record.rootTag !== tag || !rootClasses.has(record.rootClass) || !sheets.includes(record.stylesheetPath) || docText === undefined) return { error: `That shared ${tag} does not fit this ${tag}.` };
        const plan = planLinkPagePartCopies({ documentText: docText, files, sources, recordId: id, copies: [{ pagePath: path, range: exact }] });
        if ("error" in plan) return plan;
        plan.operation.expectedSources.set(path, painted);
        return { operation: plan.operation, expectedFiles: plan.expectedFiles, customised: !plan.keys[0]?.unchanged };
      } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    };
    const catalog = tag === "section" ? catalogs.sections : catalogs.parts;
    const savedRecords = Object.keys(catalog).sort().filter(id => !("error" in linkPlan(id))).map(id => ({ id, label: catalog[id].label }));
    // Without a class to choose or a stylesheet to name, and nothing to use, the form could never be completed: no offer.
    if ((!classes.length || !sheets.length) && !savedRecords.length) return undefined;
    const name = (item.heading || item.text || tag).trim().slice(0, 60) || tag;
    const used = new Set([...Object.keys(catalogs.sections), ...Object.keys(catalogs.parts)].map(id => id.toLowerCase()));
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "") || tag;
    let proposedId = base;
    for (let n = 2; used.has(proposedId) || files.includes(`${tag === "section" ? SECTION_MASTER_FOLDER : PAGE_PART_FOLDER}${proposedId}.html`); n++) proposedId = `${base}-${n}`;
    const key = JSON.stringify([revision, path, item.node, exact.start, exact.end, savedRecords.map(record => record.id)]);
    // The same key is the same revision and root: the context a form already holds stays the one checked.
    if (!nativeSharedContexts.has(key)) nativeSharedContexts.set(key, {
      current,
      records: savedRecords.map(record => record.id),
      link: linkPlan,
      plan: (metadata) => {
        const input = { documentText: docText, files, sources, pagePath: path, pageSource: painted, range: exact, id: metadata.id, label: metadata.label, rootClass: metadata.rootClass, stylesheetPath: metadata.stylesheetPath };
        return tag === "section" ? planNativeSharedSection(input) : planSavePagePart(input);
      },
    });
    return {
      state: "available",
      context: { key, kind: tag, initialName: name, proposedId, availableClasses: classes, availableStylesheetPaths: sheets, ...(savedRecords.length ? { savedRecords } : {}) },
      actions: {
        submit: (metadata, contextKey) => nativeSharedSubmit(metadata, contextKey),
        link: (recordId, contextKey) => nativeSharedSubmit(recordId, contextKey),
        // Structure calls this from its own render: the context goes now, the UI updates afterwards.
        close: (contextKey) => { nativeSharedContexts.delete(contextKey); },
      },
    };
  }
  // Save shared (metadata) or Use here (a record id offered with this key): one guarded operation.
  const nativeSharedInFlight = new Set<string>();
  async function nativeSharedSubmit(choice: NativeSharedMetadata | string, key: string): Promise<{ success: true } | { error: string }> {
    const offered = nativeSharedContexts.get(key);
    const changed = "The page or its shared files changed. Select the element again.";
    if (!offered || !offered.current()) return { error: changed };
    if (nativeSharedInFlight.has(key)) return { error: "This is already being saved." };
    if (typeof choice === "string" && !offered.records.includes(choice)) return { error: "Choose a shared item offered for this selection." };
    const plan = typeof choice === "string" ? offered.link(choice) : offered.plan(choice);
    if ("error" in plan) return { error: plan.error };
    const graph = [...plan.expectedFiles].sort().join("\n"), selected = ports.selectionEpoch();
    // A Cancel, a new revision (which drops every offered context), another selection or any change refuses the write.
    const live = () => nativeSharedContexts.get(key) === offered && offered.current() && ports.selectionEpoch() === selected && ports.nativeFiles().sort().join("\n") === graph;
    nativeSharedInFlight.add(key);
    let error: string | undefined;
    try { error = await ports.applyNativeOperation({ ...plan.operation, current: live }); }
    finally { nativeSharedInFlight.delete(key); }
    if (error) return { error };
    if ("customised" in plan && plan.customised) ports.announce("Linked. This copy differs from the shared item, so Update copies leaves it as it is.");
    // After the form has taken this result and closed as saved (a later task, not a microtask that
    // could run first and cancel it): then the preview and Structure show the shared root.
    ports.setTimer(() => { ports.updateNativePreviewSources(); ports.renderNativeShownStructure(); });
    return { success: true };
  }
  async function nativeSharedDisconnect(current: () => boolean, plan: () => { operation: StaticSectionOperation; expectedFiles: readonly string[] } | { error: string }) {
    if (!current()) { ports.announce("The page changed. Select the element again."); return; }
    const made = plan();
    if ("error" in made) { ports.announce(made.error); return; }
    const graph = made.expectedFiles.join("\n");
    const error = await ports.applyNativeOperation({ ...made.operation, current: () => current() && ports.nativeFiles().sort().join("\n") === graph });
    if (error) { ports.errorMessage(new Error(error)); return; }
    ports.updateNativePreviewSources();
    ports.renderNativeShownStructure();
  }
  function doneMaster() {
    const active = activeMaster();
    if (!active) { ports.renderMasterBanner(); return; }
    void active.controller.done().then(() => {
      const revealed = masterRevealedCode, now = ports.codePanes().heightResize()?.state();
      masterRevealedCode = undefined;
      if (revealed && now && !active.controller.context() && !now.collapsed && now.height === revealed.height) ports.codePanes().heightResize()?.toggle();
      ports.renderMasterBanner();
      ports.updateNativePreviewSources();
    });
  }
  function updateMaster() {
    const active = activeMaster();
    if (!active) { ports.renderMasterBanner(); return; }
    void active.controller.updateCopies().then(() => { ports.renderMasterBanner(); ports.updateNativePreviewSources(); });
  }
  return {
    nativeMasterSelection,
    sectionSaveControls: nativeSectionSaveControls,
    saveNativeStaticSection,
    masterRevision,
    masterHost,
    activeMaster,
    nativeMasterEdit,
    nativeOpenMaster,
    editableSource: nativeEditableSource,
    masterIdentity: nativeMasterIdentity,
    runMasterEdit,
    insertChoices: nativeSectionChoices,
    nativeElementAddPoint,
    insertNativeComponent,
    isStaticSectionTag,
    nativeStaticSectionChoices,
    nativeStaticSectionNotice,
    nativeStaticSectionThumbnail,
    nativeSharedFieldsRevision,
    sharedRoot: nativeSharedRoot,
    submit: nativeSharedSubmit,
    disconnect: nativeSharedDisconnect,
    isPrivateMasterPath,
    doneMaster, updateMaster,
    destinationText: (point: InsertPoint) => nativeAddPoints.get(point)?.description,
  };
}
