// The one list of parts on the catalogue board (catalogue.html, the preview editor only; atomic catalogue ticket 05).
// Each entry draws the editor's real part through its own function, loaded on first use, so the board never copies
// a part. A new part is one more entry here; the board, its outline, search and approvals pick it up by themselves.
// Shared values read the tokens in src/theme.css. Mock-ups for future features live in mockups.ts.

export type AreaId = "values" | "atoms" | "molecules" | "organisms" | "mockups";
export const AREAS: readonly { id: AreaId; name: string }[] = [
  { id: "values", name: "Shared values" },
  { id: "atoms", name: "Atoms" },
  { id: "molecules", name: "Molecules" },
  { id: "organisms", name: "Organisms" },
  { id: "mockups", name: "Mock-ups" },
];

/** States a cell can show: hover, pressed and focus are forced (force-states.ts), the rest are the part's own. */
export type State = "normal" | "hover" | "pressed" | "focus" | "disabled";
export const STATE_NAMES: Record<State, string> = { normal: "Normal", hover: "Hover", pressed: "Pressed", focus: "Focus", disabled: "Disabled" };
export const FORCED: ReadonlySet<State> = new Set(["hover", "pressed", "focus"]);

export type Values = Record<string, string | boolean>;
export type Choice = readonly [value: string, label: string];
export type Control =
  | { kind: "choice"; key: string; label: string; choices: readonly Choice[] }
  | { kind: "text"; key: string; label: string }
  | { kind: "switch"; key: string; label: string };
/** A row or a column of a part's grid: a name and the options it sets over the part's defaults. */
export interface Example { label: string; values?: Values; state?: State }

interface Entry {
  id: string;
  name: string;
  /** Where it lives, for hand edits: the right panel shows these in one quiet line. */
  files: readonly string[];
  defaults: Values;
  controls: readonly Control[];
}
/** A shared value: one body, drawn once per theme (`themed`) or once on the page colour. */
export interface ValuePart extends Entry {
  area: "values";
  themed: boolean;
  render(values: Values): Promise<HTMLElement>;
}
/** A part: options in rows, states in columns, light and dark side by side, and a live cell the options drive. */
export interface Part extends Entry {
  area: "atoms" | "molecules" | "organisms";
  /** The parts it is made of (molecules and organisms): each a link on the board that flies there. */
  madeOf?: readonly string[];
  /** Home-made copies it uses instead of a part: shown as untraced beside the raw values the one-offs count lists. */
  copies?: readonly string[];
  rows: readonly Example[];
  columns: readonly Example[];
  /** Drawn in a same-origin frame of this size (menus, dialogs: anything that needs its own page). */
  frame?: { width: number; height: number };
  render(values: Values, state: State): Promise<Element>;
}
export type BoardEntry = ValuePart | Part;

const states = (...list: State[]): Example[] => list.map((state) => ({ label: STATE_NAMES[state], state }));
const text = (key: string, label: string): Control => ({ kind: "text", key, label });
const toggle = (key: string, label: string): Control => ({ kind: "switch", key, label });
const choice = (key: string, label: string, choices: readonly Choice[]): Control => ({ kind: "choice", key, label, choices });
const str = (value: string | boolean | undefined) => String(value ?? "");

async function dom() {
  return (await import("../ui/dom")).node;
}
/** The value of a token as the editor's root computes it (spacing, corners and timings are the same in both themes). */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- Shared values ----------

const COLOUR_ROLES: readonly Choice[] = [
  ["--background", "Background"], ["--surface", "Surface"], ["--surface-subtle", "Subtle"], ["--panel-surface", "Panel"],
  ["--text", "Text"], ["--muted", "Muted"], ["--primary", "Action"], ["--on-primary", "On action"],
  ["--control-line", "Control line"], ["--hover", "Hover"], ["--current", "Current"], ["--focus", "Focus"],
  ["--color-success", "Success"], ["--color-warning", "Warning"], ["--danger", "Danger"], ["--link", "Link"],
];
const SPACES = ["--space-4xs", "--space-3xs", "--space-2xs", "--space-xs", "--space-s", "--space-m", "--space-l"];
const TYPES: readonly Choice[] = [
  ["--type-badge", "Badge"], ["--type-small", "Small"], ["--type-base", "Base"], ["--type-title", "Title"], ["--type-heading", "Heading"],
];
const CORNERS: readonly Choice[] = [
  ["--radius-small", "Small"], ["--radius", "Control"], ["--radius-panel", "Panel"], ["--radius-dialog", "Dialog"], ["--radius-full", "Pill"],
];
const SHADOWS: readonly Choice[] = [
  ["--shadow-small", "Small"], ["--elevation-2", "Card"], ["--shadow", "Panel"], ["--elevation-4", "Dialog"],
];
const TIMINGS: readonly Choice[] = [
  ["--dur-hover", "Hover"], ["--dur-press", "Press"], ["--dur-tooltip", "Tooltip"], ["--dur-menu", "Menu"],
  ["--dur-sheet", "Sheet"], ["--dur-fly", "Fly to a part"],
];

async function valueRows(rows: readonly Choice[], sample: (name: string) => HTMLElement, className = "") {
  const node = await dom();
  const list = node("div", `cat-values ${className}`.trim());
  for (const [name, label] of rows) {
    const row = node("div", "cat-values__row");
    const caption = node("span", "cat-values__label");
    caption.append(node("b", "", label), node("code", "cat-values__token", name));
    row.append(caption, sample(name));
    list.append(row);
  }
  return list;
}

const VALUES: ValuePart[] = [
  {
    id: "colours", area: "values", name: "Colours", themed: true, files: ["src/theme.css"], defaults: {}, controls: [],
    async render() {
      const node = await dom();
      const grid = node("div", "cat-swatches");
      for (const [name, label] of COLOUR_ROLES) {
        const swatch = node("span", "cat-swatch");
        const chip = node("span", "cat-swatch__chip");
        chip.style.background = `var(${name})`;
        swatch.append(chip, node("span", "cat-swatch__name", label), node("code", "cat-values__token", name));
        grid.append(swatch);
      }
      return grid;
    },
  },
  {
    id: "spacing", area: "values", name: "Spacing", themed: false, files: ["src/tokens/framework-editor.settings.json", "src/theme.css"], defaults: {}, controls: [],
    async render() {
      const node = await dom();
      return valueRows(SPACES.map((name) => [name, token(name) || name] as const), (name) => {
        const ruler = node("span", "cat-ruler");
        ruler.style.inlineSize = `var(${name})`;
        return ruler;
      });
    },
  },
  {
    id: "type", area: "values", name: "Type sizes", themed: true, files: ["src/theme.css"], defaults: { sample: "" }, controls: [text("sample", "Sample")],
    async render(values) {
      const node = await dom();
      return valueRows(TYPES, (name) => {
        const sample = node("span", "cat-type", str(values.sample) || `${TYPES.find(([n]) => n === name)?.[1]} text, ${token(name)}`);
        sample.style.fontSize = `var(${name})`;
        return sample;
      });
    },
  },
  {
    id: "corners", area: "values", name: "Corners", themed: false, files: ["src/theme.css"], defaults: {}, controls: [],
    async render() {
      const node = await dom();
      return valueRows(CORNERS, (name) => {
        const box = node("span", "cat-corner");
        box.style.borderRadius = `var(${name})`;
        return box;
      }, "cat-values--wide");
    },
  },
  {
    id: "shadows", area: "values", name: "Shadows", themed: true, files: ["src/theme.css"], defaults: {}, controls: [],
    async render() {
      const node = await dom();
      const list = node("div", "cat-shadows");
      for (const [name, label] of SHADOWS) {
        const card = node("span", "cat-shadow");
        card.style.boxShadow = `var(${name})`;
        card.append(node("b", "", label), node("code", "cat-values__token", name));
        list.append(card);
      }
      return list;
    },
  },
  {
    id: "motion", area: "values", name: "Motion", themed: false, files: ["src/theme.css"], defaults: {}, controls: [],
    async render() {
      const node = await dom();
      const { icon } = await import("../icons");
      const wrap = node("div", "cat-motion");
      const play = (row: HTMLElement) => {
        const ball = row.querySelector<HTMLElement>(".cat-motion__ball")!;
        const track = row.querySelector<HTMLElement>(".cat-motion__track")!;
        const far = track.clientWidth - ball.offsetWidth - 2 * ball.offsetLeft;
        const back = row.dataset.at === "end";
        row.dataset.at = back ? "start" : "end";
        const [from, to] = back ? [far, 0] : [0, far];
        const duration = parseFloat(token(row.dataset.token!)) * (token(row.dataset.token!).endsWith("ms") ? 1 : 1000);
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        ball.animate(reduced
          ? [{ opacity: 1, translate: `${from}px` }, { opacity: 0, translate: `${from}px`, offset: 0.5 }, { opacity: 0, translate: `${to}px`, offset: 0.5 }, { opacity: 1, translate: `${to}px` }]
          : [{ translate: `${from}px` }, { translate: `${to}px` }],
        { duration, easing: token("--ease-out") || "ease-out", fill: "forwards" });
      };
      const all = node("button", "button secondary cat-motion__all");
      all.type = "button";
      all.append(icon("play", 16, "icon--before"), "Play all");
      all.addEventListener("click", () => wrap.querySelectorAll<HTMLElement>(".cat-motion__row").forEach(play));
      wrap.append(all);
      for (const [name, label] of TIMINGS) {
        const row = node("div", "cat-motion__row");
        row.dataset.token = name;
        const caption = node("span", "cat-values__label");
        caption.append(node("b", "", label), node("code", "cat-values__token", `${name} · ${token(name)} · --ease-out`));
        const track = node("span", "cat-motion__track");
        track.append(node("span", "cat-motion__ball"));
        const button = node("button", "cat-icon-button");
        button.type = "button";
        button.setAttribute("aria-label", `Play ${label}`);
        button.append(icon("play", 16));
        button.addEventListener("click", () => play(row));
        row.append(caption, track, button);
        wrap.append(row);
      }
      return wrap;
    },
  },
];

// ---------- Atoms ----------

const ICON_NAMES: readonly Choice[] = [["check", "Check"], ["plus", "Plus"], ["trash", "Delete"], ["copy", "Copy"], ["gear", "Settings"], ["sparkle", "Agent"]];

const ATOMS: Part[] = [
  {
    id: "button", area: "atoms", name: "Button", files: ["src/ui/dom.ts", "src/style.css"],
    defaults: { tone: "primary", label: "Save" },
    controls: [choice("tone", "Tone", [["primary", "Primary"], ["secondary", "Secondary"]]), text("label", "Label")],
    rows: [{ label: "Primary", values: { tone: "primary" } }, { label: "Secondary", values: { tone: "secondary" } }],
    columns: states("normal", "hover", "pressed", "focus", "disabled"),
    async render(values, state) {
      const { button } = await import("../ui/dom");
      const element = button(str(values.label), () => undefined, `button ${str(values.tone)}`);
      element.disabled = state === "disabled";
      return element;
    },
  },
  {
    id: "icon", area: "atoms", name: "Icon", files: ["src/icons.ts", "src/icons.css"],
    defaults: { name: "check", size: "16" },
    controls: [choice("name", "Icon", ICON_NAMES), choice("size", "Size", [["16", "16"], ["20", "20"], ["24", "24"]])],
    rows: ICON_NAMES.slice(0, 4).map(([name, label]) => ({ label, values: { name } })),
    columns: [{ label: "16", values: { size: "16" } }, { label: "20", values: { size: "20" } }, { label: "24", values: { size: "24" } }],
    async render(values) {
      const { icon } = await import("../icons");
      return icon(str(values.name) as Parameters<typeof icon>[0], Number(values.size) || 16);
    },
  },
  {
    id: "inline-field", area: "atoms", name: "Inline field", files: ["src/ui/inline-field.css"],
    defaults: { value: "About us", placeholder: "Page title" },
    controls: [text("value", "Value"), text("placeholder", "Placeholder")],
    rows: [{ label: "Filled" }, { label: "Empty", values: { value: "" } }],
    columns: states("normal", "hover", "focus", "disabled"),
    async render(values, state) {
      const node = await dom();
      const input = node("input", "inline-field cat-field");
      input.value = str(values.value);
      input.placeholder = str(values.placeholder);
      input.setAttribute("aria-label", str(values.placeholder) || "Field");
      input.disabled = state === "disabled";
      input.tabIndex = -1;
      return input;
    },
  },
];

// ---------- Molecules ----------

const MOLECULES: Part[] = [
  {
    id: "share-row", area: "molecules", name: "Sharing row", files: ["src/components/share-row.ts", "src/components/share-row.css"],
    madeOf: ["icon"], copies: ["Row look borrowed from the project menu's actions (src/components/repository-menu.css)"],
    defaults: { label: "Preview link", dot: "idle", link: false },
    controls: [
      text("label", "Label"),
      choice("dot", "Status", [["idle", "Off"], ["busy", "Busy"], ["wait", "Waiting"], ["on", "Someone there"], ["bad", "Problem"]]),
      toggle("link", "Link on"),
    ],
    rows: [
      { label: "Off" },
      { label: "Waiting", values: { label: "Waiting for customer", dot: "wait", link: true } },
      { label: "Someone there", values: { label: "1 watching", dot: "on", link: true } },
      { label: "Problem", values: { label: "Couldn't make a link · try again", dot: "bad" } },
    ],
    columns: states("normal", "hover", "focus", "disabled"),
    async render(values, state) {
      const [{ shareRow }, { node }] = await Promise.all([import("../components/share-row"), import("../ui/dom"), import("../components/repository-menu.css")]);
      const view = () => ({
        label: str(values.label), dot: str(values.dot) as "idle", disabled: state === "disabled",
        ...(values.link ? { link: "https://preview.example/s/site" } : {}),
      });
      const rows = node("div", "link-rows cat-menu-surface");
      rows.append(shareRow(str(values.label), "text-button repository-menu__action", view, () => undefined).root);
      return rows;
    },
  },
  {
    id: "row-menu", area: "molecules", name: "Row menu", files: ["src/components/row-menu.ts", "src/components/row-menu.css"],
    madeOf: ["button", "icon"], frame: { width: 280, height: 260 },
    defaults: { sections: false, shortcut: true, disabled: false, danger: true },
    controls: [toggle("sections", "Sections"), toggle("shortcut", "Shortcut"), toggle("disabled", "Unavailable item"), toggle("danger", "Remove")],
    rows: [{ label: "Plain", values: { shortcut: false } }, { label: "Sections", values: { sections: true } }],
    columns: [{ label: "Open" }],
    async render(values) {
      const [{ createRowMenu }, { node }] = await Promise.all([import("../components/row-menu"), import("../ui/dom")]);
      const host = node("div", "cat-menu-host");
      const anchor = node("button", "button secondary", "Actions");
      anchor.type = "button";
      anchor.setAttribute("aria-haspopup", "menu");
      host.append(anchor);
      const menu = createRowMenu(host);
      const section = values.sections ? "Page" : undefined;
      const entries = [
        { label: "Rename", run: () => undefined, section, ...(values.shortcut ? { shortcut: "F2" } : {}) },
        { label: "Duplicate", run: () => undefined, section },
        { label: "Move to folder", run: () => undefined, section, ...(values.disabled ? { disabled: "No other folders" } : {}) },
        ...(values.danger ? [{ label: "Remove", run: () => undefined, danger: true, section: values.sections ? "Danger" : undefined }] : []),
      ];
      // Opens once the frame shows it: the menu measures itself against its anchor.
      requestAnimationFrame(() => menu.open(anchor, entries));
      return host;
    },
  },
  {
    id: "confirm-dialog", area: "molecules", name: "Confirm dialog", files: ["src/components/confirm-dialog.ts", "src/components/create-dialog.css"],
    madeOf: ["button"], frame: { width: 440, height: 280 },
    defaults: { title: "Delete “About us”?", action: "Delete", option: false },
    controls: [text("title", "Title"), text("action", "Action"), toggle("option", "Checkbox")],
    rows: [{ label: "Ask" }, { label: "With a checkbox", values: { option: true } }],
    columns: [{ label: "Open" }],
    async render(values) {
      const [{ createConfirmDialog }, { node }] = await Promise.all([import("../components/confirm-dialog"), import("../ui/dom")]);
      const host = node("div", "cat-dialog-host");
      const dialog = createConfirmDialog(`confirm-${Math.random().toString(36).slice(2, 8)}`);
      host.append(dialog.root);
      requestAnimationFrame(() => void dialog.choose({
        title: str(values.title), notes: ["The page and its address go. Undo brings them back."],
        actions: [{ label: str(values.action), value: "confirm" }],
        ...(values.option ? { option: { label: "Also delete its pictures", checked: false } } : {}),
      }));
      return host;
    },
  },
];

const ORGANISMS: Part[] = [];

/** Every entry on the board, areas in order (mock-ups come from mockups.ts). */
export const PARTS: readonly BoardEntry[] = [...VALUES, ...ATOMS, ...MOLECULES, ...ORGANISMS];

/** The one-offs count per stylesheet (scripts/agents/one-offs.json `files`). */
export type OneOffCounts = Record<string, Record<string, number>>;
const KIND_WORDS: Record<string, readonly [string, string]> = {
  spacing: ["hand-typed spacing", "hand-typed spacings"], radii: ["hand-typed corner", "hand-typed corners"],
  shadows: ["hand-typed shadow", "hand-typed shadows"], timings: ["hand-typed timing", "hand-typed timings"],
  localProperties: ["local value", "local values"], zIndex: ["hand-typed layer", "hand-typed layers"], fontSizes: ["hand-typed type size", "hand-typed type sizes"],
};
/** What does not trace to a shared value in an entry's stylesheets, from the one-offs count: one line per file. */
export function untracedLines(files: readonly string[], counts: OneOffCounts): string[] {
  return files.filter((file) => file.endsWith(".css") && counts[file]).map((file) => {
    const kinds = Object.entries(counts[file]).map(([kind, n]) => `${n} ${KIND_WORDS[kind]?.[n === 1 ? 0 : 1] ?? "hand-typed values"}`);
    return `${kinds.join(", ")} in ${file.split("/").pop()}`;
  });
}

export const isPart = (entry: { area: AreaId }): entry is Part => entry.area === "atoms" || entry.area === "molecules" || entry.area === "organisms";
