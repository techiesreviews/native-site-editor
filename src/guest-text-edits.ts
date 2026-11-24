// Owns a guest's text-edit lifecycle: the selected element and source proof, typing acknowledgements,
// formatting in flight and the render that confirms it. The bar supplies transport and draws the controls.
import type { EditBarControl } from "./components/edit-bar";
import type { GuestContext } from "./components/native-preview";
import type { TextSizeScale } from "./native-text-size";
import type { GuestChange, GuestHeadingLevel } from "./guest-changes";
import { GUEST_RENDERS_KEPT } from "./live-session";

type Selected = { path: string; node: number[]; tag: string };
interface TextEditPorts {
  read: (target: Selected, scale: TextSizeScale | undefined) => Promise<{ size?: string; bold?: boolean } | undefined>;
  write: (change: GuestChange, on: number) => Promise<string | undefined>;
  changed: () => void;
  answered: (reason: string | undefined) => void;
}

// Text being typed re-renders the page often: its size and bold are read again once renders pause this long.
const REREAD_MS = 1_200;
// A written text change waits this long at most for the render that shows it before the bar takes the next one.
const RENDER_WAIT_MS = 2_000;
const LEVELS: GuestHeadingLevel[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

const key = (target: Selected | undefined) => target ? `${target.path}#${target.node.join(".")}` : "";

/** The text sizes Lex's tab sent, as far as they are well formed (a message is never trusted as typed). */
function sizesOf(context: GuestContext | undefined): TextSizeScale | undefined {
  const scale = context?.sizes;
  const fine = scale && ["class", "variable", "inline"].includes(scale.kind) && Array.isArray(scale.sizes)
    && scale.sizes.every((size) => typeof size?.value === "string" && typeof size.label === "string");
  return fine ? scale : undefined;
}

export function createGuestTextEdits(ports: TextEditPorts) {
  let context: GuestContext | undefined;
  let selected: Selected | undefined;
  let closed = false;
  let seen = 0;
  let selectedSeen = 0;
  // The selected text element as Lex's sources have it: its text size and whether all of its text is bold.
  let text: { key: string; on: number; epoch: number; size?: string; bold?: boolean } | undefined;
  let reading = 0;
  let textApplied = 0;
  let textEpoch = 0;
  let textReading: { key: string; on: number; epoch: number; again: boolean } | undefined;
  let reread: ReturnType<typeof setTimeout> | undefined;
  // The element whose heading level, text size or bold change is on its way: its bar shows the change at once and its
  // text controls wait until Lex's tab refuses it, or a later render shows it written (so the next change names a page
  // that has it). `level` is a heading level on its way (the box shows it, not the tag still on the page); `answeredAt`
  // the last render come when Lex's tab answered that it was written: only a render after it can show the change.
  let sending: { key: string; level?: string; answeredAt?: number; timer?: ReturnType<typeof setTimeout> } | undefined;
  // The guest's last typed letter sent to Lex's tab, and the last one a render has: while letters are on their way the
  // text controls wait, as a change made then would name a page without them (a lost answer waits no longer).
  let typedSent = 0;
  let typedShown = 0;
  let typedTimer: ReturnType<typeof setTimeout> | undefined;
  const typingAhead = () => typedSent > typedShown;
  const textWaiting = () => Boolean(text && (text.epoch !== textEpoch || seen - text.on >= GUEST_RENDERS_KEPT));

  const still = (target: Selected) => !closed && key(selected) === key(target) && context?.path === target.path;
  function cancel() {
    textEpoch++;
    text = undefined;
    textReading = undefined;
    clearTimeout(reread);
    clearTimeout(sending?.timer);
    sending = undefined;
  }
  /** Reads the selected text element from Lex's sources, for its Text size and Bold. */
  async function readText(target: Selected) {
    if (!still(target) || sending?.key === key(target) || typingAhead()) return;
    if (textReading?.key === key(target) && textReading.on === seen && textReading.epoch === textEpoch) { textReading.again = true; return; }
    const ticket = ++reading;
    const mine = { key: key(target), on: seen, epoch: textEpoch, again: false };
    textReading = mine;
    try {
      const on = mine.on;
      const state = await ports.read(target, sizesOf(context)).catch(() => undefined);
      // A change on its way shows on the bar until it is answered, and the sources are read again then.
      // A newer request may still be waiting: only a newer completed read supersedes this one.
      if (ticket < textApplied || mine.epoch !== textEpoch || !still(target) || sending?.key === key(target)) return;
      textApplied = ticket;
      text = state && { key: key(target), on, epoch: mine.epoch, ...state };
      ports.changed();
    } finally {
      if (textReading === mine) {
        textReading = undefined;
        if (mine.again && !closed && selected && selected.tag !== "img" && context?.path === selected.path) {
          clearTimeout(reread);
          reread = setTimeout(() => { if (still(target)) void readText(selected!); }, REREAD_MS);
        }
      }
    }
  }

  /** The host bar's heading level, text size and bold, each sent to Lex's tab as one change. */
  function textControls(at: Selected): EditBarControl[] {
    const controls: EditBarControl[] = [], waiting = sending?.key === key(at) || typingAhead() || selectedSeen !== seen;
    const epoch = textEpoch;
    // One change at a time: the bar shows it at once, and Lex's sources are read again once it is settled.
    const change = (next: GuestChange, shown?: Partial<NonNullable<typeof text>>) => {
      if (!still(at) || epoch !== textEpoch) return;
      if (sending?.key === key(at) || typingAhead() || selectedSeen !== seen) { ports.changed(); return; }
      if (next.kind !== "heading" && textWaiting()) { ports.changed(); return; }
      // Bold and size depend on the sources read, not a newer render that may contain different text.
      const on = next.kind === "heading" ? selectedSeen : text?.on;
      if (on === undefined) return;
      const mine: NonNullable<typeof sending> = { key: key(at), ...next.kind === "heading" ? { level: next.level } : {} };
      textEpoch++;
      sending = mine;
      if (shown && text?.key === key(at)) text = { ...text, ...shown };
      ports.changed();
      const settle = () => {
        if (sending !== mine) return;
        clearTimeout(mine.timer);
        sending = undefined;
        ports.changed();
        if (still(at)) void readText(selected!);
      };
      void ports.write(next, on).then((reason) => {
        if (sending !== mine || closed) return;
        ports.answered(reason);
        // Written: settled by the render that shows it (`select`), which Lex's tab sends after its answer; a render
        // come before the answer left before the change was written. A lost render waits no longer.
        if (reason) { settle(); return; }
        mine.answeredAt = seen;
        mine.timer = setTimeout(settle, RENDER_WAIT_MS);
      });
    };
    if (/^h[1-6]$/.test(at.tag)) controls.push({
      kind: "select", label: "Heading level", waiting,
      options: LEVELS.map((level) => ({ label: level.toUpperCase(), value: level })),
      value: waiting && sending?.level || at.tag,
      onChange: (value) => change({ kind: "heading", ...at, level: value as GuestHeadingLevel }),
    });
    const state = text?.key === key(at) ? text : undefined, scale = sizesOf(context);
    if (state?.size !== undefined && scale) {
      const options = [{ label: "Default", value: "default" }, ...scale.sizes.map((size) => ({ label: size.label, value: size.value }))];
      if (state.size === "custom") options.push({ label: "Custom", value: "custom" });
      controls.push({ kind: "select", label: "Text size", options, value: state.size, waiting: waiting || textWaiting(), onChange: (size) => change({ kind: "size", ...at, size }, { size }) });
    }
    if (state?.bold !== undefined) controls.push({
      kind: "button", label: "B", ariaLabel: "Bold", title: "Bold", pressed: state.bold, waiting: waiting || textWaiting(),
      className: "edit-bar__format edit-bar__format--strong",
      onPress: () => change({ kind: "bold", ...at, on: !state.bold }, { bold: !state.bold }),
    });
    return controls;
  }

  return {
    controls: () => selected && !closed ? textControls(selected) : [],
    select(next: Selected | undefined) {
      if (closed) return;
      const moved = key(next) !== key(selected);
      if (moved) cancel();
      // The runtime reports the selection again after each render it draws: its node is that render's.
      selected = next;
      selectedSeen = seen;
      // A text change on its way is settled by another selection, or by the render that shows it written.
      const shown = Boolean(!moved && sending?.answeredAt !== undefined && selectedSeen > sending.answeredAt);
      if (moved || shown) {
        clearTimeout(sending?.timer);
        sending = undefined;
      }
      ports.changed();
      clearTimeout(reread);
      if (!next || next.tag === "img" || context?.path !== next.path) return;
      // Keep the proof inside Lex's retained renders during long edits, without reading on every render.
      const readOn = textReading?.key === key(next) ? textReading.on : text?.on;
      const needsText = text && text.epoch !== textEpoch && textReading?.epoch !== textEpoch;
      if (moved || shown || !typingAhead() && needsText || readOn !== undefined && seen - readOn >= GUEST_RENDERS_KEPT / 2) void readText(next);
      else reread = setTimeout(() => { if (still(next)) void readText(selected!); }, REREAD_MS);
    },
    context(next: GuestContext | undefined) {
      if (closed) return;
      const moved = context?.path !== next?.path;
      // New text sizes on the same page: a size read against the old ones may name none of the new choices.
      const rescaled = !moved && JSON.stringify(sizesOf(context)) !== JSON.stringify(sizesOf(next));
      if (moved) cancel();
      else if (rescaled) {
        textEpoch++;
        text = undefined;
        textReading = undefined;
        clearTimeout(reread);
      }
      context = next;
      ports.changed();
      if ((moved || rescaled) && selected && selected.tag !== "img") void readText(selected);
    },
    rendered(n: number, typed: number) {
      if (closed) return;
      if (Number.isInteger(n)) seen = n;
      if (typingAhead() && typed >= typedSent) {
        typedShown = typed;
        clearTimeout(typedTimer);
      }
      ports.changed();
    },
    /** The guest typed: letter `seq` (their frame's numbering) went to Lex's tab. */
    typing(seq: number) {
      if (closed || !Number.isInteger(seq)) return;
      const was = typingAhead();
      textEpoch++;
      // A fresh frame numbers its typing from 1 again: the last letter sent is the one to wait for.
      typedSent = seq;
      if (seq <= typedShown) typedShown = seq - 1;
      clearTimeout(typedTimer);
      typedTimer = setTimeout(() => {
        typedShown = typedSent;
        ports.changed();
        if (selected && selected.tag !== "img" && context?.path === selected.path) void readText(selected);
      }, RENDER_WAIT_MS);
      if (!was) ports.changed();
    },
    close() {
      closed = true;
      cancel();
      clearTimeout(typedTimer);
    },
  };
}
