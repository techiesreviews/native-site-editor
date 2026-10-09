// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Structure while a template is edited. Round 2 (Lex): it shows the end
// result, as the editor's Page Structure shows this component on a page, in
// its own row styles, names and icons ("Section work · Recent work",
// "Heading · Recent work", "Block", the cards), not the template's insides:
// a slot has no row of its own; the rows of what it shows (its fallback, or
// in A with "Show this page's content" what the page puts there) carry its
// name as a badge and a purple mark, as ticket 04's making mode marked them.
// One purple outline goes round the component's rows. A nested component
// keeps "Open ›". A breadcrumb leads back out of a drilled component.
// Rows select their part, hovering a row shows its chip on the canvas (and
// the canvas hover marks the row), and a drag shows its place as a line here.

import { componentIcon } from "../page-builder/component-icon";
import { elementIcon } from "../components/element-icons";
import { structureLabel } from "../native-structure";
import { componentLabel } from "../native-insert";
import { deps, el, latest, mode, isItemsSlot, templatePath, frameSelect, type Model, type TNode, type Target } from "./cb14-core";
import { renameInput, renaming, startRename, setHoverFromTree, formerSlots, hooks as layerHooks } from "./cb14-layer";

export const treeHooks: { crumb?: (index: number) => void; drill?: (n: TNode) => void } = {};
let panel: HTMLElement | undefined;
let body: HTMLElement | undefined;
let crumbs: HTMLElement | undefined;
/** Rows by template node key (a slot's key: the row holding its empty place, if any). */
const rows = new Map<string, HTMLElement>();
let hoveredKeys = new Set<string>();

export function treePanel() {
  if (panel) return panel;
  panel = el("section", "cb14-tree");
  panel.setAttribute("aria-label", "Page structure while editing the component");
  const head = el("div", "sidebar-heading cb14-tree__head");
  head.append(el("span", "eyebrow", "Page structure"));
  crumbs = el("nav", "cb14-tree__crumbs");
  crumbs.setAttribute("aria-label", "Component breadcrumb");
  const scroller = el("div", "page-structure cb14-structure");
  body = el("div", "page-structure__tree");
  body.setAttribute("role", "tree");
  scroller.append(body);
  panel.append(head, crumbs, scroller);
  const sidebar = document.querySelector<HTMLElement>(".sidebar");
  sidebar?.querySelector(".sidebar-heading")?.before(panel);
  layerHooks.renameMirror = (p) => mirrorRename(p);
  layerHooks.hovered = (keys) => {
    const next = new Set(keys);
    for (const [key, row] of rows) row.classList.toggle("cb14-row-hover", next.has(key));
    hoveredKeys = next;
  };
  body.addEventListener("pointerleave", () => setHoverFromTree(undefined));
  return panel;
}

interface DRow {
  key?: string;
  node?: TNode;
  tag: string;
  kind: string;
  text: string;
  component: boolean;
  depth: number;
  /** The slot whose content this row shows. */
  slot?: TNode;
  /** What the page puts in the slot (not part of the template). */
  page?: boolean;
  empty?: boolean;
  open?: TNode;
  hasKids: boolean;
}
const isComponent = (tag: string) => Boolean(deps().site() && Object.hasOwn(deps().site()!.components, tag));
function label(tag: string, text: string, heading: string, kids: number) {
  const component = isComponent(tag);
  return { ...structureLabel({ tag, text, heading, children: { length: kids } }, component), component };
}

/** The rows of what renders: slots resolved into what they show. */
function displayRows(model: Model): DRow[] {
  const out: DRow[] = [];
  const tag = model.tag ?? "";
  const top = label(tag, "", model.hd, 1);
  out.push({ key: "", tag, kind: top.kind, text: top.text, component: true, depth: 0, hasKids: true });
  const visit = (list: TNode[], depth: number, inSlot?: TNode) => {
    for (const n of list) {
      if (n.slot) {
        if (n.slot.showsPage && n.pageItems?.length) {
          for (const item of n.pageItems) {
            const l = label(item.t, item.txt, item.hd, item.n);
            out.push({ tag: item.t, kind: l.kind, text: l.text, component: l.component, depth, slot: n, page: true, hasKids: false });
          }
        } else if (n.kids.length && !n.hid) visit(n.kids, depth, n);
        else if (n.slot.drop || !n.hid) out.push({ key: n.key, node: n, tag: "slot", kind: "Empty", text: "", component: false, depth, slot: n, empty: true, hasKids: false });
        continue;
      }
      if (n.hid) continue;
      const l = label(n.t, n.txt, n.hd, n.kids.length);
      const kids = n.inst ? [] : n.kids;
      out.push({ key: n.key, node: n, tag: n.t, kind: l.kind, text: l.text, component: l.component, depth, slot: inSlot, open: n.inst ? n : undefined, hasKids: kids.length > 0 });
      if (kids.length) visit(kids, depth + 1);
    }
  };
  visit(model.roots.length === 1 && !model.roots[0].slot ? model.roots[0].kids : model.roots, 1);
  return out;
}

export function drawTree(model: Model) {
  const now = mode.now;
  if (!now || !body || !crumbs) return;
  crumbs.replaceChildren();
  if (now.chain.length > 1) {
    now.chain.forEach((step, i) => {
      if (i) crumbs!.append(el("span", "cb14-tree__sep", "›"));
      const last = i === now.chain.length - 1;
      const crumb = el("button", `cb14-tree__crumb${last ? " is-current" : ""}`);
      crumb.type = "button";
      crumb.append(componentIcon(12), document.createTextNode(` ${componentLabel(step.tag)}`));
      crumb.disabled = last;
      crumb.title = last ? `Editing <${step.tag}>` : `Back to <${step.tag}>`;
      crumb.addEventListener("click", () => treeHooks.crumb?.(i));
      crumbs!.append(crumb);
    });
  }
  crumbs.hidden = now.chain.length < 2;
  const sel = deps().selection();
  const selected = sel && sel.path === templatePath() && sel.node ? sel.node.join(".") : undefined;
  const rootSelected = selected === (model.roots.length === 1 ? model.roots[0].key : undefined);
  rows.clear();
  const list = displayRows(model);
  const els: HTMLElement[] = [];
  list.forEach((d, i) => {
    const row = el("div", "page-structure__row cb14-row");
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", String(d.depth + 1));
    row.style.setProperty("--depth", String(d.depth));
    const isRoot = i === 0;
    const isSel = isRoot ? rootSelected : d.key !== undefined && d.key === selected;
    row.setAttribute("aria-selected", String(Boolean(isSel)));
    if (d.hasKids) row.setAttribute("aria-expanded", "true");
    const toggle = el("span", "page-structure__toggle");
    toggle.setAttribute("aria-hidden", "true");
    const lab = el("span", "page-structure__label");
    if (d.component) {
      const k = el("span", "page-structure__kind", d.kind);
      k.prepend(componentIcon(12));
      lab.append(k);
      row.classList.add("page-structure__row--component");
      if (isRoot || d.open) row.classList.add("page-structure__row--instance");
    } else {
      const k = el("span", "page-structure__kind page-structure__kind--icon");
      k.title = d.kind;
      k.append(elementIcon(d.empty ? "slot" : d.tag, 14), el("span", d.text ? "sr-only" : "", d.kind));
      lab.append(k);
    }
    if (d.text) lab.append(" ", el("span", "page-structure__text", d.text));
    row.append(toggle, lab);
    const target = isRoot ? model.roots[0] : d.node;
    if (target) row.dataset.p = target.key;
    if (isRoot) { row.classList.add("cb14-srow--root"); if (model.roots[0]) rows.set(model.roots[0].key, row); }
    if (d.key) rows.set(d.key, row);
    // Ticket 04's marks: a slot's rows carry its name; a slot unchecked this session reads ○.
    if (d.slot) {
      row.classList.add("cb14-srow");
      if (d.page) row.classList.add("cb14-srow--page");
      if (d.empty) row.classList.add("page-structure__row--empty-slot");
      const first = list.findIndex((x) => x.slot === d.slot) === i;
      if (first) {
        if (renaming.p?.join(".") === d.slot.key) {
          if (!treeInput) treeInput = renameInput(renaming.original ?? "", "cb14-mode__field cb14-mode__field--tree");
          row.append(treeInput);
        } else {
          const badge = el("button", `cb14-sbadge${isItemsSlot(d.slot) ? " is-items" : ""}`, d.slot.slot!.name || "items");
          badge.type = "button";
          badge.title = `${d.page ? "This page's content in" : "Fallback of"} the slot “${d.slot.slot!.name || "unnamed"}” · double-click to rename`;
          const slotNode = d.slot;
          badge.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); startRename(slotNode); });
          row.append(badge);
        }
      }
    } else if (d.node && formerSlots.some((f) => f.path.join(".") === d.node!.key)) {
      row.append(el("span", "cb14-sbadge is-fixed", `○ ${formerSlots.find((f) => f.path.join(".") === d.node!.key)!.name}`));
    }
    if (d.open) {
      const open = el("button", "cb14-row__open", "Open ›");
      open.type = "button";
      open.title = `Edit <${d.open.t}>'s own template`;
      const inst = d.open;
      open.addEventListener("click", (e) => { e.stopPropagation(); treeHooks.drill?.(inst); });
      row.append(open);
    }
    if (target && hoveredKeys.has(target.key)) row.classList.add("cb14-row-hover");
    row.addEventListener("click", (event) => {
      if ((event.target as Element).closest("button, input")) return;
      if (target) void frameSelect(target.p);
      else if (d.slot) void frameSelect(d.slot.p);
    });
    row.addEventListener("pointerenter", () => setHoverFromTree(target?.key ?? d.slot?.key));
    els.push(row);
  });
  // One outline round the component's rows (ticket 04's group border).
  const group = el("div", "page-structure__group cb14-sgroup");
  group.append(...els.slice(1));
  body.replaceChildren(els[0], group);
}

let treeInput: HTMLInputElement | undefined;
function mirrorRename(p: number[] | undefined) {
  if (!p) treeInput = undefined;
  if (latest.model) drawTree(latest.model);
  if (p && treeInput) treeInput.classList.add("is-mirror");
}

// ---- The drag's place, mirrored as an indented line. ----
let line: HTMLElement | undefined;
let marked: HTMLElement | undefined;
const lastRowOf = (n: TNode): HTMLElement | undefined => {
  const deepest = (m: TNode): TNode => (m.kids.length && !m.inst ? deepest(m.kids.at(-1)!) : m);
  return rows.get(deepest(n).key) ?? rows.get(n.key);
};
export function treeLine(t: Target | undefined) {
  marked?.classList.remove("is-target", "is-refused");
  marked = undefined;
  if (!t || !body) { line?.remove(); line = undefined; return; }
  // A slot has no row: its parent's row stands for it.
  let holder = t.box.node;
  while (holder?.slot && !rows.has(holder.key)) holder = holder.parent;
  const containerRow = holder ? rows.get(holder.key) : undefined;
  const items = t.box.node ? t.box.node.kids : latest.model?.roots ?? [];
  const after = [...items].reverse().find((n) => n.p.at(-1)! < t.index);
  const anchor = after ? lastRowOf(after) : (t.box.node && rows.get(t.box.node.key)) ?? containerRow;
  if (containerRow) { containerRow.classList.add(t.ok ? "is-target" : "is-refused"); marked = containerRow; }
  if (!anchor) { line?.remove(); line = undefined; return; }
  if (!line) { line = el("div", "cb14-tree-line"); document.body.append(line); }
  const r = anchor.getBoundingClientRect();
  const depth = Number(anchor.style.getPropertyValue("--depth") || 0) + (after ? 0 : 1);
  const b = body.getBoundingClientRect();
  const left = b.left + 14 + depth * 12;
  Object.assign(line.style, { left: `${left}px`, top: `${r.bottom - 1}px`, width: `${Math.max(b.right - left - 10, 30)}px` });
  line.classList.toggle("is-refused", !t.ok);
}
export function removeTree() { panel?.remove(); panel = undefined; body = undefined; crumbs = undefined; rows.clear(); treeLine(undefined); }
