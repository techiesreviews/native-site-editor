/** Shared with the canvas device switcher. Widths are CSS pixels. */
export type Breakpoint = "all" | "tablet" | "mobile";
let current: Breakpoint = "all";
const listeners = new Set<(value: Breakpoint) => void>();
export function getCurrentBreakpoint(): Breakpoint { return current; }
export function setCurrentBreakpoint(value: Breakpoint) {
  if (current === value) return;
  current = value;
  for (const listener of listeners) listener(value);
}
export function subscribeBreakpoint(listener: (value: Breakpoint) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
