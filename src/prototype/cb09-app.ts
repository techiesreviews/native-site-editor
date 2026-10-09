// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// Loaded only with ?proto=cards. Mounts the variant switcher, makes the test
// material once (two draft pages under /work/ that no card links to yet, and
// a scratch grid whose cards aren't links), and sends Add card to the
// current variant: ?variant=A (popover tab), B (page picker sheet), C (card
// first, link after).

import type { CardsDeps } from "../page-builder/cards";
import { cb09Variant, type Cb09AddRequest, type Cb09PopoverRequest, type Cb09Variant } from "./cb09";
import { state, el, btn, toast, deps, frameRects, DRAFT_PAGES, draftPageDocument, SCRATCH } from "./cb09-core";
import { decorate, nonLinkPopover } from "./cb09-a";
import { openSheet } from "./cb09-b";
import { cardFirst } from "./cb09-c";
import "./cb09.css";

const NAMES: Record<Cb09Variant, string> = { A: "A · Popover tab", B: "B · Page picker sheet", C: "C · Card first, link after" };
const ORDER: Cb09Variant[] = ["A", "B", "C"];
let mounted = false;

export function install(cardsDeps: CardsDeps) {
  state.deps = cardsDeps;
  if (mounted) return;
  mounted = true;
  document.documentElement.dataset.cb09Variant = cb09Variant();
  mountSwitcher();
  void seed();
  // The scratch grid's stylesheet, kept in the frame (it reloads on page changes).
  setInterval(() => void frameRects("", []), 1200);
}

export function activate(request: Cb09AddRequest) {
  const variant = cb09Variant();
  if (variant === "A") return nonLinkPopover(request);
  if (variant === "B") return openSheet(request);
  return cardFirst(request);
}

export function decoratePopover(request: Cb09PopoverRequest) {
  decorate(request);
}

// ---- The switcher: ← label →, outside the design. ----
function mountSwitcher() {
  const current = cb09Variant();
  const go = (step: number) => {
    const next = ORDER[(ORDER.indexOf(current) + step + ORDER.length) % ORDER.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(history.state, "", url);
    location.reload();
  };
  const bar = el("div", "cb09-switcher");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Prototype variant");
  const prev = btn("←", () => go(-1), "cb09-switcher__step");
  prev.title = "Previous variant (←)";
  const next = btn("→", () => go(1), "cb09-switcher__step");
  next.title = "Next variant (→)";
  const label = el("span", "cb09-switcher__label");
  label.append(el("span", "cb09-switcher__tag", "PROTOTYPE cb09"), el("strong", "", NAMES[current]));
  bar.append(prev, label, next);
  document.body.append(bar);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']") || active.closest(".monaco-editor, .cm-editor, [role='tree'], [role='listbox'], [role='menu'], [role='tablist'], dialog"))) return;
    if (document.querySelector("dialog[open]")) return;
    go(event.key === "ArrowLeft" ? -1 : 1);
  });
}

// ---- Test material, made once through the real draft path. ----
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed() {
  for (let i = 0; i < 240; i++) {
    const d = deps();
    if (d.site() && d.source("index.html") !== undefined && d.editor()?.isMounted("index.html")) break;
    await wait(500);
  }
  await wait(600);
  const d = deps();
  if (!d.site()) return;
  const made: string[] = [];
  for (const page of DRAFT_PAGES) {
    if (d.exists(page.file)) continue;
    if (!d.saveNewDraft(page.file, draftPageDocument(page))) made.push(page.route);
  }
  const source = d.source("index.html");
  if (source !== undefined && !source.includes('id="cb09-scratch"') && d.editor()?.isMounted("index.html")) {
    const work = source.indexOf('id="work"');
    const close = work < 0 ? -1 : source.indexOf("</section>", work);
    const at = close < 0 ? source.lastIndexOf("\n", source.indexOf("</main>")) + 1 : source.indexOf("\n", close) + 1;
    const indent = "    ";
    const text = `${SCRATCH.split("\n").map((line) => `${indent}${line}`).join("\n")}\n`;
    if (d.change("index.html", source, [{ start: at, end: at, text }], undefined, "PROTOTYPE cb09: scratch grid “Shop” added (its cards are not links)")) made.push("the scratch grid “Shop”");
  }
  if (made.length) toast(`PROTOTYPE cb09 made test material as drafts: ${made.join(", ")}. Orchard Bakery and Quiet Lane Books are under /work/ but not in “Recent work”.`);
}
