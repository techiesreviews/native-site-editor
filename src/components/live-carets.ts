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
import type { CaretShare, LiveCaret } from "../live-text";
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
function programIcon(agent: string) {
  const mark = PROGRAMS.find(([pattern]) => pattern.test(agent))?.[1] ?? PLAIN_AGENT;
  return svgElement(`<svg class="live-caret__program" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${mark}</svg>`);
}

/** A caret's name tag: the circle, the rest of the name and the undo button (shown while `undoable`). */
export function caretFlag(caret: Pick<LiveCaret, "name" | "agent">, onUndo: () => void) {
  const flag = document.createElement("span");
  flag.className = "live-caret__flag";
  flag.tabIndex = 0;
  const mark = document.createElement("span");
  mark.className = "live-caret__mark";
  const rest = document.createElement("span");
  rest.className = "live-caret__name";
  rest.setAttribute("aria-hidden", "true");
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "live-caret__undo";
  undo.hidden = true;
  undo.append(icon("undo", 12));
  undo.addEventListener("click", event => {
    event.stopPropagation();
    onUndo();
  });
  // Monaco takes a press inside the editor as a click in the text: the tag keeps its own.
  for (const type of ["mousedown", "pointerdown"] as const) flag.addEventListener(type, event => event.stopPropagation());
  flag.append(mark, rest, undo);
  const name = (next: Pick<LiveCaret, "name" | "agent">) => {
    const full = next.name.trim() || (next.agent === undefined ? "Someone" : "Agent");
    if (flag.dataset.name === full && flag.dataset.agent === next.agent) return;
    flag.dataset.name = full;
    if (next.agent === undefined) {
      delete flag.dataset.agent;
      const [first = "", ...others] = [...full];
      const letter = document.createElement("b");
      letter.textContent = first.toLocaleUpperCase();
      mark.replaceChildren(letter);
      rest.textContent = others.join("");
    } else {
      flag.dataset.agent = next.agent;
      mark.replaceChildren(programIcon(next.agent));
      rest.textContent = full;
    }
    flag.setAttribute("aria-label", full);
    undo.setAttribute("aria-label", `Undo ${full.split(/\s/)[0]}'s change`);
  };
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
    },
  };
}

/** Draws `share`'s carets in every code pane showing its file, and tells it where this tab's caret is. */
export function startCodeCarets(share: CaretShare): () => void {
  const attached = new Map<CaretPane, () => void>();
  const ours = (pane: CaretPane) => pane.path === share.path && pane.scope.account === share.scope.account &&
    pane.scope.repoId === share.scope.repoId && pane.scope.branch === share.scope.branch;
  const sync = () => {
    const panes = caretPanes();
    for (const [pane, detach] of attached) if (!panes.includes(pane)) { detach(); attached.delete(pane); }
    for (const pane of panes) if (!attached.has(pane) && ours(pane)) attached.set(pane, attach(share, pane));
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

function attach(share: CaretShare, pane: CaretPane) {
  const { editor, monaco } = pane;
  const model = editor.getModel();
  if (!model) return () => {};
  const { CursorChangeReason, ContentWidgetPositionPreference, EditorOption } = monaco.editor;
  const own = () => {
    const selection = editor.getSelection();
    if (!selection || model.isDisposed()) return;
    share.own({
      anchor: model.getOffsetAt({ lineNumber: selection.selectionStartLineNumber, column: selection.selectionStartColumn }),
      head: model.getOffsetAt(selection.getPosition()),
    });
  };
  // Others' text moving this caret along is not a move of its own: its relative position already follows.
  const moved = editor.onDidChangeCursorSelection(event => {
    if (event.reason !== CursorChangeReason.RecoverFromMarkers && event.reason !== CursorChangeReason.ContentFlush) own();
  });
  own();

  type Widget = Monaco.editor.IContentWidget & { root: HTMLElement; flag: ReturnType<typeof caretFlag>; caret: LiveCaret; leaving?: ReturnType<typeof setTimeout> };
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
        if (!can.has(author)) can.set(author, share.canUndo(author));
        widget.flag.undoable(!widget.leaving && can.get(author)!);
      }
    });
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
    };
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
      if (found?.leaving) { clearTimeout(found.leaving); found.leaving = undefined; found.root.removeAttribute("data-leaving"); }
      if (!found) { widgets.set(caret.peer, found = widget(caret)); added = true; }
      if (found.caret.author !== caret.author) added = true;
      found.caret = caret;
      found.flag.name(caret);
      found.root.dataset.colour = String(caretColour(caret.author));
      // On the first line the tag sits below the caret, inside the pane.
      found.root.toggleAttribute("data-below", position(caret.head).lineNumber === 1);
      editor.layoutContentWidget(found);
    }
    for (const [peer, gone] of widgets) {
      if (seen.has(peer) || gone.leaving) continue;
      gone.root.dataset.leaving = "";
      gone.flag.undoable(false);
      gone.leaving = setTimeout(() => { widgets.delete(peer); editor.removeContentWidget(gone); }, FADE_MS);
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
    for (const gone of widgets.values()) { clearTimeout(gone.leaving); editor.removeContentWidget(gone); }
    widgets.clear();
  };
}
