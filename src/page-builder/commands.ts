// The editor's commands: one registry the command palette (⌘K) searches and
// the keyboard shortcuts sheet (?) lists. A feature adds a command with one
// call and gets both:
//
//   registerCommand({ id: "page.duplicate", title: "Duplicate page", group: "Actions",
//     shortcut: [["Mod", "Shift", "D"]], when: () => Boolean(currentPath), run: duplicate });
//
// Commands that come and go with the site (its pages, files, components, the
// selected element's edit bar controls) are listed by a source function,
// asked each time the palette opens or its query changes
// (`registerCommandSource`). A shortcut handled elsewhere (in a list, on the
// canvas) that is no command is listed for the sheet with `registerShortcut`.
// No DOM here, so the registry is unit tested in Node.

/**
 * A key combination, as key names: "Mod" (⌘ on a Mac, Ctrl elsewhere),
 * "Ctrl", "Alt", "Shift", then the key ("K", "ArrowUp", "Enter", "?", "F2").
 */
export type Keys = string[];

export type CommandGroup = "Recent" | "Selection" | "Actions" | "Pages" | "Components" | "Files" | "Agent" | (string & {});

export interface Command {
  // Stable across opens (recent items are remembered by it).
  id: string;
  title: string;
  group: CommandGroup;
  // Shown after the title, and searched: a path, a URL, the selected kind.
  hint?: string;
  // More words that find it (synonyms); matched from their start.
  keywords?: string[];
  // Its keyboard shortcuts, the first one shown in the palette.
  shortcut?: Keys[];
  // An icon name from the palette's set (src/components/command-palette.ts).
  icon?: string;
  // Drawn in the component accent.
  accent?: "component";
  // Listed only when this is true now (an action that cannot run is left out).
  when?: () => boolean;
  // Shown before any typing, among the suggestions.
  suggested?: boolean;
  // Where the shortcut sheet lists its shortcut (default: by group).
  area?: string;
  run: () => void | Promise<void>;
}

export type CommandSource = () => Command[];

export interface ShortcutEntry {
  label: string;
  keys: Keys[];
  // The part of the editor it works in: "Everywhere", "Canvas", "Page structure"…
  area: string;
  // A short note: where focus must be, what it does not do.
  note?: string;
}

const commands = new Map<string, Command>();
const sources = new Set<CommandSource>();
const shortcuts = new Map<string, ShortcutEntry>();

/** Adds a command (replacing one with its id); the returned function removes it. */
export function registerCommand(command: Command): () => void {
  commands.set(command.id, command);
  return () => { if (commands.get(command.id) === command) commands.delete(command.id); };
}

/** Adds commands listed afresh each time the palette searches; the returned function removes them. */
export function registerCommandSource(source: CommandSource): () => void {
  sources.add(source);
  return () => { sources.delete(source); };
}

/** Lists a shortcut in the keyboard shortcuts sheet that is not a command of its own. */
export function registerShortcut(entry: ShortcutEntry): () => void {
  const key = `${entry.area}\n${entry.label}`;
  shortcuts.set(key, entry);
  return () => { if (shortcuts.get(key) === entry) shortcuts.delete(key); };
}

const available = (command: Command) => {
  try {
    return !command.when || command.when();
  } catch {
    return false;
  }
};

/** Every command available now: registered ones first, then those of the sources, without duplicate ids. */
export function availableCommands(): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  const add = (command: Command) => {
    if (seen.has(command.id) || !available(command)) return;
    seen.add(command.id);
    out.push(command);
  };
  for (const command of commands.values()) add(command);
  for (const source of sources) {
    let listed: Command[] = [];
    try { listed = source(); } catch { listed = []; }
    for (const command of listed) add(command);
  }
  return out;
}

/** Runs the command `id` if it is available now; whether it ran. */
export async function runCommand(id: string): Promise<boolean> {
  const command = availableCommands().find((item) => item.id === id);
  if (!command) return false;
  await command.run();
  return true;
}

/**
 * Every shortcut for the sheet, by area ("Everywhere" first): registered
 * commands' (whether or not available now) and the listed ones, in
 * registration order.
 */
export function shortcutSheet(): { area: string; entries: ShortcutEntry[] }[] {
  const areas = new Map<string, ShortcutEntry[]>();
  const add = (entry: ShortcutEntry) => {
    let list = areas.get(entry.area);
    if (!list) areas.set(entry.area, (list = []));
    if (!list.some((other) => other.label === entry.label)) list.push(entry);
  };
  for (const command of commands.values())
    if (command.shortcut?.length) add({ label: command.title, keys: command.shortcut, area: command.area ?? command.group });
  for (const entry of shortcuts.values()) add(entry);
  // What works everywhere comes first.
  return [...areas].map(([area, entries]) => ({ area, entries })).sort((a, b) => Number(b.area === "Everywhere") - Number(a.area === "Everywhere"));
}

/** Clears the registry (tests). */
export function resetCommands() {
  commands.clear();
  sources.clear();
  shortcuts.clear();
}

const MAC_SYMBOLS: Record<string, string> = {
  Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧",
};
const NAMES: Record<string, string> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Enter: "↵", Escape: "Esc", Backspace: "⌫", Delete: "Del", " ": "Space", Space: "Space",
};

/** The keys of a combination as shown on key caps: ⌘ ⇧ Z on a Mac, Ctrl Shift Z elsewhere. */
export function keyCaps(keys: Keys, mac: boolean): string[] {
  return keys.map((key) => {
    if (mac && MAC_SYMBOLS[key]) return MAC_SYMBOLS[key];
    if (key === "Mod") return "Ctrl";
    return NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  });
}

/** A combination in words, for a label or a title: "⌘K" on a Mac, "Ctrl+K" elsewhere. */
export function keyLabel(keys: Keys, mac: boolean): string {
  const caps = keyCaps(keys, mac);
  return mac ? caps.join("") : caps.join("+");
}

/** Whether a keyboard event is the combination `keys` ("Mod" being ⌘ on a Mac, Ctrl elsewhere). */
export function matchesKeys(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, keys: Keys, mac: boolean): boolean {
  const want = new Set(keys.slice(0, -1));
  const key = keys[keys.length - 1];
  const meta = want.has("Mod") ? mac : false;
  const ctrl = (want.has("Mod") && !mac) || want.has("Ctrl");
  if (event.metaKey !== meta || event.ctrlKey !== ctrl || event.altKey !== want.has("Alt")) return false;
  // A shifted character ("?") comes with Shift held: only letters check Shift.
  if (key.length === 1 && !/[a-z]/i.test(key)) return event.key === key;
  if (event.shiftKey !== want.has("Shift")) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}
