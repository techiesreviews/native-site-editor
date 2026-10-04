import { button, node } from "../ui/dom";
import { descendants, parseSource } from "../page-builder/component-model";
import { planCollectionChange, planBake, type BakePlan, type BakeResult } from "../page-builder/collection-bake";
import { readPageFields, withCustomPageField, withPageField, type CollectionIdentity } from "../page-builder/collection-fields";
import { attribute, collectionSpec, readCollections, validCollectionRoute } from "../page-builder/collection-model";
import { isManualCardGrid, manualGridFolders, newCollectionToken, planManualConversion, readManualGrid } from "../page-builder/native-grid-collection";
import { planSidecarRecipe, sidecarCollectionAt, type SidecarOrigin } from "../page-builder/collection-origins";
import { planNativeCollectionOperation } from "../page-builder/native-collection-host";
import { readSidecar, type DocumentCollectionPreview } from "../page-builder/document-collections";
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
  const snapshot = () => ({ sources: { ...deps.sources() }, routes: { ...deps.routes() }, identity: { ...deps.identity() }, revision: deps.revision(), page: deps.page() });
  // Each dependency is read once per check: the host builds them from the whole file graph.
  const current = (saved: ReturnType<typeof snapshot>) => {
    if (saved.page !== deps.page() || saved.revision !== deps.revision()) return false;
    if (JSON.stringify(saved.routes) !== JSON.stringify(deps.routes()) || JSON.stringify(saved.identity) !== JSON.stringify(deps.identity())) return false;
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
  function previewSidecar(saved: ReturnType<typeof snapshot>, origin: SidecarOrigin, path: string): DocumentCollectionPreview {
    const planned = planNativeCollectionOperation({ sources: saved.sources, routes: saved.routes, files: Object.keys(saved.sources), revision: saved.revision, identity: saved.identity,
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
    const fields: Record<string, string> = { ...jsonFields, ...htmlFields };
    const inHtml = (name: string) => Object.hasOwn(htmlFields, name) && name !== "url";
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
    const baked = planBake(saved.sources, saved.routes, saved.identity);
    // Collections stored in the editor's JSON are listed from their recipe, with the cards the host would bake.
    let fromJson: { folders: string[]; template: string; records: DocumentCollectionPreview["records"] }[] = [];
    try {
      const recipes = Object.entries(readSidecar(saved.sources[EDITOR_PAGE_BUILDER_PATH]).collections).filter(([, recipe]) => recipe.pagePath === path);
      if (recipes.length) {
        const planned = planNativeCollectionOperation({ sources: saved.sources, routes: saved.routes, files: Object.keys(saved.sources), revision: saved.revision, identity: saved.identity, origin: { done: "", undone: "" } });
        if ("error" in planned) throw new Error(planned.error);
        fromJson = recipes.map(([id, recipe]) => ({ folders: recipe.folders, template: recipe.template, records: planned.documentCollections.find((item) => item.id === id)?.records ?? [] }));
      }
    } catch (error) { root.append(node("p", "", error instanceof Error ? error.message : "The editor's page data could not be read.")); }
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
    root.append(status);
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
    let existing: { spec: { folders: string[]; sort: string; filter: string; limit: number }; fields: string[]; template: string; namespace?: string } | undefined;
    try {
      const stored = sidecarCollectionAt(saved.sources, path, sourceStart);
      const inline = stored ? undefined : readCollections(source).find((collection) => collection.element.start === sourceStart);
      existing = stored ? { spec: stored.collection, fields: stored.collection.fields, template: stored.collection.template, namespace: stored.id }
        : inline ? { spec: inline.spec, fields: inline.fields, template: source.slice(inline.template.tag.end, inline.template.close!.start), namespace: attribute(source, inline.element, "data-collection-id") } : undefined;
    }
    catch (error) { root.replaceChildren(status); report(error instanceof Error ? error.message : "The collection could not be read."); return; }
    activeGrid = { path, start: sourceStart };
    if (!existing && isManualCardGrid(source, el)) { openManualGrid(path, sourceStart, saved); return; }
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
      saved.sources[file] === undefined ? [] : Object.keys(readPageFields(saved.sources[file], url, saved.identity)))])];
    const namespace = existing?.namespace;
    const fieldLabel = (name: string) => {
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
      const option = node("option", "", sortValue.replace(/^-/, "")); option.value = sortValue.replace(/^-/, ""); sort.append(option); sort.value = option.value;
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
