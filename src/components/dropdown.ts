import "./dropdown.css";

/** Shared, nonmodal dropdown behavior for navigation and repository actions. */
export function mountDropdown(options: {
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  anchor: string;
  closeOnAction?: boolean;
}) {
  const { trigger, panel } = options;
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pinned = false;
  panel.classList.add("dropdown-panel");
  panel.popover = "auto";
  trigger.style.setProperty("anchor-name", options.anchor);
  panel.style.setProperty("position-anchor", options.anchor);
  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");
  const isOpen = () => panel.matches(":popover-open");
  const contains = (target: Node | null) => trigger.contains(target) || panel.contains(target);
  const cancelClose = () => clearTimeout(timer);
  function open() {
    if (trigger.disabled) return;
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
    if (pinned && isOpen()) close();
    else { open(); pinned = true; }
  }, { signal });
  trigger.addEventListener("pointerenter", event => {
    if (event.pointerType === "mouse") open();
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
  return { open, close, isOpen, destroy() { cancelClose(); controller.abort(); close(); } };
}
