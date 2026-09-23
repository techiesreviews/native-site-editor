import "./sidebar-resize.css";

export function mountSidebarResize(
  workspace: HTMLElement,
  sidebar: HTMLElement,
) {
  const key = "astro-editor.sidebar-width";
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
  let width = 280;
  try {
    const stored = localStorage.getItem(key);
    const saved = stored === null ? NaN : Number(stored);
    if (saved === 0 || saved >= minimum) width = saved;
  } catch {}
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
  }
  const save = () => {
    try {
      localStorage.setItem(key, String(width));
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
    apply(280);
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
  return () => {
    observer.disconnect();
    handle.remove();
    workspace.classList.remove("workspace--resizing");
  };
}
