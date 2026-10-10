// The editor↔preview wire, typed: what the runtime (native-preview-runtime.js)
// posts to the editor (`FrameMessage`) and what the editor posts to it
// (`HostMessage`), and the one reader that turns raw `postMessage` data into a
// `FrameMessage`. The wire format is flat fields plus `source` (and `context`,
// the render a frame message describes). The reader does every shape check
// and limit; checks against the editor's state (a path of the site, the page
// on show, the current render) stay with the receiver.
import type { AssetChanges, EditComponentFrameMode, NativeNodeRequest, NativePreviewSelection, NativeStructureItem, NativeTextSelection, UpdatePayload } from "./native-preview";
import type { SelectionRect } from "./edit-bar";
import type { InsertPoint } from "./insert-controls";
import type { ItemGridReport } from "./card-grid-controls";
import type { PinLocator } from "./agent-pins";
import { parseDropReport, type DropReport } from "../page-builder/drop-report";
import { readCascade, readSelectedRules, type NativeCascade, type NativeSelectedRule } from "../style-cascade";
import { readCrumbs, type CanvasCrumb } from "../page-builder/canvas-model";

import { FRAME_SOURCE, HOST_SOURCE } from "./preview-wire";
export { FRAME_SOURCE, HOST_SOURCE } from "./preview-wire";

/** A component instance around the selection, as the frame reports it (the receiver adds `paintedSource`). */
export type FrameHost = Omit<NonNullable<NativePreviewSelection["host"]>, "paintedSource">;
// Rules whose path the frame reported; the receiver keeps those of files it shows.
type Styles = { selectors: NativeSelectedRule[]; cascade: NativeCascade | undefined };
type Frame<T extends string, P = object> = { source: typeof FRAME_SOURCE; type: T; context: string | undefined } & P;

export type FrameMessage =
  | Frame<"typing-finished", { id: number }>
  | Frame<"image-drop", { path: string; node: number[]; width: number | undefined; files: File[] }>
  | Frame<"image-edit", { path: string; node: number[]; width: number | undefined }>
  | Frame<"patched", { id: number; ok: boolean }>
  | Frame<"text-edit", { path: string; node: number[]; before: string; after: string }>
  | Frame<"route", { href: string }>
  | Frame<"format", { format: "strong" | "em" | "link" }>
  | Frame<"move", { direction: "up" | "down" | "out" | "in" }>
  // `x`/`y` may be NaN (the receiver checks); a start names its block by `node` and `tag`.
  | Frame<"press-drag", { phase: "start" | "move" | "end" | "cancel"; x: number; y: number; alt: boolean; node: number[] | undefined; tag: string | undefined; cls: string; band: boolean; template: boolean }>
  | Frame<"canvas-clear">
  | Frame<"pin-rects", { rects: { id: string; rect: SelectionRect | null }[] }>
  // `report` is read against its own path; the receiver compares that with the probe's.
  | Frame<"drop-containers", { id: number | undefined; report: DropReport | undefined }>
  | Frame<"dismiss-context-menu">
  // Read against the editor's state (src/components/slot-ghosts.ts).
  | Frame<"slot-ghosts", { report: unknown }>
  | Frame<"inspect-result", { id: number; report: unknown }>
  | Frame<"ack", { id: number }>
  | Frame<"ready", { load: string | undefined }>
  | Frame<"error", { message: string }>
  | Frame<"clear-error">
  | Frame<"insert-points", { path: string; points: InsertPoint[] }>
  | Frame<"section-hover", { item: { parent: number[]; index: number } | undefined }>
  | Frame<"text-selection", { selection: NativeTextSelection | undefined }>
  | Frame<"item-grids", { hover: ItemGridReport | null; selected: ItemGridReport | null; tracking: number | undefined }>
  | Frame<"structure", { path: string; items: NativeStructureItem[] }>
  | Frame<"selection-rect", { rect: SelectionRect }>
  | Frame<"select", Styles & {
    path: string | undefined; tag: string | undefined; text: string; reason: "click" | "refresh" | undefined;
    node: number[] | undefined; pageNode: number[] | undefined; link: string | undefined; rect: SelectionRect | undefined;
    selector: string | undefined; host: FrameHost | undefined; hostChain: FrameHost[] | undefined; crumbs: CanvasCrumb[];
    menu: { x: number; y: number } | undefined;
  }>
  | Frame<"default-styles", Styles>
  | Frame<"component-styles", { tags: string[] }>
  | Frame<"shortcut", { name: string }>
  | Frame<"refusal-note-action">;

type Host<T extends string, P = object> = { source: typeof HOST_SOURCE; type: T } & P;
/** A structure field's text set in the page ahead of its render (`end`: the last), or the live patch dropped. */
export type PatchText = { drop: true } | { id: number; request: NativeNodeRequest; text: string; end?: true };

export type HostMessage =
  | Host<"update", { id: number; payload: UpdatePayload }>
  | Host<"drop-probe", { id: number; x: number; y: number; moving: number[] | undefined; bands: boolean | undefined }>
  | Host<"patch-text", PatchText>
  | Host<"finish-typing", { id: number }>
  | Host<"inspect", { id: number; request: { path?: string; node?: number[]; selector?: string; limit?: number } }>
  | Host<"theme", { focus: string; component: string }>
  | Host<"component-focus", { tag: string }>
  | Host<"edit-component", { mode: EditComponentFrameMode | undefined }>
  | Host<"viewing", { viewing: boolean }>
  | Host<"scroll-by", { dy: number; smooth?: boolean }>
  | Host<"pins", { pins: PinLocator[] }>
  | Host<"show-pin", { id: string }>
  | Host<"assets", Pick<UpdatePayload, "styles" | "componentStyles"> & { assetChanges: AssetChanges }>
  | Host<"canvas-crumb", { action: "select" | "hover"; index: number }>
  | Host<"canvas-avoid", { rect: Pick<SelectionRect, "top" | "left" | "bottom" | "right"> | null }>
  | Host<"canvas-hint", { request: NativeNodeRequest | null }>
  | Host<"canvas-code-select", { request: NativeNodeRequest }>
  | Host<"clear-selection">
  | Host<"select-node", { request: NativeNodeRequest; edit?: boolean }>
  | Host<"select-parent">
  | Host<"item-grid-track", { grid: ItemGridReport | undefined; tracking: number }>;

/** A host message as a sender writes it; `source` is added on the way out. */
export type HostMessageBody<T extends HostMessage["type"] = HostMessage["type"]> =
  Extract<HostMessage, { type: T }> extends infer M ? M extends HostMessage ? Omit<M, "source"> : never : never;

/**
 * When a frame message still counts (frame-protocol design, 4.3):
 * `action` a user's action, always (the host checks it against the current source);
 * `render` a description of one render, only for the current one;
 * `whole` a full report sent when it changed, always;
 * `reply` an answer matched to its request by id;
 * `lifecycle` the frame's document, matched by load number.
 */
export type Freshness = "action" | "render" | "whole" | "reply" | "lifecycle";
type PressPhase = Extract<FrameMessage, { type: "press-drag" }>["phase"];

// A press drag's start names a block in one render's DOM; its later steps belong to the drag.
export const FRESHNESS: { [T in FrameMessage["type"]]: T extends "press-drag" ? Record<PressPhase, Freshness> : Freshness } = {
  "typing-finished": "reply", "image-drop": "render", "image-edit": "render", patched: "reply", "text-edit": "action",
  route: "action", format: "action", move: "action", "press-drag": { start: "render", move: "action", end: "action", cancel: "action" },
  "canvas-clear": "action", "pin-rects": "whole", "drop-containers": "reply", "dismiss-context-menu": "action",
  "slot-ghosts": "render", "inspect-result": "reply", ack: "reply", ready: "lifecycle", error: "render", "clear-error": "render",
  "insert-points": "render", "section-hover": "render", "text-selection": "render", "item-grids": "render", structure: "render",
  "selection-rect": "render", select: "render", "default-styles": "render", "component-styles": "render",
  shortcut: "action", "refusal-note-action": "action",
};

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" ? value as Record<string, unknown> : undefined;
const string = (value: unknown) => typeof value === "string" ? value : undefined;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const index = (value: unknown): value is number => integer(value) && value >= 0;
/** An element-index path: at most 500 steps. */
const indexes = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 500 && value.every(index);

/** A box in frame-viewport points; `inset` (the page's own top bar, edit-bar.ts) only when positive. */
function readRect(raw: unknown): SelectionRect | undefined {
  const rect = object(raw);
  if (!rect || !finite(rect.top) || !finite(rect.left) || !finite(rect.width) || !finite(rect.height) || !finite(rect.bottom) || !finite(rect.right)) return undefined;
  const read: SelectionRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
  if (finite(rect.inset) && rect.inset > 0) read.inset = rect.inset;
  return read;
}

/** A card grid's report, its page path not yet checked against the page on show. */
function readItemGrid(raw: unknown): ItemGridReport | null {
  const grid = object(raw);
  if (!grid) return null;
  const frameBox = (value: unknown) => {
    const part = object(value);
    const read = readRect(part ? { ...part, bottom: 0, right: 0 } : undefined);
    return read && { top: read.top, left: read.left, width: read.width, height: read.height };
  };
  const box = frameBox(grid.ghost);
  const item = frameBox(grid.item);
  if (typeof grid.path !== "string" || !indexes(grid.parent) || !box) return null;
  // An empty card slot has no item: index and position -1, count 0.
  const slot = string(grid.slot);
  const { index: at, position, count } = grid;
  if (!integer(at) || !integer(position) || !integer(count)) return null;
  const empty = slot !== undefined && count === 0 && at === -1 && position === -1;
  if (!empty && (at < 0 || position < 0 || count < 0)) return null;
  return {
    path: grid.path,
    parent: grid.parent,
    index: at,
    position,
    count,
    row: grid.row === true,
    beside: grid.beside === true,
    ghost: box,
    ...(slot === undefined ? {} : { slot }),
    ...(item ? { item } : {}),
  };
}

/** An instance around the selection; `path`, `node` and `rect` only with a path and an index path. */
function readHost(raw: unknown): FrameHost | undefined {
  const value = object(raw);
  if (!value || typeof value.tag !== "string" || typeof value.selector !== "string") return undefined;
  const host: FrameHost = { tag: value.tag.slice(0, 100), selector: value.selector.slice(0, 2000) };
  if (typeof value.path === "string" && indexes(value.node)) {
    host.path = value.path;
    host.node = value.node;
    host.rect = readRect(value.rect);
  }
  return host;
}

/** Up to 16 nested instances, each with its path and node, or none. */
function readHostChain(raw: unknown): FrameHost[] | undefined {
  if (!Array.isArray(raw) || !raw.length || raw.length > 16) return undefined;
  const chain = raw.map(readHost);
  return chain.every((host): host is FrameHost => Boolean(host?.path && host.node)) ? chain : undefined;
}

function readTextSelection(raw: unknown): NativeTextSelection | undefined {
  const value = object(raw);
  if (!value || !integer(value.start) || !integer(value.end) || typeof value.text !== "string") return undefined;
  const { start, end } = value;
  const caret = value.caret === true && end === start && value.text === "";
  if (start < 0 || (end <= start && !caret) || value.text.length > 100_000) return undefined;
  const wrappers = Array.isArray(value.wrappers)
    ? value.wrappers.filter((name): name is string => typeof name === "string").slice(0, 50)
    : [];
  return caret ? { start, end, text: "", wrappers, caret } : { start, end, text: value.text, wrappers };
}

/** Page structure rows: at most 2000, 12 levels deep. */
function readStructure(raw: unknown): NativeStructureItem[] {
  let count = 0;
  const readItems = (value: unknown, depth: number): NativeStructureItem[] => {
    if (!Array.isArray(value) || depth > 12) return [];
    return value.flatMap((entry): NativeStructureItem[] => {
      const item = object(entry);
      if (!item || ++count > 2000) return [];
      if (typeof item.tag !== "string" || !indexes(item.node)) return [];
      const text = (key: string) => string(item[key])?.slice(0, 80) ?? "";
      return [{ tag: item.tag.slice(0, 100), node: item.node, className: string(item.className) ?? "", text: text("text"), heading: text("heading"), slot: text("slot"), children: readItems(item.children, depth + 1) }];
    });
  };
  return readItems(raw, 0);
}

const anyPath = { has: (_path: string) => true };
function readStyles(raw: Record<string, unknown>): Styles {
  return { selectors: readSelectedRules(raw.selectors, anyPath), cascade: readCascade(raw.cascade) };
}

function readInsertPoints(path: string, raw: unknown[]): InsertPoint[] {
  return raw.slice(0, 500).flatMap((entry): InsertPoint[] => {
    const point = object(entry);
    if (!point || !indexes(point.parent) || !index(point.index)) return [];
    if (!finite(point.top) || !finite(point.left) || !finite(point.width)) return [];
    return [{
      path,
      parent: point.parent,
      index: point.index,
      top: point.top,
      left: point.left,
      width: point.width,
      before: string(point.before)?.slice(0, 60) ?? "",
      tag: string(point.tag)?.slice(0, 100),
      empty: point.empty === true || undefined,
      height: finite(point.height) ? point.height : undefined,
    }];
  });
}

/**
 * The frame message `data` is, or undefined: not from the runtime, an unknown
 * type, or a field its receiver drops the whole message for. A field a
 * receiver acts without (it still dismisses, clears or hovers) reads as
 * undefined or its default instead.
 */
export function readFrameMessage(data: unknown): FrameMessage | undefined {
  const raw = object(data);
  if (!raw || raw.source !== FRAME_SOURCE) return undefined;
  const base = <T extends FrameMessage["type"]>(type: T): Frame<T> => ({ source: FRAME_SOURCE, type, context: string(raw.context) });
  switch (raw.type) {
    case "typing-finished":
      return typeof raw.id === "number" ? { ...base(raw.type), id: raw.id } : undefined;
    case "image-drop": {
      // Its node path has no step limit.
      const { path, node, files } = raw;
      if (typeof path !== "string" || !Array.isArray(node) || !node.length || !node.every(index)) return undefined;
      if (!Array.isArray(files) || !files.every((file) => file instanceof File)) return undefined;
      return { ...base(raw.type), path, node, width: typeof raw.width === "number" ? raw.width : undefined, files };
    }
    case "image-edit":
      if (typeof raw.path !== "string" || !indexes(raw.node) || !raw.node.length) return undefined;
      return { ...base(raw.type), path: raw.path, node: raw.node, width: typeof raw.width === "number" ? raw.width : undefined };
    case "patched":
      return typeof raw.id === "number" ? { ...base(raw.type), id: raw.id, ok: raw.ok === true } : undefined;
    case "text-edit":
      if (typeof raw.path !== "string" || typeof raw.before !== "string" || typeof raw.after !== "string" || raw.after.length > 100_000) return undefined;
      return indexes(raw.node) ? { ...base(raw.type), path: raw.path, node: raw.node, before: raw.before, after: raw.after } : undefined;
    case "route":
      return typeof raw.href === "string" ? { ...base(raw.type), href: raw.href } : undefined;
    case "format":
      return raw.format === "strong" || raw.format === "em" || raw.format === "link" ? { ...base(raw.type), format: raw.format } : undefined;
    case "move":
      return raw.direction === "up" || raw.direction === "down" || raw.direction === "out" || raw.direction === "in"
        ? { ...base(raw.type), direction: raw.direction } : undefined;
    case "press-drag":
      if (raw.phase !== "start" && raw.phase !== "move" && raw.phase !== "end" && raw.phase !== "cancel") return undefined;
      return {
        ...base(raw.type), phase: raw.phase, x: Number(raw.x), y: Number(raw.y), alt: raw.alt === true,
        node: indexes(raw.node) ? raw.node : undefined, tag: string(raw.tag), cls: string(raw.cls) ?? "",
        band: raw.band === true, template: raw.template === true,
      };
    case "canvas-clear":
    case "dismiss-context-menu":
    case "clear-error":
    case "refusal-note-action":
      return base(raw.type);
    case "pin-rects":
      if (!Array.isArray(raw.rects)) return undefined;
      return {
        ...base(raw.type),
        rects: raw.rects.slice(0, 200).flatMap((entry) => {
          const item = object(entry);
          return item && typeof item.id === "string" ? [{ id: item.id, rect: readRect(item.rect) ?? null }] : [];
        }),
      };
    case "drop-containers":
      return { ...base(raw.type), id: typeof raw.id === "number" ? raw.id : undefined, report: typeof raw.path === "string" ? parseDropReport(raw, raw.path) : undefined };
    case "slot-ghosts":
      return { ...base(raw.type), report: raw.report };
    case "inspect-result":
      return { ...base(raw.type), id: Number(raw.id), report: raw.report };
    case "ack":
      return { ...base(raw.type), id: Number(raw.id) };
    case "ready":
      // A load number that is not a string matches no load: the message is the replaced document's.
      return raw.load === undefined || typeof raw.load === "string" ? { ...base(raw.type), load: raw.load } : undefined;
    case "error":
      return typeof raw.message === "string" ? { ...base(raw.type), message: raw.message } : undefined;
    case "insert-points":
      if (typeof raw.path !== "string" || !Array.isArray(raw.points)) return undefined;
      return { ...base(raw.type), path: raw.path, points: readInsertPoints(raw.path, raw.points) };
    case "section-hover": {
      // Its parent path has no step limit.
      const item = object(raw.item);
      const parent = item?.parent, at = item?.index;
      const valid = Array.isArray(parent) && parent.every(index) && index(at);
      return { ...base(raw.type), item: valid ? { parent, index: at } : undefined };
    }
    case "text-selection":
      return { ...base(raw.type), selection: readTextSelection(raw.selection) };
    case "item-grids":
      return {
        ...base(raw.type), hover: readItemGrid(raw.hover), selected: readItemGrid(raw.selected),
        tracking: typeof raw.tracking === "number" && Number.isSafeInteger(raw.tracking) && raw.tracking > 0 ? raw.tracking : undefined,
      };
    case "structure":
      return typeof raw.path === "string" ? { ...base(raw.type), path: raw.path, items: readStructure(raw.items) } : undefined;
    case "selection-rect": {
      const rect = readRect(raw.rect);
      return rect ? { ...base(raw.type), rect } : undefined;
    }
    case "select": {
      const menu = object(raw.menu);
      return {
        ...base(raw.type),
        ...readStyles(raw),
        path: string(raw.path),
        tag: string(raw.tag),
        text: string(raw.text) ?? "",
        reason: raw.reason === "click" || raw.reason === "refresh" ? raw.reason : undefined,
        node: indexes(raw.node) ? raw.node : undefined,
        pageNode: indexes(raw.pageNode) ? raw.pageNode : undefined,
        link: string(raw.link),
        rect: readRect(raw.rect),
        selector: string(raw.selector)?.slice(0, 2000),
        host: readHost(raw.host),
        hostChain: readHostChain(raw.hostChain),
        crumbs: readCrumbs(raw.crumbs),
        menu: menu && finite(menu.x) && finite(menu.y) ? { x: menu.x, y: menu.y } : undefined,
      };
    }
    case "default-styles":
      return { ...base(raw.type), ...readStyles(raw) };
    case "component-styles":
      return { ...base(raw.type), tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [] };
    case "shortcut":
      return typeof raw.name === "string" ? { ...base(raw.type), name: raw.name } : undefined;
    default:
      return undefined;
  }
}
