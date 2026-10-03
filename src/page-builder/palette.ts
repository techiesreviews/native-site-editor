// The keyboard layer of the editor: the command palette (⌘K, and ⌘P to go
// to a page or file), the keyboard shortcuts sheet (?), and the editor's
// commands registered for both (src/page-builder/commands.ts). main.ts hands
// over what the commands call (`EditorPaletteDeps`); every command calls the
// function the editor's own button or menu calls, so a command does exactly
// what that control does, as one source edit where it edits.
//
// Keys pressed in the preview frame never reach this document: the preview
// runtime forwards the ones the editor answers as `shortcut` messages
// (public/native-preview-runtime.js, "Editor shortcuts").
import type { EditBarControl, EditBarModel } from "../components/edit-bar";
import { createCommandPalette, type CommandPalette } from "../components/command-palette";
import { createShortcutSheet, type ShortcutSheet } from "../components/shortcut-sheet";
import { parseMarked } from "../native-source-location";
import { availableCommands, matchesKeys, registerCommand, registerCommandSource, registerShortcut, shortcutSheet, type Command, type Keys } from "./commands";

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
  currentPath: () => string | undefined;
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

function selectionCommands(deps: EditorPaletteDeps): Command[] {
  const model = deps.editBar();
  const selection = deps.selection();
  if (!model || !selection) return [];
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
      run,
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
      run: () => deps.select(selection.path, node.slice(0, -1)),
    });
  }
  out.push(...later);
  return out;
}

const publishButton = () => document.querySelector<HTMLButtonElement>(".publish-menu > button");

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
      keywords: ["toggle", "code pane", "source", "show", "preview", "full"],
      when: () => !deps.codeHidden() && Boolean(document.querySelector(".code-resize")),
      run: deps.toggleCode,
    },
    {
      id: "editor.show-code", title: "Show code", group: "Actions", icon: "code",
      keywords: ["toggle", "code pane", "source", "html"],
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
      icon: page.route === "/" ? "home" : "file",
      keywords: [page.file, "page", "open"],
      suggested: page.file !== current,
      run: () => deps.open(page.file),
    });
  }
  // Components: add a section component where the selection is, or open any component's template.
  const selection = deps.selection();
  const pagePath = current && pageFiles.has(current) ? current : undefined;
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
          const source = deps.source(pagePath) ?? "";
          const point = sectionInsertPoint(source, selection?.path === pagePath ? selection : undefined, deps.isSectionTag);
          if (!point) { deps.announce(`Select a section to add ${component.label} after it.`); return; }
          await deps.insert({ path: pagePath, ...point }, { tag: component.tag, label: component.label });
        },
      });
    }
    out.push({
      id: `component.open:${component.tag}`,
      title: `Open ${component.label} component`,
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
      icon: fileIcon(path),
      keywords: [path],
      run: () => deps.open(path),
    });
  }
  return out;
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
    { area: "Edit bar", label: "Move the section from its grip", keys: [["ArrowUp"], ["ArrowDown"]] },
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
  const showShortcuts = () => {
    palette.close();
    sheet?.open();
  };
  const palette: CommandPalette = createCommandPalette({
    commands: availableCommands,
    fromQuery: (text) => {
      // Ask agent with what was typed, about the selected element.
      const prompt = deps.editBar()?.controls.find((control): control is Extract<EditBarControl, { kind: "prompt" }> => control.kind === "prompt");
      if (!prompt || text.length < 3) return [];
      return [{
        id: "agent.ask-typed",
        title: `Ask agent: “${text}”`,
        hint: deps.editBar()?.kind,
        group: "Agent",
        icon: "sparkle",
        run: async () => {
          const problem = await prompt.onSend(text);
          if (problem) deps.onError(new Error(problem));
        },
      }];
    },
    showShortcuts,
    onError: deps.onError,
  });
  sheet = createShortcutSheet(shortcutSheet);
  host.append(palette.root, sheet.root);

  const removers = [
    ...actionCommands(deps).map(registerCommand),
    registerCommand({
      id: "editor.palette", title: "Command palette", group: "Actions", icon: "search", area: "Everywhere",
      shortcut: [MOD_K], when: () => false, run: () => palette.open("all"),
    }),
    registerCommand({
      id: "editor.go-to", title: "Go to page or file", group: "Actions", icon: "pages", area: "Everywhere",
      shortcut: [MOD_P], keywords: ["open", "find", "quick open"], run: () => palette.open("go"),
    }),
    registerCommand({
      id: "editor.shortcuts", title: "Keyboard shortcuts", group: "Actions", icon: "keyboard", area: "Everywhere",
      shortcut: [["?"]], keywords: ["help", "keys", "hotkeys", "cheat sheet"], run: () => sheet?.open(),
    }),
    registerCommandSource(() => selectionCommands(deps)),
    registerCommandSource(() => siteCommands(deps)),
    ...listShortcuts(),
  ];

  const otherModalOpen = () => [...document.querySelectorAll("dialog[open]")].some((dialog) => dialog !== palette.root && dialog !== sheet?.root && dialog.matches(":modal"));
  // A selection key (⌘D, Delete, Shift+Enter) runs its edit bar control.
  const runBar = (label: string) => {
    const command = selectionCommands(deps).find((item) => item.title === label);
    if (command) void command.run();
    return Boolean(command);
  };
  const shortcut = (name: string) => {
    if (name === "palette") palette.toggle("all");
    else if (name === "go") palette.toggle("go");
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
      palette.toggle("all");
      return;
    }
    if (matchesKeys(event, MOD_P, mac)) {
      if (otherModalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      palette.toggle("go");
      return;
    }
    if (palette.isOpen() || sheet?.isOpen()) return;
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
      palette.root.remove();
      sheet?.root.remove();
    },
  };
}
