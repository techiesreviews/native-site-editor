import "./code-resize.css";

// Horizontal splitter above the code pane when the preview is open. The pane
// can shrink to its toolbar; double-click or the toggle collapses it.
export function mountCodeResize(main: HTMLElement, pane: HTMLElement) {
  const key = "astro-editor.code-height";
  const handle = document.createElement("div");
  handle.className = "code-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "Resize code pane");
  handle.title = "Drag to resize the code pane. Double-click to collapse or expand.";
  pane.prepend(handle);
  const minimum = 56;
  let height = 0.4;
  let collapsed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as { height?: number; collapsed?: boolean };
    if (saved.height && saved.height > 0 && saved.height < 1) height = saved.height;
  } catch {}
  const maximum = () => main.clientHeight - 120;
  function apply() {
    main.classList.toggle("code-collapsed", collapsed);
    const px = Math.round(Math.max(minimum, Math.min(maximum(), height * main.clientHeight)));
    main.style.setProperty("--code-height", `${px}px`);
    handle.setAttribute("aria-valuenow", String(collapsed ? 0 : px));
    handle.setAttribute("aria-expanded", String(!collapsed));
  }
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ height }));
    } catch {}
  };
  let drag: { y: number; height: number } | undefined;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus();
    drag = { y: event.clientY, height: collapsed ? minimum : height * main.clientHeight };
    handle.setPointerCapture(event.pointerId);
    main.classList.add("code-resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const px = drag.height - (event.clientY - drag.y);
    collapsed = px < minimum + 20;
    height = Math.max(minimum, Math.min(maximum(), px)) / main.clientHeight;
    apply();
  });
  function finish() {
    if (!drag) return;
    drag = undefined;
    main.classList.remove("code-resizing");
    save();
  }
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
  const toggle = () => {
    collapsed = !collapsed;
    apply();
    save();
  };
  handle.addEventListener("dblclick", toggle);
  handle.addEventListener("keydown", (event) => {
    const step = (event.shiftKey ? 40 : 10) / main.clientHeight;
    if (event.key === "ArrowUp") height = Math.min(maximum() / main.clientHeight, height + step);
    else if (event.key === "ArrowDown") height = Math.max(minimum / main.clientHeight, height - step);
    else if (event.key === "Enter" || event.key === " ") collapsed = !collapsed;
    else return;
    event.preventDefault();
    if (event.key.startsWith("Arrow")) collapsed = false;
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
// secondary pane is open; the split ratio persists and is restored on reopen.
// Independent of the horizontal height resizer above.
export function mountCodeWidthResize(split: HTMLElement, primary: HTMLElement, secondary: HTMLElement) {
  const key = "astro-editor.code-width";
  const handle = document.createElement("div");
  handle.className = "code-width-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Resize code pane widths");
  handle.setAttribute("aria-controls", "content content-secondary");
  handle.title = "Drag to resize the code panes. Double-click to reset to 50/50.";
  let ratio = 0.5;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as { ratio?: number };
    if (saved.ratio && saved.ratio > 0 && saved.ratio < 1) ratio = saved.ratio;
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ ratio }));
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
    if (secondary.hidden) {
      handle.hidden = true;
      primary.style.flex = "";
      return;
    }
    handle.hidden = false;
    const { available, min, max } = bounds();
    const px = Math.round(Math.max(min, Math.min(max, ratio * available)));
    primary.style.flex = `0 0 ${px}px`;
    handle.setAttribute("aria-valuemin", String(Math.round(min)));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(px));
    handle.setAttribute("aria-valuetext", `${available > 0 ? Math.round((px / available) * 100) : 50}%`);
  }
  let dragging = false;
  function setFromClientX(clientX: number) {
    const { available, min, max } = bounds();
    if (available <= 0) return;
    const px = Math.max(min, Math.min(max, clientX - split.getBoundingClientRect().left));
    ratio = px / available;
    apply();
  }
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || secondary.hidden || bounds().available <= 0) return;
    event.preventDefault();
    handle.focus();
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    split.classList.add("code-width-resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setFromClientX(event.clientX);
  });
  function finish() {
    if (!dragging) return;
    dragging = false;
    split.classList.remove("code-width-resizing");
    save();
  }
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
  handle.addEventListener("dblclick", () => {
    ratio = 0.5;
    apply();
    save();
  });
  handle.addEventListener("keydown", (event) => {
    if (secondary.hidden) return;
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
      split.classList.remove("code-width-resizing");
    },
  };
}
