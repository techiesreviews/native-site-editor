import "./code-resize.css";
import { createGrip, isToggleKey, trackPress } from "./resize-handle";

// Horizontal splitter above code. Click/keyboard toggles full collapse;
// the edge grip remains available to restore the remembered height.
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
  const bounds = () => {
    const available = main.getBoundingClientRect().height;
    // Reserve canvas space when expanding code in short layouts.
    const bar = main.querySelector<HTMLElement>(".canvas-bar");
    const frameHost = main.querySelector<HTMLElement>(".preview-frame-host");
    const frameStyle = frameHost && getComputedStyle(frameHost);
    const canvasReserve = 48 + (bar?.getBoundingClientRect().height ?? 0) +
      (Number.parseFloat(frameStyle?.paddingTop ?? "0") || 0) + (Number.parseFloat(frameStyle?.paddingBottom ?? "0") || 0);
    const minimum = Math.min(96, available);
    // Expanded source remains readable in a cramped stacked layout. Collapse
    // still has no floor, and the canvas reserve wins whenever both can fit.
    const maximum = Math.max(minimum, available - Math.max(120, canvasReserve));
    return { minimum, maximum };
  };
  let height = 0.4;
  let collapsed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as { height?: number; collapsed?: boolean };
    if (saved.height && saved.height > 0 && saved.height < 1) height = saved.height;
    collapsed = saved.collapsed === true;
  } catch {}

  function apply() {
    if (collapsed && pane.contains(document.activeElement) && document.activeElement !== handle) handle.focus();
    main.classList.toggle("code-collapsed", collapsed);
    const { minimum, maximum } = bounds();
    const px = Math.round(collapsed ? 0 : Math.max(minimum, Math.min(maximum, height * main.clientHeight)));
    main.style.setProperty("--code-height", `${px}px`);
    for (const child of pane.children) {
      if (!(child instanceof HTMLElement) || child === handle) continue;
      child.inert = collapsed;
      if (collapsed) child.setAttribute("aria-hidden", "true"); else child.removeAttribute("aria-hidden");
    }
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", String(Math.round(maximum)));
    handle.setAttribute("aria-valuenow", String(px));
    // `aria-expanded` is not allowed on a separator, so the value text
    // carries the state.
    handle.setAttribute("aria-valuetext", collapsed ? "Code hidden" : `Code shown, ${px} pixels`);
    handle.classList.toggle("is-collapsed", collapsed);
    handle.title = `Drag to resize, click to ${collapsed ? "restore" : "hide"} the code`;
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
      const { minimum, maximum } = bounds();
      drag = { y: event.clientY, px: collapsed ? 0 : Math.max(minimum, Math.min(maximum, height * main.clientHeight)), height };
      main.classList.add("code-resizing");
      return true;
    },
    move(event) {
      if (!drag) return;
      const px = drag.px - (event.clientY - drag.y);
      const { minimum, maximum } = bounds();
      collapsed = px < minimum / 2 || px <= 0;
      // Collapsing by dragging keeps the height the pane had, for the click
      // that brings it back.
      height = collapsed ? drag.height : Math.max(minimum, Math.min(maximum, px)) / main.clientHeight;
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
    // Collapse state remains controllable even when a stacked layout has no code space.
    if (isToggleKey(event)) {
      event.preventDefault();
      toggle();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      collapsed = true;
      apply();
      save();
      return;
    }
    const { minimum, maximum } = bounds();
    if (main.clientHeight <= 0) return;
    const step = event.shiftKey ? 40 : 10;
    let px = collapsed ? 0 : Math.max(minimum, Math.min(maximum, height * main.clientHeight));
    if (event.key === "ArrowUp") px = collapsed ? minimum : Math.min(maximum, px + step);
    else if (event.key === "ArrowDown") px = px - step >= minimum ? px - step : 0;
    else if (event.key === "End") px = maximum;
    else return;
    event.preventDefault();
    collapsed = px <= 0;
    if (!collapsed) height = px / main.clientHeight;
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
      for (const child of pane.children) {
        if (!(child instanceof HTMLElement)) continue;
        child.inert = false; child.removeAttribute("aria-hidden");
      }
    },
  };
}

// Vertical splitter between the page/CSS code panes. Only active while the
// secondary pane is open. Dragging sets the split; a click, or Enter/Space,
// minimizes the secondary pane while retaining a readable source viewport.
// A second click restores the same split. Ratio and minimized state persist. Independent of the horizontal height resizer above.
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
  // keeps at least min(160, half). `available` can be 0 before layout; callers
  // guard against dividing by it.
  function bounds() {
    const style = getComputedStyle(handle);
    const footprint = handle.getBoundingClientRect().width + (Number.parseFloat(style.marginLeft) || 0) + (Number.parseFloat(style.marginRight) || 0);
    const available = Math.max(0, split.clientWidth - footprint);
    const min = Math.min(160, available / 2);
    return { available, min, max: available - min };
  }
  function apply() {
    split.classList.toggle("code-split--secondary-collapsed", collapsed && !secondary.hidden);
    handle.classList.toggle("is-collapsed", collapsed);
    handle.title = `Drag to resize, click to ${collapsed ? "restore" : "minimize"} the side-by-side pane`;
    if (secondary.hidden) {
      handle.hidden = secondary.hidden;
      primary.style.flex = "";
      const available = Math.max(0, split.clientWidth - handle.getBoundingClientRect().width);
      handle.setAttribute("aria-valuenow", String(Math.round(available)));
      handle.setAttribute("aria-valuetext", "Side-by-side pane closed");
      return;
    }
    handle.hidden = false;
    const { available, min, max } = bounds();
    const px = Math.round(collapsed ? max : Math.max(min, Math.min(max, ratio * available)));
    primary.style.flex = `0 0 ${px}px`;
    handle.setAttribute("aria-valuemin", String(Math.round(min)));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(px));
    // `aria-expanded` is not allowed on a separator, so the value text
    // carries the state.
    handle.setAttribute("aria-valuetext", collapsed ? `Side-by-side pane minimized, ${Math.round(available - px)} pixels; source remains visible` : `Side-by-side pane shown, ${available > 0 ? Math.round((px / available) * 100) : 50}% for the first pane`);
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
    let px = collapsed ? max : Math.max(min, Math.min(max, ratio * available));
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
