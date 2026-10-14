import { startTags } from "../../shared/html-source";
import type { MediaRecords } from "../../shared/media-records";
import type { Stamp } from "../guarded-edit";
import type { MediaControllerPorts } from "../controllers/media-controller";
import { locateNativeElementRange } from "../native-source-location";
import { mediaAttribute } from "./media-attributes";
import { mediaAttributes, type MediaMeasured } from "./media-markup";
import { mediaPageEdits } from "./media-page-markup";
import { decodeHtmlEntities } from "./html-entities";
import { mediaResolvePath } from "./media-references";

const ratios = { square: "1 / 1", "4:3": "4 / 3", "16:9": "16 / 9", "4:5": "4 / 5" };
export type PlaceShape = "original" | keyof typeof ratios;
export interface PlaceFocus { x: number; y: number }
export interface PlaceFrameChange { shape?: PlaceShape; focus?: PlaceFocus }
const managed = ["aspect-ratio", "object-fit", "object-position"] as const;

/** Split only at top-level semicolons; comments and strings are opaque CSS tokens. */
function declarations(style: string) {
  const parts: { text: string; plain: string; comments: string }[] = [];
  let start = 0, plain = "", comments = "", quote = "", depth = 0;
  const push = (end: number) => { parts.push({ text: style.slice(start, end), plain, comments }); start = end; plain = ""; comments = ""; };
  for (let i = 0; i < style.length; i++) {
    const c = style[i];
    if (c === "\\") { plain += style.slice(i, i + 2); i++; continue; }
    if (quote) { plain += c; if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; plain += c; continue; }
    if (c === "/" && style[i + 1] === "*") {
      const end = style.indexOf("*/", i + 2), stop = end < 0 ? style.length : end + 2;
      comments += style.slice(i, stop); plain += " "; i = stop - 1; continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    if (c === ";" && !depth) push(i + 1); else plain += c;
  }
  if (start < style.length) push(style.length);
  return parts;
}
const property = (plain: string) => plain.match(/^\s*([\w-]+)\s*:/)?.[1].toLowerCase();
/** An image tag's decoded inline style ("" without one). */
export const inlineStyle = (text: string) => {
  const attr = mediaAttribute(text, startTags(text)[0], "style");
  return attr ? decodeHtmlEntities(attr.value, true) : "";
};

/** Keep unowned declarations byte-for-byte in the decoded attribute, including their separators. */
function editStyle(style: string, changes: Record<string, string | undefined>) {
  const seen = new Set<string>();
  let result = declarations(style).map(part => {
    const name = property(part.plain);
    if (!name || !Object.hasOwn(changes, name)) return part.text;
    const value = changes[name], first = !seen.has(name);
    seen.add(name);
    const prefix = part.text.match(/^\s*/)?.[0] ?? "";
    const written = first && value !== undefined ? `${name}: ${value};` : "";
    // A removed declaration takes its leading space with it; its comments stay.
    return `${written || part.comments ? prefix : ""}${part.comments}${written}`;
  }).join("");
  for (const name of managed) if (Object.hasOwn(changes, name) && !seen.has(name) && changes[name] !== undefined) {
    if (result.trim() && !result.trimEnd().endsWith(";")) result += ";";
    result += `${result.trim() ? " " : ""}${name}: ${changes[name]}`;
  }
  return /^[\s;]*$/.test(result) ? undefined : result.trimEnd();
}

export function writePlaceFrame(tagText: string, change: PlaceFrameChange): string {
  const tag = startTags(tagText)[0];
  if (!tag || (tag.name !== "img" && !(tag.name === "video" && mediaAttribute(tagText, tag, "muted") && mediaAttribute(tagText, tag, "loop"))) || tagText[tag.end - 1] !== ">") throw new Error("Choose an image place.");
  const changes: Record<string, string | undefined> = {};
  if (change.shape !== undefined) {
    if (change.shape !== "original" && !Object.hasOwn(ratios, change.shape)) throw new Error("Free trimming needs a trimmed copy.");
    changes["aspect-ratio"] = change.shape === "original" ? undefined : ratios[change.shape];
    changes["object-fit"] = change.shape === "original" ? undefined : "cover";
    if (change.shape === "original") changes["object-position"] = undefined;
  }
  if (change.focus && change.shape !== "original") {
    const percent = (value: number) => {
      if (!Number.isFinite(value)) throw new Error("The focus point must use finite percentages.");
      return Math.round(Math.max(0, Math.min(100, value)));
    };
    const x = percent(change.focus.x), y = percent(change.focus.y);
    changes["object-position"] = x === 50 && y === 50 ? undefined : `${x}% ${y}%`;
  }
  if (!Object.keys(changes).length) return tagText;
  return mediaAttributes(tagText, { style: editStyle(inlineStyle(tagText), changes) });
}

/** Replace resets only the focus (the image popup writes it through `placeMediaImage`'s frame). */
export function resetPlaceFocus(tagText: string): string {
  return writePlaceFrame(tagText, { focus: { x: 50, y: 50 } });
}

function styleValues(style: string) {
  const values = new Map<string, { value: string; important: boolean }>();
  for (const part of declarations(style)) {
    const name = property(part.plain);
    if (!name) continue;
    const raw = part.plain.slice(part.plain.indexOf(":") + 1).trim();
    const important = /!\s*important\s*$/i.test(raw), old = values.get(name);
    if (!old?.important || important) values.set(name, { value: raw.replace(/!\s*important\s*$/i, "").trim(), important });
  }
  return (name: string) => values.get(name)?.value;
}

function readFocus(raw: string | undefined): PlaceFocus | undefined {
  if (raw === undefined) return { x: 50, y: 50 };
  let tokens = raw.toLowerCase().trim().split(/\s+/);
  if (tokens.length === 1) tokens = /^(top|bottom)$/.test(tokens[0]) ? ["center", tokens[0]] : [tokens[0], "center"];
  if (tokens.length !== 2) return undefined;
  if (/^(top|bottom)$/.test(tokens[0]) || /^(left|right)$/.test(tokens[1])) tokens.reverse();
  const value = (token: string, axis: "x" | "y") => {
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(token)) return Number(token.slice(0, -1));
    if (token === "center") return 50;
    if (token === (axis === "x" ? "left" : "top")) return 0;
    if (token === (axis === "x" ? "right" : "bottom")) return 100;
    return undefined;
  };
  const x = value(tokens[0], "x"), y = value(tokens[1], "y");
  return x === undefined || y === undefined ? undefined : { x, y };
}

export function readPlaceFrame(tagText: string, records?: MediaRecords, pagePath = "index.html") {
  const values = styleValues(inlineStyle(tagText)), raw = values("aspect-ratio");
  let shape: PlaceShape | { kind: "other"; value: string } = "original";
  if (raw !== undefined) {
    const ratio = raw.match(/^\s*(\d+(?:\.\d*)?|\.\d+)\s*(?:\/\s*(\d+(?:\.\d*)?|\.\d+))?\s*$/);
    const n = ratio ? Number(ratio[1]) / Number(ratio[2] ?? 1) : NaN;
    const known = Object.entries(ratios).find(([, text]) => {
      const [a, b] = text.split(" / ").map(Number);
      return Math.abs(n - a / b) < 0.0001;
    });
    shape = known && values("object-fit")?.toLowerCase() === "cover" ? known[0] as keyof typeof ratios : { kind: "other", value: raw };
  }
  const focusRaw = values("object-position"), focus = readFocus(focusRaw);
  const src = mediaAttribute(tagText, startTags(tagText)[0], "src");
  const path = src && mediaResolvePath(decodeHtmlEntities(src.value, true), pagePath);
  const trimmedFrom = path && records?.files[path]?.trimmedFrom;
  return { file: path || undefined, shape, focus, ...(focus === undefined ? { focusRaw } : {}), trimmed: !!trimmedFrom, ...(trimmedFrom ? { source: trimmedFrom.source, trim: structuredClone(trimmedFrom.trim) } : {}) };
}

export type PlaceFramePorts = Pick<MediaControllerPorts, "source" | "openFile" | "restoreFile" | "viewingVersion" | "measureImage" | "locateElement" | "change">;
export interface PlaceFrameProof { stamp: Stamp; epoch: number; source: string; expected: string }

/** A page-only, one-Undo edit. Measurement failure leaves download sizing untouched. */
export async function framePlace(ports: PlaceFramePorts, target: { path: string; node: number[] }, change: PlaceFrameChange, proof: PlaceFrameProof) {
  if (/^components\//i.test(target.path)) throw new Error("A component template's fallback picture has no image popup.");
  const locate = ports.locateElement ?? locateNativeElementRange;
  const current = () => {
    const latest = ports.source(target.path), range = latest === undefined ? undefined : locate(latest, target.node);
    if (!proof.stamp.holds() || ports.viewingVersion() || latest !== proof.source || !range || range.tag.name !== "img"
      || latest?.slice(range.tag.start, range.tag.end) !== proof.expected) throw new Error("This image changed while the popup was open. Select it again.");
    return range;
  };
  current();
  if (ports.openFile() !== target.path) { await ports.restoreFile(target.path, proof.epoch); current(); }
  let text = writePlaceFrame(proof.expected, change);
  if (text === proof.expected) return;
  let measured: MediaMeasured | undefined;
  if (change.shape !== undefined) {
    try { measured = await ports.measureImage?.(target.path, target.node, {}, undefined, inlineStyle(text)); }
    catch { /* The place still changes when measurement fails. */ }
    current();
  }
  // No usable width hint is a failed measurement, so auto sizes and loading stay paired.
  if (!measured?.sizes) measured = undefined;
  if (ports.openFile() !== target.path) throw new Error("The page changed while the popup was open. Select the image again.");
  const page = mediaPageEdits(proof.source, measured, target.node, locate);
  if (measured) {
    // As in slice 33: placed images (with `sizes`) follow the measurement; hand-written ones change only for priority.
    const tag = startTags(text)[0], placed = !!mediaAttribute(text, tag, "sizes");
    const attrs: Record<string, string | undefined> = { fetchpriority: page.placement.priority ? "high" : undefined };
    if (placed || page.placement.priority) attrs.loading = page.placement.lazy ? "lazy" : undefined;
    if (placed) attrs.sizes = page.placement.sizes;
    text = mediaAttributes(text, attrs);
  }
  const range = current();
  if (!ports.change(target.path, proof.source, [...page.edits, { start: range.tag.start, end: range.tag.end, text }], target.node,
    change.shape !== undefined ? "Image shape changed" : "Focus point moved")) throw new Error("The image place could not be changed.");
}
