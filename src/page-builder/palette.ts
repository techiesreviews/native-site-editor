import { refuse } from "../components/refusal-note";
import { handleChunkLoadFailure } from "../chunk-recovery";
// The keyboard layer of the editor: the command palette (⌘K, and ⌘P to go
// to a page or file), the keyboard shortcuts sheet (?), and the editor's
// commands registered for both (src/page-builder/commands.ts). main.ts hands
// over what the commands call (`EditorPaletteDeps`); every command calls the
// function the editor's own button or menu calls, so a command does exactly
// what that control does, as one source edit where it edits.
//
// Keys pressed in the preview frame never reach this document: the preview
// runtime forwards the ones the editor answers as `shortcut` messages
// (src/components/native-preview-runtime.js, "Editor shortcuts").
import type { AddChoice } from "./add-catalog";
import { nativeDestinations, nativeMarkupInsertEdit } from "./native-operations";
import { nativeChoiceMarkup } from "./native-elements";
import type { EditBarControl, EditBarModel } from "../components/edit-bar";
import type { CommandPalette } from "../components/command-palette";
import type { ShortcutSheet } from "../components/shortcut-sheet";
import { parseMarked } from "../native-source-location";
import { availableCommands, guardCommand, matchesKeys, registerCommand, registerCommandSource, registerShortcut, shortcutSheet, type Command, type Keys } from "./commands";

export interface PalettePage {
  file: string;
  route: string;
  label: string;
}

export interface PaletteComponent {
  tag: string;
  // The component's template file.
  file: string;
  label: string;
  // Its template is one section: it can be added between sections.
  section: boolean;
}

export interface PaletteSelection {
  path: string;
  node?: number[];
  tag: string;
}

export interface EditorPaletteDeps {
  /** The site's pages, files and components (empty when no site is open). */
  pages: () => PalettePage[];
  files: () => string[];
  components: () => PaletteComponent[];
  /** While the site's pages are still being read: resolves once they are (the palette waits, showing "Loading…"). */
  ready?: () => Promise<unknown> | undefined;
  currentPath: () => string | undefined;
  /** Native choices are separate from site components and never open templates. */
  nativeElements?: () => readonly AddChoice[];
  /** Optional synchronous host placement; the palette still validates source safety. */
  nativeInsertPoint?: (source: string, path: string, selection: PaletteSelection | undefined, choice: AddChoice) => { path?: string; parent: number[]; index: number } | undefined;
  /** Site and mount revision, changed when an editor session is replaced. */
  revision?: () => string;
  /** Opens a file (a page in the preview and the code pane, any other file in the code pane). */
  open: (path: string) => void | Promise<void>;
  /** A file's text as drafted. */
  source: (path: string) => string | undefined;
  isSectionTag: (tag: string) => boolean;
  /** Adds a section component at a point of a page, as the insert picker does. */
  insert: (point: { path: string; parent: number[]; index: number }, component: { tag: string; label: string }) => Promise<void>;
  /** The element selected in the preview, and its edit bar (undefined when the bar is hidden). */
  selection: () => PaletteSelection | undefined;
  editBar: () => EditBarModel | undefined;
  select: (path: string, node: number[]) => void;
  /** Text is selected in the selected element (so ⌘K there makes a link). */
  textSelected: () => boolean;
  /** Undo or redo in the open file, as the toolbar's buttons do. */
  history: (direction: "undo" | "redo") => void;
  /** The open file can be edited (undo, redo). */
  editing: () => boolean;
  toggleCode: () => void;
  codeHidden: () => boolean;
  toggleStructure: () => void;
  structureHidden: () => boolean;
  newPage: () => void;
  newFile: () => void;
  showPagesAndFiles: () => void;
  announce: (text: string) => void;
  onError: (error: unknown) => void;
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD_K: Keys = ["Mod", "K"];
const MOD_P: Keys = ["Mod", "P"];

/** Where typing goes: a field, an editable element, or the code editor. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".monaco-editor")) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(target.type);
  return false;
}

// Labels of the edit bar's controls → the palette's icon and the shortcut
// that does the same (the bar's own, the canvas's).
const BAR_ICONS: Record<string, string> = {
  "Move up": "arrow-up", "Move down": "arrow-down", Duplicate: "copy", Remove: "trash",
  Bold: "bold", Italic: "italic", Link: "link", "Remove link": "link", Address: "link",
  "Ask agent": "sparkle", "Heading level": "text", "Text size": "text", "Alt text": "image",
};
const BAR_SHORTCUTS: Record<string, Keys[]> = {
  "Move up": [["Alt", "ArrowUp"]],
  "Move down": [["Alt", "ArrowDown"]],
  Duplicate: [["Mod", "D"]],
  Remove: [["Delete"], ["Backspace"]],
  Bold: [["Mod", "B"]],
  Italic: [["Mod", "I"]],
  Link: [["Mod", "K"]],
};
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
const fileIcon = (path: string) => {
  const ext = extension(path);
  if (ext === "html" || ext === "htm") return "file-html";
  if (ext === "css") return "file-css";
  if (["js", "mjs", "ts", "json", "jsonc", "xml", "svg", "md", "txt", "toml", "yml", "yaml"].includes(ext)) return "file-code";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "ico"].includes(ext)) return "image";
  return "file";
};

/**
 * Where a component goes for "Add …": after the selected section (or the
 * section the selection is in), else at the end of the page's `main`.
 */
export function sectionInsertPoint(source: string, selection: PaletteSelection | undefined, isSectionTag: (tag: string) => boolean): { parent: number[]; index: number } | undefined {
  const { root } = parseMarked(source);
  if (selection?.node?.length) {
    let parent: ParentNode = root;
    let found: { parent: number[]; index: number } | undefined;
    selection.node.forEach((index, depth) => {
      const child = parent.children[index];
      if (!child) return;
      if (isSectionTag(child.localName)) found = { parent: selection.node!.slice(0, depth), index: index + 1 };
      parent = child;
    });
    if (found) return found;
  }
  const main = root.querySelector("main");
  if (!main) return undefined;
  const path: number[] = [];
  for (let el: Element | null = main; el; el = el.parentElement) path.unshift([...(el.parentNode as ParentNode).children].indexOf(el));
  return { parent: path, index: main.children.length };
}

// The edit bar's button for a control, to open its field or note.
function barButton(label: string): HTMLButtonElement | undefined {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".edit-bar button")];
  return buttons.find((item) => item.getAttribute("aria-label") === label) ??
    buttons.find((item) => item.title === label || item.title.startsWith(`${label}:`) || item.textContent === label);
}

/** Controls retain the source revision from their construction, even after a new search. */
function modelOriginCurrent(deps: EditorPaletteDeps, model: EditBarModel): boolean {
  const origin = model.origin;
  const selection = deps.selection();
  return Boolean(origin && selection && deps.currentPath() === origin.path && selection.path === origin.path &&
    deps.revision?.() === origin.revision && deps.source(origin.path) === origin.source &&
    JSON.stringify(selection.node) === JSON.stringify(origin.node));
}

function announceRefusal(deps: EditorPaletteDeps, reason: string) {
  deps.announce(reason);
  refuse(reason);
}

function selectionCommands(deps: EditorPaletteDeps): Command[] {
  const model = deps.editBar();
  const selection = deps.selection();
  if (!model || !selection) return [];
  const revision = deps.revision?.();
  const source = deps.source(selection.path);
  const identity = JSON.stringify(selection);
  const guard = (run: () => void | Promise<void>) => guardCommand(run,
    () => modelOriginCurrent(deps, model) && deps.revision?.() === revision && deps.currentPath() === selection.path && deps.editBar() === model && deps.source(selection.path) === source && JSON.stringify(deps.selection()) === identity,
    () => announceRefusal(deps, "The selection changed. Reopen the command palette and try again."));
  const kind = model.kind;
  const out: Command[] = [];
  // Fields (Address, Label, Alt text) and Ask agent come after what acts at once.
  const later: Command[] = [];
  const add = (control: EditBarControl, title: string, run: () => void, extra: Partial<Command> = {}) => {
    (control.kind === "address" || control.kind === "prompt" ? later : out).push({
      id: `selection.${slug(title)}`,
      title,
      hint: kind,
      group: "Selection",
      icon: BAR_ICONS[control.label] ?? BAR_ICONS[title] ?? "text",
      shortcut: BAR_SHORTCUTS[title] ?? BAR_SHORTCUTS[control.label],
      keywords: ["selection", "element", kind.toLowerCase()],
      run: guard(run),
      ...extra,
    });
  };
  for (const control of model.controls) {
    if (control.kind === "button") {
      if (control.disabled) continue;
      add(control, control.ariaLabel ?? control.label, control.onPress, control.label === "Remove" ? { keywords: ["delete", "selection", kind.toLowerCase()] } : {});
    } else if (control.kind === "select") {
      for (const option of control.options) {
        if (option.value === control.value || option.value === "custom") continue;
        add(control, `${control.label}: ${option.label}`, () => control.onChange(option.value));
      }
    } else if (control.kind === "menu") {
      for (const item of control.items) if (!item.disabled && !item.current) add(control, `${control.label}: ${item.label}`, item.onSelect);
    } else if (control.kind === "address") {
      add(control, control.warning ? `${control.label} (${control.warning.toLowerCase()})` : control.label, () => barButton(control.label)?.click(), { keywords: ["edit", control.label.toLowerCase()] });
    } else if (control.kind === "prompt") {
      add(control, `${control.label}…`, () => barButton(control.label)?.click(), { group: "Agent", icon: "sparkle", keywords: ["agent", "ai", "request", "claude", "codex"] });
    }
  }
  // Select parent: the element around the selection (not past the page's body).
  if (selection.node && selection.node.length > 1) {
    const node = selection.node;
    out.push({
      id: "selection.select-parent",
      title: "Select parent",
      hint: kind,
      group: "Selection",
      icon: "parent",
      shortcut: [["Shift", "Enter"]],
      keywords: ["up", "container", "outer", "selection"],
      run: guard(() => deps.select(selection.path, node.slice(0, -1))),
    });
  }
  out.push(...later);
  return out;
}

const publishButton = () => document.querySelector<HTMLButtonElement>(".publish-menu__trigger");

function actionCommands(deps: EditorPaletteDeps): Command[] {
  const mac = isMac();
  return [
    {
      id: "editor.publish", title: "Publish changes", group: "Actions", icon: "publish", suggested: true,
      keywords: ["save", "commit", "github", "deploy", "push"],
      when: () => Boolean(publishButton() && !publishButton()!.disabled),
      run: () => publishButton()?.click(),
    },
    {
      id: "editor.review-changes", title: "Review changes to publish", group: "Actions", icon: "publish",
      keywords: ["save", "changes", "diff", "drafts", "github"],
      when: () => Boolean(publishButton() && !publishButton()!.disabled),
      run: () => {
        const trigger = publishButton();
        if (!trigger) return;
        trigger.focus();
        trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      },
    },
    {
      id: "editor.undo", title: "Undo", group: "Actions", icon: "undo", area: "Editing",
      shortcut: [["Mod", "Z"]], when: deps.editing, run: () => deps.history("undo"),
    },
    {
      id: "editor.redo", title: "Redo", group: "Actions", icon: "redo", area: "Editing",
      shortcut: mac ? [["Mod", "Shift", "Z"]] : [["Mod", "Shift", "Z"], ["Ctrl", "Y"]], when: deps.editing, run: () => deps.history("redo"),
    },
    {
      id: "editor.toggle-code", title: "Hide code", group: "Actions", icon: "split",
      keywords: ["toggle", "code pane", "source", "minimize", "preview"],
      when: () => !deps.codeHidden() && Boolean(document.querySelector(".code-resize")),
      run: deps.toggleCode,
    },
    {
      id: "editor.show-code", title: "Show code", group: "Actions", icon: "code",
      keywords: ["toggle", "code pane", "source", "restore", "html"],
      when: () => deps.codeHidden(),
      run: deps.toggleCode,
    },
    {
      id: "editor.toggle-structure", title: "Hide page structure", group: "Actions", icon: "sidebar",
      keywords: ["toggle", "sidebar", "navigator", "layers", "tree"],
      when: () => !deps.structureHidden(),
      run: deps.toggleStructure,
    },
    {
      id: "editor.show-structure", title: "Show page structure", group: "Actions", icon: "structure",
      keywords: ["toggle", "sidebar", "navigator", "layers", "tree"],
      when: () => deps.structureHidden(),
      run: deps.toggleStructure,
    },
    {
      id: "editor.new-page", title: "New page", group: "Actions", icon: "file-plus", suggested: true,
      keywords: ["add", "create", "page"],
      when: () => deps.pages().length > 0,
      run: deps.newPage,
    },
    {
      id: "editor.new-file", title: "New file or folder", group: "Actions", icon: "file-plus",
      keywords: ["add", "create", "folder", "stylesheet", "css"],
      when: () => Boolean(document.getElementById("new-at-root")),
      run: deps.newFile,
    },
    {
      id: "editor.pages-and-files", title: "Show pages and files", group: "Actions", icon: "pages",
      keywords: ["explorer", "browse", "tree", "open"],
      when: () => Boolean(document.getElementById("explorer-toggle")),
      run: deps.showPagesAndFiles,
    },
    {
      id: "editor.history", title: "Show history", group: "Actions", icon: "clock",
      keywords: ["commits", "versions", "restore", "changes"],
      when: () => Boolean(document.getElementById("history-button")),
      run: () => document.getElementById("history-button")?.click(),
    },
  ];
}

function siteCommands(deps: EditorPaletteDeps): Command[] {
  const out: Command[] = [];
  const current = deps.currentPath();
  const pages = deps.pages();
  const pageFiles = new Set(pages.map((page) => page.file));
  for (const page of pages) {
    out.push({
      id: `page:${page.file}`,
      title: page.label,
      hint: page.route,
      group: "Pages",
      navigation: true,
      icon: page.route === "/" ? "home" : "file",
      keywords: [page.file, "page", "open"],
      suggested: page.file !== current,
      run: () => deps.open(page.file),
    });
  }
  // Components: add a section component where the selection is, or open any component's template.
  const selection = deps.selection();
  const pagePath = current && pageFiles.has(current) ? current : undefined;
  const revision = deps.revision?.();
  const listedSource = pagePath ? deps.source(pagePath) : undefined;
  const listedSelection = JSON.stringify(selection);
  for (const component of deps.components()) {
    if (component.section && pagePath) {
      out.push({
        id: `component.add:${component.tag}`,
        title: `Add ${component.label}`,
        hint: selection?.path === pagePath && selection.node ? `<${component.tag}> after the selected section` : `<${component.tag}> at the end of the page`,
        group: "Components",
        icon: "insert",
        accent: "component",
        suggested: true,
        keywords: ["insert", "section", "component", component.tag],
        run: async () => {
          if (deps.revision?.() !== revision || deps.currentPath() !== pagePath || deps.source(pagePath) !== listedSource || JSON.stringify(deps.selection()) !== listedSelection) {
            announceRefusal(deps, "The page changed. Reopen the command palette and try again.");
            return;
          }
          const source = deps.source(pagePath) ?? "";
          const point = sectionInsertPoint(source, selection?.path === pagePath ? selection : undefined, deps.isSectionTag);
          if (!point) { announceRefusal(deps, `Select a section to add ${component.label} after it.`); return; }
          await deps.insert({ path: pagePath, ...point }, { tag: component.tag, label: component.label });
        },
      });
    }
    out.push({
      id: `component.open:${component.tag}`,
      title: `Open ${component.label} component`,
      navigation: true,
      hint: component.file,
      group: "Components",
      icon: "component",
      accent: "component",
      keywords: ["open", "template", "edit", component.tag],
      run: () => deps.open(component.file),
    });
  }
  const componentFiles = new Set(deps.components().map((component) => component.file));
  for (const path of deps.files()) {
    if (pageFiles.has(path) || componentFiles.has(path)) continue;
    const slash = path.lastIndexOf("/");
    out.push({
      id: `file:${path}`,
      title: path.slice(slash + 1),
      hint: slash > 0 ? path.slice(0, slash) : undefined,
      group: "Files",
      navigation: true,
      icon: fileIcon(path),
      keywords: [path],
      run: () => deps.open(path),
    });
  }
  return out;
}

/** Source-safe native placement: inside a valid container, else after selection, else main. */
export function nativePaletteInsertPoint(source: string, path: string, selection: PaletteSelection | undefined, choice: AddChoice): { parent: number[]; index: number } | undefined {
  const markup = nativeChoiceMarkup(choice.tag);
  if (!markup) return undefined;
  const valid = (point: { parent: number[]; index: number }) => Boolean(nativeMarkupInsertEdit(source, point.parent, point.index, markup));
  if (selection?.path === path && selection.node?.length) {
    const destinations = nativeDestinations(source, path, selection.node);
    for (const placement of ["inside", "after"] as const) {
      const candidate = destinations.find((item) => item.placement === placement)?.point;
      if (candidate && valid(candidate)) return { parent: [...candidate.parent], index: candidate.index };
    }
    return undefined;
  }
  const { root } = parseMarked(source);
  const main = root.querySelector("main");
  if (!main) return undefined;
  const node: number[] = [];
  for (let element: Element | null = main; element; element = element.parentElement) node.unshift([...(element.parentNode as ParentNode).children].indexOf(element));
  const candidate = nativeDestinations(source, path, node).find((item) => item.placement === "inside")?.point;
  return candidate?.tag === "main" && valid(candidate) ? { parent: [...candidate.parent], index: candidate.index } : undefined;
}

/** Each visible command carries its exact page, selection and mount snapshot. */
export function nativePaletteCommands(deps: EditorPaletteDeps): Command[] {
  const path = deps.currentPath();
  const source = path ? deps.source(path) : undefined;
  if (!path || source === undefined || !deps.pages().some((page) => page.file === path)) return [];
  const revision = deps.revision?.();
  const selection = deps.selection();
  const identity = JSON.stringify(selection);
  return (deps.nativeElements?.() ?? []).filter((choice) => choice.kind === "native" && Boolean(nativeChoiceMarkup(choice.tag))).map((choice) => ({
    id: `native.add:${choice.tag}`, title: `Add ${choice.label}`, group: "Elements", icon: "insert",
    hint: "Native HTML", keywords: ["insert", "native", choice.tag, choice.group ?? ""],
    run: async () => {
      if (deps.currentPath() !== path || deps.source(path) !== source || deps.revision?.() !== revision || JSON.stringify(deps.selection()) !== identity || !(deps.nativeElements?.() ?? []).some((current) => current.kind === "native" && current.tag === choice.tag)) {
        announceRefusal(deps, "The page changed. Reopen the command palette and try again."); return;
      }
      const point: { path?: string; parent: number[]; index: number } | undefined = deps.nativeInsertPoint ? deps.nativeInsertPoint(source, path, selection, choice) : nativePaletteInsertPoint(source, path, selection, choice);
      const markup = nativeChoiceMarkup(choice.tag)!;
      if (!point || !nativeMarkupInsertEdit(source, point.parent, point.index, markup)) {
        announceRefusal(deps, `Select a valid HTML container to add ${choice.label}.`); return;
      }
      // Host callbacks cannot silently replace the captured source or selection.
      if (deps.currentPath() !== path || deps.source(path) !== source || deps.revision?.() !== revision || JSON.stringify(deps.selection()) !== identity) {
        announceRefusal(deps, "The page changed. Reopen the command palette and try again."); return;
      }
      if (point.path !== undefined && point.path !== path) { announceRefusal(deps, "The insertion page changed. Reopen the command palette."); return; }
      await deps.insert(point.path === path ? point as { path: string; parent: number[]; index: number } : { path, parent: [...point.parent], index: point.index }, { tag: choice.tag, label: choice.label });
    },
  }));
}

// Shortcuts that are no command of the palette, for the sheet: what lists,
// the canvas, the code editor and the edit bar answer themselves.
function listShortcuts() {
  const entries: Parameters<typeof registerShortcut>[0][] = [
    { area: "Everywhere", label: "Close a menu, popover or dialog", keys: [["Escape"]] },
    { area: "Canvas", label: "Finish typing", keys: [["Enter"]], note: "In a text element" },
    { area: "Canvas", label: "Cancel typing", keys: [["Escape"]], note: "Puts the text back" },
    { area: "Canvas", label: "Bold", keys: [["Mod", "B"]], note: "Selected text, or the whole element" },
    { area: "Canvas", label: "Italic", keys: [["Mod", "I"]] },
    { area: "Canvas", label: "Link the selected text", keys: [["Mod", "K"]], note: "With text selected; otherwise ⌘K opens the palette" },
    { area: "Canvas", label: "Move the selected section", keys: [["Alt", "ArrowUp"], ["Alt", "ArrowDown"]], note: "Also on the edit bar and in the page structure" },
    { area: "Canvas", label: "Duplicate the selected section", keys: [["Mod", "D"]], note: "When not typing" },
    { area: "Canvas", label: "Remove the selected section", keys: [["Delete"], ["Backspace"]], note: "When not typing" },
    { area: "Canvas", label: "Select parent", keys: [["Shift", "Enter"]], note: "When not typing" },
    { area: "Canvas", label: "Follow a link to its page", keys: [["Mod", "Click"]] },
    { area: "Edit bar", label: "Move between controls", keys: [["ArrowLeft"], ["ArrowRight"]] },
    { area: "Edit bar", label: "Move the section from its name", keys: [["ArrowUp"], ["ArrowDown"]] },
    { area: "Edit bar", label: "Cancel a section drag", keys: [["Escape"]] },
    { area: "Edit bar", label: "Send to the agent", keys: [["Enter"]], note: "Shift+Enter starts a new line" },
    { area: "Page structure", label: "Move between rows", keys: [["ArrowUp"], ["ArrowDown"], ["Home"], ["End"]] },
    { area: "Page structure", label: "Open or close a row", keys: [["ArrowRight"], ["ArrowLeft"]] },
    { area: "Page structure", label: "Move a section", keys: [["Alt", "ArrowUp"], ["Alt", "ArrowDown"]] },
    { area: "Pages and files", label: "Open", keys: [["Enter"], ["Space"]] },
    { area: "Pages and files", label: "Rename", keys: [["F2"]] },
    { area: "Pages and files", label: "Delete", keys: [["Delete"]], note: "Files also with ⌘⌫ on a Mac" },
    { area: "Pages and files", label: "Row actions menu", keys: [["Shift", "F10"], ["Menu"]] },
    { area: "Pages and files", label: "Pages or Files tab", keys: [["ArrowLeft"], ["ArrowRight"]] },
    { area: "Code", label: "Code editor commands", keys: [["F1"]], note: "Monaco's own palette, while typing in code" },
    { area: "Code", label: "Find", keys: [["Mod", "F"]] },
    { area: "Panels", label: "Resize the sidebar or code", keys: [["ArrowLeft"], ["ArrowRight"], ["ArrowUp"], ["ArrowDown"]], note: "On a resize handle; Shift for bigger steps" },
    { area: "Panels", label: "Hide or show the sidebar or code", keys: [["Enter"], ["Space"]], note: "On its resize handle" },
  ];
  return entries.map(registerShortcut);
}

/**
 * Mounts the palette and the shortcuts sheet in `host`, registers the
 * editor's commands, and listens for the keys. Returns a function that
 * undoes all of it.
 */
export function mountEditorPalette(host: HTMLElement, deps: EditorPaletteDeps) {
  const mac = isMac();
  let sheet: ShortcutSheet | undefined;
  let palette: CommandPalette | undefined;
  let disposed = false;
  let loading: Promise<void> | undefined;
  type PendingOpening = { root: HTMLDialogElement; input: HTMLInputElement; scope: "all" | "go"; opener: Element | null; runWhenReady?: boolean };
  let pending: PendingOpening | undefined;
  const cancelPending = () => {
    const opening = pending;
    if (!opening) return;
    pending = undefined;
    opening.root.close();
    opening.root.remove();
    if (!otherModalOpen() && opening.opener instanceof HTMLElement && opening.opener.isConnected)
      opening.opener.focus({ preventScroll: true });
  };
  const showShortcuts = () => void loadPanels().then(() => {
    if (disposed || otherModalOpen()) return;
    cancelPending();
    palette?.close();
    sheet?.open();
  });
  const loadPanels = () => loading ??= Promise.all([
    import("../components/command-palette"), import("../components/shortcut-sheet"),
  ]).then(([{ createCommandPalette }, { createShortcutSheet }]) => {
    if (disposed) return;
    palette = createCommandPalette({
      commands: availableCommands,
      fromQuery: (text) => {
        // Ask agent with what was typed, about the selected element.
        const model = deps.editBar();
        const prompt = model?.controls.find((control): control is Extract<EditBarControl, { kind: "prompt" }> => control.kind === "prompt");
        if (!model || !prompt || text.length < 3) return [];
        const revision = deps.revision?.();
        const selection = deps.selection();
        const source = selection && deps.source(selection.path);
        const identity = JSON.stringify(selection);
        return [{
          id: "agent.ask-typed",
          title: `Ask agent: “${text}”`,
          hint: deps.editBar()?.kind,
          group: "Agent",
          icon: "sparkle",
          run: guardCommand(async () => {
            const problem = await prompt.onSend(text);
            if (problem) deps.onError(new Error(problem));
          }, () => modelOriginCurrent(deps, model) && deps.revision?.() === revision && deps.editBar() === model && JSON.stringify(deps.selection()) === identity && (!selection || (deps.currentPath() === selection.path && deps.source(selection.path) === source)),
          () => announceRefusal(deps, "The selection changed. Reopen the command palette and try again.")),
        }];
      },
      showShortcuts,
      onError: deps.onError,
    });
    sheet = createShortcutSheet(shortcutSheet);
    host.append(palette.root, sheet.root);

  }).catch((error) => { loading = undefined; cancelPending(); void handleChunkLoadFailure(error); deps.onError(error); });
  const openPalette = (scope: "all" | "go", toggle = false) => {
    if (disposed || otherModalOpen()) return;
    // The site's pages are searched once they are all read.
    const ready = deps.ready?.();
    if (palette && !ready) {
      if (toggle) palette.toggle(scope); else palette.open(scope);
      return;
    }
    if (palette?.root.open) {
      if (toggle) palette.toggle(scope); else palette.open(scope);
      return;
    }
    if (pending) {
      if (toggle && pending.scope === scope) { cancelPending(); return; }
      if (pending.scope !== scope) pending.runWhenReady = false;
      pending.scope = scope;
      pending.input.placeholder = scope === "go" ? "Go to a page, file or component…" : "Search pages, files, components and actions…";
      pending.input.focus();
      return;
    }
    // Capture typing immediately, before the optional panel chunks arrive.
    const root = document.createElement("dialog");
    root.setAttribute("aria-label", "Command palette");
    root.style.cssText = "position:fixed;inset:12vh 0 auto;width:min(640px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border:1px solid var(--line);border-radius:var(--radius-dialog);background:var(--surface);color:var(--text)";
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", "Search commands");
    input.setAttribute("aria-expanded", "false");
    input.placeholder = scope === "go" ? "Go to a page, file or component…" : "Search pages, files, components and actions…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.cssText = "box-sizing:border-box;width:100%;padding:8px;background:var(--surface);color:var(--text);border:1px solid var(--line);font:inherit";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "Loading commands…";
    root.append(input, status);
    const opening: PendingOpening = { root, input, scope, opener: document.activeElement };
    pending = opening;
    root.addEventListener("cancel", (event) => { event.preventDefault(); cancelPending(); });
    input.addEventListener("input", () => { opening.runWhenReady = false; });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        opening.runWhenReady = true;
      }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelPending(); }
    });
    root.addEventListener("pointerdown", (event) => { if (event.target === root) cancelPending(); });
    sheet?.close();
    host.append(root);
    root.showModal();
    input.focus();
    void Promise.all([loadPanels(), ready?.catch(() => undefined)]).then(() => {
      if (pending !== opening) return;
      const query = input.value;
      // The caret and selection made while loading carry over with the text.
      const { selectionStart, selectionEnd, selectionDirection } = input;
      const blocked = disposed || otherModalOpen();
      cancelPending();
      if (!blocked) {
        palette?.open(opening.scope, query);
        const real = document.activeElement;
        if (real instanceof HTMLInputElement && real.value === query && selectionStart !== null && selectionEnd !== null)
          real.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
        if (opening.runWhenReady) void palette?.runActive();
      }
    });
  };

  const removers = [
    ...actionCommands(deps).map(registerCommand),
    registerCommand({
      id: "editor.palette", title: "Command palette", group: "Actions", icon: "search", area: "Everywhere",
      shortcut: [MOD_K], when: () => false, run: () => openPalette("all"),
    }),
    registerCommand({
      id: "editor.go-to", title: "Go to page or file", group: "Actions", icon: "pages", area: "Everywhere",
      shortcut: [MOD_P], keywords: ["open", "find", "quick open"], run: () => openPalette("go"),
    }),
    registerCommand({
      id: "editor.shortcuts", title: "Keyboard shortcuts", group: "Actions", icon: "keyboard", area: "Everywhere",
      shortcut: [["?"]], keywords: ["help", "keys", "hotkeys", "cheat sheet"], run: () => sheet?.open(),
    }),
    registerCommandSource(() => selectionCommands(deps)),
    registerCommandSource(() => siteCommands(deps)),
    registerCommandSource(() => nativePaletteCommands(deps)),
    ...listShortcuts(),
  ];

  const otherModalOpen = () => [...document.querySelectorAll("dialog[open]")].some((dialog) => dialog !== palette?.root && dialog !== sheet?.root && dialog !== pending?.root && dialog.matches(":modal"));
  // A selection key (⌘D, Delete, Shift+Enter) runs its edit bar control.
  const runBar = (label: string) => {
    const command = selectionCommands(deps).find((item) => item.title === label);
    if (command) void command.run();
    return Boolean(command);
  };
  const shortcut = (name: string) => {
    if (name === "palette") openPalette("all", true);
    else if (name === "go") openPalette("go", true);
    else if (name === "shortcuts") { if (!otherModalOpen()) showShortcuts(); }
    else if (name === "undo" || name === "redo") { if (deps.editing()) deps.history(name); }
    else if (name === "duplicate") runBar("Duplicate");
    else if (name === "remove") runBar("Remove");
    else if (name === "parent") runBar("Select parent");
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    const target = event.target;
    const element = target instanceof Element ? target : undefined;
    const inCode = Boolean(element?.closest(".monaco-editor"));
    if (matchesKeys(event, MOD_K, mac)) {
      // Monaco's own ⌘K chords (⌘K ⌘C comments a line…) stay in the code; ⌘P works there.
      if (inCode) return;
      // In the edit bar with text selected, ⌘K links it (the bar's own shortcut).
      if (element?.closest(".edit-bar, .edit-bar__popover, .edit-bar__note") && deps.textSelected()) return;
      if (otherModalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      openPalette("all", true);
      return;
    }
    if (matchesKeys(event, MOD_P, mac)) {
      if (otherModalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      openPalette("go", true);
      return;
    }
    if (pending || palette?.isOpen() || sheet?.isOpen()) return;
    if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(target) && !otherModalOpen()) {
      event.preventDefault();
      showShortcuts();
      return;
    }
    // Selection keys from the page itself (nothing focused): as on the canvas.
    const onPage = !element || element === document.body;
    if (!onPage || otherModalOpen()) return;
    const name = matchesKeys(event, ["Mod", "D"], mac) ? "duplicate"
      : (event.key === "Delete" || event.key === "Backspace") && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey ? "remove"
        : matchesKeys(event, ["Shift", "Enter"], mac) ? "parent" : undefined;
    const label = name === "duplicate" ? "Duplicate" : name === "remove" ? "Remove" : name === "parent" ? "Select parent" : undefined;
    // Only when the selection has that control: the key otherwise keeps its own meaning.
    if (label && runBar(label)) event.preventDefault();
  };
  window.addEventListener("keydown", onKey, true);

  // Keys forwarded from the preview frame.
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { source?: unknown; type?: unknown; name?: unknown } | undefined;
    if (data?.source !== "astro-native-preview" || data.type !== "shortcut" || typeof data.name !== "string") return;
    const frames = [...document.querySelectorAll<HTMLIFrameElement>(".native-preview-frame")];
    if (!frames.some((frame) => frame.contentWindow === event.source)) return;
    if (otherModalOpen() && data.name !== "palette") return;
    shortcut(data.name);
  };
  window.addEventListener("message", onMessage);

  return {
    palette,
    sheet,
    dispose() {
      for (const remove of removers) remove();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("message", onMessage);
      disposed = true;
      cancelPending();
      palette?.root.remove();
      sheet?.root.remove();
    },
  };
}
