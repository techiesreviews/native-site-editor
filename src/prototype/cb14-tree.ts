// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Structure while a template is edited: the template's own tree (fixed parts,
// slots with their chips and fallbacks, nested components to open) in place
// of the page's. A breadcrumb leads back out of a drilled component. Rows
// select their part; a slot row's chip toggles and renames like the canvas
// chip; a block dragged over the canvas or here shows the same place as an
// indented line (ticket 12's mirroring).

import { deps, el, latest, mode, isItemsSlot, nodeName, templatePath, frameSelect, type Model, type TNode, type Target } from "./cb14-core";
import { renameInput, renaming, startRename, toggleSlot, hooks as layerHooks } from "./cb14-layer";

export const treeHooks: { crumb?: (index: number) => void; drill?: (n: TNode) => void } = {};
let panel: HTMLElement | undefined;
let body: HTMLElement | undefined;
let crumbs: HTMLElement | undefined;
const rows = new Map<string, HTMLElement>();

export function treePanel() {
  if (panel) return panel;
  panel = el("section", "cb14-tree");
  panel.setAttribute("aria-label", "Template structure");
  const head = el("div", "cb14-tree__head");
  head.append(el("span", "cb14-tree__eyebrow", "Template structure"));
  crumbs = el("nav", "cb14-tree__crumbs");
  crumbs.setAttribute("aria-label", "Component breadcrumb");
  body = el("div", "cb14-tree__body");
  body.setAttribute("role", "tree");
  panel.append(head, crumbs, body);
  const sidebar = document.querySelector<HTMLElement>(".sidebar");
  sidebar?.querySelector(".page-structure")?.before(panel);
  layerHooks.renameMirror = (p) => mirrorRename(p);
  return panel;
}

const rowText = (n: TNode) => {
  if (n.slot) return "";
  if (n.inst) return "";
  return n.txt && !n.kids.length ? n.txt : "";
};

export function drawTree(model: Model) {
  const now = mode.now;
  if (!now || !body || !crumbs) return;
  // The breadcrumb: the component, then each one opened inside it.
  crumbs.replaceChildren();
  now.chain.forEach((step, i) => {
    if (i) crumbs!.append(el("span", "cb14-tree__sep", "›"));
    const last = i === now.chain.length - 1;
    const crumb = el("button", `cb14-tree__crumb${last ? " is-current" : ""}`, `◇ ${step.tag}`);
    crumb.type = "button";
    crumb.disabled = last;
    crumb.title = last ? `Editing <${step.tag}>` : `Back to <${step.tag}>`;
    crumb.addEventListener("click", () => treeHooks.crumb?.(i));
    crumbs!.append(crumb);
  });
  const sel = deps().selection();
  const selected = sel && sel.path === templatePath() && sel.node ? sel.node.join(".") : undefined;
  const seen = new Set<string>();
  const order: HTMLElement[] = [];
  const visit = (list: TNode[], depth: number) => {
    for (const n of list) {
      seen.add(n.key);
      let row = rows.get(n.key);
      if (!row) {
        row = el("div", "cb14-row");
        row.setAttribute("role", "treeitem");
        row.tabIndex = -1;
        const key = n.key;
        row.addEventListener("click", (event) => {
          if ((event.target as Element).closest("button, input")) return;
          void frameSelect(key.split(".").map(Number));
        });
        rows.set(n.key, row);
      }
      row.dataset.p = n.key;
      row.style.setProperty("--depth", String(depth));
      row.classList.toggle("is-selected", selected === n.key);
      row.classList.toggle("is-slot", Boolean(n.slot));
      row.classList.toggle("is-items", Boolean(n.slot && isItemsSlot(n)));
      row.classList.toggle("is-fallback", n.inSlot);
      row.classList.toggle("is-hidden", n.hid && !n.slot?.drop);
      row.setAttribute("aria-selected", String(selected === n.key));
      const kind = el("span", "cb14-row__kind", n.slot ? (isItemsSlot(n) ? "▦" : "✓") : n.inst ? "◇" : CONTAINER_MARK(n));
      const name = el("span", "cb14-row__name", n.slot ? (isItemsSlot(n) ? `items slot` : "slot") : n.inst ? `<${n.t}>` : nodeName(n).replace(/ <.*>$/, ""));
      const extra: HTMLElement[] = [];
      if (n.slot) {
        if (renaming.p?.join(".") === n.key) {
          if (!treeInput) { treeInput = renameInput(renaming.original ?? "", "cb14-rename--tree"); }
          extra.push(treeInput);
        } else {
          const chip = el("button", "cb14-row__chip", n.slot.name || "unnamed");
          chip.type = "button";
          chip.title = "Click: make it fixed · double-click: rename";
          let timer: ReturnType<typeof setTimeout> | undefined;
          chip.addEventListener("click", () => { clearTimeout(timer); timer = setTimeout(() => toggleSlot(n), 240); });
          chip.addEventListener("dblclick", (e) => { e.preventDefault(); clearTimeout(timer); startRename(n); });
          extra.push(chip);
        }
        if (n.slot.showsPage) extra.push(el("span", "cb14-row__note", `this page ×${n.slot.assigned}`));
        else if (n.slot.drop) extra.push(el("span", "cb14-row__note", "empty"));
      } else if (n.inst) {
        const open = el("button", "cb14-row__open", "Open ›");
        open.type = "button";
        open.title = `Edit <${n.t}>'s own template`;
        open.addEventListener("click", () => treeHooks.drill?.(n));
        extra.push(open);
      } else {
        const text = rowText(n);
        if (text) extra.push(el("span", "cb14-row__text", text));
      }
      row.replaceChildren(kind, name, ...extra);
      order.push(row);
      if (n.slot?.showsPage) {
        // What this page puts in the slot, shown under it (not part of the template).
        const page = el("div", "cb14-row cb14-row--page");
        page.style.setProperty("--depth", String(depth + 1));
        page.append(el("span", "cb14-row__kind", "⎘"), el("span", "cb14-row__name", `this page's ${n.pageItems?.length ?? n.slot.assigned} × <${n.pageItems?.[0]?.t ?? "…"}>`), el("span", "cb14-row__note", "not in the template"));
        order.push(page);
        if (n.kids.length) {
          const sub = el("div", "cb14-row cb14-row--sub", "fallback (shown with placeholders):");
          sub.style.setProperty("--depth", String(depth + 1));
          order.push(sub);
        }
      }
      if (!n.inst) visit(n.kids, depth + 1);
    }
  };
  visit(model.roots, 0);
  for (const [key, row] of rows) if (!seen.has(key)) { row.remove(); rows.delete(key); }
  body.replaceChildren(...order);
}
const CONTAINER_MARK = (n: TNode) => (/^h[1-6]$/.test(n.t) ? "H" : n.t === "p" ? "¶" : n.t === "img" ? "▣" : n.t === "a" ? "↗" : n.t === "section" ? "▭" : n.t === "div" ? "▦" : "‹›");

let treeInput: HTMLInputElement | undefined;
function mirrorRename(p: number[] | undefined) {
  if (!p) treeInput = undefined;
  if (latest.model) drawTree(latest.model);
  if (p && treeInput) treeInput.classList.add("is-mirror");
}

// ---- The drag's place, mirrored as an indented line. ----
let line: HTMLElement | undefined;
let marked: HTMLElement | undefined;
export function treeLine(t: Target | undefined) {
  marked?.classList.remove("is-target", "is-refused");
  marked = undefined;
  if (!t || !body) { line?.remove(); line = undefined; return; }
  const containerRow = t.box.node ? rows.get(t.box.node.key) : undefined;
  const items = t.box.node ? t.box.node.kids : latest.model?.roots ?? [];
  const after = [...items].reverse().find((n) => n.p.at(-1)! < t.index);
  const lastRow = (n: TNode): HTMLElement | undefined => {
    const deepest = (m: TNode): TNode => (m.kids.length && !m.inst ? deepest(m.kids.at(-1)!) : m);
    return rows.get(deepest(n).key);
  };
  const anchor = after ? lastRow(after) : containerRow;
  if (containerRow) { containerRow.classList.add(t.ok ? "is-target" : "is-refused"); marked = containerRow; }
  if (!anchor) { line?.remove(); line = undefined; return; }
  if (!line) { line = el("div", "cb14-tree-line"); document.body.append(line); }
  const r = anchor.getBoundingClientRect();
  const depth = Number(containerRow?.style.getPropertyValue("--depth") || 0) + 1;
  const left = (body.getBoundingClientRect().left) + 14 + depth * 14;
  Object.assign(line.style, { left: `${left}px`, top: `${r.bottom - 1}px`, width: `${Math.max(body.getBoundingClientRect().right - left - 10, 30)}px` });
  line.classList.toggle("is-refused", !t.ok);
}
export function removeTree() { panel?.remove(); panel = undefined; body = undefined; crumbs = undefined; rows.clear(); treeLine(undefined); }
