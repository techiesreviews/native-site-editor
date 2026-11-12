// The one list of parts on the catalogue board (catalogue.html, the preview editor only; atomic catalogue ticket 05).
// Each entry draws the editor's real part through its own function, loaded on first use, so the board never copies
// a part. A new part is one more entry here; the board, its outline, search and approvals pick it up by themselves.
// Shared values read the tokens in src/theme.css. Mock-ups for future features live in mockups.ts.

import type { IconName } from "../icons";
import { BADGE_KINDS, BADGE_TONES } from "../ui/parts/badge-options";
import { ICON_PLACES, ICON_SIZES, type IconPlace } from "../ui/parts/icon-options";
import { PROGRESS_STEPS } from "../ui/parts/progress-options";
import { SPINNER_PLACES, SPINNER_SIZES, type SpinnerPlace, type SpinnerSize } from "../ui/parts/spinner-options";
import { HEADING_LEVELS } from "../ui/parts/section-heading-options";

export type AreaId = "values" | "atoms" | "molecules" | "organisms" | "screens" | "mockups";
export const AREAS: readonly { id: AreaId; name: string }[] = [
  { id: "values", name: "Shared values" },
  { id: "atoms", name: "Atoms" },
  { id: "molecules", name: "Molecules" },
  { id: "organisms", name: "Organisms" },
  { id: "screens", name: "Screens" },
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
  /**
   * Its own component CSS file on the components layer (docs/wayfinder/atomic-catalogue/css-layers-plan.md): the
   * right panel shows that file to edit on the live cell, in place of the Tweak fields.
   */
  css?: string;
  rows: readonly Example[];
  columns: readonly Example[];
  /** Drawn in a same-origin frame of this size (menus, dialogs: anything that needs its own page). */
  frame?: { width: number; height: number };
  /**
   * Draws the part. `live`: the board's working cell, where it starts as the editor shows it (a menu or a dialog
   * closed, its button opening it); otherwise a state cell's picture (a menu or a dialog drawn open).
   */
  render(values: Values, state: State, live?: boolean): Promise<Element>;
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

/** Icons the options panel offers (every name is checked against the bundled set by its type); the editor has more. */
const iconChoice = (name: IconName, label: string): Choice => [name, label];
const ICON_NAMES: readonly Choice[] = [
  iconChoice("check", "Check"), iconChoice("plus", "Plus"), iconChoice("x", "Close"), iconChoice("trash", "Delete"), iconChoice("copy", "Copy"),
  iconChoice("gear", "Settings"), iconChoice("sparkle", "Agent"), iconChoice("link", "Link"), iconChoice("folder", "Folder"), iconChoice("file", "File"),
  iconChoice("house", "Home"), iconChoice("play", "Play"), iconChoice("arrow-right", "Arrow right"), iconChoice("caret-down", "Caret down"),
  iconChoice("dots-three", "More"), iconChoice("undo", "Undo"), iconChoice("redo", "Redo"),
];
const ICON_ROWS = ICON_NAMES.filter(([name]) => ["check", "plus", "trash", "copy"].includes(name));
const ICON_SIZE_CHOICES: readonly Choice[] = ICON_SIZES.map((size) => [String(size), String(size)]);
const ICON_PLACE_LABELS: Record<IconPlace, string> = { alone: "Alone", before: "Before words", after: "After words" };
const ICON_PLACE_CHOICES: readonly Choice[] = ICON_PLACES.map((place) => [place, ICON_PLACE_LABELS[place]]);

const SPINNER_SIZE_LABELS: Record<SpinnerSize, string> = { small: "Small", medium: "Medium", large: "Large" };
const SPINNER_PLACE_LABELS: Record<SpinnerPlace, string> = { inline: "Inline", overlay: "Overlay" };
const SPINNER_SIZE_CHOICES: readonly Choice[] = SPINNER_SIZES.map((size) => [size, SPINNER_SIZE_LABELS[size]]);
const SPINNER_PLACE_CHOICES: readonly Choice[] = SPINNER_PLACES.map((place) => [place, SPINNER_PLACE_LABELS[place]]);
/** The amounts the board offers: not known, then a few places along the bar ("unknown" is the part's own word). */
const PROGRESS_AMOUNTS: readonly Choice[] = [["unknown", "Unknown"], ...PROGRESS_STEPS.map((step): Choice => [String(step), step === 0 ? "Not started" : step === 100 ? "Done" : `${step}%`])];
const BADGE_KIND_LABELS: Record<(typeof BADGE_KINDS)[number], string> = { count: "Count", status: "Status", tag: "Tag", dot: "Dot", mark: "Mark" };
const BADGE_TONE_LABELS: Record<(typeof BADGE_TONES)[number], string> = {
  neutral: "Neutral", action: "Action", warning: "Warning", question: "Question", success: "Success", danger: "Danger",
};
const BADGE_KIND_CHOICES: readonly Choice[] = BADGE_KINDS.map((kind) => [kind, BADGE_KIND_LABELS[kind]]);
const BADGE_TONE_CHOICES: readonly Choice[] = BADGE_TONES.map((tone) => [tone, BADGE_TONE_LABELS[tone]]);
const HEADING_LEVEL_CHOICES: readonly Choice[] = HEADING_LEVELS.map((level) => [String(level), `H${level}`]);
const HEADING_ENDS: readonly Choice[] = [["none", "Nothing"], ["count", "A count"], ["button", "A button"]];

const ATOMS: Part[] = [
  {
    id: "button", area: "atoms", name: "Button", files: ["src/ui/parts/button.css", "src/ui/dom.ts"], css: "src/ui/parts/button.css",
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
    id: "icon", area: "atoms", name: "Icon", files: ["src/ui/parts/icon.ts", "src/ui/parts/icon-options.ts", "src/icons.ts", "src/icons.css"],
    defaults: { name: "check", size: "16", place: "alone", words: "Save" },
    controls: [
      choice("name", "Icon", ICON_NAMES), choice("size", "Size", ICON_SIZE_CHOICES), choice("place", "Place", ICON_PLACE_CHOICES), text("words", "Words"),
    ],
    rows: [
      ...ICON_ROWS.map(([name, label]) => ({ label, values: { name } })),
      { label: "Before words", values: { name: "plus", place: "before", words: "New page" } },
      { label: "After words", values: { name: "arrow-right", place: "after", words: "Next" } },
    ],
    columns: ICON_SIZE_CHOICES.map(([size, label]) => ({ label, values: { size } })),
    async render(values) {
      const { iconPart } = await import("../ui/parts/icon");
      return iconPart(str(values.name) as IconName, { size: str(values.size), place: str(values.place), words: str(values.words) });
    },
  },
  {
    id: "spinner", area: "atoms", name: "Spinner", files: ["src/ui/parts/spinner.ts", "src/ui/parts/spinner-options.ts", "src/ui/parts/spinner.css"],
    defaults: { size: "medium", place: "inline", label: "Loading" },
    controls: [choice("size", "Size", SPINNER_SIZE_CHOICES), choice("place", "Place", SPINNER_PLACE_CHOICES), text("label", "Label")],
    rows: SPINNER_PLACE_CHOICES.map(([place, label]) => ({ label, values: { place } })),
    columns: SPINNER_SIZE_CHOICES.map(([size, label]) => ({ label, values: { size } })),
    async render(values) {
      const [{ spinner }, node] = await Promise.all([import("../ui/parts/spinner"), dom()]);
      const ring = spinner({ size: str(values.size), place: str(values.place), label: str(values.label) });
      if (values.place !== "overlay") return ring;
      // An overlay covers what is loading: a stand-in block of words for it to sit over.
      const host = node("div", "cat-overlay-host");
      host.append(node("p", "", "Pages are on their way."), ring);
      return host;
    },
  },
  {
    id: "progress", area: "atoms", name: "Progress bar", files: ["src/ui/parts/progress.ts", "src/ui/parts/progress-options.ts", "src/ui/parts/progress.css"],
    defaults: { amount: "60", label: "Adding pictures" },
    controls: [choice("amount", "Amount", PROGRESS_AMOUNTS), text("label", "Label")],
    rows: PROGRESS_AMOUNTS.map(([amount, label]) => ({ label, values: { amount } })),
    columns: states("normal"),
    async render(values) {
      const [{ progress }, node] = await Promise.all([import("../ui/parts/progress"), dom()]);
      const stage = node("div", "cat-progress-stage");
      stage.append(progress({ value: values.amount === "unknown" ? null : str(values.amount), label: str(values.label) }));
      return stage;
    },
  },
  {
    id: "badge", area: "atoms", name: "Badge", files: ["src/ui/parts/badge.ts", "src/ui/parts/badge-options.ts", "src/ui/parts/badge.css"],
    defaults: { kind: "tag", tone: "neutral", words: "Draft", icon: "check" },
    controls: [
      choice("kind", "Kind", BADGE_KIND_CHOICES), choice("tone", "Tone", BADGE_TONE_CHOICES), text("words", "Words"), choice("icon", "Mark icon", ICON_NAMES),
    ],
    // Words per kind: a dot and a mark show none, their words are the name a screen reader says.
    rows: [
      { label: "Count", values: { kind: "count", words: "3" } },
      { label: "Count over 99", values: { kind: "count", words: "120" } },
      { label: "Status", values: { kind: "status", words: "Saved" } },
      { label: "Tag", values: { kind: "tag", words: "Heading" } },
      { label: "Long tag", values: { kind: "tag", words: "A page title that is far longer than any badge should be" } },
      { label: "Dot", values: { kind: "dot", words: "Waiting" } },
      { label: "Mark", values: { kind: "mark", words: "Done" } },
    ],
    // A badge is read, not pressed: it has no hover, pressed, focus, disabled or busy look, so the columns are tones.
    columns: BADGE_TONE_CHOICES.map(([tone, label]) => ({ label, values: { tone } })),
    async render(values) {
      const { badgePart } = await import("../ui/parts/badge");
      return badgePart({ kind: str(values.kind), tone: str(values.tone), words: str(values.words), icon: str(values.icon) as IconName });
    },
  },
  {
    id: "section-heading", area: "atoms", name: "Section heading", files: ["src/ui/parts/section-heading.ts", "src/ui/parts/section-heading-options.ts", "src/ui/parts/section-heading.css"],
    defaults: { words: "Pages", level: "3", end: "none" },
    controls: [text("words", "Words"), choice("level", "Level", HEADING_LEVEL_CHOICES), choice("end", "End slot", HEADING_ENDS)],
    rows: [
      { label: "Words only" },
      { label: "With a count", values: { end: "count" } },
      { label: "With a button", values: { end: "button" } },
      { label: "Long words", values: { words: "Pages added since the last save", end: "count" } },
    ],
    // Hover, focus and pressed belong to the button in the end slot, not to the heading.
    columns: states("normal"),
    async render(values) {
      const [{ sectionHeadingPart }, { badgePart }, { button }] = await Promise.all([
        import("../ui/parts/section-heading"), import("../ui/parts/badge"), import("../ui/dom"),
      ]);
      const end = values.end === "count" ? badgePart({ kind: "count", words: "12" }) : values.end === "button" ? button("Add", () => undefined, "button secondary") : undefined;
      const heading = sectionHeadingPart(str(values.words), { level: str(values.level), ...(end ? { end } : {}) });
      heading.classList.add("cat-heading-stage");
      return heading;
    },
  },
  {
    id: "key", area: "atoms", name: "Keyboard key", files: ["src/ui/parts/key.ts", "src/ui/parts/key-options.ts", "src/ui/parts/key.css"],
    defaults: { keys: "Ctrl+K" },
    controls: [text("keys", "Keys (joined with +)")],
    rows: [
      { label: "One key", values: { keys: "K" } },
      { label: "Named key", values: { keys: "Esc" } },
      { label: "Two keys", values: { keys: "Ctrl+K" } },
      { label: "Three keys", values: { keys: "Ctrl+Shift+Z" } },
      { label: "Symbols", values: { keys: "⌘+," } },
    ],
    // A key cap is a label: no hover, pressed, focus or disabled look of its own.
    columns: states("normal"),
    async render(values) {
      const [{ keyPart }, node] = await Promise.all([import("../ui/parts/key"), dom()]);
      return keyPart(str(values.keys)) ?? node("span", "cat-hint", "Type a key");
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
    async render(values, _state, live) {
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
      // Pressing the button moves focus out of the menu, which closes it before the click: whether it was open is read
      // on the press. A click from the keyboard comes with the menu's focus already back on the button.
      let wasOpen = false;
      anchor.addEventListener("pointerdown", () => { wasOpen = menu.isOpen(); });
      anchor.addEventListener("click", (event) => {
        if (event.detail ? wasOpen : menu.isOpen()) menu.close(true);
        else menu.open(anchor, entries);
      });
      // Redrawn with new options while open: the old menu closes, taking its listener on the page with it.
      host.addEventListener("cat-redraw", () => menu.close(false));
      // A state cell shows it open, once the frame shows it: the menu measures itself against its anchor.
      if (!live) requestAnimationFrame(() => menu.open(anchor, entries));
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
    async render(values, _state, live) {
      const [{ createConfirmDialog }, { node, button }] = await Promise.all([import("../components/confirm-dialog"), import("../ui/dom")]);
      const host = node("div", "cat-dialog-host");
      const dialog = createConfirmDialog(`confirm-${Math.random().toString(36).slice(2, 8)}`);
      const ask = () => void dialog.choose({
        title: str(values.title), notes: ["The page and its address go. Undo brings them back."],
        actions: [{ label: str(values.action), value: "confirm" }],
        ...(values.option ? { option: { label: "Also delete its pictures", checked: false } } : {}),
      });
      // The live cell asks from a button, as the editor does; a state cell shows the dialog open.
      if (live) host.append(button(`${str(values.action) || "Open"}…`, ask, "button secondary"));
      host.append(dialog.root);
      if (!live) requestAnimationFrame(ask);
      return host;
    },
  },
];

// The slim top bar (ticket 66, version B, pulled forward on 2026-11-11 with Lex's phone layout): the editor's own
// markup (src/workspace-shell.ts), with the real project menu tile and, on the phone, the real Menu
// (src/components/top-bar-phone.ts). The toolbar on its right (Undo, Redo, History and Publish) belongs to the open
// file's editor; here it is drawn with the same classes and the Save menu's place is a plain Publish button
// (organisms 58 and 62 rebuild those, inside this bar). The editor screens (screens.ts) fill their bar the same way.
type Repository = Parameters<ReturnType<typeof import("../components/repository-menu").createRepositoryMenu>["setRepository"]>[0];
const sampleRepository = (values: Values) => {
  const project = str(values.project) || "techies-site";
  return { id: 1, name: project, full_name: `techiesreviews/${project}`, owner: { login: "techiesreviews", type: "Organization" } } as Repository;
};
/** Fills a top bar drawn from the editor's markup inside `scope`: the project menu, the page's name and the toolbar. */
export async function fillTopBar(scope: HTMLElement, values: Values) {
  // The toolbar's and Publish's own stylesheets load with the file's editor in the editor; the board loads them here.
  const [{ iconMarkup }, { createRepositoryMenu }] = await Promise.all([
    import("../icons"), import("../components/repository-menu"),
    import("../components/source-editor.css"), import("../components/publish-menu.css"),
  ]);
  const tool = (name: "undo" | "redo" | "clock-counter-clockwise", label: string, part: string) =>
    `<button type="button" class="icon-button code-editor__${part}" aria-label="${label}" title="${label}">${iconMarkup(name)}</button>`;
  scope.querySelector("#editor-toolbar-host")!.innerHTML = `<div class="code-editor__toolbar code-editor__toolbar--hosted">
    ${tool("undo", "Undo", "undo")}${tool("redo", "Redo", "redo")}${tool("clock-counter-clockwise", "History", "history")}
    <div class="publish-menu"><button type="button" class="button primary publish-menu__trigger">Publish</button><button type="button" class="button primary publish-menu__more" aria-label="More save options">${iconMarkup("caret-down", 12)}</button></div>
    </div>`;
  scope.querySelector("#current-page")!.textContent = str(values.page) || "Home";
  const menu = createRepositoryMenu({ installUrl: null, accounts: [], onReload: () => undefined, onAccessChanged: () => undefined, onSwitchAccount: () => undefined, onSignOut: () => undefined });
  menu.setRepository(sampleRepository(values));
  scope.querySelector("#repository-menu")!.append(menu.root);
}
/** The phone's top bar on a bar filled by fillTopBar: its Menu, opened when `open` (and the pull-up sheet in a workspace). */
export async function phoneTopBar(app: HTMLElement, values: Values, open: boolean) {
  const [{ mountTopBarPhone }, { signal }] = await Promise.all([import("../components/top-bar-phone"), import("@preact/signals-core")]);
  mountTopBarPhone({ app, appStore: { repository: signal(sampleRepository(values)) }, page: { siteSettings: () => Promise.resolve() }, errorMessage: () => undefined });
  // Open as the cell asks (the frame is its own page, so its modal never holds the board), once the frame shows the bar.
  if (open) requestAnimationFrame(() => app.querySelector<HTMLButtonElement>("#topbar-menu")?.click());
}
async function topBar(values: Values, phone: boolean, open: boolean) {
  const [{ node }, { topBarMarkup }] = await Promise.all([import("../ui/dom"), import("../workspace-shell")]);
  const host = node("div", "cat-top-bar");
  host.innerHTML = topBarMarkup();
  await fillTopBar(host, values);
  if (phone) await phoneTopBar(host, values, open);
  return host;
}

const ORGANISMS: Part[] = [
  {
    id: "top-bar", area: "organisms", name: "Top bar", madeOf: ["button", "icon"], frame: { width: 1280, height: 64 },
    files: ["src/workspace-shell.ts", "src/style.css", "src/components/top-bar-phone.ts", "src/components/top-bar-phone.css"],
    defaults: { project: "techies-site", page: "Home" },
    controls: [text("project", "Project"), text("page", "Page")],
    rows: [{ label: "A page open" }, { label: "A long page name", values: { page: "Winter pruning: when to cut back roses, shrubs and fruit trees" } }],
    columns: [{ label: "1280 wide" }],
    render: (values) => topBar(values, false, false),
  },
  {
    id: "top-bar-phone", area: "organisms", name: "Top bar on a phone", madeOf: ["button", "icon"], frame: { width: 390, height: 720 },
    files: ["src/components/top-bar-phone.ts", "src/components/top-bar-phone.css", "src/components/top-bar-menu-rules.ts", "src/style.css"],
    defaults: { project: "techies-site", page: "Home", menu: false },
    controls: [text("project", "Project"), text("page", "Page"), toggle("menu", "Menu open")],
    rows: [{ label: "The bar", values: { menu: false } }, { label: "Menu open", values: { menu: true } }],
    columns: [{ label: "390 wide" }],
    render: (values) => topBar(values, true, Boolean(values.menu)),
  },
];

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
