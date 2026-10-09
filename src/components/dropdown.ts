import "./dropdown.css";

/** Shared, nonmodal dropdown behavior for navigation and repository actions. */
export function mountDropdown(options: {
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  /** A second button toggles this same panel and moves focus into it. */
  secondaryTrigger?: HTMLButtonElement;
  /** Position against a joined control rather than one of its buttons. */
  anchorElement?: HTMLElement;
  align?: "start" | "end";
  anchor: string;
  closeOnAction?: boolean;
  /** A click runs this, with the panel held open, instead of toggling the panel. */
  onClick?: () => void;
  /** A mouse resting on the trigger this long (ms) opens it; passing over shows nothing. */
  hoverDelay?: number;
}) {
  const { trigger, panel, secondaryTrigger } = options;
  const triggers = secondaryTrigger ? [trigger, secondaryTrigger] : [trigger];
  const anchorElement = options.anchorElement ?? trigger;
  let opener = trigger;
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovering: ReturnType<typeof setTimeout> | undefined;
  let pinned = false;
  panel.classList.add("dropdown-panel");
  panel.popover = "auto";
  // The native invoker also counts as inside for popover light dismissal.
  if (secondaryTrigger) secondaryTrigger.popoverTargetElement = panel;
  anchorElement.style.setProperty("anchor-name", options.anchor);
  panel.style.setProperty("position-anchor", options.anchor);
  for (const button of triggers) {
    button.setAttribute("aria-controls", panel.id);
    button.setAttribute("aria-expanded", "false");
  }
  const isOpen = () => panel.matches(":popover-open");
  const contains = (target: Node | null) => triggers.some(button => button.contains(target)) || panel.contains(target);
  const cancelClose = () => { clearTimeout(timer); clearTimeout(hovering); };
  /** `force` opens it for a disabled trigger too (a status to show, nothing to do). */
  function open(force = false, source = trigger) {
    if (source.disabled && !force) return;
    cancelClose();
    if (!isOpen()) opener = source;
    if (!CSS.supports("position-area", "bottom")) {
      const rect = anchorElement.getBoundingClientRect();
      const width = parseFloat(getComputedStyle(panel).width) || 480;
      const left = options.align === "end" ? rect.right - width : rect.left;
      panel.style.left = `${Math.max(16, Math.min(left, innerWidth - width - 16))}px`;
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
  function focusPanel() {
    const target = options.secondaryTrigger
      ? Array.from(panel.querySelectorAll<HTMLElement>("summary, a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled)")).find(element => element.getClientRects().length)
      : panel.querySelector<HTMLElement>("a, button, select");
    if (target) target.focus();
    else if (options.secondaryTrigger) { panel.tabIndex = -1; panel.focus(); }
  }
  if (secondaryTrigger) secondaryTrigger.addEventListener("click", event => {
    // Shared behavior owns the toggle and focus instead of the native default.
    event.preventDefault();
    if (pinned && isOpen()) close();
    else { open(false, secondaryTrigger); opener = secondaryTrigger; pinned = true; focusPanel(); }
  }, { signal });
  trigger.addEventListener("click", () => {
    if (options.onClick) { open(); pinned = true; options.onClick(); }
    else if (pinned && isOpen()) close();
    else { open(); pinned = true; }
  }, { signal });
  // Hover opens on the mouse moving over the trigger, not on `pointerenter`
  // alone: a trigger that appears under a still pointer (a toolbar mounting
  // late) would otherwise open itself and light-dismiss whatever was open.
  for (const button of triggers) {
    let hovered = false;
    button.addEventListener("pointerleave", () => { hovered = false; }, { signal });
    button.addEventListener("pointermove", event => {
      if (event.pointerType !== "mouse" || hovered) return;
      hovered = true;
      if (!options.hoverDelay || isOpen()) { open(false, button); return; }
      cancelClose();
      hovering = setTimeout(() => open(false, button), options.hoverDelay);
    }, { signal });
    button.addEventListener("pointerleave", scheduleClose, { signal });
  }
  panel.addEventListener("pointerenter", cancelClose, { signal });
  panel.addEventListener("pointerleave", scheduleClose, { signal });
  for (const target of [...triggers, panel]) {
    target.addEventListener("focusout", event => {
      // Loading a folder temporarily disables its button, which blurs with no
      // destination. Keep the picker open; native light dismissal handles outside clicks.
      if (event.relatedTarget && !contains(event.relatedTarget as Node)) close();
    }, { signal });
    target.addEventListener("keydown", event => {
      if (event.key === "Escape" && isOpen()) {
        event.preventDefault();
        close();
        opener.focus();
      } else if (event.key === "ArrowDown" && triggers.includes(event.target as HTMLButtonElement)) {
        event.preventDefault();
        open(false, event.target as HTMLButtonElement);
        opener = event.target as HTMLButtonElement;
        pinned = true;
        focusPanel();
      }
    }, { signal });
  }
  if (options.closeOnAction) panel.addEventListener("click", event => {
    if ((event.target as Element).closest("a, button")) { close(); opener.focus(); }
  }, { signal });
  panel.addEventListener("toggle", () => {
    for (const button of triggers) button.setAttribute("aria-expanded", String(isOpen()));
    if (!isOpen()) pinned = false;
  }, { signal });
  return { open, close, scheduleClose, isOpen, destroy() { cancelClose(); controller.abort(); close(); } };
}
