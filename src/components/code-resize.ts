import "./code-resize.css";
import { createGrip, isToggleKey, trackPress } from "./resize-handle";

// Horizontal splitter above the code pane when the preview is open. Dragging
// resizes it (down to its minimum, or below that to collapse it); a click, or
// Enter/Space, collapses the code split so the preview fills, and brings it
// back at the height it had. Height and collapsed state persist.
export function mountCodeResize(main: HTMLElement, pane: HTMLElement) {
  const key = "astro-editor.code-height";
  const handle = document.createElement("div");
  handle.className = "code-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "Resize code pane");
  handle.setAttribute("aria-controls", "code-split");
  handle.append(createGrip());
  pane.prepend(handle);
  const minimum = 56;
  let height = 0.4;
  let collapsed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as { height?: number; collapsed?: boolean };
    if (saved.height && saved.height > 0 && saved.height < 1) height = saved.height;
    collapsed = saved.collapsed === true;
  } catch {}
  const maximum = () => main.clientHeight - 120;
  function apply() {
    main.classList.toggle("code-collapsed", collapsed);
    const px = Math.round(Math.max(minimum, Math.min(maximum(), height * main.clientHeight)));
    main.style.setProperty("--code-height", `${px}px`);
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", String(Math.max(minimum, maximum())));
    handle.setAttribute("aria-valuenow", String(collapsed ? 0 : px));
    // `aria-expanded` is not allowed on a separator, so the value text
    // carries the state.
    handle.setAttribute("aria-valuetext", collapsed ? "Code hidden" : `Code shown, ${px} pixels`);
    handle.classList.toggle("is-collapsed", collapsed);
    handle.title = `Drag to resize, click to ${collapsed ? "show" : "hide"} the code`;
  }
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ height, collapsed }));
    } catch {}
  };
  const toggle = () => {
    collapsed = !collapsed;
    apply();
    save();
  };
  let drag: { y: number; px: number; height: number } | undefined;
  trackPress(handle, {
    start(event) {
      drag = { y: event.clientY, px: collapsed ? minimum : height * main.clientHeight, height };
      main.classList.add("code-resizing");
      return true;
    },
    move(event) {
      if (!drag) return;
      const px = drag.px - (event.clientY - drag.y);
      collapsed = px < minimum + 20;
      // Collapsing by dragging keeps the height the pane had, for the click
      // that brings it back.
      height = collapsed ? drag.height : Math.max(minimum, Math.min(maximum(), px)) / main.clientHeight;
      apply();
    },
    end(click) {
      drag = undefined;
      main.classList.remove("code-resizing");
      if (click) toggle();
      else save();
    },
  });
  handle.addEventListener("keydown", (event) => {
    const step = (event.shiftKey ? 40 : 10) / main.clientHeight;
    if (event.key === "ArrowUp") height = Math.min(maximum() / main.clientHeight, height + step);
    else if (event.key === "ArrowDown") height = Math.max(minimum / main.clientHeight, height - step);
    else if (isToggleKey(event)) {
      event.preventDefault();
      toggle();
      return;
    } else return;
    event.preventDefault();
    collapsed = false;
    apply();
    save();
  });
  const observer = new ResizeObserver(apply);
  observer.observe(main);
  apply();
  return {
    toggle,
    destroy() {
      observer.disconnect();
      handle.remove();
      main.classList.remove("code-collapsed", "code-resizing");
      main.style.removeProperty("--code-height");
    },
  };
}

// Vertical splitter between the page/CSS code panes. Only active while the
// secondary pane is open. Dragging sets the split; a click, or Enter/Space,
// collapses the secondary pane so the primary fills, the handle staying at the
// right edge, and a second click brings it back at the same split. Ratio and
// collapsed state persist. Independent of the horizontal height resizer above.
export function mountCodeWidthResize(split: HTMLElement, primary: HTMLElement, secondary: HTMLElement) {
  const key = "astro-editor.code-width";
  const handle = document.createElement("div");
  handle.className = "code-width-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Resize code pane widths");
  handle.setAttribute("aria-controls", "content content-secondary");
  handle.append(createGrip());
  let ratio = 0.5;
  let collapsed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as { ratio?: number; collapsed?: boolean };
    if (saved.ratio && saved.ratio > 0 && saved.ratio < 1) ratio = saved.ratio;
    collapsed = saved.collapsed === true;
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ ratio, collapsed }));
    } catch {}
  };
  // Bounds are computed over the width the panes actually share — the split
  // minus the handle — so an even split gives both panes the same size and each
  // keeps at least min(240, half). `available` can be 0 before layout; callers
  // guard against dividing by it.
  function bounds() {
    const available = Math.max(0, split.clientWidth - handle.getBoundingClientRect().width);
    const min = Math.min(240, available / 2);
    return { available, min, max: available - min };
  }
  function apply() {
    split.classList.toggle("code-split--secondary-collapsed", collapsed && !secondary.hidden);
    handle.classList.toggle("is-collapsed", collapsed);
    handle.title = `Drag to resize, click to ${collapsed ? "show" : "hide"} the side-by-side pane`;
    if (secondary.hidden || collapsed) {
      handle.hidden = secondary.hidden;
      primary.style.flex = "";
      const available = Math.max(0, split.clientWidth - handle.getBoundingClientRect().width);
      handle.setAttribute("aria-valuenow", String(Math.round(available)));
      handle.setAttribute("aria-valuetext", "Side-by-side pane hidden");
      return;
    }
    handle.hidden = false;
    const { available, min, max } = bounds();
    const px = Math.round(Math.max(min, Math.min(max, ratio * available)));
    primary.style.flex = `0 0 ${px}px`;
    handle.setAttribute("aria-valuemin", String(Math.round(min)));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(px));
    // `aria-expanded` is not allowed on a separator, so the value text
    // carries the state.
    handle.setAttribute("aria-valuetext", `Side-by-side pane shown, ${available > 0 ? Math.round((px / available) * 100) : 50}% for the first pane`);
  }
  function setFromClientX(clientX: number) {
    const { available, min, max } = bounds();
    if (available <= 0) return;
    const px = Math.max(min, Math.min(max, clientX - grab - split.getBoundingClientRect().left));
    ratio = px / available;
    apply();
  }
  const toggle = () => {
    collapsed = !collapsed;
    apply();
    save();
  };
  // Where in the handle it was pressed, so the edge does not jump to the pointer.
  let grab = 0;
  trackPress(handle, {
    start(event) {
      if (secondary.hidden) return false;
      grab = event.clientX - primary.getBoundingClientRect().right;
      split.classList.add("code-width-resizing");
      return true;
    },
    move(event) {
      // Dragging a collapsed handle brings the pane back where it is let go.
      collapsed = false;
      setFromClientX(event.clientX);
    },
    end(click) {
      split.classList.remove("code-width-resizing");
      if (click) toggle();
      else save();
    },
  });
  handle.addEventListener("keydown", (event) => {
    if (secondary.hidden) return;
    if (isToggleKey(event)) {
      event.preventDefault();
      toggle();
      return;
    }
    const { available, min, max } = bounds();
    if (available <= 0) return;
    const step = event.shiftKey ? 40 : 10;
    let px = Math.max(min, Math.min(max, ratio * available));
    if (event.key === "ArrowLeft") px = Math.max(min, px - step);
    else if (event.key === "ArrowRight") px = Math.min(max, px + step);
    else if (event.key === "Home") px = min;
    else if (event.key === "End") px = max;
    else return;
    event.preventDefault();
    collapsed = false;
    ratio = px / available;
    apply();
    save();
  });
  split.insertBefore(handle, secondary);
  const observer = new ResizeObserver(apply);
  observer.observe(split);
  apply();
  return {
    apply,
    destroy() {
      observer.disconnect();
      handle.remove();
      primary.style.flex = "";
      split.classList.remove("code-width-resizing", "code-split--secondary-collapsed");
    },
  };
}
