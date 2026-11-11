// The CSS section's controls (css-file.ts writes the live CSS and the change request): the part's own component CSS
// file in a code field, shown on its live cell as it is typed, Reset, and "Send to agent", which says Copied on itself.
import { iconMarkup, svgElement } from "../icons";
import { cssChangeRequest, cssProblem, liveCss } from "./css-file";
import { copy } from "./tweak-panel";

/**
 * A part's file on the board, kept until the page closes: the code's text once read, the text as edited, and the
 * edited text the live cell shows (the last one with no problem); `text` and `shown` are unset while unchanged.
 */
export interface CssFile { before?: string; text?: string; shown?: string }

export interface CssPanel {
  part: { id: string; name: string };
  path: string;
  file: CssFile;
  /** Shows the file's `shown` text on the live cell, or nothing when it is unset. */
  apply(): void;
  say(text: string): void;
}

let fieldIds = 0;

/**
 * Why the text cannot be shown on the live cell, or "": the text check first, then the browser's own reading, where
 * the edit nested in the cell's scope must stay the two rules it is written as, nothing reaching past them.
 */
function problemOf(text: string, before: string): string {
  const wrong = cssProblem(text);
  if (wrong) return wrong;
  const sheet = new CSSStyleSheet();
  try { sheet.replaceSync(liveCss(before, text, ".cat-live__stage")); } catch { return "The browser cannot read this file"; }
  return sheet.cssRules.length === 2 ? "" : "A rule closes past the end of the file";
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** The CSS section for the selected part, in place of the Tweak fields. */
export function cssSection(panel: CssPanel): HTMLElement {
  const section = el("section", "cat-inspector__section cat-css");
  section.setAttribute("aria-label", "CSS");
  section.dataset.css = "";
  section.append(el("h3", "cat-inspector__heading", "CSS"));
  const { file } = panel;
  if (file.before === undefined) {
    section.setAttribute("aria-busy", "true");
    section.append(el("p", "cat-tweak__note", "Reading its file…"));
    return section;
  }
  const before = file.before;
  const id = `cat-css-${++fieldIds}`;
  const name = el("label", "cat-css__file", panel.path);
  name.htmlFor = id;
  const text = el("textarea", "cat-input cat-css__text");
  text.id = id;
  text.spellcheck = false;
  text.autocomplete = "off";
  text.setAttribute("autocapitalize", "off");
  text.wrap = "off";
  const problem = el("p", "cat-css__problem");
  problem.id = `${id}-problem`;
  problem.hidden = true;
  text.setAttribute("aria-describedby", problem.id);

  const reset = el("button", "button secondary cat-tweak__reset", "Reset");
  const send = el("button", "button secondary cat-tweak__send");
  reset.type = send.type = "button";
  const sendLabel = () => send.replaceChildren(svgElement(iconMarkup("sparkle", 16, "icon--before")), "Send to agent");
  sendLabel();
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  /** Shows the text's state: its problem beside the field, the changed mark, and whether the actions do anything. */
  const paint = () => {
    const now = file.text ?? before;
    const wrong = problemOf(now, before);
    text.setAttribute("aria-invalid", String(!!wrong));
    problem.textContent = wrong;
    problem.hidden = !wrong;
    // One row per line, so the whole file reads without a scroll of its own; the panel scrolls.
    text.rows = now.split("\n").length;
    section.toggleAttribute("data-changed", now !== before);
    reset.setAttribute("aria-disabled", String(now === before));
    send.setAttribute("aria-disabled", String(now === before || !!wrong));
  };
  text.value = file.text ?? before;
  paint();
  text.addEventListener("input", () => {
    file.text = text.value === before ? undefined : text.value;
    clearTimeout(copiedTimer);
    sendLabel();
    paint();
    // A file with a problem would reach past the live cell: the cell keeps the last text that had none.
    if (problemOf(text.value, before)) return;
    file.shown = file.text;
    panel.apply();
  });

  reset.addEventListener("click", () => {
    if (reset.getAttribute("aria-disabled") === "true") return;
    delete file.text;
    delete file.shown;
    text.value = before;
    clearTimeout(copiedTimer);
    sendLabel();
    paint();
    panel.apply();
    panel.say(`${panel.part.name} reset`);
  });
  send.addEventListener("click", () => void sendRequest());
  async function sendRequest() {
    const sent = file.text;
    const request = cssChangeRequest(panel.part, panel.path, before, sent ?? before);
    if (send.getAttribute("aria-disabled") === "true" || !request) return;
    const copied = await copy(request);
    // Typed on while the clipboard answered: what is in the field now was not copied, and the button already says so.
    if (file.text !== sent) return;
    send.replaceChildren(...copied ? [svgElement(iconMarkup("check", 16, "icon--before")), "Copied"] : ["Couldn't copy"]);
    send.toggleAttribute("data-problem", !copied);
    panel.say(copied ? "Change request copied" : "Couldn't copy the change request");
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { send.removeAttribute("data-problem"); sendLabel(); }, 2000);
  }
  const actions = el("div", "cat-tweak__actions");
  actions.append(reset, send);
  section.append(name, text, problem, actions);
  return section;
}
