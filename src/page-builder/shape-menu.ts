// The shape menu shared by the image popup and the large editor (slice 110): a button that names
// the current shape ("16:9 ▾") and a menu of shapes on the top layer, anchored to the button. A
// shaped component's own shape comes first; a hand-written ratio is offered while the place has it;
// Free only for a picture that can be trimmed. Arrow keys, Home and End move in the menu; Tab
// closes it. Escape and presses outside are the host's (it knows what else is open).
import { node } from "../ui/dom";
import { icon } from "../icons";
import { componentShapeEntry, type ComponentPicture } from "./component-shapes";
import { POPUP_SHAPES, shapeLabel, type PopupShape } from "./image-popup-rules";

let anchors = 0;

/** A shape menu on `button` (its label goes in `label`); `choose` gets the shape picked. */
export function mountShapeMenu(button: HTMLButtonElement, label: HTMLElement, component: ComponentPicture | undefined, choose: (shape: PopupShape) => void) {
  let open = false, current: PopupShape = "original";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const menu = node("div", "image-popup__menu");
  menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Shape");
  // On the top layer (a manual popover), so scrolling rows, a pinned Done or a dialog never cover it (slice 94).
  menu.setAttribute("popover", "manual");
  // Each menu hangs under its own button, even with the popup and the large editor both on the page.
  const anchor = `--shape-menu-${++anchors}`;
  button.style.setProperty("anchor-name", anchor);
  menu.style.setProperty("position-anchor", anchor);
  const entry = (id: PopupShape | "custom", text: string) => {
    const item = node("button", "image-popup__item");
    item.type = "button";
    item.setAttribute("role", "menuitemradio");
    item.dataset.shape = typeof id === "string" ? id : "component";
    item.append(node("span", "", text), icon("check", 16));
    item.addEventListener("click", () => { toggle(false); button.focus(); choose(id === "custom" ? current : id); });
    return item;
  };
  const componentEntry = componentShapeEntry(component);
  const custom = entry("custom", "");
  const items = [...(componentEntry ? [entry(componentEntry.id, componentEntry.label)] : []), custom,
    ...POPUP_SHAPES.map(shape => entry(shape.id, shape.label)), entry("free", "Free")];
  menu.append(...items);
  button.addEventListener("click", () => toggle(!open));

  function toggle(next: boolean) {
    open = next;
    if (open !== menu.matches(":popover-open")) menu.togglePopover();
    button.setAttribute("aria-expanded", String(open));
    if (open) (items.find(item => !item.hidden && item.getAttribute("aria-checked") === "true") ?? items.find(item => !item.hidden))?.focus();
  }

  menu.addEventListener("keydown", event => {
    const shown = items.filter(item => !item.hidden), index = shown.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (index + 1) % shown.length : event.key === "ArrowUp" ? (index - 1 + shown.length) % shown.length
      : event.key === "Home" ? 0 : event.key === "End" ? shown.length - 1 : undefined;
    if (next !== undefined) { event.preventDefault(); shown[next].focus(); return; }
    if (event.key === "Tab") { event.preventDefault(); toggle(false); button.focus(); }
  });

  return {
    menu,
    get open() { return open; },
    toggle,
    /** Shows `shape` on the button and checks it in the menu; Free shows only when the picture can be trimmed. */
    draw(shape: PopupShape, trimmable: boolean) {
      current = shape;
      const text = shapeLabel(shape), kind = typeof shape === "string" ? shape : shape.kind === "component" ? "component" : "custom";
      label.textContent = text;
      button.setAttribute("aria-label", `Shape: ${text}`);
      custom.hidden = kind !== "custom";
      if (kind === "custom") custom.firstElementChild!.textContent = text;
      for (const item of items) {
        item.setAttribute("aria-checked", String(item === custom ? kind === "custom" : item.dataset.shape === kind));
        if (item.dataset.shape === "free") item.hidden = !trimmable;
      }
    },
  };
}
