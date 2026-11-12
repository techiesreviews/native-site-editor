// The catalogue board (atomic catalogue tickets 07, 08 and 05): an endless canvas with areas left to right, each part a
// frame (a live cell that works, then options in rows, states in columns, light and dark side by side; each card and
// live cell named by `data-part`, each card its files by `data-files` and `data-css`, for preview annotations), cards
// dragged by their titles to wherever suits (places.ts, remembered in this browser), an outline that flies to a part and ticks
// approved ones, and a right panel with live options, a part's own component CSS file to edit on its live cell
// (css-file.ts) or else a Tweak section for its CSS values there (tweak.ts), where the part lives, what it is made
// of, and Approve.
// Plain DOM moved by one CSS transform; `will-change` only while a gesture runs, so text redraws sharp at rest.
import listSvg from "@phosphor-icons/core/regular/list.svg?raw";
import minusSvg from "@phosphor-icons/core/regular/minus.svg?raw";
import moonSvg from "@phosphor-icons/core/regular/moon.svg?raw";
import searchSvg from "@phosphor-icons/core/regular/magnifying-glass.svg?raw";
import slidersSvg from "@phosphor-icons/core/regular/sliders-horizontal.svg?raw";
import sunSvg from "@phosphor-icons/core/regular/sun.svg?raw";
import oneOffsText from "../../scripts/agents/one-offs.json?raw";
import { iconMarkup, sizedSvg, svgElement } from "../icons";
import approvalsText from "./approvals.json?raw";
import { DEFAULT_TARGET, approvalTarget, parseApprovals, readApprovals, saveApproval, signedInAs, type Approvals } from "./approvals";
import { componentText, liveRoot } from "./component-css";
import { cssSection, type CssFile } from "./css-panel";
import { force, forceStates, type Forced } from "./force-states";
import { frameElement, updateFrame, type Theme } from "./frame";
import { MOCKUPS, type Mockup } from "./mockups";
import { SCREENS } from "./screens";
import { isPlan, type PlanAreaId, type PlanMockup, type Plans } from "./plans";
import { boundsOf, readPlaces, snapMove, writePlaces, type Box, type Guide, type Point } from "./places";
import { AREAS as BOARD_AREAS, FORCED, PARTS, STATE_NAMES, isPart, untracedLines, type AreaId, type BoardEntry, type Control, type OneOffCounts, type Part, type State, type Values } from "./parts";
import { readFields, tweakCss, type Edits, type Side, type TweakField } from "./tweak";
import { tweakSection } from "./tweak-panel";

type Entry = BoardEntry | Mockup | PlanMockup;
type AreaKey = AreaId | PlanAreaId;
const BOARD_ENTRIES: readonly (BoardEntry | Mockup)[] = [...PARTS, ...SCREENS, ...MOCKUPS];
/** Screens (the editor's own, and mock-ups of features to come): one frame per width and theme, each a live cell. */
const isScreen = (entry: Entry): entry is Mockup => entry.area === "screens" || entry.area === "mockups";
const svg = (markup: string, size = 16) => svgElement(sizedSvg(markup, size));
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
/** The page's storage, or none where the browser refuses it (reading `localStorage` itself can throw). */
const store: Pick<Storage, "getItem" | "setItem"> = (() => {
  try { return localStorage; } catch { return { getItem: () => null, setItem: () => undefined }; }
})();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
function iconButton(label: string, glyph: SVGElement, className = "cat-icon-button") {
  const button = el("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(glyph);
  return button;
}

const untraced = (() => {
  let counts: OneOffCounts = {};
  try { counts = (JSON.parse(oneOffsText) as { files?: OneOffCounts }).files ?? {}; } catch { /* No count: nothing listed. */ }
  return (files: readonly string[]) => untracedLines(files, counts);
})();

// ---------- The board ----------

/** `plans`: the planning mock-ups of the mock-ups page, one area per map after the others (plans.ts), if the build has them. */
export function startBoard(root: HTMLElement, plans: Plans = { areas: [], mockups: [] }) {
  const ENTRIES: readonly Entry[] = [...BOARD_ENTRIES, ...plans.mockups];
  const AREAS: readonly { id: AreaKey; name: string }[] = [...BOARD_AREAS, ...plans.areas];
  const byId = new Map(ENTRIES.map((entry) => [entry.id, entry]));
  const areaName = (id: AreaKey) => AREAS.find((area) => area.id === id)!.name;
  /** What Approve is for: parts and screens; a planning mock-up's own page is not approved here. */
  const approvable = ENTRIES.filter((entry) => !isPlan(entry));
  forceStates();
  const target = approvalTarget(location.search);
  let approvals: Approvals = parseApprovals(approvalsText);
  const live = new Map<string, { values: Values; state: State; theme: Theme }>();
  for (const entry of ENTRIES) live.set(entry.id, { values: { ...entry.defaults }, state: "normal", theme: "light" });
  const saving = new Map<string, { busy: boolean; note?: "signed-out" | string }>();
  /** Each part's Tweak values (read once, when it is first selected) and its edits, kept until the page closes. */
  /** `again`: a frame never drew while reading, so the next selection reads once more. */
  const tweaks = new Map<string, { fields?: TweakField[]; edits: Edits; again?: boolean }>();
  /** Each part's own CSS file (`Part.css`) and its edits, kept until the page closes. */
  const cssFiles = new Map<string, CssFile>();
  const cssFile = (entry: Part, path: string) => {
    let file = cssFiles.get(entry.id);
    if (!file) cssFiles.set(entry.id, file = { before: componentText(path) });
    return file;
  };
  /**
   * Each moved piece's offset from its place in the flow (places.ts), remembered in this browser. A piece is a card (its
   * id), a screen frame (`screen:<card>:<width>:<theme>`) or an area (`area:<id>`), each named by `data-piece`.
   */
  const places = readPlaces(store);
  const placeOf = (key: string): Point => places.get(key) ?? { x: 0, y: 0 };
  function placePiece(element: HTMLElement) {
    const place = placeOf(element.dataset.piece!);
    element.style.translate = place.x || place.y ? `${place.x}px ${place.y}px` : "";
  }
  const pieceOf = (key: string) => world.querySelector<HTMLElement>(`[data-piece="${CSS.escape(key)}"]`);
  /** Moves a piece to `place` (an offset from its flow); `keep`: remembered now, else when the drag ends. */
  function setPlace(key: string, place: Point, keep = true) {
    if (place.x || place.y) places.set(key, place); else places.delete(key);
    const element = pieceOf(key);
    if (element) placePiece(element);
    placeSel();
    cull();
    if (placeKey() === key) syncPlace();
    if (keep) writePlaces(store, places);
  }
  /** The text a part's live cell shows of its own CSS file: the last edit without a problem, else the code's. */
  const shownText = (entry: Part, path: string) => { const file = cssFile(entry, path); return file.shown ?? file.before ?? ""; };

  root.className = "cat-board";
  root.innerHTML = `
    <header class="cat-topbar">
      <h1 class="cat-brand">Catalogue</h1>
      <span class="cat-topbar__actions"></span>
    </header>
    <div class="cat-shell">
      <nav class="cat-panel cat-outline" aria-label="Outline"></nav>
      <div class="cat-viewport" tabindex="0" role="region" aria-label="Canvas">
        <div class="cat-dots"></div>
        <div class="cat-world"></div>
        <div class="cat-sel" hidden></div>
        <div class="cat-guides" aria-hidden="true"></div>
        <div class="cat-zoombar" role="toolbar" aria-label="Zoom"></div>
        <div class="cat-search" hidden>
          <label class="cat-search__box"><input class="cat-input cat-search__input" placeholder="Jump to a part" aria-label="Jump to a part" autocomplete="off" spellcheck="false"></label>
          <ul class="cat-search__list" role="listbox" aria-label="Parts"></ul>
        </div>
      </div>
      <aside class="cat-panel cat-inspector" aria-label="Options"></aside>
    </div>
    <p class="sr-only" role="status" aria-live="polite"></p>
    <div class="cat-probes" hidden><div data-theme="light"></div><div data-theme="dark"></div></div>`;
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const viewport = $<HTMLElement>(".cat-viewport"), world = $<HTMLElement>(".cat-world"), dots = $<HTMLElement>(".cat-dots");
  const selBox = $<HTMLElement>(".cat-sel"), guideLayer = $<HTMLElement>(".cat-guides"), outline = $<HTMLElement>(".cat-outline"), inspector = $<HTMLElement>(".cat-inspector");
  const status = $<HTMLElement>("[role='status']");
  const say = (text: string) => { status.textContent = text; };
  const probes = { light: $<HTMLElement>('.cat-probes [data-theme="light"]'), dark: $<HTMLElement>('.cat-probes [data-theme="dark"]') };

  // Top bar: search, the board's own colours, and (medium and phone widths) the two panels as sheets.
  const actions = $<HTMLElement>(".cat-topbar__actions");
  const searchButton = iconButton("Search parts", svg(searchSvg));
  searchButton.setAttribute("aria-keyshortcuts", "/");
  const chrome = el("div", "cat-segmented");
  chrome.setAttribute("role", "group");
  chrome.setAttribute("aria-label", "Board colours");
  const chromeTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  for (const [theme, glyph, label] of [["light", sunSvg, "Light"], ["dark", moonSvg, "Dark"]] as const) {
    const button = el("button");
    button.type = "button";
    button.dataset.chrome = theme;
    button.setAttribute("aria-pressed", String(theme === chromeTheme));
    button.append(svg(glyph, 15), el("span", "cat-segmented__text", label));
    button.setAttribute("aria-label", label);
    chrome.append(button);
  }
  document.documentElement.dataset.theme = chromeTheme;
  const outlineToggle = iconButton("Outline", svg(listSvg), "cat-icon-button cat-sheet-toggle");
  outlineToggle.dataset.sheet = "outline";
  const optionsToggle = iconButton("Options", svg(slidersSvg), "cat-icon-button cat-sheet-toggle");
  optionsToggle.dataset.sheet = "options";
  for (const toggle of [outlineToggle, optionsToggle]) toggle.setAttribute("aria-pressed", "false");
  actions.append(searchButton, chrome, outlineToggle, optionsToggle);

  // Zoom bar.
  const zoombar = $<HTMLElement>(".cat-zoombar");
  const zoomOut = iconButton("Zoom out", svg(minusSvg));
  const zoomPct = el("output", "cat-zoombar__pct", "100%");
  const zoomIn = iconButton("Zoom in", svgElement(iconMarkup("plus")));
  const zoomFit = el("button", "cat-text-button", "Fit");
  const zoom100 = el("button", "cat-text-button", "100%");
  zoomFit.type = zoom100.type = "button";
  zoom100.setAttribute("aria-label", "Actual size");
  zoombar.append(zoomOut, zoomPct, zoomIn, el("span", "cat-zoombar__sep"), zoomFit, zoom100);

  // ---------- Cards on the canvas ----------

  /** A state cell shows a picture of a part; it is not a control on the board (a tap selects its card), so it is inert. */
  function cell(className = "cat-cell") {
    const element = el("div", className);
    element.inert = true;
    return element;
  }
  /** Parts and values still drawing when the board opens: the first view fits once they have their size. */
  const drawing: Promise<unknown>[] = [];
  // Each stage's latest draw: a slower earlier one (a part's module loading the first time) never lands over it.
  const turns = new WeakMap<HTMLElement | ShadowRoot, number>();
  async function drawInline(part: Part, values: Values, state: State, into: HTMLElement | ShadowRoot, live = false) {
    const turn = (turns.get(into) ?? 0) + 1;
    turns.set(into, turn);
    const element = await part.render(values, FORCED.has(state) ? "normal" : state, live);
    if (turns.get(into) !== turn) return;
    if (FORCED.has(state)) force(element, state as Forced);
    into.replaceChildren(element);
  }
  function half(theme: Theme, label: string) {
    const element = el("div", "cat-half");
    element.dataset.theme = theme;
    element.append(el("span", "cat-label", label));
    return element;
  }
  function partGrid(part: Part, theme: Theme) {
    const grid = el("div", "cat-grid");
    grid.style.gridTemplateColumns = `auto repeat(${part.columns.length}, auto)`;
    grid.append(el("span"), ...part.columns.map((column) => el("span", "cat-grid__head", column.label)));
    for (const row of part.rows) {
      grid.append(el("span", "cat-grid__row", row.label));
      for (const column of part.columns) {
        const values = { ...part.defaults, ...row.values, ...column.values };
        const into = cell();
        into.dataset.state = column.state ?? "normal";
        if (part.frame) into.append(frameElement({ kind: "frame", id: part.id, theme, values, ...part.frame }, `${part.name}, ${row.label}, ${theme}`));
        else drawing.push(drawInline(part, values, column.state ?? "normal", into));
        grid.append(into);
      }
    }
    return grid;
  }
  function madeOfList(entry: Entry) {
    const madeOf = "madeOf" in entry ? entry.madeOf ?? [] : [];
    const lines = [...("copies" in entry ? entry.copies ?? [] : []), ...untraced(entry.files)];
    const list = el("ul", "cat-made");
    list.setAttribute("aria-label", "Made of");
    for (const id of madeOf) {
      const part = byId.get(id);
      const item = el("li");
      const link = el("button", "cat-made__link", part?.name ?? id);
      link.type = "button";
      link.dataset.fly = id;
      item.append(link);
      list.append(item);
    }
    for (const line of lines) {
      const item = el("li", "cat-made__untraced");
      item.append(el("span", "cat-made__tag", "Untraced"), el("span", "", line));
      list.append(item);
    }
    return list;
  }
  /** A planning mock-up: its picture (a released one that has it), its label and tickets, and the link that opens it. */
  function planBody(entry: PlanMockup) {
    const plan = el("div", "cat-plan");
    if (entry.picture) {
      const picture = el("img", "cat-plan__picture");
      // `src` last: the browser reads `loading` and `decoding` when the address is set.
      Object.assign(picture, { alt: "", width: 480, height: 300, loading: "lazy", decoding: "async", draggable: false, src: entry.picture });
      plan.append(picture);
    }
    const line = el("div", "cat-plan__line");
    line.append(el("span", `cat-plan__label cat-plan__label--${entry.label}`, entry.labelName));
    if (entry.tickets) line.append(el("span", "cat-plan__tickets", entry.tickets));
    const open = el("a", "cat-plan__open", "Open mock-up");
    Object.assign(open, { href: entry.href, target: "_blank", rel: "noopener" });
    open.setAttribute("aria-label", `Open mock-up: ${entry.name}`);
    plan.append(line, open);
    return plan;
  }
  function card(entry: Entry) {
    const article = el("article", "cat-card");
    article.id = `card-${entry.id}`;
    article.dataset.id = entry.id;
    article.dataset.piece = entry.id;
    article.dataset.part = entry.id;
    // What a preview annotation on the card names: the part, its files and the stylesheet that draws it.
    article.dataset.files = entry.files.join(" ");
    const sheet = ("css" in entry ? entry.css : undefined) ?? entry.files.find((file) => file.endsWith(".css"));
    if (sheet) article.dataset.css = sheet;
    article.setAttribute("aria-labelledby", `title-${entry.id}`);
    placePiece(article);
    const title = el("h3", "cat-card__title");
    title.id = `title-${entry.id}`;
    title.append(el("span", "", entry.name));
    if (!isPlan(entry)) title.append(el("span", "cat-mark"));
    else article.classList.add("cat-card--plan");
    const body = el("div", "cat-card__body");
    if (isPlan(entry)) {
      body.append(planBody(entry));
    } else if (entry.area === "values") {
      const halves = el("div", "cat-halves");
      for (const theme of entry.themed ? (["light", "dark"] as const) : (["light"] as const)) {
        const side = half(theme, entry.themed ? (theme === "light" ? "Light" : "Dark") : entry.name);
        side.dataset.stage = "page";
        const into = el("div", "cat-value-body");
        drawing.push(entry.render(entry.defaults).then((element) => into.replaceChildren(element)));
        side.append(into);
        halves.append(side);
      }
      body.append(halves);
    } else if (isScreen(entry)) {
      for (const width of entry.widths) {
        const row = el("div", "cat-halves");
        for (const theme of ["light", "dark"] as const) {
          const side = half(theme, `${width} px · ${theme === "light" ? "Light" : "Dark"}`);
          // Every mock-up frame works: each is a live cell, told apart by its width and theme.
          Object.assign(side.dataset, { part: entry.id, cell: "live", width: String(width), piece: `screen:${entry.id}:${width}:${theme}` });
          placePiece(side);
          // Reached by the keyboard too: the label picks its screen as it takes focus, and the arrows then nudge it.
          const name = side.querySelector<HTMLElement>(".cat-label")!;
          name.tabIndex = 0;
          name.setAttribute("role", "button");
          name.setAttribute("aria-label", `${entry.name}, ${name.textContent}`);
          name.setAttribute("aria-roledescription", "movable screen");
          side.append(frameElement({ kind: "mockup", id: entry.id, theme, values: entry.defaults, width, height: entry.height, live: true }, `${entry.name}, ${width} px, ${theme}`));
          row.append(side);
        }
        body.append(row);
      }
    } else {
      // The live cell works like the real part: clicks, hover and the keyboard reach it.
      const liveCell = el("div", "cat-live");
      const stage = el("div", "cat-live__stage");
      Object.assign(stage.dataset, { part: entry.id, cell: "live" });
      liveCell.append(el("span", "cat-label", "Live"), stage);
      body.append(liveCell);
      const halves = el("div", "cat-halves");
      for (const theme of ["light", "dark"] as const) {
        const side = half(theme, theme === "light" ? "Light" : "Dark");
        side.append(partGrid(entry, theme));
        halves.append(side);
      }
      body.append(halves);
    }
    article.append(title, body);
    if (entry.area === "molecules" || entry.area === "organisms" || isScreen(entry)) {
      const foot = el("footer", "cat-card__foot");
      foot.append(el("span", "cat-label", "Made of"), madeOfList(entry));
      article.append(foot);
    }
    return article;
  }
  function drawLive(entry: Entry) {
    const now = live.get(entry.id)!;
    const article = world.querySelector<HTMLElement>(`#card-${CSS.escape(entry.id)}`);
    if (!article || isPlan(entry)) return;
    if (entry.area === "values") {
      for (const into of article.querySelectorAll<HTMLElement>(".cat-value-body")) void entry.render(now.values).then((element) => { into.replaceChildren(element); placeSel(); });
      return;
    }
    if (isScreen(entry)) {
      for (const frame of article.querySelectorAll("iframe")) updateFrame(frame, now.values);
      return;
    }
    const liveCell = article.querySelector<HTMLElement>(".cat-live")!;
    liveCell.dataset.theme = now.theme;
    const stage = liveCell.querySelector<HTMLElement>(".cat-live__stage")!;
    if (entry.frame) {
      const frame = stage.querySelector("iframe");
      if (frame && frame.dataset.theme === now.theme) updateFrame(frame, now.values);
      else {
        const made = frameElement({ kind: "frame", id: entry.id, theme: now.theme, values: now.values, ...entry.frame, live: true }, `${entry.name}, live`);
        made.dataset.theme = now.theme;
        const css = frameTweaks(entry);
        if (css) made.dataset.tweaks = css;
        stage.replaceChildren(made);
      }
    } else {
      // A part with its own CSS file draws in a shadow root that holds that file as edited in place of the board's copy.
      const css = entry.css;
      const into = css ? liveRoot(stage, css, shownText(entry, css)).root : stage;
      void drawInline(entry, now.values, now.state, into, true).then(() => {
        // Its module may have brought CSS of its own as it drew: the shadow root reads the board's styles again.
        if (css) liveRoot(stage, css, shownText(entry, css));
        placeSel();
      });
    }
  }

  // ---------- Tweak: the part's CSS, edited on its live cell only ----------

  /** Where a part's edits show: its live cell in that theme, never a state cell or the editor's own styles. */
  const inlineScope = (id: string) => (side: Side) => `.cat-live[data-theme="${side}"] > .cat-live__stage[data-part="${CSS.escape(id)}"]`;
  const frameScope = (side: Side) => `:root[data-theme="${side}"] .cat-frame-stage`;
  const frameTweaks = (entry: Part) => { const tweak = tweaks.get(entry.id); return tweak?.fields ? tweakCss(tweak.fields, tweak.edits, frameScope) : ""; };
  function applyTweaks(entry: Part) {
    const stage = world.querySelector<HTMLElement>(`#card-${CSS.escape(entry.id)} .cat-live__stage`);
    // A part's own CSS file: its live cell's shadow root takes the file as edited (both themes: the file holds both).
    if (entry.css) { if (stage) liveRoot(stage, entry.css, shownText(entry, entry.css)); return; }
    const tweak = tweaks.get(entry.id);
    if (!tweak?.fields) return;
    if (entry.frame) {
      // The frame's own page writes them into its document (frame.ts), also after it is made again for another theme.
      const frame = stage?.querySelector("iframe");
      if (frame) frame.dataset.tweaks = frameTweaks(entry);
      return;
    }
    const css = tweakCss(tweak.fields, tweak.edits, inlineScope(entry.id));
    let style = document.head.querySelector<HTMLStyleElement>(`style[data-tweaks="${CSS.escape(entry.id)}"]`);
    if (!css) { style?.remove(); return; }
    if (!style) { style = el("style"); style.dataset.tweaks = entry.id; }
    style.textContent = css;
    // Last in the page, so an edit wins over the rule it changes (same specificity), as a later stylesheet would.
    document.head.append(style);
  }
  /** A frame's part once it has drawn (a state cell's menu or dialog opens a frame later); null when it never does. */
  function frameStage(frame: HTMLIFrameElement): Promise<Element | null> {
    const start = performance.now();
    return new Promise((done) => {
      const look = () => {
        const stage = frame.contentDocument?.querySelector(".cat-frame-stage");
        if (stage?.firstElementChild) setTimeout(() => done(stage), 50);
        else if (performance.now() - start > 5000) done(null);
        else setTimeout(look, 50);
      };
      look();
    });
  }
  /** Reads a part's values from its live cell and its light state cells (rows show its variants; forced states left out). */
  async function readTweaks(entry: Part, tweak: { fields?: TweakField[]; again?: boolean }) {
    const article = world.querySelector<HTMLElement>(`#card-${CSS.escape(entry.id)}`);
    if (!article) return;
    const holders = [
      ...article.querySelectorAll<HTMLElement>(".cat-live__stage"),
      ...article.querySelectorAll<HTMLElement>(`.cat-half[data-theme="light"] .cat-cell:not(${[...FORCED].map((state) => `[data-state="${state}"]`).join(", ")})`),
    ];
    const stages = await Promise.all(holders.map((holder) => {
      const frame = holder.querySelector("iframe");
      return frame ? frameStage(frame) : holder;
    }));
    tweak.again = stages.includes(null);
    tweak.fields = readFields(stages.flatMap((stage) => (stage ? [...stage.children] : [])), probes);
    // Read at once (no frame to wait for), the section being made shows them; else it is redrawn with them.
    if (selected === entry.id) refreshTweak();
  }
  /** `select`: the part was just selected, when values read without a frame are read again (nothing edited yet). */
  function tweakFor(entry: Part, select = false) {
    let tweak = tweaks.get(entry.id);
    if (!tweak || (select && tweak.again && !Object.keys(tweak.edits).length)) {
      tweak = { edits: {} };
      tweaks.set(entry.id, tweak);
      void readTweaks(entry, tweak);
    }
    const side = live.get(entry.id)!.theme;
    return tweakSection({
      part: entry, fields: tweak.fields, edits: tweak.edits, side, probe: probes[side],
      apply: () => applyTweaks(entry), say,
    });
  }
  /** Redraws only the Tweak section (its values read, or the other theme on show). */
  function refreshTweak() {
    const entry = selected ? byId.get(selected) : undefined;
    const section = inspector.querySelector("[data-tweak]");
    if (entry && isPart(entry) && section) section.replaceWith(tweakFor(entry));
  }
  /** The CSS section of a part with its own CSS file. */
  function cssFor(entry: Part, path: string) {
    return cssSection({ part: entry, path, file: cssFile(entry, path), apply: () => applyTweaks(entry), say });
  }

  const areas = new Map<AreaKey, HTMLElement>();
  for (const area of AREAS) {
    const section = el("section", "cat-area");
    section.id = `area-${area.id}`;
    section.dataset.area = area.id;
    section.dataset.piece = `area:${area.id}`;
    placePiece(section);
    const label = el("h2", "cat-area__label", area.name);
    label.dataset.area = area.id;
    // A long map name is cut short on the board (board.css): the full name is the label's tooltip.
    if (area.id.startsWith("plan:")) { section.classList.add("cat-area--plan"); label.title = area.name; }
    const cards = el("div", "cat-area__cards");
    const inArea = ENTRIES.filter((entry) => entry.area === area.id);
    cards.append(...inArea.map(card));
    if (!inArea.length) {
      const empty = el("div", "cat-card cat-card--empty");
      empty.append(el("span", "", `No ${area.name.toLowerCase()} yet`));
      cards.append(empty);
    }
    section.append(label, cards);
    world.append(section);
    areas.set(area.id, section);
  }
  for (const entry of ENTRIES) if (entry.area !== "values") drawLive(entry);

  // ---------- Outline ----------

  for (const area of AREAS) {
    const head = el("button", "cat-outline__area", area.name);
    head.type = "button";
    head.dataset.area = area.id;
    const list = el("ul", "cat-outline__list");
    for (const entry of ENTRIES.filter((item) => item.area === area.id)) {
      const item = el("li");
      const button = el("button", "cat-outline__item");
      button.type = "button";
      button.dataset.id = entry.id;
      button.setAttribute("aria-current", "false");
      button.append(el("span", "cat-outline__name", entry.name));
      if (!isPlan(entry)) button.append(el("span", "cat-mark"));
      item.append(button);
      list.append(item);
    }
    outline.append(head, list);
  }
  function paintMarks() {
    for (const entry of ENTRIES) {
      const approved = Boolean(approvals.approved[entry.id]);
      for (const mark of root.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(entry.id)}"] .cat-mark`)) {
        mark.toggleAttribute("data-approved", approved);
        mark.replaceChildren(...approved ? [svgElement(iconMarkup("check", 14))] : []);
        if (approved) { mark.setAttribute("role", "img"); mark.setAttribute("aria-label", "Approved"); }
        else { mark.removeAttribute("role"); mark.removeAttribute("aria-label"); }
      }
    }
  }

  // ---------- Camera: screen = world × z + (x, y) ----------

  const cam = { x: 0, y: 0, z: 1 };
  const MIN_Z = 0.03, MAX_Z = 4;
  let gestureTimer: ReturnType<typeof setTimeout> | undefined, flight = 0;
  const titles = () => world.querySelectorAll<HTMLElement>(".cat-card__title");
  const areaLabels = () => world.querySelectorAll<HTMLElement>(".cat-area__label");
  function rectOf(element: HTMLElement) {
    let x = 0, y = 0;
    for (let node: HTMLElement | null = element; node && node !== world; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop; }
    return { x, y, w: element.offsetWidth, h: element.offsetHeight };
  }
  /**
   * Where a piece is on the board: its place in the flow, moved by its own offset and those of the pieces around it (a
   * card in a moved area, a screen in a moved card); offsets ignore a `translate`.
   */
  function pieceBox(element: HTMLElement): Box {
    const rect = rectOf(element);
    let { x, y } = rect;
    for (let node: HTMLElement | null = element; node; node = node.parentElement?.closest<HTMLElement>("[data-piece]") ?? null) {
      const place = placeOf(node.dataset.piece!);
      x += place.x; y += place.y;
    }
    return { x, y, w: rect.w, h: rect.h };
  }
  function apply() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    const grid = 20 * cam.z;
    dots.style.backgroundSize = `${grid}px ${grid}px`;
    dots.style.backgroundPosition = `${cam.x}px ${cam.y}px`;
    dots.style.opacity = String(clamp((grid - 6) / 8, 0, 1));
    zoomPct.textContent = `${Math.round(cam.z * 100)}%`;
    // A zoom or pan mid-drag: the guides follow the board.
    if (move?.moved) drawGuides(move.guides);
    placeSel();
    cull();
  }
  const movedScreens = (article: HTMLElement) => [...article.querySelectorAll<HTMLElement>("[data-piece]")].filter((screen) => places.has(screen.dataset.piece!));
  /** A card with the screens moved out of it. */
  const cardSpan = (article: HTMLElement) => boundsOf([pieceBox(article), ...movedScreens(article).map(pieceBox)])!;
  // Cards wholly off screen are not drawn (as tldraw culls shapes); their place on the canvas stays. A card counts with the
  // screens moved out of it. Positions are read each time: offsets ignore the transform, so moving the board lays nothing out again.
  function cull() {
    const w = viewport.clientWidth, h = viewport.clientHeight, title = 40;
    for (const article of world.querySelectorAll<HTMLElement>(".cat-card")) {
      const box = cardSpan(article);
      const left = box.x * cam.z + cam.x, top = (box.y - title) * cam.z + cam.y;
      article.classList.toggle("is-culled", left > w || top > h || left + box.w * cam.z < 0 || top + (box.h + title) * cam.z < 0);
    }
  }
  function placeSel() {
    const key = placeKey(), element = key ? pieceOf(key) : null;
    if (!element) { selBox.hidden = true; return; }
    const rect = pieceBox(element);
    selBox.hidden = false;
    selBox.style.transform = `translate(${rect.x * cam.z + cam.x}px, ${rect.y * cam.z + cam.y}px)`;
    selBox.style.inlineSize = `${rect.w * cam.z}px`;
    selBox.style.blockSize = `${rect.h * cam.z}px`;
  }
  function startGesture() { world.style.willChange = "transform"; clearTimeout(gestureTimer); }
  function settle() {
    clearTimeout(gestureTimer);
    world.style.willChange = "";
    cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
    apply();
    const titleScale = String(clamp(1 / cam.z, 1, 6)), labelScale = String(clamp(0.4 / cam.z, 1, 9));
    for (const title of titles()) if (!title.closest(".cat-card--plan")) title.style.scale = titleScale;
    for (const label of areaLabels()) label.style.scale = labelScale;
    // A mock-up's name (smaller cards, longer names) and a map's name keep to their card or area at any zoom (board.css), so
    // zoomed out they do not run into the next.
    world.style.setProperty("--cat-title-scale", titleScale);
    world.style.setProperty("--cat-label-scale", labelScale);
  }
  const settleSoon = () => { clearTimeout(gestureTimer); gestureTimer = setTimeout(settle, 160); };
  function zoomAt(sx: number, sy: number, factor: number) {
    const next = clamp(cam.z * factor, MIN_Z, MAX_Z), k = next / cam.z;
    cam.x = sx - (sx - cam.x) * k; cam.y = sy - (sy - cam.y) * k; cam.z = next;
    apply();
  }
  const mode = () => { const width = root.clientWidth; return width < 600 ? "phone" : width < 1040 ? "medium" : "wide"; };
  function camFor(rect: { x: number; y: number; w: number; h: number }, maxZ: number, pad = 48) {
    const w = viewport.clientWidth, h = viewport.clientHeight, sheet = root.dataset.sheet, medium = mode() === "medium";
    // On a phone the open sheet covers the bottom of the canvas: the card is centred in the space above it.
    const phoneSheet = mode() === "phone" && sheet ? (sheet === "outline" ? outline : inspector).offsetHeight : 0;
    const left = medium && sheet === "outline" ? 256 : 0, right = medium && sheet === "options" ? 288 : 0, bottom = Math.max(56, phoneSheet);
    const aw = Math.max(w - left - right - pad * 2, 60), ah = Math.max(h - bottom - pad * 2, 60);
    const z = clamp(Math.min(aw / rect.w, ah / rect.h), MIN_Z, maxZ);
    return { z, x: left + (w - left - right) / 2 - (rect.x + rect.w / 2) * z, y: (h - bottom) / 2 - (rect.y + rect.h / 2) * z };
  }
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function stopFlight() { if (flight) { cancelAnimationFrame(flight); flight = 0; } }
  function flyTo(to: { x: number; y: number; z: number }, fixed?: number) {
    stopFlight();
    if (reduced.matches) { Object.assign(cam, to); settle(); return; }
    const w = viewport.clientWidth, h = viewport.clientHeight, from = { ...cam };
    const c0 = { x: (w / 2 - from.x) / from.z, y: (h / 2 - from.y) / from.z };
    const c1 = { x: (w / 2 - to.x) / to.z, y: (h / 2 - to.y) / to.z };
    const span = (Math.hypot(c1.x - c0.x, c1.y - c0.y) * Math.min(from.z, to.z)) / w;
    // A long trip zooms out a little on the way, as Paper and Figma do.
    const dip = span > 1 ? Math.min(Math.log(span) * 0.7, 2.2) : 0;
    const duration = fixed ?? clamp(420 + 160 * Math.log2(1 + span), 420, 950);
    const lz0 = Math.log(from.z), lz1 = Math.log(to.z), t0 = performance.now();
    startGesture();
    const step = (now: number) => {
      const t = clamp((now - t0) / duration, 0, 1), e = ease(t);
      const z = Math.exp(lz0 + (lz1 - lz0) * e - dip * Math.sin(Math.PI * e));
      cam.z = z; cam.x = w / 2 - (c0.x + (c1.x - c0.x) * e) * z; cam.y = h / 2 - (c0.y + (c1.y - c0.y) * e) * z;
      apply();
      if (t < 1) flight = requestAnimationFrame(step);
      else { flight = 0; Object.assign(cam, to); settle(); }
    };
    flight = requestAnimationFrame(step);
  }
  const cardRect = (id: string) => { const r = cardSpan(pieceOf(id)!); return { x: r.x, y: r.y - 30, w: r.w, h: r.h + 30 }; };
  const flyToCard = (id: string, maxZ = 1.25) => flyTo(camFor(cardRect(id), maxZ));
  const areaRect = (id: AreaKey) => { const r = pieceBox(areas.get(id)!); return { x: r.x, y: r.y - 100, w: r.w, h: r.h + 100 }; };
  const flyToArea = (id: AreaKey) => flyTo(camFor(areaRect(id), 1, 32));
  // Everything on the board: the areas, and what was moved out of them (with room for the names above them).
  const allRect = () => boundsOf([{ x: 0, y: 0, w: world.offsetWidth, h: world.offsetHeight },
    ...[...world.querySelectorAll<HTMLElement>("[data-piece]")].map((piece) => {
      const box = pieceBox(piece), room = piece.matches(".cat-area") ? 100 : piece.matches(".cat-card") ? 40 : 0;
      return { ...box, y: box.y - room, h: box.h + room };
    })])!;
  const fitAll = () => flyTo(camFor(allRect(), 1, 24));
  function zoomCentre(factor: number) {
    const w = viewport.clientWidth, h = viewport.clientHeight, next = clamp(cam.z * factor, MIN_Z, MAX_Z), k = next / cam.z;
    flyTo({ z: next, x: w / 2 - (w / 2 - cam.x) * k, y: h / 2 - (h / 2 - cam.y) * k }, 200);
  }

  // ---------- Selection and the right panel ----------

  /** `selected`: the card whose options show; `picked`: the screen or area (a piece's key) being placed, else the card itself. */
  let selected: string | undefined, picked: string | undefined;
  const placeKey = () => picked ?? selected;
  function setSheet(name: "" | "outline" | "options") {
    if (name) root.dataset.sheet = name; else delete root.dataset.sheet;
    for (const toggle of [outlineToggle, optionsToggle]) toggle.setAttribute("aria-pressed", String(toggle.dataset.sheet === name));
  }
  /** `sheet`: below wide widths, a selection opens the Options sheet (not when a live cell is being used). */
  function select(id: string | undefined, sheet = true, piece?: string) {
    selected = id && byId.has(id) ? id : undefined;
    picked = piece && pieceOf(piece) ? piece : undefined;
    for (const article of world.querySelectorAll<HTMLElement>(".cat-card[data-id]")) article.classList.toggle("is-selected", article.dataset.id === selected);
    for (const holder of world.querySelectorAll<HTMLElement>(".cat-half[data-piece], .cat-area")) holder.classList.toggle("is-selected", holder.dataset.piece === picked);
    for (const head of outline.querySelectorAll<HTMLElement>(".cat-outline__area")) {
      if (`area:${head.dataset.area}` === picked) head.setAttribute("aria-current", "true"); else head.removeAttribute("aria-current");
    }
    for (const item of outline.querySelectorAll<HTMLElement>(".cat-outline__item")) item.setAttribute("aria-current", String(item.dataset.id === selected));
    renderInspector();
    placeSel();
    if (mode() !== "wide" && sheet) { if (placeKey()) setSheet("options"); else if (root.dataset.sheet === "options") setSheet(""); }
  }
  /** Picks whatever a name label belongs to: a card, one of its screens, or an area. */
  function selectPiece(key: string, sheet = true) {
    const element = pieceOf(key);
    if (!element) return;
    if (element.matches(".cat-area")) select(undefined, sheet, key);
    else if (element.matches(".cat-card")) select(key, sheet);
    else select(element.closest<HTMLElement>(".cat-card")!.dataset.id, sheet, key);
  }
  function go(id: string) {
    select(id);
    flyToCard(id);
    say(byId.get(id)?.name ?? id);
  }

  function controlElement(entry: Entry, control: Control) {
    const now = live.get(entry.id)!;
    const value = now.values[control.key];
    if (control.kind === "switch") {
      // The editor's own switch: a checkbox with role="switch" (src/page-builder/media-spot-popup.ts), the row its label.
      const row = el("label", "cat-control cat-control--row");
      const toggle = el("input", "cat-check");
      toggle.type = "checkbox";
      toggle.setAttribute("role", "switch");
      toggle.checked = Boolean(value);
      toggle.addEventListener("change", () => setValue(entry, control.key, toggle.checked));
      row.append(el("span", "cat-control__label", control.label), toggle);
      return row;
    }
    const label = el("label", "cat-control");
    label.append(el("span", "cat-control__label", control.label));
    if (control.kind === "text") {
      const input = el("input", "cat-input");
      input.value = String(value ?? "");
      input.spellcheck = false;
      input.addEventListener("input", () => setValue(entry, control.key, input.value));
      label.append(input);
    } else {
      const picker = el("select", "cat-input cat-select");
      for (const [option, text] of control.choices) {
        const item = el("option", "", text);
        item.value = option;
        item.selected = String(value) === option;
        picker.append(item);
      }
      picker.addEventListener("change", () => setValue(entry, control.key, picker.value));
      label.append(picker);
    }
    return label;
  }
  function segmented(label: string, choices: readonly (readonly [string, string])[], current: string, pick: (value: string) => void) {
    const wrap = el("div", "cat-control");
    wrap.append(el("span", "cat-control__label", label));
    const group = el("div", "cat-segmented cat-segmented--fill");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    for (const [value, text] of choices) {
      const button = el("button", "", text);
      button.type = "button";
      button.setAttribute("aria-pressed", String(value === current));
      button.addEventListener("click", () => {
        for (const other of group.children) other.setAttribute("aria-pressed", String(other === button));
        pick(value);
      });
      group.append(button);
    }
    wrap.append(group);
    return wrap;
  }
  function setValue(entry: Entry, key: string, value: string | boolean) {
    live.get(entry.id)!.values[key] = value;
    drawLive(entry);
  }
  function section(title: string, ...children: Node[]) {
    const element = el("section", "cat-inspector__section");
    element.setAttribute("aria-label", title);
    element.append(el("h3", "cat-inspector__heading", title), ...children);
    return element;
  }
  /** Where the picked piece sits on the board, to type exactly; dragging its name or the arrow keys move it too. */
  function placeSection(key: string) {
    const fields = el("div", "cat-place");
    for (const axis of ["x", "y"] as const) {
      const label = el("label", "cat-control");
      const input = el("input", "cat-input");
      input.type = "number";
      input.step = "1";
      input.dataset.place = axis;
      input.addEventListener("input", () => {
        const element = pieceOf(key), value = input.valueAsNumber;
        if (!element || !Number.isFinite(value)) return;
        const place = placeOf(key);
        setPlace(key, { ...place, [axis]: place[axis] + Math.round(value) - pieceBox(element)[axis] });
      });
      label.append(el("span", "cat-control__label", axis.toUpperCase()), input);
      fields.append(label);
    }
    // A screen names itself (its width and colours), as its card has others beside it.
    const screen = key.startsWith("screen:") ? pieceOf(key)?.querySelector(":scope > .cat-label")?.textContent : "";
    const place = section(screen ? `Place · ${screen}` : "Place", fields);
    place.dataset.placeSection = "";
    return place;
  }
  /** The Place fields follow the piece as it moves, except the one being typed in. */
  function syncPlace() {
    const element = pieceOf(placeKey() ?? "");
    if (!element) return;
    const box = pieceBox(element);
    for (const input of inspector.querySelectorAll<HTMLInputElement>("[data-place]"))
      if (input !== document.activeElement) input.value = String(Math.round(box[input.dataset.place as "x" | "y"]));
  }
  function approveSection(entry: Entry) {
    const mark = approvals.approved[entry.id];
    const save = saving.get(entry.id);
    const button = el("button", `button ${mark ? "secondary" : "primary"} cat-approve`);
    button.type = "button";
    button.dataset.approve = entry.id;
    if (mark) {
      // Done, not a toggle: it says so and does nothing more.
      button.setAttribute("aria-disabled", "true");
      button.append(svgElement(iconMarkup("check", 16, "icon--before")), "Approved");
    } else if (save?.busy) {
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      button.textContent = "Approving…";
    } else button.textContent = "Approve";
    const children: Node[] = [button];
    if (mark) children.push(el("p", "cat-approve__note", `${mark.by} · ${mark.on}`));
    else if (save?.note === "signed-out") {
      const note = el("p", "cat-approve__note cat-approve__note--problem");
      // Sign-in returns to the editor, not here: it opens in a new tab, and this one checks again when it is back in front.
      const link = el("a", "", "Sign in with GitHub");
      link.href = "/auth/login";
      link.target = "_blank";
      link.rel = "noopener";
      note.append(link, " to approve.");
      children.push(note);
    } else if (save?.note) children.push(el("p", "cat-approve__note cat-approve__note--problem", `Not saved: ${save.note}`));
    // A link that names a repository says where Approve saves (approvalTarget returns DEFAULT_TARGET itself otherwise).
    if (target !== DEFAULT_TARGET)
      children.push(el("p", "cat-approve__note", `Saves to ${target.repo} · ${target.branch}`));
    const review = section("Review", ...children);
    review.dataset.review = "";
    return review;
  }
  /** Redraws only the Review section, so a field being typed in keeps its focus. */
  function refreshReview() {
    const entry = selected ? byId.get(selected) : undefined;
    const review = inspector.querySelector("[data-review]");
    if (entry && review) review.replaceWith(approveSection(entry));
    else if (!entry) renderInspector();
  }
  function renderInspector() {
    const entry = selected ? byId.get(selected) : undefined;
    if (!entry && picked) {
      // An area: its name, and where it sits.
      const head = el("div", "cat-inspector__head"), heads = el("div", "cat-inspector__heads");
      const area = AREAS.find((item) => `area:${item.id}` === picked)!;
      heads.append(el("h2", "cat-inspector__title", area.name), el("span", "cat-inspector__area", "Area"));
      const close = iconButton("Close", svgElement(iconMarkup("x")));
      close.addEventListener("click", () => { select(undefined); setSheet(""); });
      head.append(heads, close);
      inspector.replaceChildren(head, placeSection(picked));
      syncPlace();
      return;
    }
    if (!entry) {
      const count = approvable.filter((item) => approvals.approved[item.id]).length;
      const empty = el("div", "cat-inspector__empty");
      empty.append(el("span", "", `Approved ${count} of ${approvable.length}`));
      inspector.replaceChildren(empty);
      return;
    }
    const now = live.get(entry.id)!;
    const head = el("div", "cat-inspector__head");
    const heads = el("div", "cat-inspector__heads");
    heads.append(el("h2", "cat-inspector__title", entry.name), el("span", "cat-inspector__area", areaName(entry.area)));
    const close = iconButton("Close", svgElement(iconMarkup("x")));
    close.addEventListener("click", () => { select(undefined); setSheet(""); });
    head.append(heads, close);
    const files = el("p", "cat-inspector__files", entry.files.join(" · "));
    const sections: Node[] = [head, files];
    const controls: Node[] = entry.controls.map((control) => controlElement(entry, control));
    if (isPart(entry)) {
      const stateChoices = entry.columns.flatMap((column) => column.state ? [[column.state, STATE_NAMES[column.state]] as const] : []);
      if (stateChoices.length > 1) controls.push(stateControl(entry, stateChoices));
      controls.push(segmented("Colours", [["light", "Light"], ["dark", "Dark"]], now.theme, (theme) => { now.theme = theme as Theme; drawLive(entry); refreshTweak(); }));
    }
    if (controls.length) sections.push(section("Options", ...controls));
    sections.push(placeSection(picked ?? entry.id));
    if (isPart(entry)) sections.push(entry.css ? cssFor(entry, entry.css) : tweakFor(entry, true));
    if (entry.area === "molecules" || entry.area === "organisms" || isScreen(entry)) sections.push(section("Made of", madeOfList(entry)));
    if (!isPlan(entry)) sections.push(approveSection(entry));
    inspector.replaceChildren(...sections);
    syncPlace();
  }
  function stateControl(entry: Part, choices: readonly (readonly [State, string])[]) {
    const now = live.get(entry.id)!;
    const label = el("label", "cat-control");
    label.append(el("span", "cat-control__label", "State"));
    const picker = el("select", "cat-input cat-select");
    for (const [state, text] of choices) {
      const option = el("option", "", text);
      option.value = state;
      option.selected = state === now.state;
      picker.append(option);
    }
    picker.addEventListener("change", () => { now.state = picker.value as State; drawLive(entry); });
    label.append(picker);
    return label;
  }

  async function approve(id: string) {
    const entry = byId.get(id);
    if (!entry || approvals.approved[id] || saving.get(id)?.busy) return;
    saving.set(id, { busy: true });
    if (selected === id) renderInspector();
    const outcome = await saveApproval(id, target);
    if (outcome.kind === "saved") {
      approvals = outcome.approvals;
      saving.delete(id);
      paintMarks();
      say(`${entry.name} approved`);
    } else {
      saving.set(id, { busy: false, note: outcome.kind === "signed-out" ? "signed-out" : outcome.message });
      say(outcome.kind === "signed-out" ? "Sign in to approve" : `${entry.name} not saved`);
    }
    if (selected === id) {
      renderInspector();
      inspector.querySelector<HTMLElement>("[data-approve]")?.focus();
    }
  }
  inspector.addEventListener("click", (event) => {
    const target = event.target as Element;
    const approveButton = target.closest<HTMLElement>("[data-approve]");
    if (approveButton) { void approve(approveButton.dataset.approve!); return; }
    const fly = target.closest<HTMLElement>("[data-fly]");
    if (fly) go(fly.dataset.fly!);
  });

  // ---------- Outline, top bar ----------

  outline.addEventListener("click", (event) => {
    const target = event.target as Element;
    const item = target.closest<HTMLElement>(".cat-outline__item"), area = target.closest<HTMLElement>(".cat-outline__area");
    if (item) go(item.dataset.id!);
    else if (area) { if (mode() !== "wide") setSheet(""); selectPiece(`area:${area.dataset.area}`, false); flyToArea(area.dataset.area as AreaKey); }
  });
  for (const toggle of [outlineToggle, optionsToggle])
    toggle.addEventListener("click", () => setSheet(root.dataset.sheet === toggle.dataset.sheet ? "" : toggle.dataset.sheet as "outline" | "options"));
  chrome.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-chrome]");
    if (!button) return;
    document.documentElement.dataset.theme = button.dataset.chrome!;
    for (const other of chrome.children) other.setAttribute("aria-pressed", String(other === button));
  });
  zoomIn.addEventListener("click", () => zoomCentre(1.25));
  zoomOut.addEventListener("click", () => zoomCentre(0.8));
  zoomFit.addEventListener("click", () => (selected ? flyToCard(selected, 2) : fitAll()));
  zoom100.addEventListener("click", () => {
    if (!selected) { zoomCentre(1 / cam.z); return; }
    const fit = camFor(cardRect(selected), 1), w = viewport.clientWidth, h = viewport.clientHeight;
    flyTo({ z: 1, x: w / 2 - (w / 2 - fit.x) / fit.z, y: h / 2 - (h / 2 - fit.y) / fit.z }, 260);
  });

  // ---------- Search ("/") ----------

  const search = $<HTMLElement>(".cat-search"), searchInput = $<HTMLInputElement>(".cat-search__input"), searchList = $<HTMLElement>(".cat-search__list");
  searchList.id = "cat-search-list";
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-controls", searchList.id);
  searchInput.setAttribute("aria-expanded", "false");
  let active = 0, results: Entry[] = [];
  function renderResults() {
    const query = searchInput.value.trim().toLowerCase();
    results = ENTRIES.filter((entry) => !query || entry.name.toLowerCase().includes(query) || areaName(entry.area).toLowerCase().includes(query)).slice(0, 8);
    active = clamp(active, 0, Math.max(results.length - 1, 0));
    searchList.replaceChildren(...results.map((entry, index) => {
      const item = el("li", "cat-search__item");
      item.id = `cat-result-${entry.id}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === active));
      item.dataset.id = entry.id;
      item.append(el("span", "cat-search__name", entry.name), el("span", "cat-search__area", areaName(entry.area)));
      return item;
    }));
    if (results[active]) searchInput.setAttribute("aria-activedescendant", `cat-result-${results[active].id}`);
    else searchInput.removeAttribute("aria-activedescendant");
  }
  function openSearch() { search.hidden = false; searchInput.setAttribute("aria-expanded", "true"); searchInput.value = ""; active = 0; renderResults(); searchInput.focus(); }
  function closeSearch() { if (search.hidden) return; search.hidden = true; searchInput.setAttribute("aria-expanded", "false"); viewport.focus({ preventScroll: true }); }
  function pick(id: string | undefined) { if (!id) return; closeSearch(); go(id); }
  searchInput.addEventListener("input", () => { active = 0; renderResults(); });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); active = clamp(active + (event.key === "ArrowDown" ? 1 : -1), 0, results.length - 1); renderResults(); }
    else if (event.key === "Enter") { event.preventDefault(); pick(results[active]?.id); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSearch(); }
  });
  searchList.addEventListener("click", (event) => pick((event.target as Element).closest<HTMLElement>("[data-id]")?.dataset.id));
  searchButton.addEventListener("click", openSearch);
  document.addEventListener("pointerdown", (event) => {
    if (!search.hidden && !(event.target as Element).closest(".cat-search, .cat-topbar")) closeSearch();
  }, true);

  // ---------- Keys ----------

  let spaceHeld = false;
  /** Whether a key goes to a field: the event's own target, inside a live cell's shadow root too. */
  const typing = (event: Event) => {
    const target = event.composedPath()[0];
    return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
  };
  document.addEventListener("keydown", (event) => {
    if (typing(event)) { const field = event.composedPath()[0] as HTMLElement; if (event.key === "Escape" && field !== searchInput) field.blur(); return; }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); openSearch(); return; }
    if (event.key === "Escape") { if (move) endMove("cancel"); else if (root.dataset.sheet) setSheet(""); else select(undefined); return; }
    // Space pans only from the canvas itself or the page: on a focused button it presses the button.
    if (event.code === "Space" && (event.target === document.body || event.target === viewport)) {
      event.preventDefault();
      if (!spaceHeld) { spaceHeld = true; root.classList.add("is-space"); }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // The arrow keys move the selected card, screen or area from the canvas or from its row in the outline, a step of 1
    // (10 with Shift), as in Figma.
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const from = event.target as Element;
    const key = placeKey();
    if (step && key && !move && (from === document.body || from === viewport || from.closest?.(".cat-outline__item, .cat-outline__area, .cat-half[data-piece] > .cat-label"))) {
      event.preventDefault();
      const size = event.shiftKey ? 10 : 1, place = placeOf(key);
      setPlace(key, { x: place.x + step[0] * size, y: place.y + step[1] * size });
      return;
    }
    if (event.key === "+" || event.key === "=") zoomCentre(1.25);
    else if (event.key === "-") zoomCentre(0.8);
    else if (event.key === "!" || (event.shiftKey && event.code === "Digit1")) fitAll();
  });
  document.addEventListener("keyup", (event) => { if (event.code === "Space") { spaceHeld = false; root.classList.remove("is-space"); } });
  // A part in a state cell's frame may focus itself as it draws (an open menu its first item, a dialog), which takes
  // focus into that inert <iframe> and away from the board. It is given back to where it was once the frame's own
  // focusing is over, the window first: focusing an element alone leaves the keys going to the frame. The board's page
  // sees the <iframe> take focus, and its window lose it (not every browser says both; a page in the background sees
  // only the first).
  let lastFocus: HTMLElement | undefined;
  const inPicture = () => document.activeElement instanceof HTMLIFrameElement && document.activeElement.inert;
  function takeBack() {
    if (!inPicture()) return;
    setTimeout(() => {
      // Read again: someone may have moved on meanwhile (into a live frame, say), and their focus stays; another state
      // cell's frame may have taken it from the first.
      if (!inPicture()) return;
      window.focus();
      // Nothing on the board had focus yet (frames drawing as it opens): the canvas takes it.
      (lastFocus?.isConnected ? lastFocus : viewport).focus({ preventScroll: true });
    });
  }
  document.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLIFrameElement) takeBack();
    else lastFocus = event.target as HTMLElement;
  });
  window.addEventListener("blur", takeBack);

  // ---------- Wheel: a mouse wheel and a pinch zoom round the pointer, a trackpad's scroll pans ----------

  viewport.addEventListener("wheel", (event) => {
    if ((event.target as Element).closest(".cat-search")) return;
    event.preventDefault();
    stopFlight(); startGesture();
    const box = viewport.getBoundingClientRect(), sx = event.clientX - box.left, sy = event.clientY - box.top;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const dx = event.deltaX * unit, dy = event.deltaY * unit;
    const mouseWheel = event.deltaMode !== 0 || (dx === 0 && Number.isInteger(dy) && Math.abs(dy) >= 50);
    if (event.ctrlKey || event.metaKey) zoomAt(sx, sy, Math.exp(-dy * 0.01));
    else if (mouseWheel && !event.shiftKey) zoomAt(sx, sy, Math.exp(-dy * 0.0016));
    else { cam.x -= event.shiftKey && dx === 0 ? dy : dx; cam.y -= event.shiftKey && dx === 0 ? 0 : dy; apply(); }
    settleSoon();
  }, { passive: false });
  for (const type of ["gesturestart", "gesturechange"]) viewport.addEventListener(type, (event) => event.preventDefault());

  // ---------- Moving a card, a screen or an area: drag its name; it snaps to the others, with guides along the edges it meets ----------

  /** The name label a piece is dragged by: a card's title, a screen's label, an area's name. */
  const gripOf = (target: Element) => target.closest<HTMLElement>(".cat-card__title, .cat-half[data-piece] > .cat-label, .cat-area__label");
  // `sx`, `sy`: the press on screen; `bx`, `by`: on the board, so a zoom during the drag keeps the piece under the pointer.
  // `lx`, `ly`: the pointer's last place on screen, where a pinch starts if a second finger joins.
  let move: { key: string; pointer: number; sx: number; sy: number; lx: number; ly: number; bx: number; by: number; from: Point; base: Box; others: Box[]; moved: boolean; target: Element; guides: Guide[] } | undefined;
  function startMove(event: PointerEvent, piece: HTMLElement) {
    stopFlight();
    const key = piece.dataset.piece!, from = placeOf(key), box = pieceBox(piece);
    // It snaps to the cards and screens, except what it holds or the area it sits in (a screen snaps to its own card).
    const others = [...world.querySelectorAll<HTMLElement>("[data-piece]")]
      .filter((other) => !other.matches(".cat-area") && !piece.contains(other) && (!other.contains(piece) || other.matches(".cat-card"))).map(pieceBox);
    const { x: bx, y: by } = boardAt(event);
    move = { key, pointer: event.pointerId, sx: event.clientX, sy: event.clientY, lx: event.clientX, ly: event.clientY, bx, by, from, base: { ...box, x: box.x - from.x, y: box.y - from.y }, others, moved: false, target: event.target as Element, guides: [] };
    try { viewport.setPointerCapture(event.pointerId); } catch { /* The pointer is gone already. */ }
  }
  /** What a piece is called: a card or area by its name, a screen by its card and label. */
  function pieceName(key: string) {
    const element = pieceOf(key);
    if (!element) return key;
    if (element.matches(".cat-area")) return element.querySelector(":scope > .cat-area__label")?.textContent ?? key;
    if (element.matches(".cat-half")) return `${byId.get(element.closest<HTMLElement>(".cat-card")!.dataset.id!)?.name ?? ""}, ${element.querySelector(":scope > .cat-label")?.textContent ?? ""}`;
    return byId.get(key)?.name ?? key;
  }
  /** The pointer on the board: `cam` is measured from the canvas's own corner, not the window's. */
  function boardAt(event: PointerEvent) {
    const box = viewport.getBoundingClientRect();
    return { x: (event.clientX - box.left - cam.x) / cam.z, y: (event.clientY - box.top - cam.y) / cam.z };
  }
  function moveTo(event: PointerEvent) {
    if (!move) return;
    // The button came up where the board never heard it (over another window, say): the drag ends there, kept, as
    // the release was the person's own; a capture taken away (lostpointercapture) was not, so that one puts it back.
    if (event.pointerType === "mouse" && event.buttons === 0) { endMove("drop"); return; }
    move.lx = event.clientX; move.ly = event.clientY;
    if (!move.moved) {
      if (Math.hypot(event.clientX - move.sx, event.clientY - move.sy) <= 4) return;
      move.moved = true;
      root.classList.add("is-moving");
      pieceOf(move.key)?.classList.add("is-moving");
      if (placeKey() !== move.key) selectPiece(move.key, false);
    }
    const now = boardAt(event), dx = now.x - move.bx, dy = now.y - move.by;
    const at = snapMove({ ...move.base, x: move.base.x + move.from.x + dx, y: move.base.y + move.from.y + dy }, move.others, 6 / cam.z);
    setPlace(move.key, { x: Math.round(at.x - move.base.x), y: Math.round(at.y - move.base.y) }, false);
    move.guides = at.guides;
    drawGuides(at.guides);
  }
  /** `drop` keeps the card where it is, `cancel` (Escape, a cancelled pointer) puts it back; a press that never moved is a tap. */
  function endMove(outcome: "drop" | "cancel") {
    if (!move) return;
    const { key, moved, from, target } = move;
    move = undefined;
    drawGuides([]);
    root.classList.remove("is-moving");
    pieceOf(key)?.classList.remove("is-moving");
    if (!moved) { if (outcome === "drop") tap(target); return; }
    // Put back: the stored places never had the drag in them, so they stay as they are.
    if (outcome === "cancel") setPlace(key, from, false);
    else { writePlaces(store, places); say(`${pieceName(key)} moved`); }
  }
  /** Guides in screen space, so they stay one pixel at every zoom. */
  function drawGuides(guides: readonly Guide[]) {
    guideLayer.replaceChildren(...guides.map((guide) => {
      const line = el("div", "cat-guide");
      line.dataset.axis = guide.axis;
      const at = guide.at * cam.z + (guide.axis === "x" ? cam.x : cam.y);
      const from = guide.from * cam.z + (guide.axis === "x" ? cam.y : cam.x), length = `${(guide.to - guide.from) * cam.z}px`;
      line.style.transform = guide.axis === "x" ? `translate(${at}px, ${from}px)` : `translate(${from}px, ${at}px)`;
      if (guide.axis === "x") line.style.blockSize = length; else line.style.inlineSize = length;
      return line;
    }));
  }

  // ---------- Pointers: drag to pan, two fingers to pinch, a tap selects, a double tap fits ----------

  const points = new Map<number, { x: number; y: number }>();
  let drag: { id: number; sx: number; sy: number; lx: number; ly: number; moved: boolean; target: Element } | undefined;
  let pinch: { mx: number; my: number; d: number } | undefined;
  let lastTap = { t: 0, id: "" };
  const pinchNow = () => {
    const [a, b] = [...points.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  function beginPan(id: number) {
    drag!.moved = true;
    try { viewport.setPointerCapture(id); } catch { /* The pointer is gone already. */ }
    startGesture();
    root.classList.add("is-panning");
  }
  /** A press in a live cell uses the part: it selects the card, and never pans or opens a sheet. */
  function press(article: HTMLElement | null) {
    const id = article?.dataset.id;
    if (id && selected !== id) select(id, false);
  }
  // The keyboard reaching a live cell selects its card too, and brings the card into view when the focus is off screen
  // or too small to see; a pointer's press leaves the board where it is.
  let byPointer = false;
  document.addEventListener("pointerdown", () => { byPointer = true; }, true);
  document.addEventListener("keydown", () => { byPointer = false; }, true);
  world.addEventListener("cat-frame-press", (event) => { byPointer = true; press((event.target as Element).closest<HTMLElement>(".cat-card[data-id]")); });
  world.addEventListener("cat-frame-key", () => { byPointer = false; });
  // Enter or Space on a screen's label picks it (and opens its options below wide widths), as a press does.
  world.addEventListener("keydown", (event) => {
    const label = (event.target as Element).closest<HTMLElement>(".cat-half[data-piece] > .cat-label");
    if (!label || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    selectPiece(label.parentElement!.dataset.piece!);
  });
  world.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement;
    const holder = target.matches(".cat-half[data-piece] > .cat-label") ? target.parentElement : null;
    if (holder && placeKey() !== holder.dataset.piece) selectPiece(holder.dataset.piece!, false);
    const article = target.closest('[data-cell="live"]') ? target.closest<HTMLElement>(".cat-card[data-id]") : null;
    if (!article) return;
    press(article);
    if (byPointer) return;
    // Measured on the focused control itself: inside a live cell's shadow root the event names its host, which has no box.
    const focused = event.composedPath()[0] as Element;
    const box = focused.getBoundingClientRect(), view = viewport.getBoundingClientRect();
    if (cam.z < 0.5 || box.left < view.left || box.top < view.top || box.right > view.right || box.bottom > view.bottom) flyToCard(article.dataset.id!);
  });
  viewport.addEventListener("pointerdown", (event) => {
    const target = event.target as Element;
    if (target.closest(".cat-zoombar, .cat-search")) return;
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    // A drag whose end the board never heard (the pointer let go elsewhere) ends before anything new starts. A second
    // finger during a touch drag turns it into a pinch, as in Figma: the card goes back and both fingers zoom.
    if (move && event.pointerId !== move.pointer && event.pointerType !== "mouse") {
      const first = { id: move.pointer, x: move.lx, y: move.ly };
      endMove("cancel");
      points.set(first.id, { x: first.x, y: first.y });
      drag = { id: first.id, sx: first.x, sy: first.y, lx: first.x, ly: first.y, moved: true, target: viewport };
    } else if (move) endMove("drop");
    // A name label is the handle: dragging it moves what it names (with Space held, the board pans as anywhere else).
    const grip = !spaceHeld && event.button === 0 && points.size === 0 ? gripOf(target) : null;
    if (grip?.parentElement?.dataset.piece) { startMove(event, grip.parentElement); return; }
    if (!spaceHeld && event.button === 0 && target.closest(".cat-live__stage > *")) { press(target.closest<HTMLElement>(".cat-card[data-id]")); return; }
    stopFlight();
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size === 1) {
      drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, lx: event.clientX, ly: event.clientY, moved: false, target: event.target as Element };
      if (spaceHeld || event.button === 1) { event.preventDefault(); beginPan(event.pointerId); }
    } else if (points.size === 2) {
      if (drag) drag.moved = true;
      pinch = pinchNow();
      startGesture();
      for (const id of points.keys()) { try { viewport.setPointerCapture(id); } catch { /* The pointer is gone already. */ } }
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    if (move?.pointer === event.pointerId) { moveTo(event); return; }
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && points.size >= 2) {
      const now = pinchNow(), box = viewport.getBoundingClientRect();
      cam.x += now.mx - pinch.mx; cam.y += now.my - pinch.my;
      zoomAt(now.mx - box.left, now.my - box.top, now.d / pinch.d);
      pinch = now;
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > 4) beginPan(event.pointerId);
    if (drag.moved) { cam.x += event.clientX - drag.lx; cam.y += event.clientY - drag.ly; apply(); }
    drag.lx = event.clientX; drag.ly = event.clientY;
  });
  function endPointer(event: PointerEvent) {
    if (move?.pointer === event.pointerId) { endMove(event.type === "pointerup" ? "drop" : "cancel"); return; }
    if (!points.has(event.pointerId)) return;
    points.delete(event.pointerId);
    if (pinch && points.size < 2) {
      pinch = undefined;
      const rest = [...points.entries()][0];
      drag = rest ? { id: rest[0], sx: rest[1].x, sy: rest[1].y, lx: rest[1].x, ly: rest[1].y, moved: true, target: viewport } : undefined;
      if (!rest) { root.classList.remove("is-panning"); settleSoon(); }
      return;
    }
    if (drag && drag.id === event.pointerId) {
      if (!drag.moved && event.type === "pointerup") tap(drag.target);
      drag = undefined;
      root.classList.remove("is-panning");
      settleSoon();
    }
  }
  viewport.addEventListener("pointerup", endPointer);
  // The board lost the pointer mid-drag (another window took it): the card goes back where it was.
  viewport.addEventListener("lostpointercapture", (event) => { if (move?.pointer === event.pointerId) endMove("cancel"); });
  // A made-of link pressed from the keyboard (a pointer's press is a tap, above).
  world.addEventListener("click", (event) => {
    const fly = (event.target as Element).closest<HTMLElement>("[data-fly]");
    if (fly && event.detail === 0) go(fly.dataset.fly!);
  });
  viewport.addEventListener("pointercancel", endPointer);
  function tap(target: Element) {
    const now = performance.now();
    const fly = target.closest<HTMLElement>("[data-fly]");
    if (fly) { go(fly.dataset.fly!); return; }
    const article = target.closest<HTMLElement>(".cat-card[data-id]"), label = target.closest<HTMLElement>(".cat-area__label");
    // A screen's own label picks that screen, as a card's title picks the card.
    const holder = gripOf(target)?.parentElement, screen = holder?.matches(".cat-half") ? holder.dataset.piece : undefined;
    if (mode() !== "wide" && root.dataset.sheet === "outline") setSheet("");
    if (article) {
      const id = article.dataset.id!;
      // A double tap is two on the same thing: a card, or one of its screens.
      const same = screen ?? id;
      const twice = lastTap.id === same && now - lastTap.t < 340 && !target.closest("button, input, select");
      if (twice) { lastTap = { t: 0, id: "" }; flyToCard(id, 2); return; }
      lastTap = { t: now, id: same };
      // The label's focus may have picked the screen already (a press focuses it): the sheet still opens below wide widths.
      if (screen) { if (picked !== screen) select(id, true, screen); else if (mode() !== "wide") setSheet("options"); }
      else if (selected !== id || picked) select(id);
      return;
    }
    lastTap = { t: 0, id: "" };
    if (label) { selectPiece(label.parentElement!.dataset.piece!, false); flyToArea(label.dataset.area as AreaKey); return; }
    if (mode() !== "wide") setSheet("");
    select(undefined);
  }

  // ---------- Start ----------

  paintMarks();
  renderInspector();
  let last: { w: number; h: number } | undefined, moved = false;
  // The shared values area opens in view; on a phone its first card, as the whole area would be too small to read.
  // `#plans` (where /mockups/ leads) opens on the planning mock-ups instead: every map's area in view.
  const onPlans = location.hash === "#plans" && plans.areas.length > 0;
  const firstView = () => {
    // On a phone every area at once would be too small to read: it opens on the first card, as the shared values do.
    if (onPlans) Object.assign(cam, mode() === "phone" ? camFor(cardRect(plans.mockups[0].id), 1, 16) : camFor(boundsOf(plans.areas.map((area) => areaRect(area.id)))!, 1, 24));
    else Object.assign(cam, mode() === "phone" ? camFor(cardRect(ENTRIES[0].id), 1, 16) : camFor(areaRect("values"), 1, 24));
    settle();
  };
  for (const type of ["pointerdown", "wheel", "keydown"]) root.addEventListener(type, () => { moved = true; }, { once: true, capture: true });
  new ResizeObserver(() => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    if (!last) firstView();
    else { cam.x += (w - last.w) / 2; cam.y += (h - last.h) / 2; apply(); }
    last = { w, h };
  }).observe(viewport);
  // Once the parts have drawn, the shared values fit again, unless someone has moved the board already.
  void Promise.allSettled(drawing).then(() => requestAnimationFrame(() => { if (last && !moved && !selected) firstView(); }));
  // Frames and lazy parts change their cards' size as they arrive: keep the selection outline on its card.
  new ResizeObserver(() => { placeSel(); cull(); }).observe(world);
  void readApprovals(target).then((fresh) => {
    if (!fresh) return;
    // Approvals are only ever added: the branch's and this page's together.
    approvals = { approved: { ...fresh.approved, ...approvals.approved } };
    paintMarks();
    refreshReview();
  });
  // Back from signing in in another tab: the parts that asked for it read the session again.
  addEventListener("focus", () => {
    const waiting = [...saving].filter(([, save]) => save.note === "signed-out").map(([id]) => id);
    if (!waiting.length) return;
    void signedInAs().then((login) => {
      if (!login) return;
      for (const id of waiting) saving.delete(id);
      refreshReview();
      void readApprovals(target).then((fresh) => {
        if (!fresh) return;
        approvals = { approved: { ...fresh.approved, ...approvals.approved } };
        paintMarks();
        refreshReview();
      });
    });
  });
}
