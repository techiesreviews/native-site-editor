import { button, node } from "../ui/dom";
import { descendants, parseSource } from "../page-builder/component-model";
import { planCollectionChange, planBake, type BakePlan, type BakeResult } from "../page-builder/collection-bake";
import { readPageFields, withCustomPageField, withPageField, type CollectionIdentity } from "../page-builder/collection-fields";
import { makeGridCollection, readCollections, validCollectionRoute } from "../page-builder/collection-model";
import "./collections-panel.css";

export interface CollectionsDeps {
  sources(): Record<string, string>;
  routes(): Record<string, string>;
  identity(): CollectionIdentity;
  revision(): string;
  page(): string | undefined;
  /** Host verifies revision and every expected source, then applies all files as one undo step. */
  apply(plan: BakePlan, expectedRevision: string, label: string): boolean | Promise<boolean>;
  openPage(path: string): void;
  announce(message: string): void;
}
export interface CollectionsPanel {
  update(): void;
  openGrid(path: string, sourceStart: number): void;
  destroy(): void;
}
export function mountCollectionsPanel(host: HTMLElement, deps: CollectionsDeps): CollectionsPanel {
  const root = node("section", "collections-panel");
  root.setAttribute("aria-label", "Collections and page fields");
  host.append(root);
  let destroyed = false;
  const snapshot = () => ({ sources: { ...deps.sources() }, routes: { ...deps.routes() }, identity: { ...deps.identity() }, revision: deps.revision() });
  const current = (saved: ReturnType<typeof snapshot>) => saved.revision === deps.revision() && JSON.stringify(saved.routes) === JSON.stringify(deps.routes()) && JSON.stringify(saved.identity) === JSON.stringify(deps.identity()) && Object.entries(saved.sources).every(([path, source]) => deps.sources()[path] === source);
  const status = node("p", "collections-panel__status");
  status.setAttribute("role", "status");
  const report = (message: string) => { status.textContent = message; deps.announce(message); };
  const submit = async (saved: ReturnType<typeof snapshot>, plan: BakeResult, label: string) => {
    if (destroyed) return;
    if ("error" in plan) { report(plan.error); return; }
    if (!current(saved)) { report("The page or repository changed. Reopen the collection panel before applying."); return; }
    const applied = await deps.apply(plan, saved.revision, label);
    if (destroyed) return;
    if (applied) { update(); report(label); }
  };
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
    root.replaceChildren(node("h2", "", "Page fields"));
    const path = deps.page(), saved = snapshot();
    if (!path || saved.sources[path] === undefined) { root.append(node("p", "", "Open a page to edit its fields."), status); return; }
    const url = Object.entries(saved.routes).find(([, file]) => file === path)?.[0] ?? "";
    root.append(node("p", "collections-panel__scope", `Page fields · ${url}`));
    const fields = readPageFields(saved.sources[path], url, saved.identity);
    const form = node("form", "collections-panel__form");
    const inputs = Object.entries(fields).filter(([name]) => name !== "url").map(([name, value]) => ({ name, input: control(form, name[0].toUpperCase() + name.slice(1), value) }));
    const customName = control(form, "New custom field name", "");
    const customValue = control(form, "New custom field value", "");
    const apply = node("button", "button primary", "Apply page fields"); apply.type = "submit";
    form.append(apply);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        let source = saved.sources[path];
        for (const { name, input } of inputs) if (input.value !== fields[name]) source = withPageField(source, name, input.value, saved.identity);
        if (customName.value.trim()) source = withCustomPageField(source, customName.value.trim(), customValue.value, saved.identity);
        void submit(saved, planCollectionChange(saved.sources, { ...saved.sources, [path]: source }, saved.routes, saved.identity), "Page fields and collections updated");
      } catch (error) { report(error instanceof Error ? error.message : "The fields could not be changed."); }
    });
    root.append(form, node("h2", "", "Collections"));
    const baked = planBake(saved.sources, saved.routes, saved.identity);
    if ("error" in baked) root.append(node("p", "", baked.error));
    else for (const collection of baked.collections.filter((item) => item.path === path)) {
      const block = node("div", "collections-panel__collection");
      block.append(node("h3", "", `Pages from ${collection.folder}`), node("p", "", `${collection.records.length} matching pages`));
      for (const record of collection.records) block.append(button(`Edit page: ${record.fields.title || record.url}`, () => deps.openPage(record.path)));
      block.append(button("Edit card design in source", () => deps.openPage(path)), node("pre", "collections-panel__preview", collection.template));
      root.append(block);
    }
    root.append(status);
  }
  function openGrid(path: string, sourceStart: number) {
    if (destroyed) return;
    const saved = snapshot(), source = saved.sources[path];
    if (source === undefined) { report("Load the page before making a collection."); return; }
    const el = [...descendants(parseSource(source))].find((item) => item.start === sourceStart);
    if (!el?.close) { report("Choose a complete grid in the page source."); return; }
    const first = el.children.find((child) => child.type === "element" && child.name !== "template");
    root.replaceChildren(node("h2", "", "Make this grid a collection"), node("p", "collections-panel__scope", "Collection template · repeated card design"));
    const form = node("form", "collections-panel__form");
    const existing = readCollections(source).find((collection) => collection.element.start === sourceStart);
    const urls = Object.entries(saved.routes).filter(([url, file]) => validCollectionRoute(url, file)).map(([url]) => url);
    const discovered = urls.filter((url) => url.endsWith("/") && url !== "/" && urls.some((child) => child !== url && child.startsWith(url)));
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
    const sort = control(form, "Sort by field (-date for newest first)", existing?.spec.sort ?? "-date");
    const filter = control(form, "Exact filter (category=Pottery)", existing?.spec.filter ?? "");
    const limit = control(form, "Maximum items (1–500)", existing ? String(existing.spec.limit) : "6");
    const template = control(form, "Card template HTML", existing ? source.slice(existing.template.tag.end, existing.template.close!.start) : first ? source.slice(first.start, first.end) : `<a href="{url}">{title}</a>`, true);
    form.append(node("p", "", "Bind text or attributes with {title}, {description}, {image}, {date}, {url}, or a custom field. Show when image exists: data-if=\"image\"."));
    const preview = node("pre", "collections-panel__preview");
    const result = node("p"); result.setAttribute("role", "status");
    let plan: BakeResult = { error: "Preview the collection first." };
    const refresh = () => {
      apply.disabled = true;
      try {
        const folders = checks.filter((input) => input.checked).map((input) => input.value);
        if (!folders.length) throw new Error("Select at least one source folder to preview or apply.");
        const converted = makeGridCollection(source, sourceStart, { folders, sort: sort.value, filter: filter.value, limit: limit.value, template: template.value });
        plan = planCollectionChange(saved.sources, { ...saved.sources, [path]: converted }, saved.routes, saved.identity);
        if ("error" in plan) { result.textContent = plan.error; preview.textContent = ""; return; }
        const collection = plan.collections.find((item) => item.path === path && item.start === sourceStart);
        result.textContent = `${collection?.records.length ?? 0} matching pages. Apply updates the grid and its dependent listings as one undo step.`;
        preview.textContent = collection?.output ?? "";
        apply.disabled = false;
      } catch (error) { plan = { error: error instanceof Error ? error.message : "The collection could not be previewed." }; result.textContent = plan.error; preview.textContent = ""; }
    };
    form.addEventListener("input", refresh);
    const apply = node("button", "button primary", "Make collection"); apply.type = "submit";
    form.append(result, preview, apply, button("Cancel", update));
    form.addEventListener("submit", (event) => { event.preventDefault(); void submit(saved, plan, "Grid made into a collection"); });
    root.append(form, status); refresh();
  }
  update();
  return { update, openGrid, destroy() { destroyed = true; root.remove(); } };
}
