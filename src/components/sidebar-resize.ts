import "./sidebar-resize.css";

export interface SidebarResize {
  /** Collapse the sidebar to nothing; the width it had is kept for `show`. */
  hide(): void;
  /** Bring the sidebar back at the width it last had, or the default. */
  show(): void;
  isHidden(): boolean;
  /** Called after every width change, including hide and show. */
  onChange(listener: (hidden: boolean) => void): void;
  dispose(): void;
}

// The one source of truth for the sidebar's width: the drag handle, its keys
// and the Hide structure toggle all go through `apply`.
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
  handle.title =
    "Drag to resize. Use arrow keys when focused; double-click to reset.";
  sidebar.id = "structure-sidebar";
  sidebar.append(handle);
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
  const listeners = new Set<(hidden: boolean) => void>();
  const maximum = () =>
    Math.max(minimum, Math.min(560, workspace.clientWidth - 360));
  function apply(value: number) {
    width = value < minimum / 2 ? 0 : Math.round(Math.max(minimum, Math.min(maximum(), value)));
    workspace.classList.toggle("workspace--sidebar-collapsed", width === 0);
    workspace.style.setProperty("--sidebar-width", `${width}px`);
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", String(maximum()));
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuetext", `${width} pixels`);
    if (width > 0) last = width;
    for (const listener of listeners) listener(width === 0);
  }
  const save = () => {
    try {
      localStorage.setItem(key, String(width));
      localStorage.setItem(lastKey, String(last));
    } catch {}
  };
  let drag: { x: number; width: number } | undefined;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus();
    drag = { x: event.clientX, width };
    handle.setPointerCapture(event.pointerId);
    workspace.classList.add("workspace--resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (drag) apply(drag.width + event.clientX - drag.x);
  });
  function finish() {
    drag = undefined;
    workspace.classList.remove("workspace--resizing");
    save();
  }
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
  handle.addEventListener("dblclick", () => {
    apply(fallback);
    save();
  });
  handle.addEventListener("keydown", (event) => {
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
    if (workspace.clientWidth > 650) apply(width);
  });
  observer.observe(workspace);
  apply(width);
  return {
    hide() {
      apply(0);
      save();
    },
    show() {
      apply(last);
      save();
    },
    isHidden: () => width === 0,
    onChange(listener) {
      listeners.add(listener);
      listener(width === 0);
    },
    dispose() {
      listeners.clear();
      observer.disconnect();
      handle.remove();
      workspace.classList.remove("workspace--resizing");
    },
  };
}
