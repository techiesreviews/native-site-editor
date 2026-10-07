import "./dropdown.css";

/** Shared, nonmodal dropdown behavior for navigation and repository actions. */
export function mountDropdown(options: {
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  anchor: string;
  closeOnAction?: boolean;
  /** A click runs this, with the panel held open, instead of toggling the panel. */
  onClick?: () => void;
  /** A mouse resting on the trigger this long (ms) opens it; passing over shows nothing. */
  hoverDelay?: number;
}) {
  const { trigger, panel } = options;
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovering: ReturnType<typeof setTimeout> | undefined;
  let pinned = false;
  panel.classList.add("dropdown-panel");
  panel.popover = "auto";
  trigger.style.setProperty("anchor-name", options.anchor);
  panel.style.setProperty("position-anchor", options.anchor);
  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");
  const isOpen = () => panel.matches(":popover-open");
  const contains = (target: Node | null) => trigger.contains(target) || panel.contains(target);
  const cancelClose = () => { clearTimeout(timer); clearTimeout(hovering); };
  /** `force` opens it for a disabled trigger too (a status to show, nothing to do). */
  function open(force = false) {
    if (trigger.disabled && !force) return;
    cancelClose();
    if (!CSS.supports("position-area", "bottom")) {
      const rect = trigger.getBoundingClientRect();
      panel.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - (parseFloat(getComputedStyle(panel).width) || 480) - 16))}px`;
      panel.style.top = `${rect.bottom + 6}px`;
    }
    if (!isOpen()) panel.showPopover();
  }
  function close() {
    cancelClose();
    if (isOpen()) panel.hidePopover();
    pinned = false;
  }
  function scheduleClose() {
    cancelClose();
    timer = setTimeout(() => {
      if (!pinned && !contains(document.activeElement)) close();
    }, 180);
  }
  trigger.addEventListener("click", () => {
    if (options.onClick) { open(); pinned = true; options.onClick(); }
    else if (pinned && isOpen()) close();
    else { open(); pinned = true; }
  }, { signal });
  // Hover opens on the mouse moving over the trigger, not on `pointerenter`
  // alone: a trigger that appears under a still pointer (a toolbar mounting
  // late) would otherwise open itself and light-dismiss whatever was open.
  let hovered = false;
  trigger.addEventListener("pointerleave", () => { hovered = false; }, { signal });
  trigger.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse" || hovered) return;
    hovered = true;
    if (!options.hoverDelay || isOpen()) { open(); return; }
    cancelClose();
    hovering = setTimeout(() => open(), options.hoverDelay);
  }, { signal });
  trigger.addEventListener("pointerleave", scheduleClose, { signal });
  panel.addEventListener("pointerenter", cancelClose, { signal });
  panel.addEventListener("pointerleave", scheduleClose, { signal });
  for (const target of [trigger, panel]) {
    target.addEventListener("focusout", event => {
      // Loading a folder temporarily disables its button, which blurs with no
      // destination. Keep the picker open; native light dismissal handles outside clicks.
      if (event.relatedTarget && !contains(event.relatedTarget as Node)) close();
    }, { signal });
    target.addEventListener("keydown", event => {
      if (event.key === "Escape" && isOpen()) {
        event.preventDefault();
        close();
        trigger.focus();
      } else if (event.key === "ArrowDown" && event.target === trigger) {
        event.preventDefault();
        open();
        pinned = true;
        panel.querySelector<HTMLElement>("a, button, select")?.focus();
      }
    }, { signal });
  }
  if (options.closeOnAction) panel.addEventListener("click", event => {
    if ((event.target as Element).closest("a, button")) { close(); trigger.focus(); }
  }, { signal });
  panel.addEventListener("toggle", () => {
    trigger.setAttribute("aria-expanded", String(isOpen()));
    if (!isOpen()) pinned = false;
  }, { signal });
  return { open, close, scheduleClose, isOpen, destroy() { cancelClose(); controller.abort(); close(); } };
}
