import "./command-palette.css";
import { node } from "../ui/dom";
import { keyCaps, type Command, type Keys } from "../page-builder/commands";
import { groupRanked, markRuns, parseQuery, pushRecent, rankItems, type PaletteScope, type Ranked } from "../page-builder/palette-search";
import arrowDown from "@phosphor-icons/core/regular/arrow-down.svg?raw";
import arrowElbowLeftUp from "@phosphor-icons/core/regular/arrow-elbow-left-up.svg?raw";
import arrowUp from "@phosphor-icons/core/regular/arrow-up.svg?raw";
import clockCounterClockwise from "@phosphor-icons/core/regular/clock-counter-clockwise.svg?raw";
import cloudArrowUp from "@phosphor-icons/core/regular/cloud-arrow-up.svg?raw";
import code from "@phosphor-icons/core/regular/code.svg?raw";
import copy from "@phosphor-icons/core/regular/copy.svg?raw";
import file from "@phosphor-icons/core/regular/file.svg?raw";
import fileCode from "@phosphor-icons/core/regular/file-code.svg?raw";
import fileCss from "@phosphor-icons/core/regular/file-css.svg?raw";
import fileHtml from "@phosphor-icons/core/regular/file-html.svg?raw";
import filePlus from "@phosphor-icons/core/regular/file-plus.svg?raw";
import folderOpen from "@phosphor-icons/core/regular/folder-open.svg?raw";
import house from "@phosphor-icons/core/regular/house.svg?raw";
import image from "@phosphor-icons/core/regular/image.svg?raw";
import keyboard from "@phosphor-icons/core/regular/keyboard.svg?raw";
import link from "@phosphor-icons/core/regular/link.svg?raw";
import listMagnifyingGlass from "@phosphor-icons/core/regular/list-magnifying-glass.svg?raw";
import magnifyingGlass from "@phosphor-icons/core/regular/magnifying-glass.svg?raw";
import plusSquare from "@phosphor-icons/core/regular/plus-square.svg?raw";
import puzzlePiece from "@phosphor-icons/core/regular/puzzle-piece.svg?raw";
import redo from "@phosphor-icons/core/regular/arrow-u-up-right.svg?raw";
import sidebarSimple from "@phosphor-icons/core/regular/sidebar-simple.svg?raw";
import sparkle from "@phosphor-icons/core/regular/sparkle.svg?raw";
import squareHalfBottom from "@phosphor-icons/core/regular/square-half-bottom.svg?raw";
import textB from "@phosphor-icons/core/regular/text-b.svg?raw";
import textItalic from "@phosphor-icons/core/regular/text-italic.svg?raw";
import textT from "@phosphor-icons/core/regular/text-t.svg?raw";
import trash from "@phosphor-icons/core/regular/trash.svg?raw";
import treeStructure from "@phosphor-icons/core/regular/tree-structure.svg?raw";
import undo from "@phosphor-icons/core/regular/arrow-u-up-left.svg?raw";
import x from "@phosphor-icons/core/regular/x.svg?raw";

// The command palette (⌘K): one field that finds pages to open, files to
// open in the code pane, components to add or open, and what can be done
// now, with each action's shortcut. Keyboard first (the field keeps focus;
// Up/Down move, Enter runs, Tab jumps to the next group, Escape closes) and
// mouse friendly (pointing moves the highlight, a click runs). Results come
// in groups, the matched characters marked. Before typing: recent items,
// then suggestions. A leading `>` narrows to actions, `/` to pages.

const ICONS: Record<string, string> = {
  "arrow-down": arrowDown,
  "arrow-up": arrowUp,
  "clock": clockCounterClockwise,
  "code": code,
  "component": puzzlePiece,
  "copy": copy,
  "file": file,
  "file-code": fileCode,
  "file-css": fileCss,
  "file-html": fileHtml,
  "file-plus": filePlus,
  "folder": folderOpen,
  "home": house,
  "image": image,
  "insert": plusSquare,
  "italic": textItalic,
  "bold": textB,
  "keyboard": keyboard,
  "link": link,
  "parent": arrowElbowLeftUp,
  "pages": listMagnifyingGlass,
  "publish": cloudArrowUp,
  "redo": redo,
  "search": magnifyingGlass,
  "sidebar": sidebarSimple,
  "split": squareHalfBottom,
  "sparkle": sparkle,
  "structure": treeStructure,
  "text": textT,
  "trash": trash,
  "undo": undo,
  "x": x,
};

/** An icon of the palette's set as an element (hidden from assistive technology). */
export function paletteIcon(name: string | undefined, size = 16) {
  const markup = (name && ICONS[name]) || ICONS.file;
  const template = document.createElement("template");
  template.innerHTML = markup.replace("<svg ", `<svg class="icon" width="${size}" height="${size}" aria-hidden="true" focusable="false" `);
  return template.content.firstElementChild as SVGSVGElement;
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Key caps for a combination: <kbd> elements, read out as words. */
export function keyCapsElement(keys: Keys, className = "palette-keys") {
  const wrap = node("span", className);
  const mac = isMac();
  const caps = keyCaps(keys, mac);
  // Arrows and other symbols read larger than letters at the same size.
  for (const cap of caps) wrap.append(node("kbd", /^[↑↓←→↵⌫]$/.test(cap) ? "palette-key palette-key--symbol" : "palette-key", cap));
  wrap.setAttribute("aria-label", caps.map((cap) => SPOKEN[cap] ?? cap).join(" "));
  return wrap;
}
const SPOKEN: Record<string, string> = { "⌘": "Command", "⇧": "Shift", "⌥": "Option", "⌃": "Control", "↑": "Up", "↓": "Down", "←": "Left", "→": "Right", "↵": "Enter", "⌫": "Backspace" };

export interface CommandPaletteOptions {
  /** Everything available now. */
  commands: () => Command[];
  /** Commands made from what is typed (Ask agent: “…”), listed after the matches. */
  fromQuery?: (text: string) => Command[];
  /** Opens the keyboard shortcuts sheet. */
  showShortcuts: () => void;
  /** A command failed. */
  onError: (error: unknown) => void;
  /** Where recent items are remembered. */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

const RECENT_KEY = "native-site-editor:palette-recent";
const RECENT_SHOWN = 5;

// How many of each group show: before typing, and for a query.
const EMPTY_LIMITS: Record<string, number> = { Selection: 12, Actions: 24, Pages: 6, Components: 6, Files: 0, Agent: 1 };
const QUERY_LIMITS: Record<string, number> = { Selection: 8, Actions: 8, Pages: 8, Components: 6, Files: 8, Agent: 3 };
const GO_LIMITS: Record<string, number> = { Pages: 12, Components: 8, Files: 30 };
const SCOPE_GROUPS: Record<PaletteScope, string[] | undefined> = {
  all: undefined,
  actions: ["Selection", "Actions", "Agent"],
  pages: ["Pages"],
  go: ["Pages", "Files", "Components"],
};
const PLACEHOLDERS: Record<PaletteScope, string> = {
  all: "Search pages, files, components and actions…",
  actions: "Search actions…",
  pages: "Search pages…",
  go: "Go to a page, file or component…",
};
// Before typing, groups come in this order.
const EMPTY_ORDER = ["Selection", "Agent", "Recent", "Actions", "Pages", "Components", "Files"];

export function createCommandPalette(options: CommandPaletteOptions) {
  const storage = options.storage ?? localStorage;
  const dialog = node("dialog", "command-palette");
  dialog.setAttribute("aria-label", "Command palette");
  const search = node("div", "command-palette__search");
  const input = node("input", "command-palette__input");
  input.type = "text";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", "Search commands");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", "command-palette-list");
  input.autocomplete = "off";
  input.spellcheck = false;
  const scopeChip = node("span", "command-palette__scope");
  scopeChip.hidden = true;
  const escape = node("kbd", "palette-key command-palette__esc", "Esc");
  escape.setAttribute("aria-hidden", "true");
  search.append(paletteIcon("search", 18), scopeChip, input, escape);
  const list = node("div", "command-palette__list");
  list.id = "command-palette-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Results");
  const empty = node("p", "command-palette__empty");
  empty.setAttribute("role", "status");
  const footer = node("div", "command-palette__footer");
  const hint = (keys: string[], words: string) => {
    const span = node("span", "command-palette__hint");
    for (const key of keys) span.append(node("kbd", /^[↑↓↵]$/.test(key) ? "palette-key palette-key--symbol" : "palette-key", key));
    span.append(document.createTextNode(` ${words}`));
    return span;
  };
  const shortcutsButton = node("button", "command-palette__shortcuts");
  shortcutsButton.type = "button";
  shortcutsButton.append(paletteIcon("keyboard", 14), document.createTextNode("Shortcuts"), node("kbd", "palette-key", "?"));
  shortcutsButton.addEventListener("click", () => { close(); options.showShortcuts(); });
  footer.append(hint(["↑", "↓"], "move"), hint(["↵"], "run"), hint([">"], "actions"), hint(["/"], "pages"), shortcutsButton);
  dialog.append(search, list, empty, footer);

  let scope: PaletteScope = "all";
  let shown: Ranked<Command>[] = [];
  let active = 0;
  let opener: Element | null = null;
  let recent: string[] = readRecent();

  function readRecent(): string[] {
    try {
      const value = JSON.parse(storage.getItem(RECENT_KEY) ?? "[]");
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  }
  function remember(id: string) {
    recent = pushRecent(recent, id);
    try { storage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private mode: not remembered */ }
  }

  function results(raw: string): { group: string; items: Ranked<Command>[] }[] {
    const parsed = parseQuery(raw, scope);
    const allowed = SCOPE_GROUPS[parsed.scope];
    const pool = options.commands().filter((command) => (!allowed || allowed.includes(command.group)) && (parsed.scope !== "go" || command.navigation === true));
    if (!parsed.text) {
      // What the selection can do, then recent items, then each group in its usual order.
      const byId = new Map(pool.filter((command) => command.group !== "Selection" && command.group !== "Agent").map((command) => [command.id, command]));
      const recentItems = recent.map((id) => byId.get(id)).filter((command): command is Command => Boolean(command)).slice(0, RECENT_SHOWN);
      const recentIds = new Set(recentItems.map((command) => command.id));
      const groups: { group: string; items: Ranked<Command>[] }[] = [];
      if (recentItems.length) groups.push({ group: "Recent", items: recentItems.map((item) => ({ item, score: 0, title: [], hint: [] })) });
      const limits = parsed.scope === "go" ? GO_LIMITS : parsed.scope === "all" ? EMPTY_LIMITS : {};
      const rest = groupRanked(rankItems(pool.filter((command) => !recentIds.has(command.id) && (parsed.scope !== "all" || command.group !== "Components" || command.suggested)), ""), limits, 12);
      return [...groups, ...rest].filter((group) => group.items.length).sort((a, b) => order(a.group) - order(b.group));
    }
    const ranked = rankItems(pool, parsed.text, recent);
    const groups = groupRanked(ranked, parsed.scope === "go" ? GO_LIMITS : QUERY_LIMITS, 8).filter((group) => group.items.length);
    const extra = parsed.scope === "all" || parsed.scope === "actions" ? options.fromQuery?.(parsed.text) ?? [] : [];
    if (extra.length) {
      const into = groups.find((group) => group.group === extra[0].group);
      const items = extra.map((item) => ({ item, score: 0, title: [], hint: [] }));
      if (into) into.items.push(...items);
      else groups.push({ group: extra[0].group, items });
    }
    return groups;
  }
  const order = (group: string) => {
    const index = EMPTY_ORDER.indexOf(group);
    return index < 0 ? EMPTY_ORDER.length : index;
  };

  function itemElement(entry: Ranked<Command>, index: number) {
    const { item } = entry;
    const row = node("div", `command-palette__item${item.accent === "component" ? " is-component" : ""}`);
    row.id = `command-palette-item-${index}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.dataset.index = String(index);
    row.dataset.command = item.id;
    const iconBox = node("span", "command-palette__icon");
    iconBox.append(paletteIcon(item.icon));
    const text = node("span", "command-palette__text");
    const title = node("span", "command-palette__title");
    for (const run of markRuns(item.title, entry.title)) title.append(run.marked ? node("mark", "", run.text) : document.createTextNode(run.text));
    text.append(title);
    if (item.hint) {
      const hintText = node("span", "command-palette__item-hint");
      for (const run of markRuns(item.hint, entry.hint)) hintText.append(run.marked ? node("mark", "", run.text) : document.createTextNode(run.text));
      text.append(hintText);
    }
    row.append(iconBox, text);
    if (item.shortcut?.[0]) row.append(keyCapsElement(item.shortcut[0]));
    // The accessible name: the title, its hint and its shortcut.
    const shortcut = item.shortcut?.[0] ? row.querySelector(".palette-keys")?.getAttribute("aria-label") : undefined;
    row.setAttribute("aria-label", [item.title, item.hint, shortcut].filter(Boolean).join(", "));
    row.addEventListener("pointermove", () => { if (active !== index) setActive(index, false); });
    row.addEventListener("click", () => void run(index));
    return row;
  }

  function render() {
    const groups = results(input.value);
    shown = groups.flatMap((group) => group.items);
    list.replaceChildren();
    let index = 0;
    groups.forEach((group, number) => {
      const section = node("div", "command-palette__group");
      section.setAttribute("role", "group");
      const heading = node("div", "command-palette__heading", group.group);
      heading.id = `command-palette-group-${number}`;
      heading.setAttribute("aria-hidden", "true");
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading);
      for (const entry of group.items) section.append(itemElement(entry, index++));
      list.append(section);
    });
    const text = input.value.trim();
    empty.textContent = shown.length ? "" : text ? `Nothing matches “${text}”.` : "Nothing to show yet.";
    empty.hidden = Boolean(shown.length);
    list.hidden = !shown.length;
    setActive(0, true);
  }

  function setActive(index: number, scroll: boolean) {
    if (!shown.length) { input.removeAttribute("aria-activedescendant"); return; }
    active = (index + shown.length) % shown.length;
    for (const row of list.querySelectorAll<HTMLElement>("[role='option']")) {
      const on = row.dataset.index === String(active);
      row.setAttribute("aria-selected", String(on));
      row.classList.toggle("is-active", on);
      if (on) {
        input.setAttribute("aria-activedescendant", row.id);
        if (scroll) row.scrollIntoView({ block: "nearest" });
      }
    }
  }

  // The first item of the next (or previous) group.
  function jumpGroup(step: 1 | -1) {
    const rows = [...list.querySelectorAll<HTMLElement>(".command-palette__group")];
    const current = rows.findIndex((group) => group.querySelector(`[data-index="${active}"]`));
    const next = rows[(current + step + rows.length) % rows.length];
    const first = next?.querySelector<HTMLElement>("[role='option']");
    if (first) setActive(Number(first.dataset.index), true);
  }

  async function run(index: number) {
    const entry = shown[index];
    if (!entry) return;
    remember(entry.item.id);
    close();
    try {
      // Let the originating click finish before a command opens another popover.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await entry.item.run();
    } catch (error) {
      options.onError(error);
    }
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    // Ctrl+N and Ctrl+P too on a Mac, as in its text fields (elsewhere they are the browser's).
    const emacs = isMac() && event.ctrlKey && !event.metaKey;
    const down = event.key === "ArrowDown" || (emacs && event.key === "n");
    const up = event.key === "ArrowUp" || (emacs && event.key === "p");
    if (down || up) {
      event.preventDefault();
      event.stopPropagation();
      setActive(active + (down ? 1 : -1), true);
    } else if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      setActive(Math.max(0, Math.min(shown.length - 1, active + (event.key === "PageDown" ? 5 : -5))), true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      jumpGroup(event.shiftKey ? -1 : 1);
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      void run(active);
    } else if (event.key === "Backspace" && !input.value && scope !== "all") {
      // Backspace in an empty field widens ⌘P's search to everything.
      scope = "all";
      showScope();
      render();
    }
  });
  // Escape closes (the dialog's cancel); nothing behind it hears it.
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  // A click on the backdrop closes.
  dialog.addEventListener("pointerdown", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  function showScope() {
    scopeChip.hidden = scope === "all";
    scopeChip.textContent = scope === "go" ? "Go to" : "";
    input.placeholder = PLACEHOLDERS[scope];
  }

  function open(nextScope: PaletteScope = "all", query = "") {
    scope = nextScope;
    showScope();
    if (!dialog.open) {
      opener = document.activeElement;
      recent = readRecent();
      dialog.showModal();
    }
    input.value = query;
    render();
    input.focus();
  }

  function restoreFocus() {
    const target = opener;
    opener = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
  }

  /** Restores focus synchronously, before the next command can open a field. */
  function close() {
    if (dialog.open) { dialog.close(); restoreFocus(); }
  }

  return {
    root: dialog,
    open,
    close,
    isOpen: () => dialog.open,
    /** Toggles: opens with `scope`, or closes when open in it already. */
    toggle(nextScope: PaletteScope = "all") {
      if (dialog.open && scope === nextScope) close();
      else open(nextScope);
    },
  };
}

export type CommandPalette = ReturnType<typeof createCommandPalette>;
