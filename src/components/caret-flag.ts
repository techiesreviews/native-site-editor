// A caret's name tag (tickets am-22 and am-23): a small circle with the person's first letter, or for an agent a tiny
// icon of its program, opened into the full name on hover or keyboard focus, ending in an undo button where the tag can
// take the author's change back. The editor's carets (src/components/live-carets.ts) and a synced session's guest page
// (src/components/guest-carets.ts, TOOLS-219) both draw it: it needs nothing of the editor, so the guest page stays lean.
import type { LiveCaret } from "../live-text";
import { initialOf, participants } from "../participant";

/** Who a caret is: its name comes from the tab's participants (src/participant.ts), so an agent's caret matches its
 * outline and pin; `guest`, a synced session's guest by the colour Lex's tab gave them. */
export type CaretWho = Pick<LiveCaret, "author" | "name" | "agent" | "who" | "guest">;

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
  const template = document.createElement("template");
  template.innerHTML = `<svg class="live-caret__program" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${programMark(agent)}</svg>`;
  return template.content.firstElementChild!;
}

/** Whether `name`'s first strong letter is written right to left (Hebrew, Arabic, Syriac, Thaana, N'Ko, …). */
export const rightToLeft = (name: string) =>
  /^[^\p{L}]*[֐-ࣿיִ-﷿ﹰ-﻿\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u.test(name);

/** A caret's name tag: the circle, the rest of the name and, with `undo`, its button (shown while `undoable`) holding
 * `undo.icon`. Without `undo` the tag never offers one (a guest's page takes nothing back). */
export function caretFlag(caret: CaretWho, undo?: { icon: Element; onUndo(): void }) {
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
  const button = undo ? document.createElement("button") : undefined;
  if (button && undo) {
    button.type = "button";
    button.className = "live-caret__undo";
    button.hidden = true;
    button.append(undo.icon);
    button.addEventListener("click", event => {
      event.stopPropagation();
      undo.onUndo();
    });
  }
  // Monaco takes a press inside the editor as a click in the text: the tag keeps its own. A press on the circle opens the
  // tag (focus), on touch too, where nothing hovers.
  // (Monaco hears touches at the document and would take focus into the code.) The press focuses the tag or its undo
  // without scrolling: a browser's own focus would scroll Monaco's inner layers and move the code under the caret.
  for (const type of ["mousedown", "pointerdown", "touchstart", "touchend"] as const) flag.addEventListener(type, event => event.stopPropagation());
  flag.addEventListener("mousedown", event => {
    event.preventDefault();
    ((event.target as Element).closest("button") ?? flag).focus({ preventScroll: true });
  });
  flag.append(mark, rest);
  if (button) flag.append(button);
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
    button?.setAttribute("aria-label", `Undo ${full}'s change`);
    if (button) button.title = `Undo ${full}'s change`;
    changed?.();
  };
  let changed: (() => void) | undefined;
  name(caret);
  return {
    element: flag,
    name,
    /** Shows or hides the undo button; a focused button that goes keeps focus on the tag. */
    undoable(can: boolean) {
      if (!button || button.hidden === !can) return;
      const focused = document.activeElement === button;
      button.hidden = !can;
      if (focused && !can) flag.focus();
      changed?.();
    },
    /** Called when the tag's width may have changed (its name, its undo). */
    onResize(listener: () => void) { changed = listener; },
  };
}

/** A caret as it is drawn: its element, its tag and the tag's measures (`placeTag`). */
export type Tagged = { root: HTMLElement; flag: ReturnType<typeof caretFlag>; width?: number; half?: number };
/** The open tag stays in its pane at every width: it opens on the side of the caret with room for it (the right unless only
 * the left has it), and its name is cut to the room there (`--live-caret-room`), so its undo always shows. On the pane's
 * top line it sits below the caret. `x` and `top`: the caret in the room the pane leaves for tags, `width` wide. The tag's
 * natural width and its circle are measured once it shows, and the width again only when its name or undo changed. */
export function placeTag(widget: Tagged, x: number, top: number, width: number) {
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
