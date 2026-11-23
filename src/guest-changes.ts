// What a guest of a synced session may change besides text (TOOLS-185): a link's address, a picture
// swapped for one of the site's or one they upload, a picture's focus and crop made in the image
// popup (src/page-builder/image-popup.ts), and the host bar's heading level, text size and bold.
// Lex's tab reads each change with these rules before it writes anything (src/live-session.ts):
// a message is a guest's word, never trusted as typed. No DOM here.
import type { PopupEdit } from "./page-builder/image-large-rules";
import type { PopupShape } from "./page-builder/image-popup-rules";
import { guestPhotoTypes, previewablePictures } from "../shared/media-kinds";

/** A guest's change as it travels: an upload carries its bytes as base64. */
export type GuestChange =
  | { kind: "link"; path: string; node: number[]; href: string }
  | { kind: "picture"; path: string; node: number[]; file: string }
  | { kind: "upload"; path: string; node: number[]; name: string; type: string; data: string }
  | { kind: "crop"; path: string; node: number[]; edit: PopupEdit; recrop: boolean }
  | { kind: "heading"; path: string; node: number[]; level: GuestHeadingLevel }
  /** A size the page's Text size offers (src/native-text-size.ts), or "default". */
  | { kind: "size"; path: string; node: number[]; size: string }
  /** The whole element's text bold, or not. */
  | { kind: "bold"; path: string; node: number[]; on: boolean };
/** The same change once Lex's tab holds it: an upload is a file again. */
export type GuestPageChange = Exclude<GuestChange, { kind: "upload" }> | { kind: "upload"; path: string; node: number[]; file: File };
export type GuestHeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/** Why a guest's change was not written when Lex's tab gave no reason: his page changed after the guest saw it. */
export const GUEST_NOT_KEPT = "The page changed meanwhile. Try again.";
/** Why a guest's change was not written when Lex's editor shows another page than the one it was made on. */
export const GUEST_OTHER_PAGE = "The site owner's editor is on another page now.";
/** The longest reason a guest is shown. */
export const GUEST_REASON_CHARS = 200;
export { guestReason } from "./guest-reason";

/** The biggest picture a guest may upload, and its base64 length. */
export const GUEST_UPLOAD_BYTES = 15 * 1024 * 1024;
const UPLOAD_CHARS = Math.ceil(GUEST_UPLOAD_BYTES / 3) * 4;
/** Whether a guest may upload this file: a photo, named as what it is, its type the one that name's ending means.
 *  A drawing (SVG), a web page (.html, .xhtml) or anything else could carry a script that would run from Lex's site once saved. */
export function guestPhoto(name: string, type: string): boolean {
  const ending = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ending !== undefined && Object.hasOwn(guestPhotoTypes, ending) && guestPhotoTypes[ending] === type.toLowerCase();
}
const SHAPES = new Set(["original", "square", "4:3", "16:9", "4:5", "free"]);
const RATIO = /^\s*\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?\s*)?$/;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const number = (value: unknown, low: number, high: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const steps = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 200 && value.every(step => Number.isInteger(step) && step >= 0);

/** An address a guest may give a link: a page, a part of one, mail or a phone, or the web; never a script. */
export function guestHref(value: unknown): string | undefined {
  if (!text(value, 2000)) return undefined;
  const href = value.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(href)) return undefined;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href.replace(/\s+/g, ""))?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "mailto", "tel"].includes(scheme)) return undefined;
  return href;
}

/** A site picture's path as a guest names it: a picture file inside the site, no way out of it. */
export function guestPicturePath(value: unknown): string | undefined {
  if (!text(value, 500) || !previewablePictures.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("/")) return undefined;
  return value.split("/").some(part => part === "" || part === "." || part === "..") ? undefined : value;
}

function readShape(value: unknown): PopupShape | undefined {
  if (typeof value === "string") return SHAPES.has(value) ? value as PopupShape : undefined;
  if (!record(value) || !text(value.value, 40) || !RATIO.test(value.value)) return undefined;
  if (value.kind === "other") return { kind: "other", value: value.value };
  if (value.kind === "component" && text(value.label, 80) && text(value.badge, 40)) return { kind: "component", value: value.value, label: value.label, badge: value.badge };
  return undefined;
}

const readFocus = (value: unknown) => record(value) && number(value.x, 0, 100) && number(value.y, 0, 100) ? { x: value.x, y: value.y } : undefined;

/** A focus and crop made in a guest's image popup, rebuilt from what is known; undefined when any of it is not. */
export function readPopupEdit(value: unknown): PopupEdit | undefined {
  if (!record(value) || !record(value.cut)) return undefined;
  const shape = readShape(value.shape), focus = readFocus(value.focus), cut = value.cut, rect = cut.rect;
  if (!shape || !focus || ![0, 90, 180, 270].includes(cut.turn as number) || !number(cut.zoom, 1, 5) || !record(rect)) return undefined;
  if (!number(rect.x, 0, 1) || !number(rect.y, 0, 1) || !number(rect.w, 0, 1) || !number(rect.h, 0, 1) || rect.w <= 0 || rect.h <= 0 || rect.x + rect.w > 1 + 1e-9 || rect.y + rect.h > 1 + 1e-9) return undefined;
  if (cut.straighten !== undefined && !number(cut.straighten, -45, 45)) return undefined;
  if (cut.flipX !== undefined && cut.flipX !== true || cut.flipY !== undefined && cut.flipY !== true) return undefined;
  const edit: PopupEdit = { shape, focus, cut: { turn: cut.turn as 0 | 90 | 180 | 270, zoom: cut.zoom, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    ...cut.straighten !== undefined ? { straighten: cut.straighten } : {}, ...cut.flipX ? { flipX: true } : {}, ...cut.flipY ? { flipY: true } : {} } };
  if (value.around !== undefined) {
    const around = readShape(value.around);
    if (!around) return undefined;
    edit.around = around;
  }
  if (value.aroundFocus !== undefined) {
    const aroundFocus = readFocus(value.aroundFocus);
    if (!aroundFocus) return undefined;
    edit.aroundFocus = aroundFocus;
  }
  return edit;
}

/** A guest's change rebuilt from what is known about it; undefined when any part of it is not. */
export function readGuestChange(value: unknown): GuestChange | undefined {
  if (!record(value) || !text(value.path, 500) || !steps(value.node)) return undefined;
  const at = { path: value.path, node: [...value.node] };
  if (value.kind === "link") {
    const href = guestHref(value.href);
    return href === undefined ? undefined : { kind: "link", ...at, href };
  }
  if (value.kind === "picture") {
    const file = guestPicturePath(value.file);
    return file ? { kind: "picture", ...at, file } : undefined;
  }
  if (value.kind === "upload") {
    if (!text(value.name, 200) || !text(value.type, 100) || !text(value.data, UPLOAD_CHARS) || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) return undefined;
    if (!guestPhoto(value.name, value.type)) return undefined;
    return { kind: "upload", ...at, name: value.name, type: value.type, data: value.data };
  }
  if (value.kind === "crop") {
    const edit = readPopupEdit(value.edit);
    return edit && typeof value.recrop === "boolean" ? { kind: "crop", ...at, edit, recrop: value.recrop } : undefined;
  }
  if (value.kind === "heading") return typeof value.level === "string" && /^h[1-6]$/.test(value.level) ? { kind: "heading", ...at, level: value.level as GuestHeadingLevel } : undefined;
  // A class name, a variable's name or a scale step: Lex's tab writes only a size the page offers.
  if (value.kind === "size") return text(value.size, 80) && /^-{0,2}[A-Za-z0-9][\w-]*$/.test(value.size) ? { kind: "size", ...at, size: value.size } : undefined;
  if (value.kind === "bold") return typeof value.on === "boolean" ? { kind: "bold", ...at, on: value.on } : undefined;
  return undefined;
}
