// The component CSS files the board's parts name (`Part.css`, docs/wayfinder/atomic-catalogue/css-layers-plan.md).
// The catalogue page loads each one as a <style data-component="<path>"> of its own, so a part's live cell can leave
// its own file out: the live cell draws inside a shadow root that holds the board's other stylesheets and the file as
// edited, so an edit (a deleted rule, a selector reaching out) stays inside that cell, as in a page of its own.
import { forcedSheet } from "./force-states";
import { PARTS, isPart } from "./parts";

const TEXTS = import.meta.glob<string>("../ui/parts/*.css", { query: "?raw", import: "default", eager: true });

/** A component file's text as the code has it, by its repository path; undefined for a file that is not one. */
export const componentText = (path: string): string | undefined => TEXTS[path.replace(/^src\//, "../")];

/** Adds each part's component file to `doc` as a style of its own (the board and every frame page alike). */
export function loadComponentStyles(doc: Document = document) {
  for (const part of PARTS) {
    if (!isPart(part) || !part.css || doc.head.querySelector(`style[data-component="${CSS.escape(part.css)}"]`)) continue;
    const text = componentText(part.css);
    if (text === undefined) continue;
    const style = doc.createElement("style");
    style.dataset.component = part.css;
    style.textContent = text;
    doc.head.append(style);
  }
}

/** The board's stylesheets as one constructed sheet, all but `leaveOut` and the board's own edit styles. */
function boardSheet(doc: Document, leaveOut: string): CSSStyleSheet {
  const texts: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    const owner = sheet.ownerNode;
    if (owner instanceof HTMLStyleElement && (owner.dataset.component === leaveOut || owner.dataset.tweaks !== undefined)) continue;
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    texts.push(Array.from(rules, (rule) => rule.cssText).join("\n"));
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(texts.join("\n"));
  return sheet;
}

/** A live cell's shadow root and the sheet that holds its part's file as edited. */
export interface LiveRoot { root: ShadowRoot; file: CSSStyleSheet }

/**
 * The shadow root a part with its own CSS file draws its live cell in: under `stage`, a host that takes no box of its
 * own (the part lays out as the stage's child), with the board's styles but that file, then `text` in its place, then
 * the forced-state copies of both (the State option: hover, pressed and focus without a pointer). The board's styles
 * are read again on a call after the number of its stylesheets changed (the board calls again once a part has drawn,
 * for CSS its module brought in).
 */
export function liveRoot(stage: HTMLElement, path: string, text: string): LiveRoot {
  let host = stage.querySelector<HTMLElement>(":scope > .cat-live__host");
  if (!host) {
    host = document.createElement("div");
    host.className = "cat-live__host";
    // Focus given to the host (the board taking it back from a frame) goes on to the part inside.
    host.attachShadow({ mode: "open", delegatesFocus: true });
    stage.replaceChildren(host);
  }
  const root = host.shadowRoot!;
  const known = rooted.get(root);
  const count = document.styleSheets.length;
  const fresh = !known || known.count !== count;
  const base = fresh ? boardSheet(document, path) : known.base;
  const baseForced = fresh ? forcedSheet(base.cssRules) : known.baseForced;
  const file = known?.file ?? new CSSStyleSheet();
  file.replaceSync(text);
  rooted.set(root, { base, baseForced, file, count });
  root.adoptedStyleSheets = [base, file, baseForced, forcedSheet(file.cssRules)];
  return { root, file };
}
const rooted = new WeakMap<ShadowRoot, { base: CSSStyleSheet; baseForced: CSSStyleSheet; file: CSSStyleSheet; count: number }>();
