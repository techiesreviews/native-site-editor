import { createGrip, isToggleKey, trackPress } from "./resize-handle";
import "./style-panel-resize.css";

/** The Style dock shares the page-structure splitter's drag/click/keyboard contract. */
export function mountStylePanelResize(workspace: HTMLElement, panel: HTMLElement, change: (collapsed: boolean) => void) {
  const key = "astro-editor.style-width", lastKey = `${key}-last`;
  const handle = document.createElement("div");
  handle.className = "style-panel-resize"; handle.tabIndex = 0;
  handle.setAttribute("role", "separator"); handle.setAttribute("aria-label", "Resize Style panel");
  handle.setAttribute("aria-orientation", "vertical"); handle.setAttribute("aria-controls", "style-dock");
  panel.id = "style-dock"; handle.append(createGrip()); panel.append(handle);
  const read = (name: string) => { try { const value = localStorage.getItem(name); return value === null ? NaN : Number(value); } catch { return NaN; } };
  const saved = read(key), savedLast = read(lastKey);
  let requested = saved === 0 || saved >= 160 ? saved : 0;
  let last = savedLast >= 160 ? savedLast : requested || 280;
  let width = 0, disposed = false, drag: { x: number; width: number } | undefined;
  // Below this canvas width an open dock would squeeze the page into a sliver,
  // so Style floats over the canvas as a drawer from the same right edge.
  const overlayBelow = 560, overlay = () => workspace.clientWidth < overlayBelow;
  const maximum = () => Math.max(0, Math.min(560, overlay() ? workspace.clientWidth - 48 : workspace.clientWidth - Math.min(360, workspace.clientWidth * .4)));
  const minimum = () => Math.min(160, maximum());
  const apply = (value: number, retain = true) => {
    if (disposed) return;
    width = value < minimum() / 2 ? 0 : Math.round(Math.max(minimum(), Math.min(maximum(), value)));
    if (!width && panel.contains(document.activeElement) && document.activeElement !== handle) handle.focus();
    // A drawer width is a clamp of the desktop request, never a new preference.
    if (retain) requested = !width ? 0 : overlay() ? requested || last : value;
    workspace.style.setProperty("--style-panel-width", `${width}px`);
    for (const child of panel.children) {
      if (!(child instanceof HTMLElement) || child === handle) continue;
      child.inert = width === 0;
      if (!width) child.setAttribute("aria-hidden", "true"); else child.removeAttribute("aria-hidden");
    }
    workspace.classList.toggle("has-style-panel", width > 0);
    workspace.classList.toggle("style-panel-overlay", overlay());
    handle.classList.toggle("is-collapsed", width === 0);
    handle.setAttribute("aria-valuemin", "0"); handle.setAttribute("aria-valuemax", String(Math.round(maximum())));
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuetext", width ? `Style shown, ${width} pixels` : "Style hidden");
    handle.title = `Drag to resize, click to ${width ? "hide" : "show"} Style`;
    change(width === 0);
  };
  const save = () => { try { localStorage.setItem(key, String(requested)); localStorage.setItem(lastKey, String(last)); } catch {} };
  const collapse = () => { if (width) last = requested || width; apply(0); save(); };
  const expand = () => { apply(last); save(); };
  const toggle = () => width ? collapse() : expand();
  trackPress(handle, {
    start(event) { if (disposed) return false; drag = { x: event.clientX, width }; workspace.classList.add("style-panel-resizing"); return true; },
    move(event) { if (drag) apply(drag.width + drag.x - event.clientX); },
    end(click) { if (disposed) return; const from = drag?.width; drag = undefined; workspace.classList.remove("style-panel-resizing"); if (click) return toggle(); if (width && !overlay()) { last = width; requested = width; } else if (!width && from && !overlay()) last = from; save(); },
  });
  handle.addEventListener("keydown", event => {
    if (isToggleKey(event)) { event.preventDefault(); toggle(); return; }
    const step = event.shiftKey ? 40 : 10;
    const values: Record<string, number> = { ArrowLeft: width ? width + step : minimum(), ArrowRight: width && width - step >= minimum() ? width - step : 0, Home: 0, End: maximum() };
    if (!(event.key in values)) return;
    event.preventDefault();
    if (!values[event.key]) collapse(); else { apply(values[event.key]); if (!overlay()) last = width; save(); }
  });
  const observer = new ResizeObserver(() => apply(requested, false)); observer.observe(workspace); apply(requested);
  return { collapse, expand, toggle, dispose() { disposed = true; observer.disconnect(); handle.remove(); for (const child of panel.children) { if (child instanceof HTMLElement) { child.inert = false; child.removeAttribute("aria-hidden"); } } workspace.classList.remove("style-panel-resizing", "has-style-panel", "style-panel-overlay"); workspace.style.removeProperty("--style-panel-width"); } };
}
