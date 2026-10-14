import { startTags, startTagAttribute } from "../../shared/html-source";
import type { MediaRecords } from "../../shared/media-records";
import { declarationRanges } from "../styles-index";
import { editNativeRedirects } from "../native-page-moves";
import { uploadProblem } from "../uploads";
import { mediaFamilyOf, alwaysKeptFiles } from "./media-families";
import { scanMediaUrlTokens } from "./media-references";
import { mediaCopyName } from "./media-storage";
import { mediaOriginalPath } from "./media-originals";
import { rewriteMediaMentions, rewriteMediaRedirects, type RenameInput } from "./media-rename";
import type { MediaReplaceRequest } from "./media-workspace";

export function replacementFamilies(path: string, paths: string[], records: MediaRecords) {
  const old = mediaFamilyOf(path, paths);
  if (!old || old.main !== path || !/\.(?:png|jpe?g|gif|webp|avif|bmp|tiff?|heic|heif)$/i.test(path) || /^media\/originals\//i.test(path))
    throw new Error("Choose an image Media file's main picture to replace.");
  if (records.files[path]?.trimmedFrom) throw new Error("Replace the original picture, not a Trimmed copy.");
  const members = (main: string) => {
    const family = mediaFamilyOf(main, paths);
    return family ? [main, ...family.copies.map(copy => copy.path), ...family.originals] : [main];
  };
  const family = members(path);
  const trims = Object.entries(records.files).filter(([, record]) => record.trimmedFrom && family.includes(record.trimmedFrom.source)).map(([main]) => main);
  return { old, family, trims, members };
}

/** Tiny header reader; no browser decoder or encoder enters the engine chunk. */
export function replacementImageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  let width = 0, height = 0;
  if (bytes.length >= 24 && text(0, 8) === "\x89PNG\r\n\x1a\n") { width = data.getUint32(16); height = data.getUint32(20); }
  else if (bytes.length >= 10 && /^GIF8[79]a$/.test(text(0, 6))) { width = data.getUint16(6, true); height = data.getUint16(8, true); }
  else if (bytes.length >= 30 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    const u24 = (at: number) => bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16);
    if (text(12, 4) === "VP8X") { width = u24(24) + 1; height = u24(27) + 1; }
    else if (text(12, 4) === "VP8 " && text(23, 3) === "\x9d\x01\x2a") { width = data.getUint16(26, true) & 0x3fff; height = data.getUint16(28, true) & 0x3fff; }
    else if (text(12, 4) === "VP8L" && bytes[20] === 47) { const bits = data.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let at = 2; at + 4 <= bytes.length;) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (at + 2 > bytes.length) break;
      const length = data.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) {
        height = data.getUint16(at + 3); width = data.getUint16(at + 5); break;
      }
      at += length;
    }
  } else if (bytes.length >= 16 && text(4, 4) === "ftyp" && /avif|avis/.test(text(8, Math.min(bytes.length - 8, 64)))) {
    for (let at = 4; at + 16 <= bytes.length; at++) if (text(at, 4) === "ispe" && data.getUint32(at - 4) >= 20 && at - 4 + data.getUint32(at - 4) <= bytes.length) {
      width = data.getUint32(at + 8); height = data.getUint32(at + 12); break;
    }
  }
  return width > 0 && height > 0 ? { width, height } : undefined;
}

interface ReplaceInput {
  request: MediaReplaceRequest; paths: string[]; sources: Record<string, string | undefined>; records: MediaRecords;
  versions: ReadonlyMap<string, string>; dimensions?: ReadonlyMap<string, { width: number; height: number }>;
  site?: RenameInput["site"];
}
interface Edit { start: number; end: number; text: string }
const apply = (source: string, edits: Edit[]) => edits.sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);

/** Pure plan: pixels and proofs are supplied by the workspace; this never mutates records or storage. */
export function planMediaReplace(input: ReplaceInput) {
  const { request, paths, records, versions, site } = input;
  const { path, result, original } = request;
  const { old, family, trims, members } = replacementFamilies(path, paths, records);
  const outputs = result?.outputs ?? [], first = outputs[0];
  if (!first || first.variantWidth !== undefined || outputs.filter(output => output.variantWidth === undefined).length !== 1)
    throw new Error("Exactly one primary image must be encoded.");
  if (outputs.some(output => !/^(?:png|jpe?g|webp|avif)$/i.test(output.extension) || output.extension !== first.extension))
    throw new Error("All responsive images must use the primary image format.");
  const widths = outputs.flatMap(output => output.variantWidth === undefined ? [] : [output.variantWidth]);
  if (new Set(widths).size !== widths.length || widths.some(width => !Number.isInteger(width) || width <= 0))
    throw new Error("Responsive image widths must be positive and unique.");
  if (![first.width, first.height].every(value => value !== undefined && Number.isFinite(value) && value > 0))
    throw new Error("The new picture must have positive dimensions.");
  const extension = /\.[^./]+$/.exec(path)![0].slice(1);
  const main = extension.toLowerCase() === first.extension.toLowerCase() ? path : path.replace(/\.[^./]+$/, "." + first.extension);
  const uploads = outputs.map(output => ({ path: output.variantWidth === undefined ? main : mediaCopyName(main, output.variantWidth), blob: output.blob }));
  if (original) {
    if (!/^[a-z0-9]+$/i.test(original.extension)) throw new Error("The original must use a supported file extension.");
    uploads.push({ path: mediaOriginalPath(main, original.extension), blob: original.blob });
  }
  for (const upload of uploads) {
    const problem = uploadProblem({ name: upload.path, size: upload.blob.size });
    if (problem) throw new Error(problem);
    if (paths.some(file => file.startsWith(upload.path + "/")) || paths.includes(upload.path) && !family.includes(upload.path)) throw new Error(`${upload.path} is taken. Nothing was replaced.`);
    for (let folder = upload.path.slice(0, upload.path.lastIndexOf("/")); folder; folder = folder.slice(0, folder.lastIndexOf("/"))) {
      if (paths.includes(folder)) throw new Error(`${folder} is a file, so it cannot contain uploaded files.`);
      if (!folder.includes("/")) break;
    }
  }
  const mapping = new Map<string, string>([[path, main]]), missing = new Set<string>(), trimmed = new Map<string, string>();
  const mapFamily = (source: string, isTrim: boolean) => {
    const f = mediaFamilyOf(source, paths);
    mapping.set(source, main);
    if (isTrim) trimmed.set(source, source);
    for (const copy of f?.copies ?? []) {
      mapping.set(copy.path, widths.includes(copy.width) ? mediaCopyName(main, copy.width) : main);
      if (!widths.includes(copy.width)) missing.add(copy.path);
      if (isTrim) trimmed.set(copy.path, source);
    }
    for (const kept of f?.originals ?? []) mapping.set(kept, original ? mediaOriginalPath(main, original.extension) : main);
  };
  mapFamily(path, false);
  for (const trim of trims) mapFamily(trim, true);
  const renameInput: RenameInput = { from: path, to: main, paths, records, sources: input.sources, site };
  const refs = new Map<string, { start: number; end: number; path: string; attribute?: string }[]>();
  rewriteMediaMentions(renameInput, mapping, { reference(file, start, end, path, attribute) {
    const list = refs.get(file) ?? []; list.push({ start, end, path, attribute }); refs.set(file, list);
  } });
  const sources = { ...input.sources };
  for (const [file, references] of refs) {
    if (!/\.html?$/i.test(file)) continue;
    const source = sources[file]!, edits: Edit[] = [];
    const tokens = scanMediaUrlTokens(file, source);
    for (const tag of startTags(source)) {
      const own = references.filter(ref => ref.start >= tag.start && ref.end <= tag.end);
      for (const name of ["srcset", "data-srcset", "imagesrcset"]) {
        const attr = startTagAttribute(source, tag, name);
        if (!attr || !own.some(ref => ref.attribute === name)) continue;
        const candidates = tokens.filter(token => token.attribute === name && token.start >= attr.valueStart && token.end <= attr.valueEnd);
        let dropped: string | undefined;
        const entries = candidates.flatMap((token, index) => {
          const ref = own.find(ref => ref.start === token.start && ref.attribute === name);
          let entry = source.slice(token.start, candidates[index + 1]?.start ?? attr.valueEnd).trim().replace(/,$/, "").trimEnd();
          if (ref && mapping.get(ref.path) === main) entry = entry.replace(/(\s+)\d+w\s*$/, `$1${first.width}w`);
          if (ref && missing.has(ref.path)) { dropped ??= entry; return []; }
          return [entry];
        });
        // Never leave a place without a picture: its only candidate becomes the new main (mapped below).
        if (!entries.length && dropped) entries.push(dropped);
        edits.push({ start: attr.valueStart, end: attr.valueEnd, text: entries.join(", ") });
      }
      if (tag.name !== "img") continue;
      const shown = own.find(ref => ["src", "data-src", "srcset", "data-srcset"].includes(ref.attribute ?? ""));
      if (!shown) continue;
      const trim = trimmed.get(shown.path), style = startTagAttribute(source, tag, "style");
      let value = style?.value ?? "";
      const shaped = hasDeclaration(value, "aspect-ratio");
      const width = startTagAttribute(source, tag, "width"), height = startTagAttribute(source, tag, "height");
      const numeric = (value?: string) => value !== undefined && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
      const w = numeric(width?.value), h = numeric(height?.value);
      if (trim && !shaped) {
        const size = w && h ? { width: w, height: h } : input.dimensions?.get(trim);
        if (!size) throw new Error(`Could not read ${trim}'s shape. Nothing was replaced.`);
        value += `${value.trim() && !value.trimEnd().endsWith(";") ? ";" : ""} aspect-ratio: ${size.width} / ${size.height};`;
        value = setDeclaration(value, "object-fit", "cover");
        value = setDeclaration(value, "object-position", "50% 50%");
      } else {
        if (hasDeclaration(value, "object-position")) value = setDeclaration(value, "object-position", "50% 50%");
        if (!shaped && w && h && height) edits.push({ start: height.valueStart, end: height.valueEnd, text: String(Math.round(w * first.height! / first.width!)) });
      }
      if (value !== (style?.value ?? "")) edits.push(style ? { start: style.valueStart, end: style.valueEnd, text: ["\"", "'"].includes(source[style.valueStart - 1]) ? value : `"${value.replaceAll('"', "&quot;")}"` } : { start: tag.nameEnd, end: tag.nameEnd, text: ` style="${value.trim()}"` });
    }
    sources[file] = apply(source, edits);
  }
  const edits = rewriteMediaMentions({ ...renameInput, sources }, mapping, { versions });
  for (const [file, source] of Object.entries(sources)) if (source !== undefined && source !== input.sources[file] && !edits.has(file)) edits.set(file, source);
  let redirects = rewriteMediaRedirects(renameInput, mapping);
  const address = (path: string) => "/" + path.split("/").map(encodeURIComponent).join("/");
  // Always keep on any family member (a kept copy protects the family) forwards every old address.
  const keepOld = request.keepOldAddress ?? family.some(member => Boolean(records.files[member]?.alwaysKeep));
  if (main !== path) for (const member of [old.main, ...old.copies.map(copy => copy.path)])
    redirects = editNativeRedirects(redirects, address(member), address(mapping.get(member)!), keepOld ? [address(member)] : [], false);
  if ((redirects ?? "") !== (input.sources._redirects ?? "")) edits.set("_redirects", redirects ?? "");
  const next = structuredClone(records);
  if (main !== path) { if (next.files[path]) next.files[main] = next.files[path]; delete next.files[path]; }
  // Copies and the kept original with a new counterpart keep their records (Always keep, notes) at its address.
  for (const member of family) {
    const record = next.files[member], to = mapping.get(member);
    if (member === path || !record) continue;
    delete next.files[member];
    if (to && to !== main && uploads.some(upload => upload.path === to)) next.files[to] = record;
  }
  for (const record of Object.values(next.files)) if (record.trimmedFrom && family.includes(record.trimmedFrom.source)) record.trimmedFrom.source = mapping.get(record.trimmedFrom.source)!;
  const kept = alwaysKeptFiles(paths, new Set(Object.keys(records.files).filter(file => records.files[file].alwaysKeep)));
  return { main, uploads, deletes: family.filter(member => !uploads.some(upload => upload.path === member)), edits, records: next,
    family, trims: trims.map(main => ({ main, members: members(main), kept: kept.has(main) })) };
}

function hasDeclaration(style: string, name: string) {
  return declarationRanges("{" + style + "}", 0, style.length + 2).some(range => range.property === name);
}

/** Replace only declaration values; retain whitespace, other declarations and priority. */
function setDeclaration(style: string, name: string, value: string) {
  const edits = declarationRanges("{" + style + "}", 0, style.length + 2).filter(range => range.property === name).map(range => {
    const start = style.indexOf(":", range.start - 1) + 1;
    const end = style[range.end - 2] === ";" ? range.end - 2 : range.end - 1;
    const previous = style.slice(start, end);
    return { start, end, text: (/^\s*/.exec(previous)?.[0] ?? "") + value + (/\s*!important\s*$/i.exec(previous)?.[0] ?? /\s*$/.exec(previous)?.[0] ?? "") };
  });
  return edits.length ? apply(style, edits) : style + (style.trim() && !style.trimEnd().endsWith(";") ? ";" : "") + ` ${name}: ${value};`;
}
