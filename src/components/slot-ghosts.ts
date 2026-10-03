import "./slot-ghosts.css";

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

export function mountSlotGhosts(pane: HTMLElement, frame: HTMLIFrameElement, options: {
  onFill: (target: SlotGhostFillTarget) => void;
  expectedIsCurrent?: (report: SlotGhostReport) => boolean;
}) {
  const layer = document.createElement("div");
  layer.className = "slot-ghosts";
  pane.append(layer);
  let report: SlotGhostReport | undefined;
  let destroyed = false;
  let key = "";
  let dismissed = "";
  let lastHostReport: SlotGhostReport | undefined;
  const identity = (r: SlotGhostReport) => JSON.stringify([r.context, r.pagePath, r.templatePath, r.tag, r.hostNode]);
  const clear = (resetDismissal = true) => { report = undefined; key = ""; if (resetDismissal) { dismissed = ""; lastHostReport = undefined; } layer.replaceChildren(); };
  function position() {
    if (!report || destroyed) return;
    const f = frame.getBoundingClientRect(), p = pane.getBoundingClientRect();
    const sx = f.width / frame.offsetWidth, sy = f.height / frame.offsetHeight;
    const px = p.width / pane.offsetWidth, py = p.height / pane.offsetHeight;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(px) || !Number.isFinite(py) || px <= 0 || py <= 0 || sx <= 0 || sy <= 0 || !f.width || !f.height || !pane.isConnected) { clear(); return; }
    const h = report.hostRect;
    const left = Math.max(f.left, p.left, 0), top = Math.max(f.top, p.top, 0);
    const right = Math.min(f.right, p.right, innerWidth), bottom = Math.min(f.bottom, p.bottom, innerHeight);
    const hostLeft = f.left + h.left * sx, hostTop = f.top + h.top * sy;
    if (hostLeft + h.width * sx <= left || hostTop + h.height * sy <= top || hostLeft >= right || hostTop >= bottom) { layer.hidden = true; return; }
    layer.hidden = false;
    layer.style.left = `${(left - p.left) / px + pane.scrollLeft}px`;
    layer.style.top = `${(top - p.top) / py + pane.scrollTop}px`;
    layer.style.width = `${Math.max(0, right - left) / px}px`;
    layer.style.height = `${Math.max(0, bottom - top) / py}px`;
    const rail = layer.firstElementChild as HTMLElement | null;
    if (rail) {
      const width = (right - left) / px, height = (bottom - top) / py;
      rail.style.maxHeight = `${Math.min(160, height)}px`;
      const rw = rail.offsetWidth, rh = rail.offsetHeight;
      const preferredX = Math.max(0, Math.min((hostLeft - left) / px, width - rw));
      const preferredY = Math.max(0, Math.min((hostTop + h.height * sy - top) / py - rh - 6, height - rh));
      // Use physical editor control rectangles, including scaled controls.
      const obstacles = Array.from(pane.querySelectorAll<HTMLElement>(".edit-bar, .insert-point__plus, .card-ghost__add, .card-add"))
        .map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
        .map(r => ({ left: (r.left - left) / px - 4, right: (r.right - left) / px + 4,
          top: (r.top - top) / py - 4, bottom: (r.bottom - top) / py + 4 }));
      const xs = [preferredX, 0, width - rw, ...obstacles.flatMap(r => [r.left - rw, r.right])];
      const ys = [preferredY, ...obstacles.flatMap(r => [r.top - rh, r.bottom]), 0, height - rh];
      const candidates = ys.flatMap(y => xs.map(x => ({ x, y }))).filter(({ x, y }) =>
        x >= 0 && y >= 0 && x + rw <= width && y + rh <= height &&
        !obstacles.some(r => x < r.right && x + rw > r.left && y < r.bottom && y + rh > r.top))
        .sort((a, b) => Math.abs(a.y - preferredY) + Math.abs(a.x - preferredX) - Math.abs(b.y - preferredY) - Math.abs(b.x - preferredX));
      const candidate = candidates[0];
      layer.hidden = !candidate;
      if (candidate) { rail.style.left = `${candidate.x}px`; rail.style.top = `${candidate.y}px`; }
    }
  }
  function update(next: SlotGhostReport) {
    if (destroyed) return;
    lastHostReport = next;
    if (dismissed && dismissed !== identity(next)) dismissed = "";
    if (dismissed) { report = next; layer.replaceChildren(); return; }
    report = next;
    const nextKey = JSON.stringify({ ...next, hostRect: undefined, entries: next.entries.map(e => ({ ...e, rect: undefined })) });
    if (key !== nextKey) {
      key = nextKey;
      layer.replaceChildren();
      const groups = new Map<string, SlotGhostEntry[]>();
      for (const entry of next.entries) if (!entry.assigned) groups.set(entry.name, [...(groups.get(entry.name) ?? []), entry]);
      if (groups.size) {
        const rail = document.createElement("div"); rail.className = "slot-ghosts__rail";
        rail.setAttribute("role", "group"); rail.setAttribute("aria-label", "Empty slots");
        const label = document.createElement("span"); label.textContent = "Empty slots"; rail.append(label);
        for (const [name, entries] of groups) {
          const button = document.createElement("button"); button.type = "button";
          const readable = name.replace(/-/g, " ");
          const title = readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Content";
          const collision = [...groups.keys()].some(other => other !== name && other.replace(/-/g, " ").toLowerCase() === readable.toLowerCase());
          button.textContent = `Add ${title}${collision ? ` (${name})` : ""}${entries.length > 1 ? ` · ${entries.length} outlets · first outlet${entries[0].hidden ? " hidden" : ""}` : ""}`;
          button.title = `Slot: ${name || "(default)"}. Content goes to the first outlet${entries[0].hidden ? ", which is hidden" : ""}.`;
          button.addEventListener("click", () => {
            if (dismissed || !layer.contains(button) || (report !== next && key !== nextKey) || !report || layer.hidden || options.expectedIsCurrent?.(report) === false) return;
            options.onFill({ context: report.context, pagePath: report.pagePath, tag: report.tag, templatePath: report.templatePath, hostNode: [...report.hostNode], name });
          });
          button.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); dismissed = report ? identity(report) : ""; clear(false); frame.focus(); } });
          rail.append(button);
        }
        layer.append(rail);
      }
    }
    position();
  }
  const observer = new ResizeObserver(position); observer.observe(pane); observer.observe(frame);
  let layoutFrame = 0;
  const layoutObserver = new MutationObserver(records => {
    if (records.every(r => layer.contains(r.target)) || layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; position(); });
  });
  layoutObserver.observe(pane, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
  return { update, clear, selectionChanged() { if (lastHostReport && options.expectedIsCurrent?.(lastHostReport) === false) clear(); }, destroy() { destroyed = true; clear(); observer.disconnect(); layoutObserver.disconnect(); cancelAnimationFrame(layoutFrame); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); layer.remove(); } };
}
