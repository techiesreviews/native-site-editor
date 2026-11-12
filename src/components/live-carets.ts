// Others' carets in the code pane (ticket am-22), loaded with Yjs once someone else has the open file
// open (src/live-text.ts), never at boot. Each one is a thin line in its colour with a small circle on top:
// the person's first letter, or for an agent a tiny icon of its program. Hover or keyboard focus opens the
// circle into the full name; while that author's latest change can be taken back (`LiveText.canUndoAuthor`)
// the tag ends with an undo button, which takes it back for everyone. A selection shows as a light tint.
//
// The text itself still goes through the draft store, not a `y-monaco` binding: that binding writes remote
// changes straight into Monaco's model, past the store's history and its per-person Undo (ticket am-24).
// Carets come from the room's own presence (src/live-room.ts), so `y-protocols` awareness is not needed.
// The caret look is shared with the page's carets (ticket am-23): `caretFlag` builds the tag.
//
// On the page (ticket am-23) the same carets show in the page's text, drawn over the preview's frame: the frame
// finds where each one is (src/components/page-caret-port.ts) and this module draws the line, the tag and a
// selection's tint there, with no element highlight. Typing on the page tells the room where this tab's caret is,
// as the code pane does.
import "./live-carets.css";
import type { CaretSelection, CaretShare, LiveCaret } from "../live-text";
import type { monaco as Monaco } from "./monaco";
import { caretPanes, watchCaretPanes, type CaretPane } from "./source-editor";
import { pageCarets, watchPageCarets, type PageCaretPoint, type PageCaretRect, type PageCarets } from "./page-caret-port";
import { sourceOffsetOfText, textPointAt } from "../native-source-location";
import { icon, svgElement } from "../icons";
import { githubScope, same } from "../workspace-session";
import { initialOf, participants } from "../participant";

/** Who a caret is: its colour (the presence colours, src/theme.css) and its name come from the tab's participants
 * (src/participant.ts), so an agent's caret matches its outline and pin. */
type CaretWho = Pick<LiveCaret, "author" | "name" | "agent" | "who">;
const colourOf = (caret: CaretWho) => participants.caret(caret).colour;

/** Tiny marks of the programs agents work in, by their MCP client's name; any other agent gets the plain one. */
const PROGRAMS: [RegExp, string][] = [
  [/claude/i, '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'],
  [/codex|openai|chatgpt|gpt/i, '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/>'],
  [/gemini/i, '<path d="M12 3c.6 4.6 3.4 7.4 9 9-5.6 1.6-8.4 4.4-9 9-.6-4.6-3.4-7.4-9-9 5.6-1.6 8.4-4.4 9-9Z"/>'],
];
const PLAIN_AGENT = '<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 4v3M9.5 12.5h.01M14.5 12.5h.01"/>';
/** The mark of `agent`'s program (exported for its unit test). */
export function programMark(agent: string) {
  return PROGRAMS.find(([pattern]) => pattern.test(agent))?.[1] ?? PLAIN_AGENT;
}
function programIcon(agent: string) {
  return svgElement(`<svg class="live-caret__program" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${programMark(agent)}</svg>`);
}

/** Whether `name`'s first strong letter is written right to left (Hebrew, Arabic, Syriac, Thaana, N'Ko, …). */
export const rightToLeft = (name: string) =>
  /^[^\p{L}]*[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u.test(name);

/** A caret's name tag: the circle, the rest of the name and the undo button (shown while `undoable`). */
export function caretFlag(caret: CaretWho, onUndo: () => void) {
  const flag = document.createElement("span");
  flag.className = "live-caret__flag";
  flag.tabIndex = 0;
  // A group takes its name from aria-label: screen readers say whose caret has focus.
  flag.setAttribute("role", "group");
  const mark = document.createElement("span");
  mark.className = "live-caret__mark";
  const rest = document.createElement("span");
  rest.className = "live-caret__name";
  rest.setAttribute("aria-hidden", "true");
  // A tag opened to the left reads its name whole, its first letter included.
  const initial = document.createElement("span");
  initial.className = "live-caret__initial";
  const after = document.createTextNode("");
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "live-caret__undo";
  undo.hidden = true;
  undo.append(icon("undo", 12));
  undo.addEventListener("click", event => {
    event.stopPropagation();
    onUndo();
  });
  // Monaco takes a press inside the editor as a click in the text: the tag keeps its own. A press on the circle opens the
  // tag (focus), on touch too, where nothing hovers.
  // (Monaco hears touches at the document and would take focus into the code.) The press focuses the tag or its undo
  // without scrolling: a browser's own focus would scroll Monaco's inner layers and move the code under the caret.
  for (const type of ["mousedown", "pointerdown", "touchstart", "touchend"] as const) flag.addEventListener(type, event => event.stopPropagation());
  flag.addEventListener("mousedown", event => {
    event.preventDefault();
    ((event.target as Element).closest("button") ?? flag).focus({ preventScroll: true });
  });
  flag.append(mark, rest, undo);
  const name = (next: CaretWho) => {
    const full = participants.caret(next).name;
    if (flag.dataset.name === full && flag.dataset.agent === next.agent) return;
    flag.dataset.name = full;
    if (next.agent === undefined) {
      delete flag.dataset.agent;
      const parts = initialOf(full);
      const letter = document.createElement("b");
      letter.textContent = parts.letter;
      mark.replaceChildren(letter);
      initial.textContent = parts.first;
      after.textContent = parts.rest;
      rest.replaceChildren(initial, after);
      // A name that cannot read on from a circle on its left shows whole: a right-to-left one, in its own direction, and
      // one whose initial (src/participant.ts `initialOf`: a letter, digit or symbol) is not its first character, "@ben".
      flag.toggleAttribute("data-whole", rightToLeft(full) || !/^[\p{L}\p{N}\p{So}]/u.test(full));
    } else {
      flag.removeAttribute("data-whole");
      flag.dataset.agent = next.agent;
      mark.replaceChildren(programIcon(next.agent));
      rest.textContent = full;
    }
    rest.dir = "auto";
    rest.title = full;
    flag.setAttribute("aria-label", full);
    undo.setAttribute("aria-label", `Undo ${full}'s change`);
    undo.title = `Undo ${full}'s change`;
    changed?.();
  };
  let changed: (() => void) | undefined;
  name(caret);
  return {
    element: flag,
    name,
    /** Shows or hides the undo button; a focused button that goes keeps focus on the tag. */
    undoable(can: boolean) {
      if (undo.hidden === !can) return;
      const focused = document.activeElement === undo;
      undo.hidden = !can;
      if (focused && !can) flag.focus();
      changed?.();
    },
    /** Called when the tag's width may have changed (its name, its undo). */
    onResize(listener: () => void) { changed = listener; },
  };
}

/** Draws `share`'s carets in every code pane showing its file and on the page, and tells it where this tab's caret is. */
export function startCarets(share: CaretShare): () => void {
  const attached = new Map<CaretPane | PageCarets, () => void>();
  /** Each pane's (and the page's) caret reader, in the order their carets last moved: the room is told the newest one's. */
  const readers = new Map<CaretPane | PageCarets, () => CaretSelection | undefined>();
  const moved = (owner: CaretPane | PageCarets, read: () => CaretSelection | undefined) => {
    readers.delete(owner);
    readers.set(owner, read);
    share.own(read);
  };
  // The caret told goes (its pane closed, typing on the page ended): the room is told the newest one still there, if any.
  const gone = (owner: CaretPane | PageCarets) => {
    const wasNewest = [...readers.keys()].at(-1) === owner;
    readers.delete(owner);
    if (wasNewest) share.own([...readers.values()].at(-1));
  };
  const ours = (pane: CaretPane) => pane.path === share.path && same(githubScope(pane.scope), githubScope(share.scope));
  const sync = () => {
    const panes = caretPanes(), pages = pageCarets();
    for (const [owner, detach] of attached) if (!(panes as readonly object[]).includes(owner) && !(pages as readonly object[]).includes(owner)) {
      detach();
      attached.delete(owner);
      gone(owner);
    }
    for (const pane of panes) if (!attached.has(pane) && ours(pane)) attached.set(pane, attach(share, pane, read => moved(pane, read)));
    // The page shows the editor's own workspace, the one shared: its files are checked as it shows them.
    for (const page of pages) if (!attached.has(page)) attached.set(page, attachPage(share, page, read => read ? moved(page, read) : gone(page)));
    if (!readers.size) share.own(undefined);
  };
  const unwatchPanes = watchCaretPanes(sync), unwatchPages = watchPageCarets(sync);
  sync();
  return () => {
    unwatchPanes();
    unwatchPages();
    for (const detach of attached.values()) detach();
    attached.clear();
    readers.clear();
    share.own(undefined);
  };
}

/** How long a caret takes to fade out before it goes (its CSS transition). */
const FADE_MS = 160;

type Tagged = { root: HTMLElement; flag: ReturnType<typeof caretFlag>; width?: number; half?: number };
/** The open tag stays in its pane at every width: it opens on the side of the caret with room for it (the right unless only
 * the left has it), and its name is cut to the room there (`--live-caret-room`), so its undo always shows. On the pane's
 * top line it sits below the caret. `x` and `top`: the caret in the room the pane leaves for tags, `width` wide. The tag's
 * natural width and its circle are measured once it shows, and the width again only when its name or undo changed. */
function placeTag(widget: Tagged, x: number, top: number, width: number) {
  const flag = widget.flag.element;
  if (flag.offsetParent === null) return;
  const name = flag.querySelector<HTMLElement>(".live-caret__name");
  widget.width ??= flag.scrollWidth - (name?.clientWidth ?? 0) + (name?.scrollWidth ?? 0);
  widget.half ??= flag.querySelector<HTMLElement>(".live-caret__mark")!.offsetWidth / 2;
  const half = widget.half;
  const right = width - x + half, left = x + half;
  const flip = widget.width > right && left > right;
  widget.root.toggleAttribute("data-flip", flip);
  widget.root.toggleAttribute("data-below", top < half * 2 + 2);
  widget.root.style.setProperty("--live-caret-room", `${Math.floor(flip ? left : right)}px`);
}

function attach(share: CaretShare, pane: CaretPane, told: (read: () => CaretSelection | undefined) => void) {
  const { editor, monaco } = pane;
  const model = editor.getModel();
  if (!model) return () => {};
  const { CursorChangeReason, ContentWidgetPositionPreference, EditorOption } = monaco.editor;
  // Read when the room is told, not when the caret moved: a caret placed before this tab caught up is told where it is in
  // the shared text the pane then shows (others' text moving it reports nothing, below).
  const read = () => {
    const selection = editor.getSelection();
    if (!selection || model.isDisposed()) return undefined;
    return {
      anchor: model.getOffsetAt({ lineNumber: selection.selectionStartLineNumber, column: selection.selectionStartColumn }),
      head: model.getOffsetAt(selection.getPosition()),
    };
  };
  const own = () => told(read);
  // Others' text moving this caret along is not a move of its own: its relative position already follows.
  const moved = editor.onDidChangeCursorSelection(event => {
    if (event.reason !== CursorChangeReason.RecoverFromMarkers && event.reason !== CursorChangeReason.ContentFlush) own();
  });
  own();

  type Widget = Monaco.editor.IContentWidget & { root: HTMLElement; flag: ReturnType<typeof caretFlag>; caret: LiveCaret; leaving?: ReturnType<typeof setTimeout>; width?: number; half?: number };
  const widgets = new Map<string, Widget>();
  const tints = editor.createDecorationsCollection();
  let frame = 0, asking = 0;
  const position = (offset: number) => model.getPositionAt(Math.min(offset, model.getValueLength()));

  /** Whose changes the name tags can take back: asked once a frame for every caret, only when that may have changed. */
  const askUndo = () => {
    if (asking) return;
    asking = requestAnimationFrame(() => {
      asking = 0;
      const can = new Map<number, boolean>();
      for (const widget of widgets.values()) {
        const author = widget.caret.author;
        if (!can.has(author)) can.set(author, !widget.caret.contested && share.canUndo(author));
        widget.flag.undoable(!widget.leaving && can.get(author)!);
      }
    });
  };

  /** The tag placed in the pane's code area (`placeTag`), measured once Monaco shows it (a new widget stays hidden until
   * its first render). Monaco places it again after every render it gets. */
  const place = (widget: Widget, rendered?: { top: number; left: number }) => {
    // Inside Monaco's render its own coordinate is used: asking Monaco for a position then would render again.
    const layout = editor.getLayoutInfo();
    const at = rendered ? { top: rendered.top, left: layout.contentLeft + rendered.left - editor.getScrollLeft() }
      : editor.getScrolledVisiblePosition(position(widget.caret.head));
    if (at) placeTag(widget, at.left - layout.contentLeft, at.top, layout.width - layout.verticalScrollbarWidth - layout.contentLeft);
  };
  const widget = (caret: LiveCaret): Widget => {
    const root = document.createElement("div");
    root.className = "live-caret";
    const flag = caretFlag(caret, () => { share.undo(made.caret.author, pane.history()); askUndo(); });
    const line = document.createElement("span");
    line.className = "live-caret__line";
    root.append(line, flag.element);
    const made: Widget = {
      root, flag, caret,
      getId: () => `live-caret:${caret.peer}`,
      getDomNode: () => root,
      getPosition: () => ({ position: position(made.caret.head), preference: [ContentWidgetPositionPreference.EXACT] }),
      // Rendered (first shown, scrolled, the pane resized): the tag looks at its room again.
      afterRender: (shown, at) => { if (shown !== null && at) place(made, at); },
    };
    flag.onResize(() => { made.width = undefined; place(made); });
    editor.addContentWidget(made);
    return made;
  };

  const draw = () => {
    frame = 0;
    if (model.isDisposed()) return;
    const carets = share.carets(), seen = new Set<string>();
    let added = false;
    for (const caret of carets) {
      seen.add(caret.peer);
      let found = widgets.get(caret.peer);
      // Back before it went: its undo is asked for again.
      if (found?.leaving) { clearTimeout(found.leaving); found.leaving = undefined; found.root.removeAttribute("data-leaving"); added = true; }
      if (!found) { widgets.set(caret.peer, found = widget(caret)); added = true; }
      if (found.caret.author !== caret.author || found.caret.contested !== caret.contested) added = true;
      found.caret = caret;
      found.flag.name(caret);
      found.root.dataset.colour = String(colourOf(caret));
      editor.layoutContentWidget(found);
    }
    for (const [peer, gone] of widgets) {
      if (seen.has(peer) || gone.leaving) continue;
      gone.root.dataset.leaving = "";
      gone.flag.undoable(false);
      gone.leaving = setTimeout(() => {
        // Keyboard focus on a tag that goes returns to the code, not to the page.
        if (gone.root.contains(document.activeElement)) editor.focus();
        widgets.delete(peer);
        editor.removeContentWidget(gone);
      }, FADE_MS);
    }
    tints.set(carets.filter(caret => caret.anchor !== caret.head).map(caret => {
      const start = Math.min(caret.anchor, caret.head), end = Math.max(caret.anchor, caret.head);
      return { range: monaco.Range.fromPositions(position(start), position(end)),
        options: { className: `live-caret-tint live-caret-tint--${colourOf(caret)}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } };
    }));
    if (added) askUndo();
  };
  const drawSoon = () => { frame ||= requestAnimationFrame(draw); };
  const lineHeight = () => editor.getDomNode()?.style.setProperty("--live-caret-line", `${editor.getOption(EditorOption.lineHeight)}px`);
  lineHeight();
  const options = editor.onDidChangeConfiguration(event => { if (event.hasChanged(EditorOption.lineHeight)) lineHeight(); });
  const stopCarets = share.onCarets(drawSoon);
  const stopUndo = share.onAuthorUndo(askUndo);
  draw();

  return () => {
    moved.dispose();
    options.dispose();
    stopCarets();
    stopUndo();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(asking);
    tints.clear();
    editor.getDomNode()?.style.removeProperty("--live-caret-line");
    for (const gone of widgets.values()) { clearTimeout(gone.leaving); editor.removeContentWidget(gone); }
    widgets.clear();
  };
}

/** The edit bar's controls: where a press goes to the bar and not to a caret's circle standing over it. */
const BAR_CONTROLS = "button, input, select, textarea, a[href], [role=button], [role=combobox], [role=menuitem]";
interface Box { left: number; right: number; top: number; bottom: number }
/** The circle's press area (live-carets.css `.live-caret__mark::after`: `width` by `height`, centred on the circle, its foot
 * 2 px above the circle's, reaching down from 2 px below its top for a tag below), joined with the circle itself. */
export function pressArea(mark: Box, width: number, height: number, below: boolean): Box {
  const middle = (mark.left + mark.right) / 2;
  const top = below ? mark.top + 2 : mark.bottom - 2 - height;
  return { left: Math.min(mark.left, middle - width / 2), right: Math.max(mark.right, middle + width / 2),
    top: Math.min(mark.top, top), bottom: Math.max(mark.bottom, top + height) };
}
/** Whether two boxes share any area. */
const boxesMeet = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** What a circle gives way to among the edit bar's `controls` (live-carets.css `data-over-bar`): `circle` when its middle is
 * over a control (it takes no press), `pad` when it only touches one or its press `area` does (the area goes, the circle
 * stays pressable, so its target is then smaller than the 24 px, 44 px on touch, on purpose), none when it is clear of them. */
export function overBarState(circle: Box, area: Box, controls: Box[]): "circle" | "pad" | undefined {
  const x = (circle.left + circle.right) / 2, y = (circle.top + circle.bottom) / 2;
  if (controls.some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) return "circle";
  return controls.some(box => boxesMeet(circle, box) || boxesMeet(area, box)) ? "pad" : undefined;
}

/**
 * Draws `share`'s carets on the page (ticket am-23), over the preview's frame where the frame finds them in the page's
 * text, and tells `told` where this tab's caret is while it types on the page (none once typing ends there).
 */
function attachPage(share: CaretShare, page: PageCarets, told: (read: (() => CaretSelection | undefined) | undefined) => void) {
  const shows = () => page.files().includes(share.path);
  // Read in the file's text each time the room is told, from the element and text offsets the frame reports.
  const read = () => {
    const caret = page.own(), source = caret?.path === share.path ? page.source(share.path) : undefined;
    if (!caret || source === undefined) return undefined;
    const anchor = sourceOffsetOfText(source, caret.node, caret.anchor), head = sourceOffsetOfText(source, caret.node, caret.head);
    return anchor === undefined || head === undefined ? undefined : { anchor, head };
  };
  let ownKey = "";
  const ownMoved = () => {
    const caret = page.own();
    const key = caret?.path === share.path && shows() ? JSON.stringify(caret) : "";
    if (key === ownKey) return;
    const had = ownKey !== "";
    ownKey = key;
    if (key) told(read);
    else if (had) told(undefined);
  };

  const layer = document.createElement("div");
  layer.className = "live-carets-page";
  page.layer.append(layer);
  type Widget = Tagged & { caret: LiveCaret; tints: HTMLElement[]; at?: { left: number; top: number }; leaving?: ReturnType<typeof setTimeout> };
  const widgets = new Map<string, Widget>();
  let frame = 0, asking = 0;
  /** Over the frame, its border left out: the frame's viewport, where its carets are measured. */
  const fit = () => {
    const box = page.frame.getBoundingClientRect(), pane = page.layer.getBoundingClientRect();
    layer.style.left = `${box.left - pane.left + page.frame.clientLeft}px`;
    layer.style.top = `${box.top - pane.top + page.frame.clientTop}px`;
    layer.style.width = `${page.frame.clientWidth}px`;
    layer.style.height = `${page.frame.clientHeight}px`;
  };
  const place = (widget: Widget) => { if (widget.at) placeTag(widget, widget.at.left, widget.at.top, layer.clientWidth); };
  // The circles stand above the edit bar (live-carets.css), so where one reaches a control of the bar the control answers:
  // a circle whose middle is over a control shows but takes no press (`circle`); one that only touches a control, or whose
  // press area does, gives up the area (`pad`) and still takes presses on the circle. The bar's own box and its blank parts
  // let presses pass to the circle. The bar moves with the selection, with no news for the carets.
  let barDue = 0;
  const overBar = () => {
    barDue = 0;
    if (!widgets.size) return;
    const controls = [...page.layer.querySelectorAll(`.edit-bar :is(${BAR_CONTROLS})`)].map(control => control.getBoundingClientRect()).filter(box => box.width > 0);
    for (const widget of widgets.values()) {
      const mark = widget.flag.element.querySelector(".live-caret__mark")!, circle = mark.getBoundingClientRect();
      const press = getComputedStyle(mark, "::after");
      const area = pressArea(circle, parseFloat(press.width), parseFloat(press.height), widget.root.hasAttribute("data-below"));
      const state = widget.root.hidden ? undefined : overBarState(circle, area, controls);
      if (state === undefined) widget.root.removeAttribute("data-over-bar");
      else if (widget.root.getAttribute("data-over-bar") !== state) widget.root.setAttribute("data-over-bar", state);
    }
  };
  const overBarSoon = () => { barDue ||= requestAnimationFrame(overBar); };
  const barMoved = new MutationObserver(records => { if (records.some(record => !layer.contains(record.target))) overBarSoon(); });
  barMoved.observe(page.layer, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  // The frame moving or changing size in its pane (a banner above it, the code pane growing) moves no caret in its
  // viewport, so no new positions come: the layer follows the frame by itself.
  const resized = new ResizeObserver(() => { fit(); for (const widget of widgets.values()) place(widget); });
  resized.observe(page.frame);
  resized.observe(page.layer);

  /** Whose changes the name tags can take back: asked once a frame for every caret, only when that may have changed. */
  const askUndo = () => {
    if (asking) return;
    asking = requestAnimationFrame(() => {
      asking = 0;
      const can = new Map<number, boolean>();
      for (const widget of widgets.values()) {
        const author = widget.caret.author;
        if (!can.has(author)) can.set(author, !widget.caret.contested && share.canUndo(author));
        widget.flag.undoable(!widget.leaving && can.get(author)!);
      }
    });
  };
  const widget = (caret: LiveCaret): Widget => {
    const root = document.createElement("div");
    root.className = "live-caret";
    // Hidden until the frame says where it is.
    root.hidden = true;
    const flag = caretFlag(caret, () => {
      // A second claim of its author, or the caret going, takes the undo away in the next frame: not taken meanwhile.
      if (made.caret.contested || made.leaving) return;
      share.undo(made.caret.author);
      askUndo();
    });
    const line = document.createElement("span");
    line.className = "live-caret__line";
    root.append(line, flag.element);
    const made: Widget = { root, flag, caret, tints: [] };
    flag.onResize(() => { made.width = undefined; place(made); });
    layer.append(root);
    return made;
  };
  const remove = (widget: Widget) => {
    // Keyboard focus on a tag that goes returns to the page.
    if (widget.root.contains(document.activeElement)) page.frame.focus();
    widget.root.remove();
    for (const tint of widget.tints) tint.remove();
  };

  const draw = () => {
    frame = 0;
    fit();
    const source = shows() ? page.source(share.path) : undefined;
    const points: PageCaretPoint[] = [], seen = new Set<string>();
    let added = false;
    for (const caret of source === undefined ? [] : share.carets()) {
      // Only a caret in the page's text shows there: one in a tag or the head shows in the code pane only.
      const head = textPointAt(source!, caret.head);
      if (!head) continue;
      points.push({ id: caret.peer, path: share.path, head, anchor: caret.anchor === caret.head ? null : textPointAt(source!, caret.anchor) ?? null });
      seen.add(caret.peer);
      let found = widgets.get(caret.peer);
      // Back before it went: its undo is asked for again.
      if (found?.leaving) { clearTimeout(found.leaving); found.leaving = undefined; found.root.removeAttribute("data-leaving"); added = true; }
      if (!found) { widgets.set(caret.peer, found = widget(caret)); added = true; }
      if (found.caret.author !== caret.author || found.caret.contested !== caret.contested) added = true;
      found.caret = caret;
      found.flag.name(caret);
      found.root.dataset.colour = String(colourOf(caret));
    }
    for (const [peer, gone] of widgets) {
      if (seen.has(peer) || gone.leaving) continue;
      gone.root.dataset.leaving = "";
      gone.flag.undoable(false);
      for (const tint of gone.tints) tint.hidden = true;
      gone.leaving = setTimeout(() => { widgets.delete(peer); remove(gone); }, FADE_MS);
    }
    page.show(points);
    if (added) askUndo();
    overBarSoon();
  };
  const drawSoon = () => { frame ||= requestAnimationFrame(draw); };

  const shown = (rects: PageCaretRect[]) => {
    fit();
    for (const { id, caret, tints } of rects) {
      const found = widgets.get(id);
      if (!found || found.leaving) continue;
      found.root.hidden = !caret;
      found.at = caret ? { left: caret.left, top: caret.top } : undefined;
      if (caret) {
        found.root.style.translate = `${caret.left}px ${caret.top}px`;
        found.root.style.setProperty("--live-caret-line", `${caret.height}px`);
        place(found);
      }
      // A selection: a light tint of their colour behind the words, under every caret.
      while (found.tints.length < tints.length) {
        const tint = document.createElement("div");
        layer.prepend(tint);
        found.tints.push(tint);
      }
      found.tints.forEach((tint, index) => {
        const box = tints[index];
        tint.hidden = !box;
        tint.className = `live-caret-tint live-caret-tint--${colourOf(found.caret)}`;
        if (box) Object.assign(tint.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      });
    }
    overBar();
  };
  const stopRects = page.onRects(shown);
  const stopCarets = share.onCarets(drawSoon);
  const stopUndo = share.onAuthorUndo(askUndo);
  const stopPage = page.onChange(() => { ownMoved(); drawSoon(); });
  ownMoved();
  draw();

  return () => {
    stopRects();
    stopCarets();
    stopUndo();
    stopPage();
    resized.disconnect();
    barMoved.disconnect();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(asking);
    cancelAnimationFrame(barDue);
    page.show([]);
    for (const gone of widgets.values()) { clearTimeout(gone.leaving); remove(gone); }
    widgets.clear();
    layer.remove();
  };
}
