import "./sidebar-resize.css";
import { createGrip, isToggleKey, trackPress } from "./resize-handle";

export interface SidebarResize {
  dispose(): void;
}

// The one source of truth for the sidebar's width. The handle on its right
// edge resizes when dragged and hides or shows the sidebar when clicked (or
// with Enter/Space); all of it goes through `apply`. In the narrow column
// layout the same handle is a bar along the sidebar's bottom edge that only
// toggles.
export function mountSidebarResize(
  workspace: HTMLElement,
  sidebar: HTMLElement,
): SidebarResize {
  const key = "astro-editor.sidebar-width";
  // The last width the sidebar showed at, so hiding and showing again
  // restores it rather than the default.
  const lastKey = "astro-editor.sidebar-width-last";
  const handle = document.createElement("div");
  handle.className = "sidebar-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-label", "Resize page structure sidebar");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-controls", "structure-sidebar");
  handle.append(createGrip());
  sidebar.id = "structure-sidebar";
  sidebar.append(handle);
  const narrow = () => workspace.clientWidth <= 650;
  // Sliding below the minimum collapses the sidebar to nothing; the handle
  // stays at the left edge so it can be pulled out again.
  const minimum = 160;
  const fallback = 280;
  let width = fallback;
  let last = fallback;
  const read = (name: string) => {
    try {
      const stored = localStorage.getItem(name);
      return stored === null ? NaN : Number(stored);
    } catch {
      return NaN;
    }
  };
  const saved = read(key);
  if (saved === 0 || saved >= minimum) width = saved;
  const savedLast = read(lastKey);
  if (savedLast >= minimum) last = savedLast;
  else if (width > 0) last = width;
  const maximum = () =>
    Math.max(minimum, Math.min(560, workspace.clientWidth - 360));
  let drag: { x: number; width: number } | undefined;
  function apply(value: number) {
    width = value < minimum / 2 ? 0 : Math.round(Math.max(minimum, Math.min(maximum(), value)));
    workspace.classList.toggle("workspace--sidebar-collapsed", width === 0);
    workspace.style.setProperty("--sidebar-width", `${width}px`);
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", String(maximum()));
    handle.setAttribute("aria-valuenow", String(width));
    // `aria-expanded` is not allowed on a separator, so the value text
    // carries the state.
    handle.setAttribute("aria-valuetext", width === 0 ? "Page structure hidden" : `Page structure shown, ${width} pixels`);
    handle.classList.toggle("is-collapsed", width === 0);
    handle.title = `${narrow() ? "Click" : "Drag to resize, click"} to ${width === 0 ? "show" : "hide"} the page structure`;
    // A drag only settles the width to come back to when it ends, so one
    // that passes through the minimum on its way to nothing keeps the width
    // it started from.
    if (width > 0 && !drag) last = width;
  }
  const save = () => {
    try {
      localStorage.setItem(key, String(width));
      localStorage.setItem(lastKey, String(last));
    } catch {}
  };
  const toggle = () => {
    apply(width === 0 ? last : 0);
    save();
  };
  trackPress(handle, {
    start(event) {
      drag = { x: event.clientX, width };
      workspace.classList.add("workspace--resizing");
      return true;
    },
    move(event) {
      // The column layout has no width to drag.
      if (drag && !narrow()) apply(drag.width + event.clientX - drag.x);
    },
    end(click) {
      const from = drag?.width ?? 0;
      drag = undefined;
      workspace.classList.remove("workspace--resizing");
      if (click) return toggle();
      if (width > 0) last = width;
      else if (from > 0) last = from;
      save();
    },
  });
  handle.addEventListener("keydown", (event) => {
    if (isToggleKey(event)) {
      event.preventDefault();
      toggle();
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    const values: Record<string, number> = {
      ArrowLeft: width === 0 ? 0 : Math.max(0, width - step) < minimum ? 0 : width - step,
      ArrowRight: width === 0 ? minimum : width + step,
      Home: 0,
      End: maximum(),
    };
    if (!(event.key in values)) return;
    event.preventDefault();
    apply(values[event.key]);
    save();
  });
  const observer = new ResizeObserver(() => {
    handle.setAttribute("aria-orientation", narrow() ? "horizontal" : "vertical");
    if (!narrow()) apply(width);
    else handle.title = `Click to ${width === 0 ? "show" : "hide"} the page structure`;
  });
  observer.observe(workspace);
  apply(width);
  return {
    dispose() {
      observer.disconnect();
      handle.remove();
      workspace.classList.remove("workspace--resizing");
    },
  };
}
