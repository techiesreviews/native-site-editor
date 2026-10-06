import { button, node } from "../ui/dom";
import { descendants, parseSource } from "../page-builder/component-model";
import { planCollectionChange, planBake, type BakePlan, type BakeResult } from "../page-builder/collection-bake";
import { readPageFields, withCustomPageField, withPageField, type CollectionIdentity } from "../page-builder/collection-fields";
import { collectionSpec, readCollections, validCollectionRoute } from "../page-builder/collection-model";
import { attribute, locateSectionTarget } from "../page-builder/source-target";
import { isManualCardGrid, manualGridFolders, newCollectionToken, planManualConversion, readManualGrid } from "../page-builder/native-grid-collection";
import { isStaticCardGrid, planStaticCardConversion, readStaticCardGrid } from "../page-builder/native-static-grid-collection";
import { planSidecarRecipe, sidecarCollectionAt, type SidecarOrigin } from "../page-builder/collection-origins";
import { planNativeCollectionOperation } from "../page-builder/native-collection-host";
import { bakePageData, locatePageCollections, readSidecar, type DocumentCollectionPreview } from "../page-builder/document-collections";
import { readEditorFieldMetas } from "../page-builder/native-page-fields";
import { EDITOR_PAGE_BUILDER_PATH, writePageBuilderDocument, type PageBuilderDocument } from "../page-builder/page-builder-document";
import "./collections-panel.css";

export interface CollectionsDeps {
  sources(): Record<string, string>;
  routes(): Record<string, string>;
  identity(): CollectionIdentity;
  revision(): string;
  page(): string | undefined;
  /**
   * Host verifies revision and every expected source, then applies all files as one undo step.
   * A sidecar origin is planned again by the host, which bakes the cards from the JSON recipe.
   */
  apply(plan: BakePlan | SidecarOrigin, expectedRevision: string, label: string): boolean | Promise<boolean>;
  openPage(path: string): void;
  announce(message: string): void;
  /** Every file on the branch, loaded or not: tells a page that is gone from one not read yet. */
  files?(): readonly string[];
  /**
   * Removes one collection's recipe from the editor's JSON (pinned at `sidecar`),
   * keeping the page's cards and all other page data. Resolves to a refusal, if any.
   */
  forget?(id: string, sidecar: string): Promise<string | undefined>;
  /**
   * Moves the open page's old `field:` metadata into the editor's JSON as one
   * undoable step. Resolves to a refusal, if any.
   */
  migrateFields?(path: string, choices: Record<string, string>): Promise<string | undefined>;
}
export interface CollectionsPanel {
  update(): void;
  openGrid(path: string, sourceStart: number): void;
  dirty(): boolean;
  pageFieldsDirty(): boolean;
  pageFieldsStamp(): string | undefined;
  pageFieldSource(source: string): string;
  /** The editor's JSON with this page's custom fields and authored date applied; unchanged bytes when nothing changed. */
  pageFieldDocument(sidecar: string | undefined): string | undefined;
  destroy(): void;
}
export function mountCollectionsPanel(host: HTMLElement, deps: CollectionsDeps, options: { settings?: boolean; grid?: () => { path: string; start: number } | undefined } = {}): CollectionsPanel {
  const root = node("section", "collections-panel");
  root.setAttribute("aria-label", options.grid ? "Collection settings" : "Collections and page fields");
  host.append(root);
  let destroyed = false;
  let applying = false;
  let activeForm: HTMLElement | undefined;
  let cleanStamp = "";
  let fieldSource: ((source: string) => string) | undefined;
  let fieldDocument: ((sidecar: string | undefined) => string | undefined) | undefined;
  let activeSnapshot: ReturnType<typeof snapshot> | undefined;
  let fieldForm: HTMLElement | undefined;
  let activeGrid: { path: string; start: number } | undefined;
  const stamp = (form: HTMLElement) => JSON.stringify([...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")].map(input => [input.value, input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : null]));
  const dirty = () => Boolean(activeForm && stamp(activeForm) !== cleanStamp);
  const track = (form: HTMLElement, saved: ReturnType<typeof snapshot>) => { activeForm = form; activeSnapshot = saved; cleanStamp = stamp(form); };
  const fileList = () => deps.files ? [...deps.files()].sort() : undefined;
  const snapshot = () => ({ sources: { ...deps.sources() }, routes: { ...deps.routes() }, identity: { ...deps.identity() }, revision: deps.revision(), page: deps.page(), files: fileList() });
  // Each dependency is read once per check: the host builds them from the whole file graph.
  const current = (saved: ReturnType<typeof snapshot>) => {
    if (saved.page !== deps.page() || saved.revision !== deps.revision()) return false;
    if (JSON.stringify(saved.routes) !== JSON.stringify(deps.routes()) || JSON.stringify(saved.identity) !== JSON.stringify(deps.identity())) return false;
    if (JSON.stringify(saved.files) !== JSON.stringify(fileList())) return false;
    const sources = deps.sources();
    return Object.keys(saved.sources).length === Object.keys(sources).length && Object.entries(saved.sources).every(([path, source]) => sources[path] === source);
  };
  const status = node("p", "collections-panel__status");
  status.setAttribute("role", "status");
  const report = (message: string) => { const changed = status.textContent !== message; status.textContent = message; if (changed) deps.announce(message); };
  const submit = async (saved: ReturnType<typeof snapshot>, plan: BakeResult | SidecarOrigin | { error: string }, label: string) => {
    if (destroyed || applying) return;
    if ("error" in plan) { report(plan.error); return; }
    if (!current(saved)) { report("The page or repository changed. Reopen the collection panel before applying."); return; }
    const submittedForm = activeForm, submittedStamp = submittedForm && stamp(submittedForm);
    let applied: boolean;
    applying = true;
    try { applied = await deps.apply(plan, saved.revision, label); }
    catch (error) { if (!destroyed) report(error instanceof Error ? error.message : "The collection could not be applied."); return; }
    finally { applying = false; }
    if (destroyed) return;
    if (applied) {
      if (activeForm === submittedForm && submittedForm && stamp(submittedForm) === submittedStamp) { activeForm = undefined; update(); report(label); }
      else report(`${label}. Newer input was kept; reopen before applying again.`);
    }
  };
  /** Plans a sidecar change against the saved graph, exactly as the host will: cards and JSON in one step. */
  function previewSidecar(saved: ReturnType<typeof snapshot>, origin: SidecarOrigin, path: string, files: readonly string[] = Object.keys(saved.sources)): DocumentCollectionPreview {
    const planned = planNativeCollectionOperation({ sources: saved.sources, routes: saved.routes, files, revision: saved.revision, identity: saved.identity,
      origin: { ...origin, done: "", undone: "" } });
    if ("error" in planned) throw new Error(planned.error);
    const preview = planned.documentCollections.find((item) => item.path === path);
    if (!preview) throw new Error("The grid could not be read back after this change.");
    return preview;
  }
  function control(form: HTMLElement, label: string, value: string, multiline = false) {
    const wrap = node("label", "collections-panel__field");
    wrap.append(node("span", "", label));
    const input = multiline ? node("textarea") : node("input");
    input.value = value;
    if (input instanceof HTMLTextAreaElement) input.rows = 8;
    wrap.append(input); form.append(wrap);
    return input;
  }
  function update() {
    if (destroyed) return;
    if (dirty()) {
      if (!applying && activeSnapshot && !current(activeSnapshot)) report("The page or repository changed. Your input was kept; reopen before applying.");
      return;
    }
    if (options.grid) {
      if (activeForm?.contains(document.activeElement) && activeSnapshot && !current(activeSnapshot)) {
        report("The page or repository changed. Your input was kept; reopen before applying."); return;
      }
      const target = options.grid();
      if (target && activeForm && activeSnapshot && activeGrid?.path === target.path && activeGrid.start === target.start && current(activeSnapshot)) return;
      activeForm = undefined; activeSnapshot = undefined; activeGrid = undefined;
      if (target) openGrid(target.path, target.start);
      else root.replaceChildren();
      return;
    }
    activeForm = undefined; activeSnapshot = undefined;
    fieldSource = undefined; fieldForm = undefined;
    root.replaceChildren(...(options.settings ? [] : [node("h2", "", "Page fields")]));
    const path = deps.page(), saved = snapshot();
    if (!path || saved.sources[path] === undefined) { root.append(node("p", "", "Open a page to edit its fields."), status); return; }
    const url = Object.entries(saved.routes).find(([, file]) => file === path)?.[0] ?? "";
    root.append(node("p", "collections-panel__scope", `Page fields · ${url}`));
    appendLegacyFields(path, saved);
    // Real head fields stay in the page; custom fields and an authored date come from the editor's JSON.
    const htmlFields = readPageFields(saved.sources[path], url, saved.identity);
    let stored: PageBuilderDocument;
    try { stored = readSidecar(saved.sources[EDITOR_PAGE_BUILDER_PATH]); }
    catch (error) { root.append(node("p", "collections-panel__refusal", (error as Error).message), status); return; }
    const storedPage = stored.pages[path] ?? {};
    const jsonFields: Record<string, string> = {};
    for (const [name, value] of Object.entries(storedPage.fields ?? {})) if (typeof value === "string") jsonFields[name] = value;
    if (typeof storedPage.date === "string" && !Object.hasOwn(htmlFields, "date")) jsonFields.date = storedPage.date;
    if (!Object.hasOwn(htmlFields, "date") && !Object.hasOwn(jsonFields, "date")) jsonFields.date = "";
    // Same precedence as the bake: a JSON custom value stands over the page's own; a JSON date only where the page has none.
    const fields: Record<string, string> = { ...htmlFields, ...jsonFields };
    const inHtml = (name: string) => Object.hasOwn(htmlFields, name) && !Object.hasOwn(jsonFields, name) && name !== "url";
    const form = node(options.settings ? "div" : "form", "collections-panel__form");
    const inputs = Object.entries(fields).filter(([name]) => name !== "url" && (!options.settings || !["title", "description", "image"].includes(name))).map(([name, value]) => ({ name, input: control(form, name[0].toUpperCase() + name.slice(1), value) }));
    const customName = control(form, "New custom field name", "");
    const customValue = control(form, "New custom field value", "");
    const newName = () => {
      const name = customName.value.trim();
      if (!name && customValue.value !== "") throw new Error("Name the new custom field, or clear its value.");
      if (name && ["title", "description", "image", "date", "url"].includes(name)) throw new Error(`${name} is a built-in field. Edit its own control above.`);
      if (name && Object.hasOwn(fields, name)) throw new Error(`${name} already exists. Edit its existing field instead.`);
      if (name && !/^[a-z][a-z0-9_-]*$/.test(name)) throw new Error("Use a valid editable page field name: lowercase letters, digits, - or _.");
      return name;
    };
    // Fields that are real page metadata are edited where they are; nothing new is written into the head.
    const stage = (source: string) => {
      if (!current(saved)) throw new Error("The page or repository changed. Reopen the collection panel before applying.");
      for (const { name, input } of inputs) if (inHtml(name) && input.value !== fields[name]) source = withPageField(source, name, input.value, saved.identity);
      newName();
      return source;
    };
    const stageDocument = (sidecar: string | undefined) => {
      if (!current(saved)) throw new Error("The page or repository changed. Reopen the collection panel before applying.");
      const document = readSidecar(sidecar);
      const page = { ...(document.pages[path] ?? {}) };
      const custom: Record<string, string> = { ...(page.fields ?? {}) };
      for (const { name, input } of inputs) {
        if (inHtml(name) || input.value === fields[name]) continue;
        if (name === "date") { if (input.value) page.date = input.value; else delete page.date; }
        else custom[name] = input.value;
      }
      const name = newName();
      if (name) custom[name] = customValue.value;
      if (Object.keys(custom).length) page.fields = custom; else delete page.fields;
      if (Object.keys(page).length) document.pages[path] = page; else delete document.pages[path];
      const empty = !Object.keys(document.pages).length && !Object.keys(document.collections).length;
      return sidecar === undefined && empty ? undefined : writePageBuilderDocument(document, sidecar);
    };
    fieldSource = stage; fieldDocument = stageDocument; fieldForm = form;
    if (!options.settings) {
      const apply = node("button", "button primary", "Apply page fields"); apply.type = "submit";
      form.append(apply, button("Cancel changes", () => { activeForm = undefined; update(); }));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        try {
          const source = stage(saved.sources[path]);
          const sidecar = saved.sources[EDITOR_PAGE_BUILDER_PATH], next = stageDocument(sidecar);
          const edits = new Map<string, string>(source === saved.sources[path] ? [] : [[path, source]]);
          const creates: { path: string; content: string }[] = [];
          if (next !== undefined && next !== sidecar) { if (sidecar === undefined) creates.push({ path: EDITOR_PAGE_BUILDER_PATH, content: next }); else edits.set(EDITOR_PAGE_BUILDER_PATH, next); }
          void submit(saved, { edits, creates, expectedSources: new Map<string, string | undefined>([[path, saved.sources[path]], [EDITOR_PAGE_BUILDER_PATH, sidecar]]) }, "Page fields and collections updated");
        } catch (error) { report(error instanceof Error ? error.message : "The fields could not be changed."); }
      });
    }
    track(form, saved);
    root.append(form, ...(options.settings ? [] : [node("h2", "", "Collections")]));
    const baked = planBake(saved.sources, saved.routes, saved.identity, bakePageData(saved.sources, deps.files?.()));
    // Collections stored in the editor's JSON are listed from their recipe, with the cards the host would bake.
    let fromJson: { folders: string[]; template: string; records: DocumentCollectionPreview["records"] }[] = [];
    try {
      const recipes = Object.entries(readSidecar(saved.sources[EDITOR_PAGE_BUILDER_PATH]).collections).filter(([, recipe]) => recipe.pagePath === path);
      if (recipes.length) {
        const planned = planNativeCollectionOperation({ sources: saved.sources, routes: saved.routes, files: Object.keys(saved.sources), revision: saved.revision, identity: saved.identity, origin: { done: "", undone: "" } });
        if ("error" in planned) throw new Error(planned.error);
        fromJson = recipes.map(([id, recipe]) => ({ folders: recipe.folders, template: recipe.template, records: planned.documentCollections.find((item) => item.id === id)?.records ?? [] }));
      }
    } catch (error) {
      // When some collection cannot be found, the list below says which, in plain words; no technical repeat here.
      root.append(node("p", "", !options.grid && unlocatableRows(saved).length ? "This page's collections can be shown again once the ones listed below are fixed or forgotten."
        : error instanceof Error ? error.message : "The editor's page data could not be read."));
    }
    if ("error" in baked) root.append(node("p", "", baked.error));
    else for (const collection of [...baked.collections.filter((item) => item.path === path), ...fromJson]) {
      const block = node("div", "collections-panel__collection");
      block.append(node("h3", "", `Pages from ${collection.folders.join(", ")}`), node("p", "", `${collection.records.length} matching ${collection.records.length === 1 ? "page" : "pages"}`));
      if (!options.settings) {
        for (const record of collection.records) block.append(button(`Edit page: ${record.fields.title || record.url}`, () => deps.openPage(record.path)));
        block.append(button("Edit card design in source", () => deps.openPage(path)));
      }
      const advanced = node("details", "collections-panel__advanced");
      advanced.append(node("summary", "", "Advanced"), node("pre", "collections-panel__preview", collection.template));
      block.append(advanced);
      root.append(block);
    }
    if (!options.grid) appendUnlocatable(saved);
    root.append(status);
  }
  /**
   * Old custom fields kept as page metadata: one inline action moves them into
   * the editor's data. A field whose editor value differs offers two inline
   * choices; Move stays off until each is chosen. Choices belong to this view
   * only: any change redraws the panel and clears them.
   */
  function appendLegacyFields(path: string, saved: ReturnType<typeof snapshot>) {
    if (!deps.migrateFields) return;
    let metas: { field: string; value: string }[];
    try { metas = readEditorFieldMetas(saved.sources[path]); }
    catch (error) { root.append(node("p", "collections-panel__refusal", error instanceof Error ? error.message : "This page's old fields could not be read.")); return; }
    if (!metas.length) return;
    let stored: Record<string, unknown> = {};
    try { const fields = readSidecar(saved.sources[EDITOR_PAGE_BUILDER_PATH]).pages[path]?.fields; if (fields) stored = fields; }
    catch { stored = {}; }
    const conflicts = metas.filter((meta) => Object.hasOwn(stored, meta.field) && typeof stored[meta.field] === "string" && stored[meta.field] !== meta.value)
      .map((meta) => ({ field: meta.field, page: meta.value, editor: stored[meta.field] as string }));
    const row = node("div", "collections-panel__legacy");
    const names = metas.map((meta) => meta.field), list = names.join(", ");
    row.append(node("p", "collections-panel__hint", `This page keeps ${names.length === 1 ? "the field" : "the fields"} ${list} in its published HTML. Move ${names.length === 1 ? "it" : "them"} to the editor's data so visitors get clean pages.`
      + (conflicts.length ? " Where the two differ, choose which value to keep; cards then show that value." : " Cards and values stay the same.")));
    const choices: Record<string, string> = Object.create(null);
    const shown = (value: string) => value === "" ? "(empty)" : `“${value}”`;
    const move = button("Move legacy fields to editor data", async () => {
      if (applying || destroyed) return;
      if (dirty()) { report("Apply or cancel your field changes first, then move the legacy fields."); return; }
      if (!current(saved)) { report("The page or repository changed. Reopen the fields before moving them."); return; }
      if (conflicts.some((conflict) => !Object.hasOwn(choices, conflict.field))) { report("Choose which value to keep for each field first."); return; }
      applying = true; move.disabled = true;
      let error: string | undefined;
      try { error = await deps.migrateFields!(path, { ...choices }); }
      catch (caught) { error = caught instanceof Error ? caught.message : "The fields could not be moved."; }
      finally { applying = false; }
      if (destroyed) return;
      if (error) { move.disabled = false; report(error); return; }
      activeForm = undefined; update(); report(`Moved ${list} to the editor's data. Undo puts them back.`);
    });
    for (const conflict of conflicts) {
      const group = node("fieldset", "collections-panel__conflict");
      group.append(node("legend", "", `${conflict.field}: the page has ${shown(conflict.page)}, the editor's data has ${shown(conflict.editor)}`));
      for (const [label, value] of [["Keep page value", conflict.page], ["Keep editor value", conflict.editor]] as const) {
        const wrap = node("label", "collections-panel__source");
        const input = node("input"); input.type = "radio"; input.name = `legacy-${conflict.field}`;
        input.setAttribute("aria-label", `${label} for ${conflict.field}`);
        input.addEventListener("change", () => { if (input.checked) choices[conflict.field] = value; move.disabled = conflicts.some((item) => !Object.hasOwn(choices, item.field)); });
        wrap.append(input, document.createTextNode(label)); group.append(wrap);
      }
      row.append(group);
    }
    move.disabled = conflicts.length > 0;
    row.append(move);
    root.append(row);
  }
  /** Custom field names (and an authored date) the editor's JSON keeps for the site's pages: the bake reads them too. */
  function jsonFieldNames(saved: ReturnType<typeof snapshot>): string[] {
    try {
      const pages = readSidecar(saved.sources[EDITOR_PAGE_BUILDER_PATH]).pages, routed = new Set(Object.values(saved.routes));
      return Object.entries(pages).filter(([file]) => routed.has(file))
        .flatMap(([, page]) => [...Object.keys(page.fields ?? {}), ...(typeof page.date === "string" ? ["date"] : [])]);
    } catch { return []; }
  }
  /**
   * Collections anywhere on the site whose grid cannot be found exactly (or
   * whose page is gone). Each can be forgotten on its own: only its recipe
   * leaves the JSON; the cards stay in the page, as do all other page data.
   */
  function unlocatableRows(saved: ReturnType<typeof snapshot>) {
    const sidecar = saved.sources[EDITOR_PAGE_BUILDER_PATH];
    const rows: { id: string; page: string; label: string; where: string; reason: string; detail: string }[] = [];
    if (sidecar === undefined || !deps.forget) return rows;
    let document: PageBuilderDocument;
    try { document = readSidecar(sidecar); } catch { return rows; }
    const files = new Set(deps.files?.() ?? Object.values(saved.routes));
    const grid = (id: string) => {
      const target = document.collections[id].target, tag = target.openingTagFingerprint;
      const classes = /\sclass\s*=\s*["']?([^"'>]*)/i.exec(tag)?.[1].trim().split(/\s+/).filter(Boolean) ?? [];
      return target.authoredId ? `${target.tag}#${target.authoredId}` : [target.tag, ...classes].join(".");
    };
    for (const page of new Set(Object.values(document.collections).map((collection) => collection.pagePath))) {
      const ids = Object.entries(document.collections).filter(([, collection]) => collection.pagePath === page).map(([id]) => id);
      const source = saved.sources[page];
      const broken = new Map<string, { reason: string; detail: string }>();
      if (source === undefined) {
        if (files.has(page)) continue;
        for (const id of ids) broken.set(id, { reason: "This page no longer exists.", detail: `${page} is not in the repository.` });
      } else {
        try { locatePageCollections(source, document, page); continue; } catch (error) {
          // Each recipe is located on its own: only the ones that fail are listed, never their healthy neighbours.
          const found = new Map<string, { start: number; end: number }>();
          for (const id of ids) {
            const located = locateSectionTarget(source, document.collections[id].target);
            if ("error" in located) broken.set(id, { reason: "Its grid was changed in Code, so the editor cannot tell which element it is.", detail: located.error });
            else found.set(id, { start: located.element.start, end: located.element.end });
          }
          for (const [id, a] of found) for (const [other, b] of found) if (id !== other && a.start <= b.start && a.end >= b.end)
            for (const both of [id, other]) broken.set(both, { reason: "Two collections point at the same grid, so the editor cannot tell whose cards are whose.", detail: `Collections ${id} and ${other} resolve to overlapping elements.` });
          if (!broken.size) for (const id of ids) broken.set(id, { reason: "The collections on this page cannot be found exactly.", detail: (error as Error).message });
        }
      }
      const url = Object.entries(saved.routes).find(([, file]) => file === page)?.[0];
      let title = "";
      try { if (source !== undefined && url) title = readPageFields(source, url, saved.identity).title ?? ""; } catch { title = ""; }
      const where = title ? `${title.split(/\s+[|·–—-]\s+/)[0]} (${url})` : url ?? page;
      for (const [id, problem] of broken) {
        const recipe = document.collections[id];
        // An optional label kept in the JSON record names the grid; otherwise its pages describe it.
        const label = typeof recipe.label === "string" && recipe.label.trim() ? recipe.label.trim() : `Cards from ${recipe.folders.join(", ")}`;
        rows.push({ id, page, label, where, reason: problem.reason, detail: `${problem.detail} Recipe “${id}” in ${EDITOR_PAGE_BUILDER_PATH}, page ${page}.` });
      }
    }
    // Rows that would read the same say which grid they are, then their place in order: never an internal id.
    const named = (row: (typeof rows)[number]) => `${row.label} on ${row.where}`;
    const groups = () => [...rows.reduce((map, row) => map.set(named(row), [...(map.get(named(row)) ?? []), row]), new Map<string, typeof rows>()).values()].filter((group) => group.length > 1);
    for (const group of groups()) for (const row of group) row.label = `${row.label}, grid ${grid(row.id)}`;
    for (const group of groups()) group.forEach((row, index) => { row.label = `${row.label} (${index + 1} of ${group.length})`; });
    return rows;
  }
  /**
   * Collections anywhere on the site whose grid cannot be found exactly (or
   * whose page is gone). Each can be forgotten on its own: only its recipe
   * leaves the JSON; the cards stay in the page, as do all other page data.
   */
  function appendUnlocatable(saved: ReturnType<typeof snapshot>) {
    const sidecar = saved.sources[EDITOR_PAGE_BUILDER_PATH];
    const rows = unlocatableRows(saved);
    if (sidecar === undefined || !rows.length) return;
    const section = node("section", "collections-panel__unlocatable");
    section.setAttribute("aria-label", "Collections that cannot be found");
    section.append(node("h3", "", "Collections that cannot be found"),
      node("p", "collections-panel__hint", "Their cards stay in the page as they are. Fix the grid in Code, or forget its recipe: the cards and every page field are kept."));
    const list = node("ul", "collections-panel__recovery");
    for (const row of rows) {
      const item = node("li", "collections-panel__recovery-row");
      const name = `${row.label} on ${row.where}`;
      const forget = button("Forget recipe, keep cards", async () => {
        if (applying || destroyed) return;
        applying = true; forget.disabled = true;
        let error: string | undefined;
        try { error = await deps.forget!(row.id, sidecar); }
        catch (caught) { error = caught instanceof Error ? caught.message : "The recipe could not be forgotten."; }
        finally { applying = false; }
        if (destroyed) return;
        if (error) { forget.disabled = false; report(error); return; }
        update(); report(`Forgot the recipe of ${name}; its cards stay as they are.`);
      });
      forget.classList.add("collections-panel__recovery-action");
      forget.setAttribute("aria-label", `Forget recipe, keep cards: ${name}`);
      const details = node("details", "collections-panel__recovery-details");
      details.append(node("summary", "", "Technical details"), node("p", "", row.detail.trim()));
      item.append(node("span", "collections-panel__recovery-name", name), node("span", "collections-panel__recovery-reason", row.reason), forget, details);
      list.append(item);
    }
    section.append(list);
    root.append(section);
  }
  function openGrid(path: string, sourceStart: number) {
    if (destroyed) return;
    if (options.settings) { report("Select a grid and open its collection settings."); return; }
    if (dirty()) { report("Apply or reopen the current fields before opening another collection."); return; }
    fieldSource = undefined; fieldForm = undefined;
    const saved = snapshot(), source = saved.sources[path];
    if (source === undefined) { report("Load the page before making a collection."); return; }
    const el = [...descendants(parseSource(source))].find((item) => item.start === sourceStart);
    if (!el?.close) { report("Choose a complete grid in the page source."); return; }
    const first = el.children.find((child) => child.type === "element" && child.name !== "template");
    const form = node("form", "collections-panel__form");
    let existing: { spec: { folders: string[]; sort: string; filter: string; limit: number }; fields: string[]; template: string; namespace?: string; fieldLabels?: unknown } | undefined;
    try {
      const stored = sidecarCollectionAt(saved.sources, path, sourceStart);
      const inline = stored ? undefined : readCollections(source).find((collection) => collection.element.start === sourceStart);
      existing = stored ? { spec: stored.collection, fields: stored.collection.fields, template: stored.collection.template, namespace: stored.id, fieldLabels: stored.collection.fieldLabels }
        : inline ? { spec: inline.spec, fields: inline.fields, template: source.slice(inline.template.tag.end, inline.template.close!.start), namespace: attribute(source, inline.element, "data-collection-id") } : undefined;
    }
    catch (error) { root.replaceChildren(status); report(error instanceof Error ? error.message : "The collection could not be read."); return; }
    activeGrid = { path, start: sourceStart };
    if (!existing && isManualCardGrid(source, el)) { openManualGrid(path, sourceStart, saved); return; }
    if (!existing && isStaticCardGrid(source, el)) { openStaticGrid(path, sourceStart, saved); return; }
    root.replaceChildren(node("h2", "", existing ? "Edit collection" : "Make this grid a collection"), node("p", "collections-panel__scope", "Choose which pages appear in this grid."));
    const urls = Object.entries(saved.routes).filter(([url, file]) => validCollectionRoute(url, file)).map(([url]) => url);
    // Parent folders need no index page of their own. Keep route order stable.
    const discovered = [...new Set(urls.flatMap((url) => {
      const segments = url.slice(1).split("/");
      return segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join("/")}/`)
        .filter((folder) => folder !== url && /^\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)+$/.test(folder));
    }))];
    const selected = existing?.spec.folders ?? (discovered.includes("/work/") ? ["/work/"] : []);
    const choices = [...new Set([...selected, ...discovered])];
    const sourceGroup = node("fieldset", "collections-panel__sources");
    sourceGroup.append(node("legend", "", "Pages from folders"));
    const checks = choices.map((url) => {
      const label = node("label", "collections-panel__source");
      const input = node("input"); input.type = "checkbox"; input.value = url; input.checked = selected.includes(url);
      label.append(input, document.createTextNode(url)); sourceGroup.append(label);
      return input;
    });
    form.append(sourceGroup);
    const fieldNames = [...new Set(["title", "date", "url", ...(existing?.fields ?? []), ...Object.entries(saved.routes).flatMap(([url, file]) =>
      saved.sources[file] === undefined ? [] : Object.keys(readPageFields(saved.sources[file], url, saved.identity))), ...jsonFieldNames(saved)])];
    const namespace = existing?.namespace;
    const fieldLabel = (name: string) => {
      const labels = existing?.fieldLabels;
      const explicit = labels && typeof labels === "object" && !Array.isArray(labels) && Object.hasOwn(labels, name) ? Reflect.get(labels, name) : undefined;
      if (existing?.fields.includes(name) && typeof explicit === "string" && explicit.trim()) return explicit;
      const text = namespace && name.startsWith(`${namespace}-`) ? `Card ${name.slice(namespace.length + 1)}` : name;
      return text.replace(/[_-]/g, " ").replace(/^./, (first) => first.toUpperCase());
    };
    const select = (label: string, choices: [string, string][], value: string) => {
      const wrap = node("label", "collections-panel__field"); wrap.append(node("span", "", label));
      const input = node("select");
      for (const [value, label] of choices) { const option = node("option", "", label); option.value = value; input.append(option); }
      input.value = value; wrap.append(input); form.append(wrap); return input;
    };
    const sortValue = existing?.spec.sort ?? "-date";
    const sort = select("Sort by", [["", "Page order"], ...fieldNames.map((name): [string, string] => [name, fieldLabel(name)])], sortValue.replace(/^-/, ""));
    const direction = select("Order", [["ascending", "Ascending"], ["descending", "Descending"]], sortValue.startsWith("-") ? "descending" : "ascending");
    const filterValue = existing?.spec.filter ?? "", equals = filterValue.indexOf("=");
    const filterName = equals < 0 ? "" : filterValue.slice(0, equals);
    const filter = select("Filter by", [["", "All pages"], ...[...new Set([...fieldNames, ...(filterName ? [filterName] : [])])].map((name): [string, string] => [name, fieldLabel(name)])], filterName);
    const filterMatch = control(form, "Matches exactly", equals < 0 ? "" : filterValue.slice(equals + 1));
    filterMatch.parentElement!.hidden = !filter.value;
    // Preserve an authored custom sort even when no current page defines it.
    if (sortValue && !fieldNames.includes(sortValue.replace(/^-/, ""))) {
      const option = node("option", "", fieldLabel(sortValue.replace(/^-/, ""))); option.value = sortValue.replace(/^-/, ""); sort.append(option); sort.value = option.value;
    }
    const limit = control(form, "Maximum items (1–500)", existing ? String(existing.spec.limit) : "6");
    const advanced = node("details", "collections-panel__advanced");
    advanced.append(node("summary", "", "Advanced"));
    const template = control(advanced, "Card template HTML", existing ? existing.template : first ? source.slice(first.start, first.end) : `<a href="{url}">{title}</a>`, true);
    const originalTemplate = existing ? existing.template : template.value;
    const displayedTemplate = template.value;
    advanced.append(node("p", "", "Bind text or attributes with {title}, {description}, {image}, {date}, {url}, or a custom field. Show when image exists: data-if=\"image\"."));
    const preview = node("pre", "collections-panel__preview");
    const result = node("p"); result.setAttribute("role", "status");
    let plan: SidecarOrigin | { error: string } = { error: "Preview the collection first." };
    const refresh = () => {
      apply.disabled = true;
      filterMatch.parentElement!.hidden = !filter.value;
      direction.parentElement!.hidden = !sort.value;
      try {
        const folders = checks.filter((input) => input.checked).map((input) => input.value);
        if (!folders.length) throw new Error("Select at least one source folder to preview or apply.");
        // Validates the settings exactly as an inline recipe would, then stores them as JSON only.
        const spec = collectionSpec({ folders, sort: sort.value ? `${direction.value === "descending" ? "-" : ""}${sort.value}` : "", filter: filter.value ? `${filter.value}=${filterMatch.value}` : "", limit: limit.value });
        plan = planSidecarRecipe({ sources: saved.sources, routes: saved.routes, identity: saved.identity }, path, sourceStart,
          { folders: spec.folders, sort: spec.sort, filter: spec.filter, limit: spec.limit, template: template.value === displayedTemplate ? originalTemplate : template.value });
        const collection = previewSidecar(saved, plan, path);
        result.textContent = `${collection?.records.length ?? 0} matching ${collection?.records.length === 1 ? "page" : "pages"}. Apply updates the grid and its dependent listings as one undo step.`;
        preview.textContent = collection?.output ?? "";
        apply.disabled = false;
      } catch (error) { plan = { error: error instanceof Error ? error.message : "The collection could not be previewed." }; result.textContent = plan.error; preview.textContent = ""; }
    };
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    const apply = node("button", "button primary", existing ? "Save collection" : "Make collection"); apply.type = "submit";
    advanced.append(preview);
    form.append(result, advanced, button("Edit card design in source", () => deps.openPage(path)), apply, button("Cancel", () => { activeForm = undefined; update(); }));
    form.addEventListener("submit", (event) => { event.preventDefault(); void submit(saved, plan, existing ? "Collection saved" : "Grid made into a collection"); });
    root.append(form, status); refresh(); track(form, saved);
  }
  /** Hand-written cards: keep every card exactly, or refuse; nothing changes until Apply. */
  function openManualGrid(path: string, sourceStart: number, saved: ReturnType<typeof snapshot>) {
    const source = saved.sources[path];
    const form = node("form", "collections-panel__form");
    root.replaceChildren(node("h2", "", "Choose pages for this grid"));
    const grid = readManualGrid(source, sourceStart);
    if ("error" in grid) {
      root.append(node("p", "collections-panel__scope", "These cards can't be turned into a page list yet, so nothing was changed."), node("p", "collections-panel__refusal", grid.error), status);
      return;
    }
    root.append(node("p", "collections-panel__scope", `Show pages from folders here instead of ${grid.cards.length} hand-written cards. Each card stays as it looks now; other pages use their own title and description.`));
    const token = newCollectionToken(saved.sources);
    const urls = Object.entries(saved.routes).filter(([url, file]) => validCollectionRoute(url, file)).map(([url]) => url);
    const discovered = [...new Set(urls.flatMap((url) => {
      const segments = url.slice(1).split("/");
      return segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join("/")}/`)
        .filter((folder) => folder !== url && /^\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)+$/.test(folder));
    }))];
    const selected = manualGridFolders(source, sourceStart, saved.routes);
    const sourceGroup = node("fieldset", "collections-panel__sources");
    sourceGroup.append(node("legend", "", "Pages from folders"));
    const checks = [...new Set([...selected, ...discovered])].map((url) => {
      const label = node("label", "collections-panel__source");
      const input = node("input"); input.type = "checkbox"; input.value = url; input.checked = selected.includes(url);
      label.append(input, document.createTextNode(url)); sourceGroup.append(label);
      return input;
    });
    const result = node("p"); result.setAttribute("role", "status");
    const kept = node("ul", "collections-panel__kept");
    const apply = node("button", "button primary", "Apply"); apply.type = "submit";
    let plan: SidecarOrigin | { error: string } = { error: "Choose folders first." };
    const refresh = () => {
      apply.disabled = true; kept.replaceChildren();
      const converted = planManualConversion({ sources: saved.sources, routes: saved.routes, identity: saved.identity, path, start: sourceStart, token,
        folders: checks.filter((input) => input.checked).map((input) => input.value) });
      if ("error" in converted) { plan = converted; result.textContent = `${converted.error} Nothing will change.`; return; }
      try {
        plan = planSidecarRecipe({ sources: saved.sources, routes: saved.routes, identity: saved.identity }, path, sourceStart, converted.recipe, converted.id);
        previewSidecar(saved, plan, path);
      } catch (error) { plan = { error: error instanceof Error ? error.message : "The pages could not be chosen." }; result.textContent = `${plan.error} Nothing will change.`; return; }
      result.textContent = `${converted.records} ${converted.records === 1 ? "page" : "pages"} will show, including all ${converted.cards} current cards in their current order. Apply changes this page and the editor's page data as one undo step.`;
      for (const line of converted.kept) kept.append(node("li", "", `Card ${line} is kept in the editor's page data; the pages' own titles, descriptions and SEO stay as they are.`));
      apply.disabled = false;
    };
    form.addEventListener("change", refresh);
    form.append(sourceGroup, result, kept, apply, button("Cancel", () => { activeForm = undefined; update(); }));
    form.addEventListener("submit", (event) => { event.preventDefault(); void submit(saved, plan, "Grid now shows pages from folders"); });
    root.append(form, status); refresh(); track(form, saved);
  }
  /**
   * Ordinary HTML cards (an <article> grid, say): every current card stays
   * byte for byte, or nothing changes. The site keeps plain HTML; the recipe
   * and per-card text live in the editor's JSON only.
   */
  function openStaticGrid(path: string, sourceStart: number, saved: ReturnType<typeof snapshot>) {
    const source = saved.sources[path];
    const form = node("form", "collections-panel__form");
    root.replaceChildren(node("h2", "", "Choose pages for this grid"));
    const refuse = (reason: string) => root.append(node("p", "collections-panel__scope", "These cards can't be turned into a page list yet, so nothing was changed."), node("p", "collections-panel__refusal", reason), status);
    const files = saved.files;
    if (!files) { refuse("The editor needs the site's complete file list to keep these cards exactly. Reload the site and try again."); return; }
    const grid = readStaticCardGrid(source, sourceStart);
    if ("error" in grid) { refuse(grid.error); return; }
    root.append(node("p", "collections-panel__scope", `Show pages from folders here instead of ${grid.cards.length} hand-written cards. Each card stays exactly as it is; other pages use their own title and description.`));
    const token = newCollectionToken(saved.sources);
    const urls = Object.entries(saved.routes).filter(([url, file]) => validCollectionRoute(url, file)).map(([url]) => url);
    const parents = (url: string) => {
      const segments = url.slice(1).split("/");
      return segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join("/")}/`)
        .filter((folder) => folder !== url && /^\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)+$/.test(folder));
    };
    const discovered = [...new Set(urls.flatMap(parents))];
    // Every folder a current card lives in starts selected, so no card is dropped.
    const selected = [...new Set(grid.cards.flatMap((card) => Object.hasOwn(saved.routes, card.href) ? parents(card.href).slice(-1) : []))];
    const sourceGroup = node("fieldset", "collections-panel__sources");
    sourceGroup.append(node("legend", "", "Pages from folders"));
    const checks: HTMLInputElement[] = [];
    const addCheck = (url: string, checked: boolean) => {
      const label = node("label", "collections-panel__source");
      const input = node("input"); input.type = "checkbox"; input.value = url; input.checked = checked;
      label.append(input, document.createTextNode(url)); sourceGroup.insertBefore(label, adder);
      checks.push(input);
    };
    // A folder not listed yet: typed inline, suggested from the site's folders.
    const adder = node("span", "collections-panel__source-add");
    const folderInput = node("input"); folderInput.type = "text"; folderInput.placeholder = "/folder/";
    folderInput.setAttribute("aria-label", "Add a folder");
    const suggestions = node("datalist"); suggestions.id = `collections-folders-${token}`;
    for (const url of discovered) { const option = node("option"); option.value = url; suggestions.append(option); }
    folderInput.setAttribute("list", suggestions.id);
    const folderProblem = node("span", "collections-panel__refusal collections-panel__source-problem");
    const add = () => {
      const raw = folderInput.value.trim();
      const url = raw && !raw.endsWith("/") ? `${raw}/` : raw;
      if (!/^\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)+$/.test(url)) { folderProblem.textContent = "Type a folder like /work/."; return; }
      if (!discovered.includes(url)) { folderProblem.textContent = `${url} has no pages on this site.`; return; }
      folderProblem.textContent = "";
      const found = checks.find((input) => input.value === url);
      if (found) found.checked = true; else addCheck(url, true);
      folderInput.value = "";
      refresh();
    };
    const addFolder = button("Add folder", add);
    // Enter adds the typed folder; it must never submit the form (Convert). Escape keeps the text.
    folderInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); add(); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
    });
    adder.append(folderInput, suggestions, addFolder, folderProblem);
    sourceGroup.append(adder);
    for (const url of [...new Set([...selected, ...discovered])]) addCheck(url, selected.includes(url));
    const result = node("p"); result.setAttribute("role", "status");
    const kept = node("ul", "collections-panel__kept");
    const apply = node("button", "button primary", "Convert"); apply.type = "submit";
    let plan: SidecarOrigin | { error: string } = { error: "Choose folders first." };
    const refresh = () => {
      apply.disabled = true; kept.replaceChildren();
      const converted = planStaticCardConversion({ sources: saved.sources, files, routes: saved.routes, identity: saved.identity, path, start: sourceStart, token,
        folders: checks.filter((input) => input.checked).map((input) => input.value) });
      if ("error" in converted) { plan = converted; result.textContent = `${converted.error} Nothing will change.`; return; }
      try {
        // The plan's texts as one origin: the page and an existing JSON are edits; a JSON that does not exist yet is created.
        const origin: SidecarOrigin = { edits: new Map(), creates: [], expectedSources: new Map(converted.expectedSources) };
        for (const [file, text] of converted.texts) {
          if (text === undefined) throw new Error(`Converting would delete ${file}, so nothing will change.`);
          if (file === EDITOR_PAGE_BUILDER_PATH && saved.sources[file] === undefined && !files.includes(file)) origin.creates.push({ path: file, content: text });
          else if (saved.sources[file] === undefined) throw new Error(`Load ${file} before converting.`);
          else origin.edits.set(file, text);
        }
        // The planner's explicit token maps these declared fields to their card part names.
        // Store labels in editor-only data; the record id is not this field namespace.
        const createdJson = origin.creates.find(file => file.path === EDITOR_PAGE_BUILDER_PATH);
        const text = origin.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? createdJson?.content;
        if (text === undefined) throw new Error("The converted grid's page data is missing.");
        const candidate = { ...saved.sources, ...Object.fromEntries(origin.edits), ...Object.fromEntries(origin.creates.map(file => [file.path, file.content])) };
        const stored = sidecarCollectionAt(candidate, path, sourceStart);
        if (!stored) throw new Error("The converted grid could not be found in its page data.");
        const document = readSidecar(text);
        document.collections[stored.id].fieldLabels = Object.fromEntries((converted.recipe.fields ?? []).map(field => {
          if (!field.startsWith(`${token}-`)) throw new Error("The converted field does not belong to this grid.");
          const label = field.slice(token.length + 1).replace(/[_-]/g, " ").replace(/^./, first => first.toUpperCase());
          return [field, label];
        }));
        const labelled = writePageBuilderDocument(document, text);
        if (createdJson) createdJson.content = labelled;
        else origin.edits.set(EDITOR_PAGE_BUILDER_PATH, labelled);
        if (JSON.stringify(converted.expectedFiles) !== JSON.stringify(files) || JSON.stringify(converted.expectedRoutes) !== JSON.stringify(saved.routes) || JSON.stringify(converted.expectedIdentity) !== JSON.stringify(saved.identity))
          throw new Error("The site changed while planning. Reopen the collection panel.");
        previewSidecar(saved, origin, path, files);
        plan = origin;
      } catch (error) { plan = { error: error instanceof Error ? error.message : "The pages could not be chosen." }; result.textContent = `${plan.error} Nothing will change.`; return; }
      result.textContent = `${converted.records} ${converted.records === 1 ? "page" : "pages"} will show, including all ${converted.cards} current cards exactly as they are, in their current order. Convert changes this page and the editor's page data as one undo step.`;
      for (const line of converted.kept) kept.append(node("li", "", `Card ${line} is kept in the editor's page data; the pages' own titles, descriptions and SEO stay as they are.`));
      apply.disabled = false;
    };
    form.addEventListener("change", refresh);
    form.append(sourceGroup, result, kept, apply, button("Cancel", () => { activeForm = undefined; update(); }));
    form.addEventListener("submit", (event) => { event.preventDefault(); void submit(saved, plan, "Grid now shows pages from folders"); });
    root.append(form, status); refresh(); track(form, saved);
  }
  if (options.grid) root.addEventListener("focusout", () => queueMicrotask(update));
  update();
  return { update, openGrid, dirty,
    pageFieldsDirty: () => Boolean(fieldForm && activeForm === fieldForm && dirty()),
    pageFieldsStamp: () => !destroyed && fieldForm && activeForm === fieldForm ? stamp(fieldForm) : undefined,
    pageFieldDocument(sidecar) {
      if (destroyed) throw new Error("Open a page to edit its fields.");
      if (options.settings && !(fieldForm && activeForm === fieldForm && dirty())) return sidecar;
      if (!fieldDocument) throw new Error("Open a page to edit its fields.");
      return fieldDocument(sidecar);
    },
    pageFieldSource(source) {
      if (destroyed) throw new Error("Open a page to edit its fields.");
      if (options.settings && !(fieldForm && activeForm === fieldForm && dirty())) return source;
      if (!fieldSource) throw new Error("Open a page to edit its fields.");
      return fieldSource(source);
    },
    destroy() { destroyed = true; root.remove(); } };
}
