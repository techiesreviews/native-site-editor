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
import { icon } from "../icons";
import { caretFlag, placeTag, type CaretWho, type Tagged } from "./caret-flag";
// The tag's look is its own module (src/components/caret-flag.ts), which a guest's page draws too.
export { programMark, rightToLeft } from "./caret-flag";
import { githubScope, same } from "../workspace-session";
import { participants } from "../participant";

/** A caret's colour: a synced session's guest in the colour Lex's tab gave them (`g` and its index, src/theme.css
 * `--guest-N`), anyone else from the tab's participants (src/participant.ts), so an agent's caret matches its outline and pin. */
const colourOf = (caret: CaretWho) => caret.guest === undefined ? String(participants.caret(caret).colour) : `g${caret.guest}`;
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
        if (!can.has(author)) can.set(author, !widget.caret.contested && widget.caret.guest === undefined && share.canUndo(author));
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
    const flag = caretFlag(caret, { icon: icon("undo", 12), onUndo: () => { share.undo(made.caret.author, pane.history()); askUndo(); } });
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
  // Monaco hides a caret laid out inside a fold and leaves it hidden when the fold opens: each is laid out again then.
  const folds = editor.onDidChangeHiddenAreas(drawSoon);
  const stopCarets = share.onCarets(drawSoon);
  const stopUndo = share.onAuthorUndo(askUndo);
  draw();

  return () => {
    moved.dispose();
    options.dispose();
    folds.dispose();
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

/** The overlay controls a circle gives way to, where a press goes to the control and not to a caret's circle standing over it:
 * the edit bar's (not a disabled one), the agents' pins and their tray, and the card grid's Add and its looks. The insert
 * points' plus fades in as the pointer nears and is left out: it was level with the circles before, and is under them. */
const CONTROLS = ".edit-bar :is(button, input, select, textarea, a[href], [role=button], [role=combobox], [role=menuitem]):not(:disabled, [aria-disabled=true]), .agent-pin, .agent-pins__tray, .card-ghost__add, .card-ghost__looks";
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
/** What a circle gives way to among the overlay `controls` (live-carets.css `data-over-control`): `circle` when its middle is
 * over a control (it takes no press), `pad` when it only touches one or its press `area` does (the area goes, the circle
 * stays pressable, so its target is then smaller than the 24 px, 44 px on touch, on purpose), none when it is clear of them. */
export function overControlState(circle: Box, area: Box, controls: Box[]): "circle" | "pad" | undefined {
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
  // The circles stand above the edit bar and the pins (live-carets.css), so where one reaches a control the control answers:
  // a circle whose middle is over a control shows but takes no press (`circle`); one that only touches a control, or whose
  // press area does, gives up the area (`pad`) and still takes presses on the circle. The controls' own boxes and their
  // blank parts let presses pass to the circle. The bar moves with the selection, with no news for the carets.
  let barDue = 0;
  const overBar = () => {
    barDue = 0;
    if (!widgets.size) return;
    // Only a control that takes a press now (the bar's faded parts have presses off). One still fading in counts: its fade ends
    // with no news for the carets.
    const controls = [...page.layer.querySelectorAll(CONTROLS)].filter(control => !layer.contains(control) && getComputedStyle(control).pointerEvents !== "none"
      && control.checkVisibility({ visibilityProperty: true })).map(control => control.getBoundingClientRect()).filter(box => box.width > 0);
    for (const widget of widgets.values()) {
      if (widget.root.hidden) { widget.root.removeAttribute("data-over-control"); continue; }
      const mark = widget.flag.element.querySelector(".live-caret__mark")!, circle = mark.getBoundingClientRect();
      const press = getComputedStyle(mark, "::after");
      const state = overControlState(circle, pressArea(circle, parseFloat(press.width), parseFloat(press.height), widget.root.hasAttribute("data-below")), controls);
      if (state === undefined) widget.root.removeAttribute("data-over-control");
      else if (widget.root.getAttribute("data-over-control") !== state) widget.root.setAttribute("data-over-control", state);
    }
  };
  const overBarSoon = () => { barDue ||= requestAnimationFrame(overBar); };
  const barMoved = new MutationObserver(records => { if (records.some(record => !layer.contains(record.target))) overBarSoon(); });
  barMoved.observe(page.layer, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  // A pin grows on focus or hover (and shrinks back when they leave), and a control's fade or slide ends, with no attribute
  // written: those are looked at too, except what happens in the carets' own layer.
  const GROWTH = ["focusin", "focusout", "pointerover", "pointerout", "transitionend", "animationend"] as const;
  const grew = (event: Event) => { if (!layer.contains(event.target as Node)) overBarSoon(); };
  for (const type of GROWTH) page.layer.addEventListener(type, grew, true);
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
        if (!can.has(author)) can.set(author, !widget.caret.contested && widget.caret.guest === undefined && share.canUndo(author));
        widget.flag.undoable(!widget.leaving && can.get(author)!);
      }
    });
  };
  const widget = (caret: LiveCaret): Widget => {
    const root = document.createElement("div");
    root.className = "live-caret";
    // Hidden until the frame says where it is.
    root.hidden = true;
    const flag = caretFlag(caret, { icon: icon("undo", 12), onUndo: () => {
      // A second claim of its author, or the caret going, takes the undo away in the next frame: not taken meanwhile.
      if (made.caret.contested || made.leaving) return;
      share.undo(made.caret.author);
      askUndo();
    } });
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
    for (const type of GROWTH) page.layer.removeEventListener(type, grew, true);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(asking);
    cancelAnimationFrame(barDue);
    page.show([]);
    for (const gone of widgets.values()) { clearTimeout(gone.leaving); remove(gone); }
    widgets.clear();
    layer.remove();
  };
}
