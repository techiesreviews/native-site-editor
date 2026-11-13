// Carets on a synced session's guest page (TOOLS-219): Lex's, the room's (agents', other signed-in tabs') and the other
// guests', as Lex's tab sends them (src/live-session-carets.ts): points in the page's text. The frame finds each one
// (src/components/native-preview-runtime.js, `carets`, measured again after every render, scroll and resize) and this
// draws the line, the tag and a selection's tint over the frame, with the editor's caret look (src/components/caret-flag.ts).
// A guest's page takes nothing back: its tags have no undo.
import "./live-carets.css";
import { caretFlag, paintCaret, placeTag, type Tagged } from "./caret-flag";
import type { createPreviewLink } from "./preview-link";
import type { PageCaretRect } from "./page-caret-port";
import type { SessionCaret } from "../live-session-carets";

/** How long a caret takes to fade out before it goes (live-carets.css). */
const FADE_MS = 160;
/** A caret's colour as Lex's tab names it: "host", `g` and a guest's index, or a presence colour's index. */
const COLOUR = /^(?:host|g[0-3]|[0-3])$/;

/** Whether `value` is a list of carets Lex's tab may send: each one well-formed, at most 64 (what the frame finds). */
export function sessionCaretList(value: unknown): SessionCaret[] {
  if (!Array.isArray(value)) return [];
  const index = (at: unknown) => Number.isSafeInteger(at) && (at as number) >= 0;
  const point = (at: unknown) => {
    if (!at || typeof at !== "object") return undefined;
    const { node, at: offset } = at as Record<string, unknown>;
    return Array.isArray(node) && node.length <= 256 && node.every(index) && index(offset) ? { node: node as number[], at: offset as number } : undefined;
  };
  const out: SessionCaret[] = [];
  for (const item of value.slice(0, 64)) {
    if (!item || typeof item !== "object") continue;
    const caret = item as Record<string, unknown>;
    const head = point(caret.head), anchor = caret.anchor === null ? null : point(caret.anchor);
    if (typeof caret.id !== "string" || typeof caret.name !== "string" || typeof caret.path !== "string" || typeof caret.colour !== "string"
      || !COLOUR.test(caret.colour) || !head || anchor === undefined) continue;
    out.push({
      id: caret.id.slice(0, 200), name: caret.name.slice(0, 400), colour: caret.colour, path: caret.path, head, anchor,
      ...(typeof caret.agent === "string" ? { agent: caret.agent.slice(0, 400) } : {}),
      ...(typeof caret.guest === "string" ? { guest: caret.guest } : {}),
    });
  }
  return out;
}

/** Draws the session's carets over `frame` in `host` (which holds the frame), leaving out this guest's own (`me`). */
export function createGuestCarets(host: HTMLElement, frame: HTMLIFrameElement, link: ReturnType<typeof createPreviewLink>, me: string) {
  const layer = document.createElement("div");
  layer.className = "live-carets-page";
  host.append(layer);
  type Widget = Tagged & { caret: SessionCaret; tints: HTMLElement[]; at?: { left: number; top: number }; leaving?: ReturnType<typeof setTimeout> };
  const widgets = new Map<string, Widget>();
  let carets: SessionCaret[] = [], ready = false;

  /** Over the frame's viewport, where its carets are measured. */
  const fit = () => {
    const box = frame.getBoundingClientRect(), room = host.getBoundingClientRect();
    layer.style.left = `${box.left - room.left + frame.clientLeft}px`;
    layer.style.top = `${box.top - room.top + frame.clientTop}px`;
    layer.style.width = `${frame.clientWidth}px`;
    layer.style.height = `${frame.clientHeight}px`;
  };
  const place = (widget: Widget) => { if (widget.at) placeTag(widget, widget.at.left, widget.at.top, layer.clientWidth); };
  // Who a caret is, for its tag: a person by their name, an agent by its program.
  const who = (caret: SessionCaret) => ({ author: 0, name: caret.name, ...(caret.agent === undefined ? {} : { agent: caret.agent }) });
  const widget = (caret: SessionCaret): Widget => {
    const root = document.createElement("div");
    root.className = "live-caret";
    // Hidden until the frame says where it is.
    root.hidden = true;
    const flag = caretFlag(who(caret));
    const line = document.createElement("span");
    line.className = "live-caret__line";
    root.append(line, flag.element);
    const made: Widget = { root, flag, caret, tints: [] };
    flag.onResize(() => { made.width = undefined; place(made); });
    layer.append(root);
    return made;
  };
  const remove = (widget: Widget) => {
    if (widget.root.contains(document.activeElement)) frame.focus();
    widget.root.remove();
    for (const tint of widget.tints) tint.remove();
  };
  const ask = () => { if (ready) link.send({ type: "carets", carets: carets.map(({ id, path, head, anchor }) => ({ id, path, head, anchor })) }); };

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
        tint.className = `live-caret-tint live-caret-tint--${found.caret.colour}`;
        if (box) Object.assign(tint.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      });
    }
  };
  const stopRects = link.on("caret-rects", (message) => shown(message.rects));
  // A fresh frame document has none: it is asked again.
  const stopReady = link.on("ready", () => { ready = true; ask(); });
  // The frame moving or changing size moves no caret in its viewport: the layer follows the frame by itself.
  const resized = new ResizeObserver(() => { fit(); for (const found of widgets.values()) place(found); });
  resized.observe(frame);
  resized.observe(host);

  return {
    /** The carets Lex's tab sent now. */
    set(next: SessionCaret[]) {
      carets = next.filter((caret) => caret.guest !== me);
      const seen = new Set<string>();
      for (const caret of carets) {
        seen.add(caret.id);
        let found = widgets.get(caret.id);
        if (found?.leaving) { clearTimeout(found.leaving); found.leaving = undefined; found.root.removeAttribute("data-leaving"); }
        if (!found) widgets.set(caret.id, found = widget(caret));
        found.caret = caret;
        found.flag.name(who(caret));
        paintCaret(found.root, caret.colour);
      }
      for (const [id, gone] of widgets) {
        if (seen.has(id) || gone.leaving) continue;
        gone.root.dataset.leaving = "";
        for (const tint of gone.tints) tint.hidden = true;
        gone.leaving = setTimeout(() => { widgets.delete(id); remove(gone); }, FADE_MS);
      }
      fit();
      ask();
    },
    close() {
      stopRects();
      stopReady();
      resized.disconnect();
      for (const gone of widgets.values()) { clearTimeout(gone.leaving); remove(gone); }
      widgets.clear();
      layer.remove();
    },
  };
}
