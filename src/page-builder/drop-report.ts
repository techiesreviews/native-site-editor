/** Geometry from one frame-viewport probe, before any drop decisions. */
export interface DropRect { left: number; top: number; width: number; height: number }
export interface DropLayout { display: string; cols: number; dir: string; wrap: string }
export type DropAxis = "row" | "column";
export interface DropChild { index: number; rect: DropRect }
export interface DropContainer {
  path: number[];
  kind: "main" | "section" | "div" | "items" | "slot";
  tag: string;
  cls: string;
  slot?: string;
  rect: DropRect;
  children: DropChild[];
  layout: DropLayout;
  empty: boolean;
  axis: DropAxis;
}
export interface DropReport { id: number; path: string; x: number; y: number; containers: DropContainer[] }

export function flowAxis(childRects: readonly DropRect[], layout: DropLayout): DropAxis {
  const visible = childRects.filter(rect => rect.width > 0 && rect.height > 0);
  for (let i = 1; i < visible.length; i++) {
    // Side by side, either way round (a row-reverse flex runs right to left).
    if (Math.abs(visible[i].top - visible[i - 1].top) < 2 && Math.abs(visible[i].left - visible[i - 1].left) > 1) return "row";
  }
  if (visible.length < 2 && (layout.display.includes("grid") && layout.cols > 1 ||
    layout.display.includes("flex") && layout.dir.startsWith("row"))) return "row";
  return "column";
}

const object = (raw: unknown): Record<string, unknown> | undefined =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
const finite = (raw: unknown): raw is number => typeof raw === "number" && Number.isFinite(raw);
const index = (raw: unknown): raw is number => typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0;
// A for loop, not every(): every() skips the holes a structured clone keeps.
const path = (raw: unknown): raw is number[] => {
  if (!Array.isArray(raw) || raw.length > 100) return false;
  for (let i = 0; i < raw.length; i++) if (!index(raw[i])) return false;
  return true;
};
// Names are identities: too long is refused, never cut.
const name = (raw: unknown): raw is string => typeof raw === "string" && raw.length <= 100;
function rect(raw: unknown): DropRect | undefined {
  const r = object(raw);
  if (!r || !finite(r.left) || !finite(r.top) || !finite(r.width) || !finite(r.height) || r.width < 0 || r.height < 0) return;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Drop malformed entries and bound work on an untrusted frame message. */
export function parseDropReport(raw: unknown, expectedPath: string): DropReport | undefined {
  const report = object(raw);
  if (!report || report.path !== expectedPath || !index(report.id) || !finite(report.x) || !finite(report.y) || !Array.isArray(report.containers)) return;
  const containers = report.containers.slice(0, 100).flatMap((raw): DropContainer[] => {
    const c = object(raw), l = object(c?.layout), r = rect(c?.rect);
    if (!c || !path(c.path) || !r || typeof c.kind !== "string" || !["main", "section", "div", "items", "slot"].includes(c.kind) ||
      !name(c.tag) || typeof c.cls !== "string" || typeof c.empty !== "boolean" || !Array.isArray(c.children) ||
      !l || typeof l.display !== "string" || !index(l.cols) || typeof l.dir !== "string" || typeof l.wrap !== "string" ||
      ((c.kind === "items" || c.kind === "slot") && !name(c.slot))) return [];
    const children = c.children.slice(0, 500).flatMap((raw): DropChild[] => {
      const child = object(raw), r = rect(child?.rect);
      return child && index(child.index) && r ? [{ index: child.index, rect: r }] : [];
    });
    const layout = { display: l.display.slice(0, 100), cols: l.cols, dir: l.dir.slice(0, 100), wrap: l.wrap.slice(0, 100) };
    return [{ path: [...c.path], kind: c.kind as DropContainer["kind"], tag: c.tag, cls: c.cls.slice(0, 1000),
      ...((c.kind === "items" || c.kind === "slot") ? { slot: c.slot as string } : {}),
      rect: r, children, layout, empty: c.empty, axis: flowAxis(children.map(child => child.rect), layout) }];
  });
  return { id: report.id, path: expectedPath, x: report.x, y: report.y, containers };
}
