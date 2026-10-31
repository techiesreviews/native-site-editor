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
import "./live-carets.css";
import type { CaretSelection, CaretShare, LiveCaret } from "../live-text";
import type { monaco as Monaco } from "./monaco";
import { caretPanes, watchCaretPanes, type CaretPane } from "./source-editor";
import { icon, svgElement } from "../icons";

/** Caret colours, theme tokens (src/theme.css): the presence colours, picked by author so every tab agrees. */
const COLOURS = 4;
export const caretColour = (author: number) => Math.abs(author) % COLOURS;

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

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** The first character a reader sees (a letter with its accents, a whole emoji), and the rest of `name`. */
export function initialOf(name: string) {
  const first = graphemes.segment(name)[Symbol.iterator]().next().value?.segment ?? "";
  // Upper case can make two letters of one ("ß" is "SS"): the circle keeps the first.
  const upper = graphemes.segment(first.toLocaleUpperCase())[Symbol.iterator]().next().value?.segment ?? "";
  return { first, letter: upper, rest: name.slice(first.length) };
}

/** Whether `name`'s first strong letter is written right to left (Hebrew, Arabic, Syriac, Thaana, N'Ko, …). */
export const rightToLeft = (name: string) =>
  /^[^\p{L}]*[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u.test(name);

/** Characters that show nothing: format controls (zero-width spaces, joiners, direction marks) and the Hangul fillers. */
const INVISIBLE = /[\p{Cf}\u115F\u1160\u3164\uFFA0]/gu;
/** The name a tag shows: what the participant says of itself with nothing invisible, or "Someone" / "Agent" for none. */
export function shownName(name: string, agent: boolean) {
  return name.replace(INVISIBLE, "").trim() || (agent ? "Agent" : "Someone");
}

/** A caret's name tag: the circle, the rest of the name and the undo button (shown while `undoable`). */
export function caretFlag(caret: Pick<LiveCaret, "name" | "agent">, onUndo: () => void) {
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
  const name = (next: Pick<LiveCaret, "name" | "agent">) => {
    const full = shownName(next.name, next.agent !== undefined);
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
      // A right-to-left name cannot read on from a circle on its left: it shows whole, in its own direction.
      flag.toggleAttribute("data-rtl", rightToLeft(full));
    } else {
      flag.removeAttribute("data-rtl");
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

/** Draws `share`'s carets in every code pane showing its file, and tells it where this tab's caret is. */
export function startCodeCarets(share: CaretShare): () => void {
  const attached = new Map<CaretPane, () => void>();
  /** Each pane's caret reader, in the order their carets last moved: the room is told the newest one's. */
  const readers = new Map<CaretPane, () => CaretSelection | undefined>();
  const moved = (pane: CaretPane, read: () => CaretSelection | undefined) => {
    readers.delete(pane);
    readers.set(pane, read);
    share.own(read);
  };
  const ours = (pane: CaretPane) => pane.path === share.path && pane.scope.account === share.scope.account &&
    pane.scope.repoId === share.scope.repoId && pane.scope.branch === share.scope.branch;
  const sync = () => {
    const panes = caretPanes();
    for (const [pane, detach] of attached) if (!panes.includes(pane)) {
      detach();
      attached.delete(pane);
      // The pane told goes: the room is told the caret of the newest pane still open, if any.
      const wasNewest = [...readers.keys()].at(-1) === pane;
      readers.delete(pane);
      if (wasNewest) share.own([...readers.values()].at(-1));
    }
    for (const pane of panes) if (!attached.has(pane) && ours(pane)) attached.set(pane, attach(share, pane, read => moved(pane, read)));
    if (!attached.size) share.own(undefined);
  };
  const unwatch = watchCaretPanes(sync);
  sync();
  return () => {
    unwatch();
    for (const detach of attached.values()) detach();
    attached.clear();
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
        if (!can.has(author)) can.set(author, !widget.caret.contested && share.canUndo(author));
        widget.flag.undoable(!widget.leaving && can.get(author)!);
      }
    });
  };

  /** The open tag stays in the pane at every width: it opens on the side of the caret with room for it (the right
   * unless only the left has it), and its name is cut to the room there (`--live-caret-room`), so its undo always shows.
   * Its natural width and its circle are measured once Monaco shows it (a new widget stays hidden until its first render),
   * and the width again only when its name or undo changed. Monaco places it again after every render it gets. */
  const place = (widget: Widget, rendered?: { top: number; left: number }) => {
    // Inside Monaco's render its own coordinate is used: asking Monaco for a position then would render again.
    const layout = editor.getLayoutInfo();
    const at = rendered ? { top: rendered.top, left: layout.contentLeft + rendered.left - editor.getScrollLeft() }
      : editor.getScrolledVisiblePosition(position(widget.caret.head));
    const flag = widget.flag.element;
    if (!at || flag.offsetParent === null) return;
    const name = flag.querySelector<HTMLElement>(".live-caret__name");
    widget.width ??= flag.scrollWidth - (name?.clientWidth ?? 0) + (name?.scrollWidth ?? 0);
    widget.half ??= flag.querySelector<HTMLElement>(".live-caret__mark")!.offsetWidth / 2;
    const half = widget.half;
    const right = layout.width - layout.verticalScrollbarWidth - at.left + half, left = at.left + half - layout.contentLeft;
    const flip = widget.width > right && left > right;
    widget.root.toggleAttribute("data-flip", flip);
    // On the pane's top line (scrolled or not) the tag sits below the caret, inside the pane.
    widget.root.toggleAttribute("data-below", at.top < half * 2 + 2);
    widget.root.style.setProperty("--live-caret-room", `${Math.floor(flip ? left : right)}px`);
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
      found.root.dataset.colour = String(caretColour(caret.author));
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
        options: { className: `live-caret-tint live-caret-tint--${caretColour(caret.author)}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } };
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
