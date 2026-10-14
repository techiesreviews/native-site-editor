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
import type { Stamp } from "../guarded-edit";
import type { AddChoice } from "./add-catalog";
import type { EditBarControl, EditBarModel } from "../components/edit-bar";
import type { CommandPalette } from "../components/command-palette";
import type { ShortcutSheet } from "../components/shortcut-sheet";
import { availableCommands, guardCommand, matchesKeys, registerCommand, registerCommandSource, shortcutSheet, type Command, type Keys } from "./commands";

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
  /** The workspace held when a command is listed. */
  stamp?: () => Stamp;
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
// The edit bar's button for a control, to open its field or note.
function barButton(label: string): HTMLButtonElement | undefined {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".edit-bar button")];
  return buttons.find((item) => item.getAttribute("aria-label") === label) ??
    buttons.find((item) => item.title === label || item.title.startsWith(`${label}:`) || item.textContent === label);
}

/** Controls retain the source proof from their construction, even after a new search. */
function modelOriginCurrent(deps: EditorPaletteDeps, model: EditBarModel): boolean {
  const origin = model.origin;
  const selection = deps.selection();
  return Boolean(origin && selection && deps.currentPath() === origin.path && selection.path === origin.path &&
    origin.stamp.holds() && deps.source(origin.path) === origin.source &&
    JSON.stringify(selection.node) === JSON.stringify(origin.node));
}

export function announceRefusal(deps: EditorPaletteDeps, reason: string) {
  deps.announce(reason);
  refuse(reason);
}

/** What a listed command must still find selected: the selection without its on-screen rect, which scrolling updates. */
export function selectionIdentity(selection: object | undefined): string {
  if (!selection) return "";
  const { rect: _rect, ...rest } = selection as { rect?: unknown };
  return JSON.stringify(rest);
}

function selectionCommands(deps: EditorPaletteDeps): Command[] {
  const model = deps.editBar();
  const selection = deps.selection();
  if (!model || !selection) return [];
  const held = deps.stamp?.();
  const source = deps.source(selection.path);
  const identity = selectionIdentity(selection);
  const guard = (run: () => void | Promise<void>) => guardCommand(run,
    () => modelOriginCurrent(deps, model) && (held?.holds() ?? true) && deps.currentPath() === selection.path && deps.editBar() === model && deps.source(selection.path) === source && selectionIdentity(deps.selection()) === identity,
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
      add(control, control.ariaLabel ?? control.label, control.onPress, control.label === "Remove" ? { keywords: ["delete", "backspace", "remove the selected element", "when not typing", "selection", kind.toLowerCase()] } : {});
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

/** Every listed action holds the workspace it was offered in: after a repository or branch switch it is refused. */
export function editorPaletteCommands(deps: EditorPaletteDeps): Command[] {
  const held = deps.stamp?.();
  return availableCommands().map(command => ({ ...command,
    run: guardCommand(command.run, () => held?.holds() ?? true,
      () => announceRefusal(deps, "The repository changed. Reopen the command palette and try again.")),
  }));
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
    import("../components/command-palette"), import("../components/shortcut-sheet"), import("./palette-catalog"),
  ]).then(([{ createCommandPalette }, { createShortcutSheet }, catalog]) => {
    if (disposed) return;
    removers.push(
      ...catalog.actionCommands(deps).map(registerCommand),
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

      registerCommandSource(() => catalog.siteCommands(deps)),
      registerCommandSource(() => catalog.nativePaletteCommands(deps)),
      ...catalog.listShortcuts(),
    );
    palette = createCommandPalette({
      commands: () => editorPaletteCommands(deps),
      fromQuery: (text) => {
        // Ask agent with what was typed, about the selected element.
        const model = deps.editBar();
        const prompt = model?.controls.find((control): control is Extract<EditBarControl, { kind: "prompt" }> => control.kind === "prompt");
        if (!model || !prompt || text.length < 3) return [];
        const held = deps.stamp?.();
        const selection = deps.selection();
        const source = selection && deps.source(selection.path);
        const identity = selectionIdentity(selection);
        return [{
          id: "agent.ask-typed",
          title: `Ask agent: “${text}”`,
          hint: deps.editBar()?.kind,
          group: "Agent",
          icon: "sparkle",
          run: guardCommand(async () => {
            const problem = await prompt.onSend(text);
            if (problem) deps.onError(new Error(problem));
          }, () => modelOriginCurrent(deps, model) && (held?.holds() ?? true) && deps.editBar() === model && selectionIdentity(deps.selection()) === identity && (!selection || (deps.currentPath() === selection.path && deps.source(selection.path) === source)),
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

  const removers = [registerCommandSource(() => selectionCommands(deps))];

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

  // Keys forwarded through this preview's link, while the palette is mounted.
  const frameShortcut = (name: string) => {
    if (disposed || (otherModalOpen() && name !== "palette")) return;
    shortcut(name);
  };

  return {
    palette,
    sheet,
    frameShortcut,
    dispose() {
      for (const remove of removers) remove();
      window.removeEventListener("keydown", onKey, true);
      disposed = true;
      cancelPending();
      palette?.root.remove();
      sheet?.root.remove();
    },
  };
}
