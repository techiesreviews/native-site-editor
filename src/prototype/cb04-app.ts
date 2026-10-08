// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// Loaded only with ?proto=components. Mounts the variant switcher and the
// entry points (Add panel, Structure row, ⌘K), and sends each flow to the
// current variant: ?variant=A (dialog), B (in the preview), C (drawer / canvas).

import { cb04Variant, type Cb04Host, type Cb04Variant } from "./cb04";
import { state, el, btn, deps, targetOf, toast } from "./cb04-core";
import { registerCommand } from "../page-builder/commands";
import type { NativePreviewSelection } from "../components/native-preview";
import { makeDialog, makeInPreview, makeDrawer } from "./cb04-make";
import { newDialog, newBuildFirst, newCanvas } from "./cb04-new";
import "./cb04.css";

const NAMES: Record<Cb04Variant, string> = { A: "A (Dialog)", B: "B (In-preview)", C: "C (Drawer · Canvas)" };
const ORDER: Cb04Variant[] = ["A", "B", "C"];
let mounted = false;

export function install(host: Cb04Host) {
  state.host = host;
  if (mounted) return;
  mounted = true;
  document.documentElement.dataset.cb04Variant = cb04Variant();
  mountSwitcher();
  watchAddPanel();
  watchStructure();
  watchFilesRoot();
  registerCommand({
    id: "cb04.make", title: "Make component from selection", group: "Selection", icon: "component", keywords: ["prototype", "component"],
    when: () => Boolean(selectionTarget()),
    run: () => { const s = deps().selection(); if (s) void makeFromSelection(s, "palette"); },
  });
  registerCommand({
    id: "cb04.new", title: "New component…", group: "Components", icon: "component", keywords: ["prototype", "create", "component"],
    when: () => Boolean(deps().site()),
    run: () => void newComponent("palette"),
  });
}

// ---- The switcher: ← label →, outside the design. ----
function mountSwitcher() {
  const current = cb04Variant();
  const go = (step: number) => {
    const next = ORDER[(ORDER.indexOf(current) + step + ORDER.length) % ORDER.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(history.state, "", url);
    location.reload();
  };
  const bar = el("div", "cb04-switcher");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Prototype variant");
  const prev = btn("←", () => go(-1), "cb04-switcher__step");
  prev.title = "Previous variant (←)";
  const next = btn("→", () => go(1), "cb04-switcher__step");
  next.title = "Next variant (→)";
  const label = el("span", "cb04-switcher__label");
  label.append(el("span", "cb04-switcher__tag", "PROTOTYPE cb04"), el("strong", "", NAMES[current]));
  bar.append(prev, label, next);
  document.body.append(bar);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']") || active.closest(".monaco-editor, [role='tree'], [role='listbox'], [role='menu'], [role='tablist'], dialog, .cb04-canvas"))) return;
    if (document.querySelector("dialog[open]")) return;
    go(event.key === "ArrowLeft" ? -1 : 1);
  });
}

// ---- Flow 1: Make component from built HTML. ----
function selectionTarget() {
  const s = deps().selection();
  if (!s || s.host || !s.node || s.tag === "main" || s.tag.includes("-")) return undefined;
  return targetOf(s);
}

export async function makeFromSelection(selection: NativePreviewSelection, _from: "edit-bar" | "palette" | "structure") {
  const target = targetOf(selection);
  if (!target) { toast("Select a section or a container on the page first."); return; }
  const variant = cb04Variant();
  if (variant === "A") return makeDialog(target);
  if (variant === "B") return makeInPreview(target);
  return makeDrawer(target);
}

// ---- Flow 2: New component. ----
export async function newComponent(_from: "add" | "palette" | "files", _folder = "components") {
  const variant = cb04Variant();
  if (variant === "A") return newDialog();
  if (variant === "B") return newBuildFirst();
  return newCanvas();
}

// The Add panel gains a "New component" row at its top.
function watchAddPanel() {
  const decorate = () => {
    const panel = document.querySelector<HTMLElement>(".pb-add-panel");
    if (!panel || panel.querySelector(".cb04-add-new")) return;
    const row = btn("", () => {
      panel.querySelector<HTMLButtonElement>(".pb-add-panel__close")?.click();
      void newComponent("add");
    }, "cb04-add-new");
    row.append(el("span", "cb04-add-new__plus", "+"), el("span", "cb04-add-new__text", "New component"),
      el("span", "cb04-add-new__hint", cb04Variant() === "B" ? "Build it on the page, name it at the end" : cb04Variant() === "C" ? "Opens the template canvas" : "Name it, then edit its template"));
    panel.querySelector(".pb-add-panel__position")?.before(row);
  };
  new MutationObserver(decorate).observe(document.body, { childList: true });
  decorate();
}

// Variant C: the selected Structure row gets a ⋯ menu with Make component.
function watchStructure() {
  if (cb04Variant() !== "C") return;
  let menu: HTMLElement | undefined;
  const closeMenu = () => { menu?.remove(); menu = undefined; };
  const decorate = () => {
    for (const old of document.querySelectorAll(".cb04-row-more")) if (!old.closest(".page-structure__row[aria-selected='true']")) old.remove();
    const row = document.querySelector<HTMLElement>(".page-structure__row[aria-selected='true']");
    if (!row || row.querySelector(".cb04-row-more") || !selectionTarget()) return;
    const open = () => {
      closeMenu();
      menu = el("div", "cb04-row-menu");
      menu.setAttribute("role", "menu");
      const item = btn("Make component…", () => { closeMenu(); const s = deps().selection(); if (s) void makeFromSelection(s, "structure"); }, "cb04-row-menu__item");
      item.setAttribute("role", "menuitem");
      menu.append(item);
      const box = row.getBoundingClientRect();
      menu.style.left = `${box.right - 150}px`;
      menu.style.top = `${box.bottom + 2}px`;
      document.body.append(menu);
      item.focus();
      setTimeout(() => document.addEventListener("pointerdown", (event) => { if (!menu?.contains(event.target as Node)) closeMenu(); }, { once: true }));
    };
    // The row repaints on pointerdown (it selects), so the menu opens then, not on click.
    const more = btn("⋯", () => undefined, "cb04-row-more");
    more.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); open(); });
    more.addEventListener("click", (event) => { event.stopPropagation(); if (event.detail === 0) open(); });
    more.title = "More (prototype)";
    more.setAttribute("aria-label", "More actions");
    row.append(more);
  };
  const start = () => {
    const tree = document.querySelector(".page-structure__tree");
    if (!tree) { setTimeout(start, 500); return; }
    new MutationObserver(decorate).observe(tree, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    // The selection can land after the row repaints.
    setInterval(decorate, 400);
  };
  start();
}

// The Files tab's root gets a "New component" button beside its "+".
function watchFilesRoot() {
  const decorate = () => {
    const plus = document.getElementById("new-at-root");
    if (!plus || plus.parentElement?.querySelector(".cb04-files-new")) return;
    const add = btn("◇+", () => void newComponent("files"), "cb04-files-new");
    add.title = "New component (prototype)";
    add.setAttribute("aria-label", "New component");
    plus.after(add);
  };
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  decorate();
}
