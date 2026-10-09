// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// Variant D: the six blocks as an icon rail left of Page Structure. An icon
// drags (A's line and label on the canvas, C's indented line in Structure,
// which also mirrors a canvas target), or a click inserts the block at once,
// following the selection, so a page builds by clicking:
//   Section or Div selected   the block goes inside it, at the end
//   a leaf selected           right after it, in its container
//   nothing selected          Section after the last band; others into the
//                             last Section, or a new Section made for them
//   Section clicked           after the selection's page band (never nested)
// The new block is selected, so the next click builds on it; Esc (here or in
// the page) or the breadcrumb goes up a level. A's label flashes at the new
// block; a refusal flashes A's red reason instead.

import sectionIcon from "@phosphor-icons/core/regular/rows.svg?raw";
import divIcon from "@phosphor-icons/core/regular/rectangle-dashed.svg?raw";
import imageIcon from "@phosphor-icons/core/regular/image.svg?raw";
import headingIcon from "@phosphor-icons/core/regular/text-h.svg?raw";
import paragraphIcon from "@phosphor-icons/core/regular/text-align-left.svg?raw";
import buttonIcon from "@phosphor-icons/core/regular/cursor-click.svg?raw";
import {
  BLOCKS, framePost, boxOfChild, boxPath, boxRect, commit, containerKind, deps, el, endIndex, fresh, measure, pagePath, readout, targetFor, whereText,
  type BlockKind, type Box, type Dragged, type Model, type PNode, type Target,
} from "./cb12-core";
import { pressToDrag, recentlyDragged, rectEl } from "./cb12-drag";
import { boxInside, expandTo } from "./cb12-tree";

const ICONS: Record<BlockKind, string> = { section: sectionIcon, div: divIcon, image: imageIcon, heading: headingIcon, paragraph: paragraphIcon, button: buttonIcon };
const named = (kind: BlockKind): Extract<Dragged, { kind: "new" }> => ({ kind: "new", block: kind, layout: "flow", name: BLOCKS.find((b) => b.kind === kind)!.name });

export function mountRail() {
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace || workspace.querySelector(".cb12-rail")) return;
  const rail = el("nav", "cb12-rail");
  rail.setAttribute("aria-label", "Blocks");
  const tip = el("div", "cb12-rail__tip");
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  const showTip = (button: HTMLElement, name: string) => {
    const r = button.getBoundingClientRect();
    tip.textContent = name;
    tip.style.left = `${r.right + 8}px`;
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.hidden = false;
  };
  for (const block of BLOCKS) {
    const button = el("button", "cb12-rail__item");
    button.type = "button";
    button.dataset.block = block.kind;
    button.setAttribute("aria-label", block.name);
    button.innerHTML = ICONS[block.kind];
    button.addEventListener("pointerenter", () => showTip(button, block.name));
    button.addEventListener("focus", () => { if (button.matches(":focus-visible")) showTip(button, block.name); });
    button.addEventListener("pointerleave", () => { if (document.activeElement !== button) tip.hidden = true; });
    button.addEventListener("blur", () => { tip.hidden = true; });
    button.addEventListener("pointerdown", (event) => { tip.hidden = true; pressToDrag(event, button, () => named(block.kind), 5); });
    button.addEventListener("click", () => { tip.hidden = true; if (!recentlyDragged()) void clickInsert(block.kind); });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); upALevel(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...rail.querySelectorAll<HTMLElement>(".cb12-rail__item")];
        items[(items.indexOf(button) + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    rail.append(button);
  }
  workspace.prepend(rail);
  document.body.append(tip);
  document.documentElement.classList.add("cb12-has-rail");
}

/** Esc on the rail: the selection's container is selected (the page's own Esc does the same). */
function upALevel() {
  const s = deps().selection();
  const path = pagePath();
  if (!s?.node || s.node.length < 2 || s.path !== path) return;
  deps().preview()?.selectNode({ path, node: s.node.slice(0, -1) });
}

const bandOf = (n: PNode | undefined) => { let at = n; while (at?.parent && at.parent.t !== "main") at = at.parent; return at?.parent?.t === "main" ? at : undefined; };

/** Where a click puts a block, from the selection (see the top of this file). */
function clickTarget(model: Model, d: Extract<Dragged, { kind: "new" }>): { t?: Target; wrap?: boolean; at?: PNode } {
  const main = model.main();
  if (!main) return {};
  const sel = deps().selection();
  let node = sel?.node && !sel.host && sel.path === pagePath() ? model.get(sel.node) : undefined;
  if (node && (node.t === "main" || node.t === "body")) node = undefined;
  if (d.block === "section") {
    const band = bandOf(node);
    return { t: targetFor(d, { node: main }, band ? band.p.at(-1)! + 1 : main.kids.length), at: node };
  }
  if (node) {
    const kind = containerKind(node);
    if (kind === "section" || kind === "div") return { t: targetFor(d, { node }, node.kids.length), at: node };
    if (kind === "instance") {
      const items = (node.slots ?? []).find((s) => s.items && s.shown);
      if (items) { const box: Box = { node, slot: items }; return { t: targetFor(d, box, endIndex(box)), at: node }; }
      const first = boxInside(node);
      const t = first ? targetFor(d, first, endIndex(first)) : undefined;
      return { t: t && { ...t, ok: false, reason: `${t.box.node.t} has no items slot; its slots are filled by editing. Select a Section or a Div.` }, at: node };
    }
    const box = boxOfChild(node);
    return { t: box ? targetFor(d, box, node.p.at(-1)! + 1) : undefined, at: node };
  }
  const last = [...main.kids].reverse().find((n) => n.t === "section");
  if (last) return { t: targetFor(d, { node: last }, last.kids.length) };
  // No Section yet: a new one, holding the block, after the last band.
  const t = targetFor({ ...d, block: "section" }, { node: main }, main.kids.length);
  return { t, wrap: true };
}

export async function clickInsert(kind: BlockKind) {
  const model = await measure();
  if (!model) return;
  const d = named(kind);
  const { t, wrap, at } = clickTarget(model, d);
  if (!t) { readout(`${d.name}: nowhere to go`, ["Select a Section or a Div."], "refused"); return; }
  const where = wrap ? `Into a new Section › ${d.name}` : whereText(t);
  if (!t.ok) {
    flash(model, at ? { node: at } : t.box, `✕ ${t.reason ?? "Not here"}`, true);
    readout(`${d.name}: refused (click)`, [`Container: ${boxPath(t.box)}`, `Reason: ${t.reason ?? ""}`], "refused");
    deps().announce(`Not here: ${t.reason ?? ""}`);
    return;
  }
  readout(`${d.name}: click insert`, [`Target: ${boxPath(t.box)} · index ${t.index}`, where], "ok");
  const result = await commit(d, t, { wrap });
  readout(result.ok ? `${d.name} added (click)` : `${d.name}: not added`, [`Target: ${boxPath(t.box)} · index ${t.index}`, result.text], result.ok ? "done" : "refused");
  if (!result.ok || !result.select) return;
  deps().announce(`${d.name} added. ${where}`);
  // The label flashes at the new block once the page shows it; Structure follows.
  const key = result.select.join(".");
  let revealed = false;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 120));
    const now = await measure();
    const added = now?.byKey.get(key);
    // Brought into sight once the page has it, then measured again.
    if (added && !revealed) { revealed = true; framePost("reveal", { node: result.select }); continue; }
    if (now && added && added.t === (wrap ? "section" : added.t) && added.r[3] > 0) {
      flash(now, { node: added }, where, false);
      expandTo(undefined);
      return;
    }
  }
}

const layerWidth = () => document.querySelector<HTMLElement>(".cb12-layer")?.clientWidth ?? innerWidth;
let flashTimer: ReturnType<typeof setTimeout> | undefined;
let flashed: HTMLElement[] = [];
/** A's label (or red reason) for a moment at a box. */
function flash(model: Model, box: Box, text: string, refused: boolean) {
  const now = fresh(box, model) ?? box;
  const r = boxRect(now);
  for (const old of flashed) old.remove();
  flashed = [];
  const outline = rectEl(refused ? "cb12-box cb12-box--refused cb12-flash" : "cb12-box cb12-box--target cb12-flash cb12-flash--new", r);
  // At the block's top right, clear of the edit bar (top left).
  const width = layerWidth();
  const label = rectEl(`cb12-flash-label${refused ? " is-refused" : ""}`, [Math.min(r[0] + r[2], width - 8), Math.max(r[1] - 30, 2), 0, 0], text);
  flashed = [outline, label];
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { for (const old of flashed) old.classList.add("is-leaving"); setTimeout(() => { for (const old of flashed) old.remove(); flashed = []; }, 260); }, refused ? 2600 : 1600);
}

export { flash };
