// Components, first class (docs/page-builder/components.md): what the page
// builder does around a component instance, alongside the edit bar and the
// page structure.
//
// - Identity: an instance's name in the edit bar wears the component mark;
//   an element inside an instance gets a chip that selects the instance.
// - Properties: the instance's slots, listed in a panel docked at the foot
//   of the sidebar while an instance (or something inside one) is selected:
//   each slot's text, image or link, editable in place; optional slots
//   switched on and off; a filled slot reset to the template's fallback;
//   and the instance tag's attributes.
// - Edit component: the template opens in the code pane at the matching
//   part, with a banner saying how many instances an edit there changes
//   and where they are (Used on).
// - Make component and Detach: an element becomes a component, an instance
//   becomes plain markup again, each shown before it is done.
//
// Every change is an edit of a site file through the open editor (one undo
// step; typing in a field is one step until the field is left), so the
// code pane shows it as it happens.

import { button, node } from "../ui/dom";
import { nativePageBody, type NativeSite } from "../../shared/native-project";
import type { NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl, EditBarModel } from "../components/edit-bar";
import { elementPathAt, locateNativeElementRange, parseMarked, type ElementRange } from "../native-source-location";
import { componentLabel } from "../native-insert";
import {
  attributeEdit,
  parseSource,
  descendants,
  attributeNameProblem,
  componentUsage,
  detachMarkup,
  fillInsertEdit,
  fillMarkup,
  fillRemoveEdits,
  makeComponentPlan,
  readInstance,
  slotLabel,
  slotStates,
  slotTextEdit,
  slotValue,
  suggestTagName,
  tagNameProblem,
  templateSlots,
  usageSummary,
  type Instance,
  type RangeEdit,
  type SlotState,
  type SlotValue,
  type TemplateSlot,
} from "./component-model";
import { componentIcon, mark, type ComponentMark } from "./component-icon";
import "../components/create-dialog.css";

type CodeEditor = typeof import("../components/code-editor");

export interface ComponentDeps {
  site: () => NativeSite | undefined;
  /** Every page, component and stylesheet's current source. */
  sources: () => Record<string, string>;
  editor: () => CodeEditor | undefined;
  preview: () => { selectAfterUpdate(request: { path: string; node: number[] } | undefined): void; selectNode(request: { path: string; node: number[] }): void } | undefined;
  /** The file open in the code pane. */
  currentPath: () => string | undefined;
  /** The preview's selection, as the editor last heard it. */
  selection: () => NativePreviewSelection | undefined;
  /** Opens a file in the code pane; resolves once it is mounted (true) or not. */
  openFile: (path: string) => Promise<boolean>;
  announce: (text: string) => void;
  error: (error: unknown) => void;
  /** Images of the repository, as root paths' suggestions. */
  images: () => string[];
  /** Uploads an image from the computer; resolves to its root path. */
  upload: (files: File[]) => Promise<string | undefined>;
  /** Pages of the site for a link's address. */
  links: () => { label: string; value: string }[];
  /** A page's name as the Pages tab shows it. */
  pageLabel: (file: string) => string;
  /** Writes new files as drafts and finds the site's pages and components again; resolves to an error. */
  createFiles: (files: { path: string; content: string }[]) => Promise<string | undefined>;
  /** Takes back new files written by `createFiles`. */
  removeFiles: (paths: string[]) => void;
  /** The sidebar, whose foot holds the properties panel. */
  panelHost: HTMLElement;
  /** Puts the banner over a component's template above the preview's frame. */
  addStrip: (strip: HTMLElement) => void;
  /** The code pane's title row, tinted while a template is open in it. */
  codeTitle: HTMLElement;
  /** The page file the preview shows (for Done, back from a template). */
  previewPage: () => string | undefined;
}

/** An instance found for a selection: where it is written and what it holds. */
interface Located {
  path: string;
  source: string;
  /** The instance's element-child indexes in `path`. */
  node: number[];
  range: ElementRange;
  tag: string;
  templatePath: string;
  template: string;
  instance: Instance;
  slots: TemplateSlot[];
  states: Map<string, SlotState>;
  /** The selection is the instance itself, or sits in the slot named here. */
  within?: string;
}

const KIND_LABEL: Record<SlotValue["kind"], string> = { text: "Text", image: "Image", link: "Link", content: "Content" };
const KIND_MARK: Record<SlotValue["kind"], ComponentMark> = { text: "text", image: "image", link: "link", content: "content" };
// Elements a section of a page is made of, which Make component offers to turn into one.
const CONTAINERS = new Set(["section", "article", "header", "footer", "aside", "nav", "figure", "div", "form"]);

export function createComponentTools(deps: ComponentDeps) {
  const panel = node("section", "component-panel");
  panel.setAttribute("aria-label", "Component properties");
  panel.hidden = true;
  deps.panelHost.append(panel);
  const banner = node("div", "component-banner");
  banner.setAttribute("role", "status");
  banner.hidden = true;
  deps.addStrip(banner);
  const usedOn = node("div", "component-menu");
  usedOn.popover = "auto";
  usedOn.setAttribute("role", "menu");
  usedOn.setAttribute("aria-label", "Used on");
  document.body.append(usedOn);
  let usedOnButton: HTMLButtonElement | undefined;
  usedOn.addEventListener("toggle", () => usedOnButton?.setAttribute("aria-expanded", String(usedOn.matches(":popover-open"))));

  const site = () => deps.site();
  const isComponent = (tag: string) => Boolean(site() && Object.hasOwn(site()!.components, tag));
  const templateOf = (tag: string) => {
    const file = site()?.components[tag];
    return file ? { path: file, source: deps.sources()[file] ?? "" } : undefined;
  };
  const tagOfFile = (path: string | undefined) =>
    path && site() ? Object.entries(site()!.components).find(([, file]) => file === path)?.[0] : undefined;
  const pageBody = (html: string) => {
    const { start, end } = nativePageBody(html);
    return html.slice(start, end);
  };
  const usage = (tag: string) => componentUsage(site()!, deps.sources(), tag, pageBody);

  // ---- Finding the instance. ----

  /** The instance written at `node` in `path`, read from the current source. */
  function instanceAt(path: string, nodePath: number[], within?: string): Located | undefined {
    const source = deps.sources()[path];
    if (source === undefined || !nodePath.length) return undefined;
    const range = locateNativeElementRange(source, nodePath);
    if (!range?.close || !isComponent(range.tag.name)) return undefined;
    const template = templateOf(range.tag.name)!;
    const instance = readInstance(source, range);
    return {
      path, source, node: nodePath, range, tag: range.tag.name,
      templatePath: template.path, template: template.source,
      instance, slots: templateSlots(template.source), states: slotStates(template.source, instance),
      ...(within !== undefined ? { within } : {}),
    };
  }

  // The last source parsed for a selection: the bar, the panel and the
  // chip all ask about the same one after each render.
  let parsed: { source: string; root: DocumentFragment } | undefined;
  function parsedRoot(source: string) {
    if (parsed?.source !== source) parsed = { source, root: parseMarked(source).root };
    return parsed.root;
  }

  /**
   * The instance a selection is, or sits in as the page's own content
   * (`within` names the slot), in the selection's own file. An element of
   * a template belongs to the component, not to an instance on the page.
   */
  function locate(selection: NativePreviewSelection | undefined, around = false): Located | undefined {
    if (!selection?.path || !selection.node?.length || !site()) return undefined;
    const source = deps.sources()[selection.path];
    if (source === undefined) return undefined;
    const root = parsedRoot(source);
    const chain: Element[] = [];
    let parent: ParentNode = root;
    for (const index of selection.node) {
      const child: Element | undefined = parent.children[index];
      if (!child) return undefined;
      chain.push(child);
      parent = child;
    }
    // With `around`, the instance the selection sits in, not the selection itself.
    for (let depth = chain.length - (around ? 2 : 1); depth >= 0; depth--) {
      if (!isComponent(chain[depth].localName)) continue;
      const within = depth < chain.length - 1 ? (chain[depth + 1].getAttribute("slot") ?? "").trim() : undefined;
      return instanceAt(selection.path, selection.node.slice(0, depth + 1), within);
    }
    return undefined;
  }

  // ---- Edits. ----

  /** Whether `path` is the file open in the editor, where edits go. */
  const editable = (path: string) => deps.currentPath() === path && Boolean(deps.editor()?.isMounted(path));

  /** One change to `path` as one undo step; `next` is selected once the preview shows it. */
  function change(path: string, edits: RangeEdit[], message: string, next?: number[]) {
    const editor = deps.editor();
    const preview = deps.preview();
    if (!editor || !editable(path)) {
      deps.announce("Open the page with this instance to change it.");
      return false;
    }
    const source = deps.sources()[path] ?? "";
    preview?.selectAfterUpdate(next ? { path, node: next } : undefined);
    try {
      editor.replaceActiveRanges(edits.filter((edit) => edit.text !== source.slice(edit.start, edit.end))
        .map((edit) => ({ path, ...edit, expected: source.slice(edit.start, edit.end) })));
      deps.announce(message);
      return true;
    } catch (error) {
      preview?.selectAfterUpdate(undefined);
      deps.error(error);
      return false;
    }
  }

  /** A keystroke's change, grouped with the others into one undo step until the field closes. */
  function live(path: string, edit: RangeEdit, message: string, next: number[]) {
    const editor = deps.editor();
    if (!editor || !editable(path)) return;
    const source = deps.sources()[path] ?? "";
    if (edit.start === edit.end && !edit.text) return;
    deps.preview()?.selectAfterUpdate({ path, node: next });
    try {
      editor.replaceActiveRange({ path, ...edit, expected: source.slice(edit.start, edit.end) }, true);
      deps.announce(message);
    } catch (error) {
      deps.preview()?.selectAfterUpdate(undefined);
      deps.error(error);
    }
  }
  const endTyping = (path: string) => deps.editor()?.closeActiveEditGroup(path);

  // What stays selected after a panel edit: the element selected, unless the
  // edit moved it (a slot filled before it, or its own content taken out),
  // then the instance.
  function keepSelection(at: Located, structural: boolean) {
    const selected = deps.selection();
    if (!structural && selected?.path === at.path && selected.node) return selected.node;
    return at.node;
  }

  // ---- The edit bar. ----

  /** The edit bar's component identity for a selection: the mark on an instance, the chip inside one. */
  function identity(selection: NativePreviewSelection): Pick<EditBarModel, "component" | "context"> {
    const out: Pick<EditBarModel, "component" | "context"> = {};
    if (isComponent(selection.tag)) out.component = { tag: selection.tag };
    // The instance around the selection: in the same file, else (for an
    // element of a template) the instance on the page it renders in.
    const at = locate(selection, true);
    const host = selection.host;
    if (at) {
      const label = componentLabel(at.tag);
      out.context = {
        label,
        title: at.within ? `In the ${slotLabel(at.within).toLowerCase()} slot of ${label}: select the instance` : `Select the ${label} instance`,
        onSelect: () => deps.preview()?.selectNode({ path: at.path, node: at.node }),
      };
    } else if (host && isComponent(host.tag)) {
      const label = componentLabel(host.tag);
      out.context = {
        label,
        title: host.path && host.node ? `Select this ${label} instance` : `Inside the ${label} component`,
        onSelect: () => void selectHost(host),
      };
    }
    return out;
  }

  async function selectHost(host: NonNullable<NativePreviewSelection["host"]>) {
    if (!host.path || !host.node) return;
    if (deps.currentPath() !== host.path && !(await deps.openFile(host.path))) return;
    deps.preview()?.selectNode({ path: host.path, node: host.node });
  }

  /** The edit bar's component actions for a selection. */
  function controls(selection: NativePreviewSelection): EditBarControl[] {
    const out: EditBarControl[] = [];
    if (isComponent(selection.tag)) {
      out.push({ kind: "button", label: "Edit component", title: `Open <${selection.tag}>'s template, which every instance shares`, className: "edit-bar__component-action", onPress: () => void editComponent(selection.tag) });
      return out;
    }
    const at = selection.host ? undefined : locate(selection);
    if (at) {
      out.push({ kind: "button", label: "Edit component", title: `Open <${at.tag}>'s template at this part`, className: "edit-bar__component-action", onPress: () => void editComponent(at.tag, at.within) });
      return out;
    }
    // A part of a page (not inside a template) can become a component.
    if (!selection.host && selection.node && CONTAINERS.has(selection.tag) && !tagOfFile(selection.path)) {
      out.push({ kind: "button", label: "Make component…", title: "Turn this element into a component the site can reuse", className: "edit-bar__component-action", onPress: () => void openMakeComponent(selection) });
    }
    return out;
  }

  // ---- Edit component. ----

  /**
   * Opens `tag`'s template in the code pane and selects its part matching
   * `slot` (the element holding that slot, its `<slot>` marked in the code)
   * in the instance on show, else the template's first element.
   */
  async function editComponent(tag: string, slot?: string) {
    const template = templateOf(tag);
    if (!template) return;
    const from = deps.selection();
    if (!(await deps.openFile(template.path))) return;
    const source = deps.sources()[template.path] ?? template.source;
    const target = templateSlots(source).find((entry) => entry.name === slot);
    // The element that shows the slot: its nearest ancestor that is not a slot.
    let element = target?.element.parent;
    while (element?.name === "slot") element = element.parent;
    // A slot shows no box of its own: a template that is one slot (`<slot><p>…</p></slot>`)
    // has nothing to select in the preview, only its code to mark.
    const rootIsSlot = /^\s*(?:<!--[\s\S]*?-->\s*)*<slot[\s>]/i.test(source);
    const nodePath = element ? elementPathAt(source, element.start) : rootIsSlot ? undefined : [0];
    if (nodePath) deps.preview()?.selectNode({ path: template.path, node: nodePath });
    else if (target && deps.currentPath() === template.path) {
      deps.editor()?.revealRange(template.path, target.element.start, target.element.tag.end);
      return;
    }
    deps.announce(`Editing the ${componentLabel(tag)} component: changes apply to ${usageSummary(usage(tag))}.`);
    if (!target) return;
    // Once the preview has selected the part (and marked its tag), the slot's own tag is selected.
    for (let waited = 0; waited < 2000; waited += 50) {
      await new Promise((done) => setTimeout(done, 50));
      const now = deps.selection();
      if (now !== from && now?.path === template.path) break;
    }
    if (deps.currentPath() === template.path) deps.editor()?.revealRange(template.path, target.element.start, target.element.tag.end);
  }

  // ---- The banner over a component's template. ----

  // Over the preview while a component's template is open (whether the code
  // pane shows or not): what an edit changes, where, and the way back.
  let bannerKey = "";
  function renderBanner() {
    const tag = tagOfFile(deps.currentPath());
    deps.codeTitle.classList.toggle("code-pane__title--component", Boolean(tag));
    if (!tag || !site()) {
      bannerKey = "";
      banner.hidden = true;
      banner.replaceChildren();
      if (usedOn.matches(":popover-open")) usedOn.hidePopover();
      return;
    }
    const found = usage(tag);
    const key = `${tag}\n${usageSummary(found)}\n${found.pages.length + found.components.length}`;
    if (key === bannerKey) return;
    bannerKey = key;
    const text = node("span", "component-banner__text");
    text.append(
      node("strong", "", "Editing component"), " ",
      node("code", "component-banner__tag", `<${tag}>`),
      ` · changes apply to ${usageSummary(found)}`,
    );
    const used = button("Used on", () => toggleUsedOn(tag, used), "component-banner__used");
    used.append(mark("more", 12));
    used.setAttribute("aria-haspopup", "menu");
    used.setAttribute("aria-expanded", "false");
    used.disabled = !found.pages.length && !found.components.length;
    usedOnButton = used;
    const done = button("Done", () => void backToPage(), "component-banner__done");
    done.title = "Back to the page, with this instance selected";
    banner.replaceChildren(componentIcon(14), text, used, node("span", "component-banner__space"), done);
    banner.hidden = false;
  }

  /** Back from a template to the page the preview shows, the instance worked on selected. */
  async function backToPage() {
    const page = deps.previewPage() ?? Object.values(site()?.routes ?? {})[0];
    const host = deps.selection()?.host;
    if (!page || !(await deps.openFile(page))) return;
    if (host?.path === page && host.node) deps.preview()?.selectNode({ path: page, node: host.node });
  }

  function toggleUsedOn(tag: string, anchor: HTMLButtonElement) {
    if (usedOn.matches(":popover-open")) { usedOn.hidePopover(); return; }
    const found = usage(tag);
    const items: HTMLElement[] = [];
    if (found.pages.length) items.push(node("p", "component-menu__heading", "Pages"));
    for (const page of found.pages) {
      const item = button("", () => { usedOn.hidePopover(); void openUse(page.file, tag); }, "component-menu__item");
      item.setAttribute("role", "menuitem");
      item.append(node("span", "component-menu__name", deps.pageLabel(page.file)), node("span", "component-menu__meta", `${page.route} · ${page.count}×`));
      items.push(item);
    }
    if (found.components.length) items.push(node("p", "component-menu__heading", "Components"));
    for (const entry of found.components) {
      const item = button("", () => { usedOn.hidePopover(); void editComponent(entry.tag); }, "component-menu__item");
      item.setAttribute("role", "menuitem");
      const name = node("span", "component-menu__name");
      name.append(componentIcon(12), componentLabel(entry.tag));
      item.append(name, node("span", "component-menu__meta", `<${entry.tag}> · ${entry.count}×`));
      items.push(item);
    }
    usedOn.replaceChildren(...items);
    usedOn.showPopover();
    const box = anchor.getBoundingClientRect();
    usedOn.style.left = `${Math.max(8, Math.min(box.left, innerWidth - usedOn.offsetWidth - 8))}px`;
    const below = box.bottom + 4;
    usedOn.style.top = `${below + usedOn.offsetHeight <= innerHeight - 8 ? below : Math.max(8, box.top - 4 - usedOn.offsetHeight)}px`;
    usedOn.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }
  usedOn.addEventListener("keydown", (event) => {
    const items = [...usedOn.querySelectorAll<HTMLElement>("[role='menuitem']")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") { usedOn.hidePopover(); usedOnButton?.focus(); event.preventDefault(); return; }
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  });

  /** Opens a page that uses `tag` and selects its first instance there. */
  async function openUse(file: string, tag: string) {
    const locate = () => {
      const source = deps.sources()[file] ?? "";
      const holder = holderOf(source, tag);
      const node = holder ? elementPathAt(source, holder.start) : undefined;
      return holder && node ? { holder: holder.name, request: { path: file, node } } : undefined;
    };
    // The file switch schedules its render before openFile resolves.
    const before = locate();
    if (before) deps.preview()?.selectAfterUpdate(before.request);
    if (!(await deps.openFile(file))) return;
    const target = locate();
    if (!target) return;
    deps.preview()?.selectNode(target.request);
    // Shown through another component: its instance on the page holds this one.
    if (target.holder !== tag) deps.announce(`${componentLabel(tag)} is inside ${componentLabel(target.holder)} on this page: ${componentLabel(target.holder)} selected.`);
  }

  /** The tag on a page that shows `tag`: itself, else the first component whose template does (through others too). */
  function holderOf(html: string, tag: string) {
    const current = site();
    if (!current) return undefined;
    const shows = (name: string, seen: Set<string>): boolean => {
      if (name === tag) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      const template = deps.sources()[current.components[name] ?? ""] ?? "";
      return [...descendants(parseSource(template))].some((other) => isComponent(other.name) && shows(other.name, seen));
    };
    const body = nativePageBody(html);
    const used = [...descendants(parseSource(html, body.start, body.end))];
    return used.find((element) => element.name === tag) ?? used.find((element) => isComponent(element.name) && shows(element.name, new Set()));
  }

  // ---- The properties panel. ----

  let shown: Located | undefined;
  let shape = "";
  // The field typed in, so a render keeps it and the undo step ends when it is left.
  let typing: { path: string; key: string } | undefined;
  // The field to focus once a change has rendered (a slot switched on).
  let focusNext: string | undefined;
  function stopTyping(input: HTMLInputElement) {
    const was = typing;
    if (!was || was.key !== input.dataset.field) return;
    typing = undefined;
    endTyping(was.path);
  }

  function show(selection: NativePreviewSelection | undefined) {
    const at = selection && !selection.host ? locate(selection) : undefined;
    if (!at || !editable(at.path)) {
      shown = undefined;
      shape = "";
      panel.hidden = true;
      panel.replaceChildren();
      return;
    }
    shown = at;
    const values = at.slots.map((slot) => slotValue(at.source, at.template, at.instance, slot));
    const key = JSON.stringify([
      at.path, at.node, at.tag, at.within ?? null,
      at.slots.map((slot, index) => [slot.name, values[index].kind, values[index].editable, at.states.get(slot.name)]),
      at.instance.attributes.map((item) => item.name),
    ]);
    if (key !== shape) {
      const active = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement) ? document.activeElement : undefined;
      const field = active?.dataset.field;
      const caret = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] as const : undefined;
      shape = key;
      render(at, values);
      // The focus stays on the same control, else on the slot it belonged to
      // (a Reset that went away leaves it on the slot's field, then its name).
      const slotOf = field?.slice(field.indexOf(":") + 1);
      const again = field === undefined ? undefined : [field, `text:${slotOf}`, `name:${slotOf}`]
        .map((key) => panel.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`)).find(Boolean);
      if (again) {
        again.focus();
        if (again instanceof HTMLInputElement && caret && caret[0] !== null && again.dataset.field === field) again.setSelectionRange(caret[0], caret[1]);
      }
    } else patch(at, values);
    // A slot just switched on: its first field, ready to type in.
    const wanted = focusNext && panel.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(focusNext)}"]`);
    if (wanted) {
      focusNext = undefined;
      wanted.focus();
      wanted.select();
    }
    if (panel.hidden) {
      panel.hidden = false;
      // The panel takes room from the page structure: its selected row stays in view.
      deps.panelHost.querySelector<HTMLElement>(".page-structure [aria-selected='true']")?.scrollIntoView({ block: "nearest" });
    }
  }

  // Values into the fields, except the one being typed in.
  function patch(at: Located, values: SlotValue[]) {
    at.slots.forEach((slot, index) => {
      const value = values[index];
      const set = (field: string, text: string | undefined) => {
        const input = panel.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(field)}"]`);
        if (input && document.activeElement !== input && input.value !== (text ?? "")) input.value = text ?? "";
      };
      set(`text:${slot.name}`, value.text);
      set(`src:${slot.name}`, value.src);
      set(`alt:${slot.name}`, value.alt);
      set(`href:${slot.name}`, value.href);
      const summary = panel.querySelector<HTMLElement>(`[data-summary="${CSS.escape(slot.name)}"]`);
      if (summary) summary.textContent = value.text || "Empty";
    });
    for (const item of at.instance.attributes) {
      const input = panel.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(`attr:${item.name}`)}"]`);
      if (input && document.activeElement !== input && input.value !== item.value) input.value = item.value;
    }
  }

  function headingRow(text: string) {
    return node("h3", "component-panel__heading", text);
  }

  function iconButton(label: string, name: ComponentMark, action: () => void, className = "") {
    const item = button("", action, `component-panel__icon-button ${className}`.trim());
    item.append(mark(name, 14));
    item.setAttribute("aria-label", label);
    item.title = label;
    return item;
  }

  function render(at: Located, values: SlotValue[]) {
    const label = componentLabel(at.tag);
    const head = node("div", "component-panel__head");
    const title = node("div", "component-panel__title");
    const name = node("span", "component-panel__name");
    name.append(componentIcon(14), label);
    const found = usage(at.tag);
    title.append(name, node("span", "component-panel__tag", `<${at.tag}>`));
    const actions = node("div", "component-panel__actions");
    actions.append(
      iconButton(`Edit component (${usageSummary(found)})`, "edit", () => void editComponent(at.tag, at.within)),
      iconButton("Detach instance…", "detach", () => void openDetach(at)),
    );
    head.append(title, actions);
    const meta = node("p", "component-panel__meta", found.instances > 1 ? `One of ${usageSummary(found)}` : `Used once on this site`);
    const body = node("div", "component-panel__body");
    body.append(meta);
    if (at.slots.length) {
      body.append(headingRow("Slots"));
      at.slots.forEach((slot, index) => body.append(slotRow(at, slot, values[index])));
    } else body.append(node("p", "component-panel__empty", "This component has no slots: every instance shows the same content."));
    body.append(headingRow("Attributes"), attributesBlock(at));
    panel.replaceChildren(head, body);
  }

  function slotRow(at: Located, slot: TemplateSlot, value: SlotValue) {
    const state = at.states.get(slot.name) ?? { filled: false, shown: false, whenEmpty: "hidden" as const };
    const row = node("div", "component-slot");
    row.dataset.slot = slot.name;
    if (at.within === slot.name) row.classList.add("is-current");
    if (!state.shown) row.classList.add("is-off");
    const head = node("div", "component-slot__head");
    const pick = button("", () => selectSlot(slot.name), "component-slot__name");
    pick.dataset.field = `name:${slot.name}`;
    pick.append(mark(KIND_MARK[value.kind], 14, "component-slot__kind"), node("span", "", slotLabel(slot.name)));
    pick.title = state.filled ? `Select what this page puts in the ${slotLabel(slot.name).toLowerCase()} slot` : "Select the instance";
    pick.setAttribute("aria-label", `${slotLabel(slot.name)}, ${KIND_LABEL[value.kind].toLowerCase()} slot${state.filled ? "" : state.whenEmpty === "hidden" ? ", off" : ", default"}`);
    head.append(pick);
    if (state.whenEmpty === "hidden") {
      // An optional part: on fills it (from the template's fallback), off takes the page's content out.
      const toggle = node("button", "component-switch");
      toggle.type = "button";
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", String(state.filled));
      toggle.setAttribute("aria-label", `Show ${slotLabel(slot.name).toLowerCase()}`);
      toggle.title = state.filled ? `Hide ${slotLabel(slot.name).toLowerCase()} on this instance` : `Show ${slotLabel(slot.name).toLowerCase()} on this instance`;
      toggle.dataset.field = `switch:${slot.name}`;
      toggle.addEventListener("click", () => setSlotOn(slot.name, !state.filled));
      head.append(toggle);
    } else if (state.filled) {
      const reset = iconButton(`Reset ${slotLabel(slot.name).toLowerCase()} to the component's default`, "reset", () => setSlotOn(slot.name, false), "component-slot__reset");
      reset.dataset.field = `reset:${slot.name}`;
      head.append(reset);
    } else head.append(node("span", "component-slot__badge", "Default"));
    row.append(head);
    // An optional slot that is off has nothing to edit.
    if (state.whenEmpty === "hidden" && !state.filled) return row;
    const fields = node("div", "component-slot__fields");
    if (value.kind === "image") {
      fields.append(
        textField(at, slot, "src", "Address", value.src ?? "", "Image in this repository or web address", deps.images().map((image) => `/${image}`)),
        uploadButton(slot),
        textField(at, slot, "alt", "Alt text", value.alt ?? "", "What the image shows; empty for decorative"),
      );
    } else if (value.kind === "link" && (value.editable || !state.filled)) {
      fields.append(
        textField(at, slot, "text", "Text", value.text, slotLabel(slot.name)),
        textField(at, slot, "href", "Address", value.href ?? "", "Page or web address", deps.links().map((entry) => entry.value)),
      );
    } else if (value.editable || (!state.filled && value.kind === "text")) {
      fields.append(textField(at, slot, "text", "", value.text, slotLabel(slot.name)));
    } else {
      const summary = node("button", "component-slot__summary", value.text || "Empty");
      summary.type = "button";
      summary.dataset.summary = slot.name;
      summary.title = "Select it in the preview to edit it";
      summary.addEventListener("click", () => selectSlot(slot.name));
      fields.append(summary);
    }
    if (!state.filled) fields.classList.add("is-default");
    row.append(fields);
    return row;
  }

  function textField(at: Located, slot: TemplateSlot, part: "text" | "src" | "alt" | "href", label: string, value: string, placeholder: string, suggestions?: string[]) {
    const wrap = node("label", "component-field");
    // A text slot's one field is named by the slot itself.
    if (label) wrap.append(node("span", "component-field__label", label));
    const input = node("input", "component-field__input");
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = part === "text" || part === "alt";
    input.dataset.field = `${part}:${slot.name}`;
    if (!label) input.setAttribute("aria-label", slotLabel(slot.name));
    if (suggestions?.length) {
      const list = node("datalist");
      list.id = `component-${part}-${slot.name || "default"}-options`;
      for (const option of suggestions) list.append(new Option(option, option));
      input.setAttribute("list", list.id);
      wrap.append(list);
    }
    input.addEventListener("focus", () => { typing = { path: at.path, key: input.dataset.field! }; });
    input.addEventListener("input", () => typeInto(slot.name, part, input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); input.blur(); }
      else if (event.key === "Escape") { event.preventDefault(); input.blur(); }
    });
    input.addEventListener("blur", () => stopTyping(input));
    wrap.append(input);
    return wrap;
  }

  function uploadButton(slot: TemplateSlot) {
    const file = node("input");
    file.type = "file";
    file.accept = "image/*";
    file.hidden = true;
    const pick = button("Upload image…", () => file.click(), "component-panel__text-button");
    file.addEventListener("change", async () => {
      const files = [...(file.files ?? [])];
      file.value = "";
      if (!files.length) return;
      // The instance the upload is for, not whatever is selected when it finishes.
      const target = shown && { path: shown.path, node: [...shown.node], tag: shown.tag, source: deps.sources()[shown.path] };
      const path = await deps.upload(files.slice(0, 1));
      if (path !== undefined && target) setImage(target, slot.name, path);
    });
    const row = node("div", "component-field__upload");
    row.append(pick, file);
    return row;
  }

  /** The instance on show, read again from the source as it is now. */
  const current = () => (shown ? instanceAt(shown.path, shown.node, shown.within) : undefined);

  /** Text typed into a slot's field: its text, an image's address or alt text, a link's address. */
  function typeInto(slotName: string, part: "text" | "src" | "alt" | "href", text: string) {
    const at = current();
    const slot = at?.slots.find((entry) => entry.name === slotName);
    if (!at || !slot) return;
    const value = text.replace(/\s+/g, " ").trim();
    if (part === "text") {
      const edit = slotTextEdit(at.source, at.template, at.instance, slot, value);
      if ("error" in edit) { deps.announce(edit.error); return; }
      live(at.path, edit, `${slotLabel(slotName)} changed`, keepSelection(at, !at.states.get(slotName)?.filled));
      return;
    }
    const name = part;
    const edit = slotAttributeEdit(at, slot, name, part === "alt" ? text : value);
    if (edit) live(at.path, edit, part === "alt" ? "Alt text changed" : part === "src" ? "Image changed" : "Link changed", keepSelection(at, !at.states.get(slotName)?.filled));
  }

  /** Sets `name` on the element the page fills `slot` with, or fills it first with a copy of its fallback. */
  function slotAttributeEdit(at: Located, slot: TemplateSlot, name: string, value: string): RangeEdit | undefined {
    const fill = at.instance.fills.get(slot.name);
    const element = fill?.length === 1 && fill[0].type === "element" ? fill[0] : undefined;
    if (element) return attributeEdit(at.source, element.tag, name, value);
    if (fill?.length) { deps.announce("Select it in the preview to change it."); return undefined; }
    let markup = fillMarkup(at.template, slot);
    const first = /^<([a-zA-Z][^\s/>]*)/.exec(markup);
    if (!first) return undefined;
    const tag = { name: first[1].toLowerCase(), start: 0, nameEnd: first[0].length, end: markup.indexOf(">") + 1 };
    const set = attributeEdit(markup, tag, name, value);
    markup = markup.slice(0, set.start) + set.text + markup.slice(set.end);
    return fillInsertEdit(at.source, at.instance, at.slots, slot.name, markup);
  }

  function setImage(target: { path: string; node: number[]; tag: string; source: string | undefined }, slotName: string, path: string) {
    const at = instanceAt(target.path, target.node);
    const slot = at?.slots.find((entry) => entry.name === slotName);
    if (!at || !slot || at.tag !== target.tag || at.source !== target.source) {
      deps.announce("The instance changed while the image uploaded; it was not replaced.");
      return;
    }
    const edit = slotAttributeEdit(at, slot, "src", path);
    if (edit) change(at.path, [edit], "Image replaced", keepSelection(at, !at.states.get(slotName)?.filled));
  }

  /** Switches a slot on (the page fills it, from the template's fallback) or off (the page's content goes). */
  function setSlotOn(slotName: string, on: boolean) {
    const at = current();
    const slot = at?.slots.find((entry) => entry.name === slotName);
    if (!at || !slot) return;
    const label = slotLabel(slotName);
    if (on) {
      const edit = fillInsertEdit(at.source, at.instance, at.slots, slotName, fillMarkup(at.template, slot));
      if (!edit) { deps.announce("The instance's end tag could not be found in the source."); return; }
      const kind = slotValue(at.source, at.template, at.instance, slot).kind;
      if (change(at.path, [edit], `${label} shown`, at.node)) focusNext = `${kind === "image" ? "src" : kind === "link" ? "href" : "text"}:${slotName}`;
    } else {
      const edits = fillRemoveEdits(at.source, at.instance, slotName);
      const reset = at.states.get(slotName)?.whenEmpty === "fallback";
      change(at.path, edits, reset ? `${label} reset to the component's default` : `${label} hidden`, at.node);
    }
  }

  /** Selects what the page gives a slot (its first element), else the instance. */
  function selectSlot(slotName: string) {
    const at = current();
    if (!at) return;
    const fill = at.instance.fills.get(slotName)?.find((part) => part.type === "element");
    const target = fill ? elementPathAt(at.source, fill.start) : undefined;
    deps.preview()?.selectNode({ path: at.path, node: target ?? at.node });
  }

  function attributesBlock(at: Located) {
    const block = node("div", "component-attributes");
    for (const item of at.instance.attributes) {
      const row = node("div", "component-attribute");
      const field = node("label", "component-field component-field--inline");
      field.append(node("span", "component-field__label component-attribute__name", item.name));
      const input = node("input", "component-field__input");
      input.type = "text";
      input.value = item.value;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.field = `attr:${item.name}`;
      input.addEventListener("focus", () => { typing = { path: at.path, key: input.dataset.field! }; });
      input.addEventListener("input", () => {
        const now = current();
        if (!now) return;
        live(now.path, attributeEdit(now.source, now.range.tag, item.name, input.value), `${item.name} changed`, keepSelection(now, false));
      });
      input.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); input.blur(); } });
      input.addEventListener("blur", () => stopTyping(input));
      field.append(input);
      row.append(field, iconButton(`Remove ${item.name}`, "close", () => {
        const now = current();
        if (now) change(now.path, [attributeEdit(now.source, now.range.tag, item.name, undefined)], `${item.name} removed`, keepSelection(now, false));
      }));
      block.append(row);
    }
    // Add attribute: a name and a value, added on Enter.
    const add = node("form", "component-attribute component-attribute--new");
    const name = node("input", "component-field__input component-attribute__new-name");
    name.placeholder = "name";
    name.setAttribute("aria-label", "New attribute name");
    name.autocomplete = "off";
    name.spellcheck = false;
    const value = node("input", "component-field__input");
    value.placeholder = "value";
    value.setAttribute("aria-label", "New attribute value");
    value.autocomplete = "off";
    // A submit button, so Enter in either field adds it.
    const submit = iconButton("Add attribute", "add", () => undefined);
    submit.type = "submit";
    const problem = node("p", "component-panel__problem");
    problem.hidden = true;
    problem.setAttribute("role", "alert");
    add.append(name, value, submit);
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      const now = current();
      const key = name.value.trim().toLowerCase();
      const why = attributeNameProblem(key) ?? (now?.instance.attributes.some((item) => item.name === key) ? `${key} is set already: change it above.` : undefined);
      problem.textContent = why ?? "";
      problem.hidden = !why;
      if (why || !now) return;
      if (change(now.path, [attributeEdit(now.source, now.range.tag, key, value.value)], `${key} added`, keepSelection(now, false))) {
        name.value = value.value = "";
      }
    });
    block.append(add, problem);
    return block;
  }

  // ---- Detach. ----

  const dialog = node("dialog", "create-dialog component-dialog");
  dialog.setAttribute("aria-labelledby", "component-dialog-title");
  document.body.append(dialog);
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });

  /** A dialog with a title, a body and actions; resolves to the action chosen (none on Cancel or Escape). */
  function ask(titleText: string, content: HTMLElement[], action: string, check?: () => string | undefined): Promise<boolean> {
    const form = node("form", "create-dialog__form");
    form.method = "dialog";
    const title = node("h2", "create-dialog__title", titleText);
    title.id = "component-dialog-title";
    const cancel = button("Cancel", () => dialog.close("cancel"), "button secondary");
    const confirm = node("button", "button primary", action);
    confirm.type = "submit";
    confirm.value = "confirm";
    const actions = node("div", "create-dialog__actions");
    actions.append(cancel, confirm);
    form.append(title, ...content, actions);
    form.addEventListener("submit", (event) => {
      if (check?.()) event.preventDefault();
    });
    dialog.replaceChildren(form);
    const opener = document.activeElement;
    dialog.returnValue = "";
    dialog.showModal();
    (content.map((el) => el.querySelector?.("input")).find(Boolean) as HTMLElement | undefined ?? confirm).focus();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        resolve(dialog.returnValue === "confirm");
      }, { once: true });
    });
  }

  // A file's (or a page part's) markup as it will read; markup for a place
  // in a page has its later lines indented for that place, which comes off.
  function codeBlock(label: string, text: string, place?: { source: string; at: number }) {
    const figure = node("figure", "component-dialog__file");
    let shown = text;
    if (place) {
      const lead = place.source.slice(place.source.lastIndexOf("\n", place.at - 1) + 1, place.at);
      const indent = /^[ \t]*$/.test(lead) ? lead : "";
      shown = text.split(/\r?\n/).map((line, index) => (index && line.startsWith(indent) ? line.slice(indent.length) : line)).join("\n");
    }
    figure.append(node("figcaption", "component-dialog__file-name", label), node("pre", "component-dialog__code", shown));
    return figure;
  }

  async function openDetach(at: Located) {
    const result = detachMarkup(at.source, at.template, at.instance);
    const label = componentLabel(at.tag);
    const notes: HTMLElement[] = [
      node("p", "create-dialog__result", `This ${label} becomes plain markup in ${at.path}: later changes to the component no longer reach it. Undo brings the instance back.`),
      codeBlock(at.path, result.markup, { source: at.source, at: at.range.start }),
    ];
    const css = deps.sources()[at.templatePath.replace(/\.html$/, ".css")];
    if (css?.trim()) notes.push(node("p", "create-dialog__result", `The component's own styles (${at.templatePath.replace(/\.html$/, ".css")}) apply inside the component only, so they stop styling this copy; the site's stylesheets still do.`));
    if (result.dropped.length) notes.push(node("p", "create-dialog__result is-error", `The template has no single top-level element, so the instance's ${result.dropped.join(", ")} cannot be kept.`));
    if (!(await ask(`Detach this ${label}?`, notes, "Detach"))) return;
    const now = instanceAt(at.path, at.node);
    if (!now) { deps.announce("The instance changed meanwhile; nothing was detached."); return; }
    const markup = detachMarkup(now.source, now.template, now.instance).markup;
    change(now.path, [{ start: now.range.start, end: now.range.end, text: markup }], `${label} detached`, now.node);
  }

  // ---- Make component. ----

  async function openMakeComponent(selection: NativePreviewSelection) {
    const path = selection.path;
    const nodePath = selection.node;
    const source = deps.sources()[path];
    const current = site();
    if (!nodePath || source === undefined || !current) return;
    const range = locateNativeElementRange(source, nodePath);
    if (!range?.close) { deps.announce("The element's end tag could not be found in the source."); return; }
    const taken = Object.keys(current.components);
    const nameField = node("label", "create-dialog__field");
    nameField.append("Component name");
    const input = node("input");
    input.type = "text";
    input.value = suggestTagName(source, range, taken);
    input.autocomplete = "off";
    input.spellcheck = false;
    nameField.append(input);
    const result = node("p", "create-dialog__result");
    result.setAttribute("role", "status");
    const files = node("div", "component-dialog__files");
    const loader = Object.values(current.routes).some((file) => /components\/components\.js/.test(deps.sources()[file] ?? ""));
    const notes = node("div", "component-dialog__notes");
    const plan = () => {
      const tag = input.value.trim();
      const problem = tagNameProblem(tag, taken);
      if (problem) return { problem };
      const made = makeComponentPlan(source, range, tag);
      if ("error" in made) return { problem: made.error };
      return { tag, made };
    };
    const update = () => {
      const planned = plan();
      result.classList.toggle("is-error", Boolean(planned.problem));
      if (planned.problem || !planned.made) {
        result.textContent = planned.problem ?? "";
        files.replaceChildren();
        return;
      }
      const { tag, made } = planned;
      const slots = made.slots.map((slot) => slot.name ? `“${slot.name}”` : "its content").join(", ");
      result.textContent = made.slots.length
        ? `<${tag}> gets ${made.slots.length === 1 ? "a slot" : `${made.slots.length} slots`} (${slots}); this page keeps its text, links and images in the instance.`
        : `<${tag}> has no text of its own to slot: every instance shows the same content.`;
      files.replaceChildren(
        codeBlock(`components/${tag}/${tag}.html (new)`, made.template),
        codeBlock(`components/${tag}/${tag}.css (new)`, made.css),
        codeBlock(`${path} (replaces the <${range.tag.name}>)`, made.instance, { source, at: range.start }),
      );
    };
    input.addEventListener("input", update);
    update();
    notes.append(node("p", "create-dialog__result", "Styles stay where they are: the site's stylesheets reach the component as they reached the page."));
    if (!loader) notes.append(node("p", "create-dialog__result is-error", "No page loads components/components.js, so the live site will not show components until it does."));
    const ok = await ask("Make component", [nameField, result, files, notes], "Make component", () => {
      const planned = plan();
      if (planned.problem) { update(); input.focus(); }
      return planned.problem;
    });
    if (!ok) return;
    const planned = plan();
    if (!planned.made || !planned.tag) return;
    await makeComponent(path, nodePath, planned.tag);
  }

  /**
   * Writes the new component's files as drafts and replaces the element
   * with an instance, as one undo step: undoing the page's edit takes the
   * new files back, redoing writes them again.
   */
  async function makeComponent(path: string, nodePath: number[], tag: string) {
    const source = deps.sources()[path] ?? "";
    const range = locateNativeElementRange(source, nodePath);
    const made = range ? makeComponentPlan(source, range, tag) : undefined;
    if (!range || !made || "error" in made) { deps.announce("The element changed meanwhile; no component was made."); return; }
    const newFiles = [
      { path: `components/${tag}/${tag}.html`, content: made.template },
      { path: `components/${tag}/${tag}.css`, content: made.css },
    ];
    const problem = await deps.createFiles(newFiles);
    if (problem) { deps.error(new Error(problem)); return; }
    const editor = deps.editor();
    // Writing the files can wait on GitHub: a page changed meanwhile keeps its change, and no component is made.
    if (deps.sources()[path] !== source) {
      deps.removeFiles(newFiles.map((file) => file.path));
      deps.announce("The page changed meanwhile; no component was made.");
      return;
    }
    if (!editor || !editable(path)) {
      deps.removeFiles(newFiles.map((file) => file.path));
      deps.announce("Open the page first.");
      return;
    }
    const latest = deps.sources()[path] ?? "";
    deps.preview()?.selectAfterUpdate({ path, node: nodePath });
    try {
      editor.replaceActiveRange({ path, start: range.start, end: range.end, text: made.instance, expected: latest.slice(range.start, range.end) }, false, {
        undo: () => deps.removeFiles(newFiles.map((file) => file.path)),
        redo: () => void deps.createFiles(newFiles),
      });
      deps.announce(`Made the component <${tag}>: components/${tag}/${tag}.html`);
    } catch (error) {
      deps.removeFiles(newFiles.map((file) => file.path));
      deps.preview()?.selectAfterUpdate(undefined);
      deps.error(error);
    }
  }

  return {
    identity,
    controls,
    /** The selection changed or the page re-rendered: the panel follows. */
    show,
    /** The open file or the sources changed: the banner follows. */
    refresh() {
      renderBanner();
    },
    editComponent,
    destroy() {
      panel.remove();
      banner.remove();
      usedOn.remove();
      dialog.remove();
    },
  };
}

export type ComponentTools = ReturnType<typeof createComponentTools>;
