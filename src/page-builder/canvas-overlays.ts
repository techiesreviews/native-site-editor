// What the page builder draws over the canvas, in a layer that covers the
// preview frame exactly (frame-viewport coordinates, clipped to the frame):
// the empty state of a page whose <main> has nothing in it yet, and the
// brief highlight of a section just added. Editor chrome only: neither is
// part of the page or its source.

import type { InsertPoint } from "../components/insert-controls";
import type { SelectionRect } from "../components/edit-bar";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { createThumbnail, type Thumbnail } from "./thumbnail";
import type { AddItem } from "./add-catalog";

export function createCanvasLayer(pane: HTMLElement, frame: HTMLElement) {
  const layer = node("div", "pb-canvas-layer");
  pane.append(layer);
  function layout() {
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    Object.assign(layer.style, {
      left: `${frameRect.left - paneRect.left}px`,
      top: `${frameRect.top - paneRect.top}px`,
      width: `${frameRect.width}px`,
      height: `${frameRect.height}px`,
    });
  }
  const resize = new ResizeObserver(layout);
  resize.observe(frame);
  resize.observe(pane);
  return {
    layer,
    layout,
    destroy() {
      resize.disconnect();
      layer.remove();
    },
  };
}

export interface EmptyCanvasHandlers {
  // The few sections to offer, the HTML each inserts and its thumbnail document.
  suggestions(): { item: AddItem; markup: string; doc: string }[];
  canvasWidth(): number;
  insert(point: InsertPoint, tag: string): void;
  browse(point: InsertPoint, opener: HTMLElement): void;
}

/** "Start with a section": shown over an empty <main>, with a few sections to start from. */
export function createEmptyCanvas(layer: HTMLElement, handlers: EmptyCanvasHandlers) {
  const root = node("div", "pb-empty");
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Empty page");
  root.hidden = true;
  layer.append(root);
  let point: InsertPoint | undefined;
  let rendered = "";
  const thumbs: Thumbnail[] = [];

  function render() {
    if (!point) return;
    const offered = handlers.suggestions();
    const key = offered.map(({ item, doc }) => `${item.tag}\n${doc.length}:${doc}`).join("\n\n");
    if (key === rendered && root.childElementCount) {
      offered.forEach(({ doc }, at) => thumbs[at]?.render(doc, handlers.canvasWidth()));
      return;
    }
    rendered = key;
    thumbs.splice(0).forEach((thumb) => thumb.destroy());
    const inner = node("div", "pb-empty__inner");
    const badge = node("span", "pb-empty__badge");
    badge.append(icon("plus", 20));
    const title = node("h2", "pb-empty__title", "Start with a section");
    const text = node("p", "pb-empty__text", offered.length
      ? "This page’s <main> is empty. Pick a section to add it, or drag one here from the Add panel."
      : "This page’s <main> is empty. A component fits here when its template is one <section> element.");
    inner.append(badge, title, text);
    if (offered.length) {
      const list = node("ul", "pb-empty__list");
      list.setAttribute("aria-label", "Suggested sections");
      for (const { item, markup, doc } of offered) {
        const pick = button("", () => point && handlers.insert(point, item.tag), "pb-empty__pick");
        pick.setAttribute("aria-label", `Add ${item.label}`);
        // The exact HTML it adds, on hover.
        pick.title = markup;
        const thumb = createThumbnail("pb-empty__thumb", 0.45);
        thumbs.push(thumb);
        const name = node("span", "pb-empty__name");
        name.append(node("span", "", item.name), node("code", "pb-empty__tag", `<${item.tag}>`));
        pick.append(thumb.root, name);
        const entry = node("li", "pb-empty__entry");
        entry.append(pick);
        list.append(entry);
        thumb.render(doc, handlers.canvasWidth());
      }
      inner.append(list);
      const browse = button("Browse all sections", () => point && handlers.browse(point, browse), "pb-empty__browse");
      browse.setAttribute("aria-haspopup", "dialog");
      inner.append(browse);
    }
    root.replaceChildren(inner);
  }

  function place() {
    if (!point) return;
    Object.assign(root.style, {
      left: `${point.left}px`,
      top: `${point.top}px`,
      width: `${point.width}px`,
      height: `${Math.max(point.height ?? 0, 320)}px`,
    });
  }

  return {
    /** The page's insert points changed: shown when one is an empty <main>. */
    update(points: InsertPoint[]) {
      const empty = points.find((candidate) => candidate.empty);
      point = empty;
      root.hidden = !empty;
      if (!empty) {
        root.classList.remove("is-drop");
        return;
      }
      render();
      place();
    },
    /** Sources changed (a template, a stylesheet): the suggestions again. */
    refresh() {
      if (point) render();
    },
    /** A section dragged from the Add panel is over the empty page (its name), or not. */
    dropping(name: string | undefined) {
      root.classList.toggle("is-drop", Boolean(name));
      const title = root.querySelector(".pb-empty__title");
      if (title) title.textContent = name ? `Release to add ${name}` : "Start with a section";
    },
    clear() {
      point = undefined;
      root.hidden = true;
    },
  };
}

/** The brief highlight around a section just added. */
export function createInsertFlash(layer: HTMLElement) {
  const box = node("div", "pb-flash");
  box.hidden = true;
  layer.append(box);
  let armed: { path: string; node: string; until: number } | undefined;
  let timer = 0;

  function place(rect: SelectionRect) {
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  return {
    /** The next selection of this element (the one an insert asked for) is highlighted. */
    arm(path: string, nodePath: number[]) {
      armed = { path, node: nodePath.join("."), until: Date.now() + 5000 };
    },
    /** The runtime selected an element: highlighted when it is the armed one. */
    selected(path: string, nodePath: number[] | undefined, rect: SelectionRect | undefined) {
      if (!armed || !nodePath || !rect) return false;
      if (Date.now() > armed.until) {
        armed = undefined;
        return false;
      }
      if (armed.path !== path || armed.node !== nodePath.join(".")) return false;
      armed = undefined;
      place(rect);
      box.hidden = false;
      // Restart the fade for a second insert in a row.
      box.classList.remove("is-on");
      void box.offsetWidth;
      box.classList.add("is-on");
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        box.hidden = true;
        box.classList.remove("is-on");
      }, 1400);
      return true;
    },
    /** The selection moved (scroll, layout): the highlight follows. */
    move(rect: SelectionRect) {
      if (!box.hidden) place(rect);
    },
    clear() {
      armed = undefined;
      box.hidden = true;
    },
  };
}
