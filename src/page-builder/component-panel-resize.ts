import { createGrip, isToggleKey, trackPress } from "../components/resize-handle";

/** A persistent splitter outside the panel's replaceable rendered contents. */
export function mountComponentPanelResize(parent: HTMLElement, panel: HTMLElement) {
  const key = "astro-editor.component-height";
  const handle = document.createElement("div");
  handle.className = "component-panel-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "Resize component properties");
  panel.id ||= "component-properties";
  handle.setAttribute("aria-controls", panel.id);
  handle.append(createGrip());
  parent.insertBefore(handle, panel);
  let height = 320, folded = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (Number.isFinite(saved.height) && saved.height >= 140) height = saved.height;
    folded = saved.folded === true;
  } catch {}
  const maximum = () => Math.max(36, parent.clientHeight - 120);
  const bounded = (value: number) => Math.max(Math.min(140, maximum()), Math.min(maximum(), value));
  function apply() {
    handle.hidden = panel.hidden;
    const px = Math.round(folded ? Math.min(72, maximum()) : bounded(height));
    panel.style.height = `${px}px`;
    panel.classList.toggle("is-folded", folded);
    handle.classList.toggle("is-collapsed", folded);
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", String(Math.round(maximum())));
    handle.setAttribute("aria-valuenow", String(folded ? 0 : px));
    handle.setAttribute("aria-valuetext", folded ? "Properties folded" : `Properties shown, ${px} pixels`);
    handle.title = `Drag to resize, click to ${folded ? "restore" : "fold"} properties`;
  }
  const save = () => { try { localStorage.setItem(key, JSON.stringify({ height, folded })); } catch {} };
  const toggle = () => { folded = !folded; apply(); save(); };
  let drag: { y: number; height: number } | undefined;
  trackPress(handle, {
    start(event) { if (panel.hidden) return false; drag = { y: event.clientY, height: folded ? 72 : bounded(height) }; return true; },
    move(event) { if (!drag) return; folded = false; height = bounded(drag.height + drag.y - event.clientY); apply(); },
    end(click) { drag = undefined; if (click) toggle(); else save(); },
  });
  handle.addEventListener("keydown", (event) => {
    if (isToggleKey(event)) { event.preventDefault(); toggle(); }
    else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") folded = true;
      else { folded = false; height = event.key === "End" ? maximum() : bounded(height + (event.key === "ArrowUp" ? 20 : -20)); }
      apply(); save();
    }
  });
  const resize = new ResizeObserver(apply); resize.observe(parent);
  const visibility = new MutationObserver(apply); visibility.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  apply();
  return () => { resize.disconnect(); visibility.disconnect(); handle.remove(); };
}
