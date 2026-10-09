// Components, first class (docs/page-builder/components.md): what the page
// builder does around a component instance, alongside the edit bar and the
// page structure.
//
// - Identity: an instance's name in the edit bar wears the component mark;
//   an element inside an instance gets a chip that selects the instance.
// - Properties: guarded instance slots and attributes live in Structure when
//   the host enables that adapter; the legacy panel remains until then.
// - Edit component: the template opens in the code pane at the matching
//   part; the canvas bar says which component is edited, where it is used
//   (Used on, a list of the pages) and holds the way back (Done).
// - Make component and Detach: an element becomes a component, an instance
//   becomes plain markup again, each shown before it is done.
//
// Every change is an edit of a site file through the open editor (one undo
// step; typing in a field is one step until the field is left), so the
// code pane shows it as it happens.

import { nativeElementUrlProblem } from "./native-elements";
import { startTags } from "../../shared/html-source";
import { mountComponentPanelResize } from "./component-panel-resize";
import { mountDropdown } from "../components/dropdown";
import { icon } from "../icons";
import { button, node } from "../ui/dom";
import { nativePageBody, type NativeSite } from "../../shared/native-project";
import type { NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl, EditBarModel } from "../components/edit-bar";
import { elementPathAt, locateNativeElementRange, parseMarked, type ElementRange } from "../native-source-location";
import { componentLabel } from "../native-insert";
import {
  attributeEdit,
  startTagAttributes,
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
  type MakeComponentPlan,
  type RangeEdit,
  type SlotState,
  type SlotValue,
  type TemplateSlot,
} from "./component-model";
import { componentIcon, mark, type ComponentMark } from "./component-icon";
import "../components/create-dialog.css";
import { cb14Install, cb14InterceptEdit, cb14EditBarControls } from "../prototype/cb14"; // PROTOTYPE cb14

type CodeEditor = typeof import("../components/source-editor");

/** File operations stay bound to their original scope and exact created drafts. */
export interface ComponentFileReceipt {
  isCurrent(): boolean;
  undo(): void;
  redo(): void | Promise<void>;
}
export type ComponentFileCreation = { error: string } | { receipt: ComponentFileReceipt };

/** Host-bound snapshot for a deferred slot action; never supplied by iframe DOM alone. */
export interface ComponentInstanceSlotTarget {
  pagePath: string;
  pageNode: number[];
  tag: string;
  templatePath: string;
  expectedRevision: string;
  /** Complete file sources, including page markup outside the instance. */
  expectedPageSource: string;
  expectedTemplateSource: string;
  /** The exact active host selection object captured by the adapter. */
  expectedSelection: NativePreviewSelection;
  /** Host proof of unchanged editor model/session/version and repository context. */
  isCurrent(): boolean;
}

export interface ComponentDeps {
  site: () => NativeSite | undefined;
  /** Stable scope/generation identity; creating this component must not change it. */
  revision: () => string;
  /** Every page, component and stylesheet's current source. */
  sources: () => Record<string, string>;
  editor: () => CodeEditor | undefined;
  preview: () => { flushPendingUpdate?(): void; selectAfterUpdate(request: { path: string; node: number[] } | undefined): void; selectNode(request: { path: string; node: number[] }): void } & Partial<PreviewTextPatch> | undefined;
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
  /** Creates drafts atomically; the receipt owns cleanup, undo and redo in the captured scope. */
  createFiles: (files: { path: string; content: string }[]) => Promise<ComponentFileCreation>;
  /** The sidebar, whose foot holds the properties panel. */
  panelHost: HTMLElement;
  /** Enable only when the host wires Structure componentSlots. */
  structureFields?: boolean;
  /** Shows the component being edited in the canvas bar, or nothing (`undefined`). */
  canvasComponent: (parts: { tag: string; lead: Element[]; end: Element[] } | undefined) => void;
  /** The code pane's title row, tinted while a template is open in it. */
  codeTitle: HTMLElement;
  /** The page file the preview shows (for Done, back from a template). */
  previewPage: () => string | undefined;
  /**
   * Native-first page actions for a plain element of a page (not a template or instance).
   * When provided, these replace the Make component fallback: a native page is never turned
   * into a component from the edit bar. Explicit component instances and templates are unaffected.
   */
  nativePageActions?: (selection: NativePreviewSelection) => EditBarControl[];
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

export type ComponentSlotPart = "text" | "src" | "alt" | "href";
/** The preview's text patch (native-preview.ts): typed text shown ahead of its write, on top of a source the session vouches for. */
export interface PreviewTextPatch {
  patchText(request: { path: string; node: number[] }, text: string, base: string, miss?: () => void): void;
  vouchPatch(path: string, source: string): void;
  endPatch(path: string, finish?: { text: string }): void;
}
export type ComponentAttributeResult = { ok: true } | { error: string; stale?: boolean };
export interface ComponentFieldSession {
  write(value: string): boolean;
  close(): void;
  /** Takes back everything this session wrote (Escape): no change and no undo step remain. False when it could not. */
  cancel(): boolean;
}
/**
 * One edit of a slot as a whole (a row's text and its card's URL or image
 * fields): every write one undo step, which Close keeps and Cancel takes back.
 */
export interface ComponentSlotEditSession {
  /** `part` reads `value` in the source: true when it does (or still holds its first value, untouched). */
  write(part: ComponentSlotPart, value: string): boolean;
  /** The slot's text can show in the page ahead of its write (one element holding text and breaks alone). */
  readonly patchable: boolean;
  /**
   * Shows `text` in the page at once, ahead of its write: false (nothing sent)
   * once the session is closed or stale, or its text was refused. `miss` runs
   * when the page could not take it.
   */
  patch(text: string, miss: () => void): boolean;
  /** The source moved on without this session (Undo, Redo, another edit): it can no longer write. */
  stale(): boolean;
  /** Ends the session, keeping what it wrote. */
  close(): void;
  /** Takes back everything it wrote and shows the first text again: false when it could not (said so). */
  cancel(): boolean;
}
export interface ComponentStructureModel {
  host: { path: string; node: readonly number[]; tag: string };
  slots: readonly { name: string; label: string; kind: SlotValue["kind"]; value: Readonly<SlotValue>; shown: boolean; filled: boolean; whenEmpty: SlotState["whenEmpty"]; assignedNodes: readonly number[][] }[];
  attributes: readonly { name: string; value: string }[];
  openAttribute(name: string): ComponentFieldSession | undefined;
  addAttribute(name: string, value: string): ComponentAttributeResult;
  openAttributeAdd(): { add(name: string, value: string): ComponentAttributeResult; close(): void } | undefined;
  removeAttribute(name: string): boolean;
  openField(name: string, part: ComponentSlotPart): ComponentFieldSession | undefined;
  /** One session for editing the slot: its text and the card's fields. */
  openSlotEdit(name: string): ComponentSlotEditSession | undefined;
  images: readonly string[];
  links: readonly {label: string; value: string}[];
  openImageUpload(name: string): { upload(files: File[]): Promise<boolean>; close(): void } | undefined;
  setVisible(name: string, on: boolean): boolean;
  selectSlot(name: string): void;
  edit(): void;
  disconnect(): void;
}

export function createComponentTools(deps: ComponentDeps) {
  const panel = node("section", "component-panel");
  panel.setAttribute("aria-label", "Component properties");
  panel.hidden = true;
  if (!deps.structureFields) deps.panelHost.append(panel);
  const destroyResize = !deps.structureFields ? mountComponentPanelResize(deps.panelHost, panel) : undefined;
  // The canvas bar while a template is open: the component, Used on, Done.
  const usedOnButton = node("button", "canvas-component__used");
  usedOnButton.type = "button";
  usedOnButton.setAttribute("aria-haspopup", "menu");
  const usedOnLabel = node("span", "canvas-component__used-label");
  usedOnButton.append(usedOnLabel, icon("caret-down", 12));
  const usedOn = node("div", "component-menu");
  usedOn.id = "component-used-on";
  usedOn.setAttribute("role", "menu");
  usedOn.setAttribute("aria-label", "Used on");
  document.body.append(usedOn);
  const usedOnDropdown = mountDropdown({ trigger: usedOnButton, panel: usedOn, anchor: "--component-used-on", hoverDelay: 150 });
  // Enter or Space (a click with no pointer) opens it with the focus on its first item;
  // hover and pointer clicks leave the focus where it is.
  usedOnButton.addEventListener("click", (event) => {
    if (event.detail === 0 && usedOnDropdown.isOpen()) usedOn.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  });
  const doneButton = node("button", "canvas-component__done");
  doneButton.type = "button";
  doneButton.setAttribute("aria-label", "Done editing component");
  doneButton.title = "Done";
  doneButton.append(icon("check", 16), node("span", "canvas-component__done-label", "Done"));
  doneButton.addEventListener("click", () => void backToPage());

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
  // Counting reads every page and template; the canvas bar asks again after each
  // change in the editor (several while a file opens), mostly over the same sources.
  let counted: { site: NonNullable<ReturnType<typeof site>>; tag: string; sources: Record<string, string>; found: ReturnType<typeof componentUsage> } | undefined;
  const sameSources = (a: Record<string, string>, b: Record<string, string>) => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
  };
  const usage = (tag: string) => {
    const now = site()!, sources = deps.sources();
    if (counted?.site === now && counted.tag === tag && sameSources(counted.sources, sources)) return counted.found;
    const found = componentUsage(now, sources, tag, pageBody);
    counted = { site: now, tag, sources: { ...sources }, found };
    return found;
  };

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
    const revision = deps.revision();
    const path = deps.currentPath();
    const source = deps.sources()[selection.path];
    const editor = deps.editor();
    const selectionKey = (value: NativePreviewSelection | undefined) => value && JSON.stringify({
      path: value.path, tag: value.tag, node: value.node, selector: value.selector, host: value.host,
    });
    const expectedSelection = selectionKey(selection);
    const guardedEdit = (tag: string, within?: string, part?: { path: string; node: number[]; tag: string }) => {
      const template = templateOf(tag);
      const templateSource = template && deps.sources()[template.path];
      if (!template || templateSource === undefined) return undefined;
      return () => {
        if (selectionKey(deps.selection()) !== expectedSelection || deps.revision() !== revision || deps.currentPath() !== path
          || deps.editor() !== editor || deps.sources()[selection.path] !== source
          || !template || templateOf(tag)?.path !== template.path || deps.sources()[template.path] !== templateSource) {
          deps.announce("This component action is stale. Select the component again to edit its current template.");
          return;
        }
        void editComponent(tag, within, part);
      };
    };
    if (isComponent(selection.tag)) out.component = { tag: selection.tag, onEdit: guardedEdit(selection.tag) };
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
    const out: EditBarControl[] = [...cb14EditBarControls(selection)]; // PROTOTYPE cb14 (was: [])
    if (isComponent(selection.tag)) {
      return out;
    }
    const at = selection.host ? undefined : locate(selection);
    if (at) {
      return out;
    }
    // A part of a page (not inside a template) can become a component.
    if (deps.nativePageActions) {
      if (!selection.host && selection.node && !tagOfFile(selection.path)) out.push(...deps.nativePageActions(selection));
      return out;
    }
    if (!selection.host && selection.node && CONTAINERS.has(selection.tag) && !tagOfFile(selection.path)) {
      out.push({ kind: "button", label: "Make component…", title: "Turn this element into a component the site can reuse", className: "edit-bar__component-action", onPress: () => void openMakeComponent(selection) });
    }
    return out;
  }

  // ---- Edit component. ----

  /**
   * Opens `tag`'s template in the code pane; root entry selects its root.
   * Legacy explicit slot entry selects its part matching
   * `slot` (the element holding that slot, its `<slot>` marked in the code)
   * in the instance on show, else the template's first element.
   */
  let explicitTemplate: { path: string; revision: string } | undefined;
  async function editComponent(tag: string, slot?: string, part?: { path: string; node: number[]; tag: string }) {
    if (cb14InterceptEdit(tag)) return; // PROTOTYPE cb14
    const template = templateOf(tag);
    if (!template) return;
    const from = deps.selection();
    const openingRevision = deps.revision();
    if (!(await deps.openFile(template.path))) return;
    if (deps.revision() !== openingRevision || deps.currentPath() !== template.path || deps.sources()[template.path] !== template.source) return;
    explicitTemplate = { path: template.path, revision: deps.revision() };
    // The template's code takes the caret straight away: typing edits it at once.
    deps.editor()?.focusEditor?.(template.path);
    const source = deps.sources()[template.path] ?? template.source;
    const target = templateSlots(source).find((entry) => entry.name === slot);
    // The element that shows the slot: its nearest ancestor that is not a slot.
    let element = target?.element.parent;
    while (element?.name === "slot") element = element.parent;
    // A slot shows no box of its own: a template that is one slot (`<slot><p>…</p></slot>`)
    // has nothing to select in the preview, only its code to mark.
    const rootIsSlot = /^\s*(?:<!--[\s\S]*?-->\s*)*<slot[\s>]/i.test(source);
    const preserved = part?.path === template.path && locateNativeElementRange(source, part.node)?.tag.name === part.tag ? part.node : undefined;
    const nodePath = preserved ?? (element ? elementPathAt(source, element.start) : rootIsSlot ? undefined : [0]);
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

  // ---- The canvas bar over a component's template. ----

  // While a component's template is open (whether the code pane shows or
  // not): which component, where it is used, and the way back.
  let barKey = "";
  let barTag = "";
  function renderBar() {
    if (explicitTemplate && (explicitTemplate.path !== deps.currentPath() || explicitTemplate.revision !== deps.revision())) explicitTemplate = undefined;
    const tag = tagOfFile(deps.currentPath());
    deps.codeTitle.classList.toggle("code-pane__title--component", Boolean(tag));
    if (!tag || !site()) {
      if (barKey) deps.canvasComponent(undefined);
      barKey = barTag = "";
      usedOnDropdown.close();
      return;
    }
    const found = usage(tag);
    const key = `${tag}\n${usageSummary(found)}\n${found.pages.length}\n${found.components.length}`;
    if (key === barKey) return;
    barKey = key;
    barTag = tag;
    const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
    const where = [found.pages.length ? count(found.pages.length, "page") : "", found.components.length ? count(found.components.length, "component") : ""].filter(Boolean);
    usedOnLabel.textContent = where.length ? `Used on ${where.join(", ")}` : "Not used yet";
    usedOnButton.disabled = !where.length;
    if (!where.length) usedOnDropdown.close();
    else if (usedOn.matches(":popover-open")) renderUsedOn(tag);
    deps.canvasComponent({ tag, lead: [usedOnButton], end: [doneButton] });
  }

  /** Back from a template to the page the preview shows, the instance worked on selected. */
  async function backToPage() {
    const page = deps.previewPage() ?? Object.values(site()?.routes ?? {})[0];
    const host = deps.selection()?.host;
    if (!page || !(await deps.openFile(page))) return;
    explicitTemplate = undefined;
    if (host?.path === page && host.node) deps.preview()?.selectNode({ path: page, node: host.node });
  }

  /** Used on: the pages (and components) showing `tag`. */
  function renderUsedOn(tag: string) {
    const found = usage(tag);
    const items: HTMLElement[] = [];
    for (const page of found.pages) {
      const item = button("", () => { usedOnDropdown.close(); void openUse(page.file, tag); }, "component-menu__item");
      item.setAttribute("role", "menuitem");
      item.append(node("span", "component-menu__name", deps.pageLabel(page.file)), node("span", "component-menu__meta", `${page.route} · ${page.count}×`));
      items.push(item);
    }
    if (found.components.length) items.push(node("p", "component-menu__heading", "Components"));
    for (const entry of found.components) {
      const item = button("", () => { usedOnDropdown.close(); void editComponent(entry.tag); }, "component-menu__item");
      item.setAttribute("role", "menuitem");
      const name = node("span", "component-menu__name");
      name.append(componentIcon(12), componentLabel(entry.tag));
      item.append(name, node("span", "component-menu__meta", `<${entry.tag}> · ${entry.count}×`));
      items.push(item);
    }
    usedOn.replaceChildren(...items);
  }
  usedOn.addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState === "open" && barTag) renderUsedOn(barTag);
  });
  usedOn.addEventListener("keydown", (event) => {
    const items = [...usedOn.querySelectorAll<HTMLElement>("[role='menuitem']")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
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
    if (deps.structureFields) { panel.hidden = true; panel.replaceChildren(); return; }
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
    const selected = deps.selection();
    const edit = selected?.path === at.path && JSON.stringify(selected.node) === JSON.stringify(at.node)
      ? identity(selected).component?.onEdit : undefined;
    if (edit) actions.append(iconButton(`Edit component (${usageSummary(found)})`, "edit", () => {
      const current = deps.selection();
      if (current?.path !== at.path || current.tag !== at.tag || JSON.stringify(current.node) !== JSON.stringify(at.node)) return;
      identity(current).component?.onEdit?.();
    }));
    actions.append(iconButton("Detach instance…", "detach", () => void openDetach(at)));
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

  /** Fills one native named assignment only while its captured host is still active. */
  function fillInstanceSlot(target: ComponentInstanceSlotTarget, name: string): boolean {
    const selection = deps.selection();
    const sameNode = (a: number[] | undefined, b: number[]) => Boolean(a && a.length === b.length && a.every((part, index) => part === b[index]));
    if (!target.isCurrent() || deps.revision() !== target.expectedRevision
      || selection !== target.expectedSelection || selection.host
      || selection.path !== target.pagePath || selection.tag !== target.tag || !sameNode(selection.node, target.pageNode)
      || deps.previewPage() !== target.pagePath || !editable(target.pagePath)
      || site()?.components[target.tag] !== target.templatePath
      || deps.sources()[target.pagePath] !== target.expectedPageSource
      || deps.sources()[target.templatePath] !== target.expectedTemplateSource
      || deps.editor()?.getMountedSource(target.pagePath) !== target.expectedPageSource) return false;
    const at = current();
    if (!at || at.within !== undefined || at.path !== target.pagePath || !sameNode(at.node, target.pageNode)
      || at.tag !== target.tag || at.templatePath !== target.templatePath
      || at.source !== target.expectedPageSource || at.template !== target.expectedTemplateSource
      || !at.slots.some((slot) => slot.name === name) || at.states.get(name)?.filled !== false) return false;
    return setSlotOn(name, true);
  }

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

  function openingSourceSafe(source: string, tag: ElementRange["tag"]) {
    const opening = document.createElement("template");
    opening.innerHTML = source.slice(tag.start, tag.end) + `</${tag.name}>`;
    const actual = opening.content.firstElementChild, attributes = startTagAttributes(source, tag);
    if (!actual || actual.localName !== tag.name || actual.attributes.length !== attributes.length) return false;
    return attributes.every(attribute => {
      const fragment = document.createElement("template");
      fragment.innerHTML = `<x-attribute${source.slice(attribute.start, attribute.end)}></x-attribute>`;
      const parsed = fragment.content.firstElementChild;
      return parsed?.attributes.length === 1 && parsed.getAttributeNames()[0] === attribute.name
        && parsed.getAttribute(attribute.name) === actual.getAttribute(attribute.name);
    });
  }

  /** Sets `name` on the element the page fills `slot` with, or fills it first with a copy of its fallback. */
  function slotAttributeEdit(at: Located, slot: TemplateSlot, name: string, value: string): RangeEdit | undefined {
    const fill = at.instance.fills.get(slot.name);
    const element = fill?.length === 1 && fill[0].type === "element" ? fill[0] : undefined;
    if (element) {
      if (!openingSourceSafe(at.source, element.tag)) { deps.announce("The slot attribute markup is ambiguous; edit its source directly."); return; }
      return attributeEdit(at.source, element.tag, name, value);
    }
    if (fill?.length) { deps.announce("Select it in the preview to change it."); return undefined; }
    let markup = fillMarkup(at.template, slot);
    const tag = startTags(markup)[0];
    if (!tag || tag.start !== 0 || !openingSourceSafe(markup, tag)) return undefined;
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
  function setSlotOn(slotName: string, on: boolean): boolean {
    const at = current();
    const slot = at?.slots.find((entry) => entry.name === slotName);
    if (!at || !slot) return false;
    const label = slotLabel(slotName);
    if (on) {
      const edit = fillInsertEdit(at.source, at.instance, at.slots, slotName, fillMarkup(at.template, slot));
      if (!edit) { deps.announce("The instance's end tag could not be found in the source."); return false; }
      const kind = slotValue(at.source, at.template, at.instance, slot).kind;
      const accepted = change(at.path, [edit], `${label} shown`, at.node);
      if (accepted) focusNext = `${kind === "image" ? "src" : kind === "link" ? "href" : "text"}:${slotName}`;
      return accepted;
    } else {
      const edits = fillRemoveEdits(at.source, at.instance, slotName);
      const reset = at.states.get(slotName)?.whenEmpty === "fallback";
      return change(at.path, edits, reset ? `${label} reset to the component's default` : `${label} hidden`, at.node);
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
    const revision = deps.revision();
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
    if (deps.revision() !== revision || deps.sources()[path] !== source) {
      deps.announce("The page or repository changed meanwhile; no component was made.");
      return;
    }
    await makeComponent({ path, nodePath: [...nodePath], tag: planned.tag, source, range, made: planned.made, revision });
  }

  /**
   * Writes the new component's files as drafts and replaces the element
   * with an instance, as one undo step: undoing the page's edit takes the
   * new files back, redoing writes them again.
   */
  async function makeComponent(request: { path: string; nodePath: number[]; tag: string; source: string; range: ElementRange; made: MakeComponentPlan; revision: string }) {
    const { path, nodePath, tag, source, range, made, revision } = request;
    const unchanged = () => deps.revision() === revision && deps.sources()[path] === source;
    if (!unchanged()) { deps.announce("The page or repository changed meanwhile; no component was made."); return; }
    const newFiles = [
      { path: `components/${tag}/${tag}.html`, content: made.template },
      { path: `components/${tag}/${tag}.css`, content: made.css },
    ];
    const result = await deps.createFiles(newFiles);
    if ("error" in result) { deps.error(new Error(result.error)); return; }
    const receipt = result.receipt;
    const editor = deps.editor();
    // The plan is the one reviewed in the modal. Cleanup belongs to its receipt,
    // even if another repository now has a draft at the same path.
    if (!unchanged() || !receipt.isCurrent()) {
      receipt.undo();
      deps.announce("The page or repository changed meanwhile; no component was made.");
      return;
    }
    if (!editor || !editable(path)) {
      receipt.undo();
      deps.announce("Open the page first.");
      return;
    }
    deps.preview()?.selectAfterUpdate({ path, node: nodePath });
    try {
      editor.replaceActiveRange({ path, start: range.start, end: range.end, text: made.instance, expected: source.slice(range.start, range.end) }, false, {
        undo: () => receipt.undo(),
        redo: () => void receipt.redo(),
      });
      deps.announce(`Made the component <${tag}>: components/${tag}/${tag}.html`);
    } catch (error) {
      receipt.undo();
      deps.preview()?.selectAfterUpdate(undefined);
      deps.error(error);
    }
  }

  /** A true instance target, independent of the current canvas selection. */
  function structure(path: string, nodePath: readonly number[]): ComponentStructureModel | undefined {
    const initial = instanceAt(path, [...nodePath]);
    const editor = deps.editor();
    if (!initial || !editable(path) || !editor) return;
    const revision = deps.revision();
    const hostProof = editor.captureHistoryHost(path);
    if (!hostProof) return;
    const read = (expectedSource = initial.source, proof?: { isCurrent(): boolean }, staleMessage = "The instance changed; reopen its field before editing.") => {
      const at = instanceAt(path, [...initial.node]);
      if (!at || !hostProof.isCurrent() || proof && !proof.isCurrent() || deps.revision() !== revision || deps.editor() !== editor || !editable(path)
        || at.tag !== initial.tag || at.templatePath !== initial.templatePath || at.template !== initial.template || at.source !== expectedSource) {
        deps.announce(staleMessage);
        return;
      }
      return at;
    };
    const attributeValue = (at: Located, name: string) => {
      const opening = document.createElement("template");
      opening.innerHTML = at.source.slice(at.range.tag.start, at.range.tag.end) + `</${at.tag}>`;
      return opening.content.firstElementChild?.getAttribute(name) ?? undefined;
    };
    // The legacy token ranges must describe the browser's actual attributes.
    const attributeSourceSafe = (at: Located) => openingSourceSafe(at.source, at.range.tag);
    const openSession = (plan: (at: Located, value: string, part?: ComponentSlotPart) => RangeEdit | { error: string } | undefined, message: string) => {
      if (!read()) return;
      const initialProof = editor.prepareHistorySources([{ path, expectedSource: initial.source, text: initial.source }]);
      if (!initialProof) return;
      let expected = initial.source, closed = false, wrote = false, writing = false, lastNode: number[] | undefined;
      // The instance's template as it was: an edit to it (an agent, the code pane) ends the session too.
      const templateAtOpen = deps.sources()[initial.templatePath];
      // Closes this session's undo group in its own scope, even after a branch switch mounted another.
      const closeOwnGroup = typeof editor.editGroupCloser === "function" ? editor.editGroupCloser(path) : undefined;
      let proof = initialProof;
      const close = () => {
        if (closed) return;
        closed = true;
        const ownsGroup = wrote && hostProof.isCurrent() && proof.isCurrent() && deps.sources()[path] === expected && deps.revision() === revision && deps.editor() === editor;
        proof.dispose?.();
        if (ownsGroup) editor.closeActiveEditGroup(path);
        else if (wrote) closeOwnGroup?.();
      };
      const reject = () => { close(); return false; };
      const cancel = () => {
        if (closed) return false;
        const owns = wrote && hostProof.isCurrent() && proof.isCurrent() && deps.sources()[path] === expected && deps.revision() === revision && deps.editor() === editor;
        closed = true;
        proof.dispose?.();
        if (!wrote) return true;
        if (!owns) { closeOwnGroup?.(); return false; }
        if (lastNode) deps.preview()?.selectAfterUpdate({ path, node: lastNode });
        const discarded = typeof editor.discardActiveEditGroup === "function" && editor.discardActiveEditGroup(path);
        if (!discarded) editor.closeActiveEditGroup(path);
        return discarded;
      };
      return {
        cancel,
        /** The source this session last wrote (else the one it opened on), and whether it has ended. */
        state: () => ({ expected, closed, wrote }),
        /** The source moved on without this session, or its file or scope did. */
        // (Its own write, still under way, is not "moved on": what it starts may look in here before it returns.)
        stale: () => !writing && (closed || deps.sources()[path] !== expected || deps.sources()[initial.templatePath] !== templateAtOpen
          || !hostProof.isCurrent() || deps.revision() !== revision || deps.editor() !== editor),
        write(value: string, part?: ComponentSlotPart) {
          if (closed) return reject();
          const at = read(expected, proof);
          if (!at) return reject();
          const edit = plan(at, value, part);
          if (!edit) return reject();
          if ("error" in edit) { deps.announce(edit.error); return false; }
          const next = at.source.slice(0, edit.start) + edit.text + at.source.slice(edit.end);
          if (next === at.source) return true;
          // A session's first write starts an undo step of its own, never one left open before it.
          if (!wrote && typeof editor.hasOpenEditGroup === "function" && editor.hasOpenEditGroup(path)) editor.closeActiveEditGroup(path);
          writing = true;
          try { live(path, edit, message, at.node); } finally { writing = false; }
          lastNode = at.node;
          if (deps.sources()[path] !== next) return reject();
          if (!hostProof.isCurrent()) return reject();
          const nextProof = editor.prepareHistorySources([{ path, expectedSource: next, text: next }]);
          if (!nextProof) return reject();
          proof.dispose?.(); proof = nextProof;
          expected = next;
          wrote = true;
          return true;
        },
        close,
      };
    };
    // The edit a slot part's new value makes in the page: URLs checked, text only where the slot holds text.
    const slotPartEdit = (at: Located, name: string, part: ComponentSlotPart, value: string) => {
      const slot = at.slots.find(slot => slot.name === name);
      if (!slot) return;
      if (part === "src" || part === "href") {
        const problem = nativeElementUrlProblem(value, part === "src" ? ["http", "https"] : ["http", "https", "mailto", "tel"], false);
        if (problem) return { error: problem };
      }
      const descriptor = slotValue(at.source, at.template, at.instance, slot);
      if ((part === "text" && !descriptor.editable) || (part === "src" || part === "alt") && descriptor.kind !== "image" || part === "href" && descriptor.kind !== "link") return;
      return part === "text" ? slotTextEdit(at.source, at.template, at.instance, slot, value)
        : slotAttributeEdit(at, slot, part, value);
    };
    const addAttribute = (rawName: string, value: string, proof?: { isCurrent(): boolean }): ComponentAttributeResult => {
      const at = read(initial.source, proof);
      if (!at) return { error: "The instance changed; reopen Attributes before adding it.", stale: true };
      if (!attributeSourceSafe(at)) return { error: "The attribute markup is ambiguous; edit its source directly." };
      const name = rawName.trim().toLowerCase();
      const problem = attributeNameProblem(name) ?? (at.instance.attributes.some(item => item.name === name) ? `${name} is set already: change it above.` : undefined);
      if (problem) return { error: problem };
      return change(path, [attributeEdit(at.source, at.range.tag, name, value)], `${name} added`, at.node)
        ? { ok: true } : { error: "The attribute could not be added." };
    };
    return {
      host: { path, node: [...nodePath], tag: initial.tag },
      slots: initial.slots.map(slot => ({ name: slot.name, label: slotLabel(slot.name),
        kind: slotValue(initial.source, initial.template, initial.instance, slot).kind,
        value: Object.freeze(slotValue(initial.source, initial.template, initial.instance, slot)),
        shown: initial.states.get(slot.name)?.shown ?? false, filled: initial.states.get(slot.name)?.filled ?? false, whenEmpty: initial.states.get(slot.name)?.whenEmpty ?? "hidden",
        assignedNodes: (initial.instance.fills.get(slot.name) ?? []).flatMap(part => {
          const node = part.type === "element" ? elementPathAt(initial.source, part.start) : undefined;
          return node ? [node] : [];
        }),
      })),
      attributes: initial.instance.attributes.map(({ name, value }) => ({ name, value: attributeValue(initial, name) ?? value })),
      openAttribute(name) {
        const problem = /^on/i.test(name) ? attributeNameProblem(name) : undefined;
        if (problem) { deps.announce(problem); return; }
        return openSession((at, value) => {
          if (!attributeSourceSafe(at)) return { error: "The attribute markup is ambiguous; edit its source directly." };
          if (at.instance.attributes.filter(item => item.name === name).length !== 1) return { error: "This attribute is missing or duplicated; edit its source directly." };
          if (attributeValue(at, name) === value) return { start: 0, end: 0, text: "" };
          return attributeEdit(at.source, at.range.tag, name, value);
        }, `${name} changed`);
      },
      addAttribute,
      openAttributeAdd() {
        if (!read()) return;
        const proof = editor.prepareHistorySources([{ path, expectedSource: initial.source, text: initial.source }]);
        if (!proof) return;
        let closed = false;
        return {
          add(name, value) {
            if (closed) return { error: "Reopen Attributes before adding it.", stale: true };
            if (!read(initial.source, proof)) { closed = true; proof.dispose?.(); return { error: "The instance changed; reopen Attributes before adding it.", stale: true }; }
            const result = addAttribute(name, value, proof);
            if ("ok" in result) { closed = true; proof.dispose?.(); }
            return result;
          },
          close() { if (!closed) { closed = true; proof.dispose?.(); } },
        };
      },
      removeAttribute(name) {
        const at = read();
        if (!at || !attributeSourceSafe(at) || at.instance.attributes.filter(item => item.name === name).length !== 1) return false;
        return change(path, [attributeEdit(at.source, at.range.tag, name, undefined)], `${name} removed`, at.node);
      },
      images: deps.images().map(image => `/${image}`),
      links: deps.links(),
      openImageUpload(name) {
        const at = read(), slot = at?.slots.find(item => item.name === name);
        if (!at || !slot || slotValue(at.source, at.template, at.instance, slot).kind !== "image") return;
        const proof = editor.prepareHistorySources([{ path, expectedSource: initial.source, text: initial.source }]);
        if (!proof) return;
        let closed = false;
        const close = () => { if (!closed) { closed = true; proof.dispose?.(); } };
        return {
          close,
          async upload(files) {
            try {
              if (closed || !files.length || !read(initial.source, proof)) return false;
              const uploaded = await deps.upload(files.slice(0, 1));
              if (closed || uploaded === undefined) return false;
              const current = read(initial.source, proof, "The instance changed while the image uploaded; it was not replaced.");
              if (!current) return false;
              const problem = nativeElementUrlProblem(uploaded, ["http", "https"], false);
              if (problem) { deps.announce(problem); return false; }
              const edit = slotAttributeEdit(current, slot, "src", uploaded);
              return !!edit && change(path, [edit], "Image replaced", current.node);
            } catch (error) { deps.error(error); return false; }
            finally { close(); }
          },
        };
      },
      openField(name, part) {
        const session = openSession((at, value) => slotPartEdit(at, name, part, value), `${slotLabel(name)} changed`);
        return session && { write: (value: string) => session.write(value), close: session.close, cancel: session.cancel };
      },
      openSlotEdit(name) {
        const at = read();
        const slot = at?.slots.find(slot => slot.name === name);
        if (!at || !slot) return;
        const session = openSession((at, value, part) => part ? slotPartEdit(at, name, part, value) : undefined, `${slotLabel(name)} changed`);
        if (!session) return;
        const opened = slotValue(at.source, at.template, at.instance, slot);
        const first: Record<ComponentSlotPart, string> = { text: opened.lines ?? opened.text, href: opened.href ?? "", src: opened.src ?? "", alt: opened.alt ?? "" };
        const touched = new Set<ComponentSlotPart>();
        // The text's element in the page, when it holds text and breaks alone: typing can show there at once.
        const fill = at.instance.fills.get(name);
        const only = fill?.length === 1 && fill[0].type === "element" ? fill[0] : undefined;
        const node = opened.editable && only?.close && only.children.every(child => child.type === "text" || child.type === "element" && child.name === "br")
          ? elementPathAt(at.source, only.start) : undefined;
        const patcher = () => { const preview = deps.preview(); return preview?.patchText && preview.vouchPatch && preview.endPatch ? preview as PreviewTextPatch : undefined; };
        let textRefused = false, patching = false, shown = first.text;
        return {
          patchable: Boolean(node && patcher()),
          stale: session.stale,
          write(part, value) {
            if (session.state().closed) return false;
            // A part still holding its first value is left as written (byte for byte).
            if (!touched.has(part) && value === first[part]) return true;
            touched.add(part);
            const ok = session.write(value, part);
            if (part === "text") textRefused = !ok;
            // Text the source refused never stays on the page: the patch ends and the page is drawn from its source.
            if (part === "text" && !ok && patching) { patcher()?.endPatch(path); patching = false; }
            if (ok && patching) patcher()?.vouchPatch(path, session.state().expected);
            return ok;
          },
          patch(text, miss) {
            const preview = patcher();
            if (!node || !preview || textRefused || session.stale()) return false;
            patching = true;
            shown = text;
            preview.patchText({ path, node: [...node] }, text, session.state().expected, miss);
            return true;
          },
          close() {
            // The page keeps the last patch only when its text is what was written; else the next render settles it.
            const kept = patching && !textRefused && !session.stale();
            session.close();
            if (patching) patcher()?.endPatch(path, kept ? { text: shown } : undefined);
            patching = false;
          },
          cancel() {
            const done = session.cancel();
            if (patching) patcher()?.endPatch(path, done ? { text: first.text } : undefined);
            patching = false;
            if (!done) deps.announce("The edit couldn't be undone; use Undo.");
            return done;
          },
        };
      },
      setVisible(name, on) {
        const at = read(), slot = at?.slots.find(slot => slot.name === name);
        if (!at || !slot) return false;
        let changed: boolean;
        if (on) {
          const edit = fillInsertEdit(at.source, at.instance, at.slots, name, fillMarkup(at.template, slot));
          changed = !!edit && change(path, [edit], `${slotLabel(name)} shown`, at.node);
        } else {
          changed = change(path, fillRemoveEdits(at.source, at.instance, name), `${slotLabel(name)} ${at.states.get(name)?.whenEmpty === "fallback" ? "reset to the component’s default" : "hidden"}`, at.node);
        }
        if (changed) deps.preview()?.flushPendingUpdate?.();
        return changed;
      },
      selectSlot(name) {
        const at = read(); if (!at) return;
        const element = at.instance.fills.get(name)?.find(part => part.type === "element");
        deps.preview()?.selectNode({ path, node: element ? elementPathAt(at.source, element.start) ?? at.node : at.node });
      },
      edit() { if (read()) void editComponent(initial.tag); },
      disconnect() { const at = read(); if (at) void openDetach(at); },
    };
  }

  cb14Install({ deps, editComponent: (tag) => editComponent(tag) }); // PROTOTYPE cb14
  return {
    identity,
    /** Only explicit template entry permits shared-template editing from a page preview. */
    editingScope() {
      if (explicitTemplate && (explicitTemplate.path !== deps.currentPath() || explicitTemplate.revision !== deps.revision())) explicitTemplate = undefined;
      return explicitTemplate && explicitTemplate.path === deps.currentPath() && explicitTemplate.revision === deps.revision()
        ? { ...explicitTemplate } : undefined;
    },
    /** Map a reported shadow child to its verified real page instance; never guess selectors. */
    instanceSelection(selection: NativePreviewSelection): NativePreviewSelection | undefined {
      const host = selection.host;
      if (!host) return selection;
      if (explicitTemplate && explicitTemplate.path === deps.currentPath() && explicitTemplate.revision === deps.revision()) return selection;
      if (!host.path || !host.node || deps.previewPage() !== host.path) return;
      const at = instanceAt(host.path, host.node);
      if (!at || at.tag !== host.tag || templateOf(at.tag)?.path !== selection.path) return;
      return { ...selection, path: at.path, node: [...at.node], tag: at.tag, host: undefined, selector: host.selector };
    },
    structure,
    controls,
    /** The selection changed or the page re-rendered: the panel follows. */
    show,
    /** The open file or the sources changed: the canvas bar follows. */
    refresh() {
      renderBar();
    },
    editComponent,
    fillInstanceSlot,
    destroy() {
      destroyResize?.();
      panel.remove();
      if (barKey) deps.canvasComponent(undefined);
      usedOnDropdown.destroy();
      usedOn.remove();
      dialog.remove();
    },
  };
}

export type ComponentTools = ReturnType<typeof createComponentTools>;
