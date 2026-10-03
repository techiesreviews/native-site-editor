
/** Rectangles are CSS pixels in the iframe viewport, before editor scaling. */
export interface SlotGhostRect { top: number; left: number; width: number; height: number; bottom: number; right: number }
export interface SlotGhostEntry { name: string; occurrence: number; slotNode: number[]; assigned: boolean; hidden: boolean; rect?: SlotGhostRect }
export interface SlotGhostReport {
  context: string; pagePath: string; tag: string; templatePath: string;
  hostNode: number[]; hostRect: SlotGhostRect; entries: SlotGhostEntry[];
}
/** One name assigns to the first same-name outlet. Source/revision guards belong to the caller. */
export type SlotGhostFillTarget = Pick<SlotGhostReport, "context" | "pagePath" | "tag" | "templatePath" | "hostNode"> & { name: string };
const path = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= 64 && v.every(n => Number.isInteger(n) && n >= 0 && n <= 100_000);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
export function readSlotGhostRect(v: unknown): SlotGhostRect | undefined {
  if (!object(v)) return;
  const keys = ["top", "left", "width", "height", "bottom", "right"] as const;
  if (!keys.every(k => typeof v[k] === "number" && Number.isFinite(v[k]) && Math.abs(v[k] as number) <= 10_000_000)) return;
  const r = v as unknown as SlotGhostRect;
  if (r.width <= 0 || r.height <= 0 || Math.abs(r.right - r.left - r.width) > .01 || Math.abs(r.bottom - r.top - r.height) > .01) return;
  return { ...r };
}
export function readSlotGhostReport(value: unknown, expected: { context: string; pagePath: string; components: Record<string, string> }): SlotGhostReport | undefined {
  if (!object(value) || value.context !== expected.context || value.pagePath !== expected.pagePath || !expected.pagePath ||
      !text(value.context, 1_000_000) || !text(value.pagePath, 4096) || !text(value.tag, 256) || !text(value.templatePath, 4096) ||
      !Object.hasOwn(expected.components, value.tag) || expected.components[value.tag] !== value.templatePath || !path(value.hostNode)) return;
  const hostRect = readSlotGhostRect(value.hostRect);
  if (!hostRect || !Array.isArray(value.entries) || value.entries.length > 100) return;
  const entries: SlotGhostEntry[] = [];
  const counts = new Map<string, number>();
  const assignments = new Map<string, boolean>();
  for (const entry of value.entries) {
    if (!object(entry) || !text(entry.name, 256) || !path(entry.slotNode) || typeof entry.assigned !== "boolean" || typeof entry.hidden !== "boolean" || entry.occurrence !== (counts.get(entry.name) ?? 0)) return;
    if (assignments.has(entry.name) && assignments.get(entry.name) !== entry.assigned) return;
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
    assignments.set(entry.name, entry.assigned);
    const rect = entry.rect === undefined ? undefined : readSlotGhostRect(entry.rect);
    if (entry.rect !== undefined && (!rect || entry.hidden)) return;
    entries.push({ name: entry.name, occurrence: entry.occurrence as number, slotNode: [...entry.slotNode], assigned: entry.assigned, hidden: entry.hidden, ...(rect ? { rect } : {}) });
  }
  return { context: value.context, pagePath: value.pagePath, tag: value.tag, templatePath: value.templatePath, hostNode: [...value.hostNode], hostRect, entries };
}

/** Compatibility seam for the preview's optional reports. Slots are edited in Structure. */
export function mountSlotGhosts(_pane: HTMLElement, _frame: HTMLIFrameElement, _options: {
  onFill: (target: SlotGhostFillTarget) => void;
  expectedIsCurrent?: (report: SlotGhostReport) => boolean;
}) {
  // No layer, listeners or geometry observers: authored slots and reports stay intact.
  return { update(_report: SlotGhostReport) {}, clear(_resetDismissal = true) {}, selectionChanged() {}, destroy() {} };
}
