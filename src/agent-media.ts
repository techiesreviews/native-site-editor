import { MEDIA_LIST_LIMIT, MEDIA_PREVIEW_LIMIT, MEDIA_PREVIEW_SIZE, isPreviewablePicture, mediaKind, picturePreviewRefusal, textBytes } from "../shared/agent";
import { MEDIA_RECORDS_PATH, type MediaRecords } from "../shared/media-records";
import { isImagePath } from "./native-structure";
import { readSiteMediaRecords } from "./page-builder/media-collections";
import { mediaFamilies, familyMembers, type MediaFamily } from "./page-builder/media-families";
import { fileDescriptionState } from "./page-builder/media-descriptions";
import { mediaUsageFor, mediaUsageRecords, mediaUsageState, type MediaUsageRecords } from "./page-builder/media-usage";
import type { MediaWorkspaceContext } from "./page-builder/media-workspace";

/** Source, editor and dependency files are not media; unknown downloads remain visible. Media lists the same. */
export { isMediaLibraryPath as isAgentMediaPath } from "./page-builder/media-library-filter";

export interface MediaListInput {
  items: { path: string; size?: number; draft?: boolean }[];
  paths: string[];
  records: MediaRecords | undefined;
  usage: MediaUsageRecords;
  folder?: string;
  offset: number;
  limit: number;
  note?: string;
}

/** One full entry per family; paging never removes fields from an entry. */
export function mediaListReport(input: MediaListInput) {
  const items = new Map(input.items.map(item => [item.path, item]));
  const families = mediaFamilies(input.paths);
  const members = new Set(families.flatMap(family => familyMembers(family)));
  const prefix = input.folder ? `${input.folder.replace(/\/+$/, "")}/` : "";
  const all = [
    ...families.filter(family => familyMembers(family).some(path => items.has(path))),
    ...input.items.filter(item => !members.has(item.path)).map((item): MediaFamily => ({ main: item.path, copies: [], originals: [], subtitles: [] })),
  ].filter(family => family.main.startsWith(prefix)).sort((a, b) => a.main.localeCompare(b.main));
  const media = all.slice(input.offset, input.offset + input.limit).map(family => {
    const item = items.get(family.main), record = input.records?.files[family.main];
    const description = fileDescriptionState(record), usage = mediaUsageFor(input.usage, family.main);
    const paths = familyMembers(family);
    const sizes = paths.map(path => items.get(path)?.size);
    return {
      path: family.main, kind: mediaKind(family.main),
      ...(item?.size !== undefined ? { size: item.size } : {}),
      ...(paths.length > 1 ? { family: { copies: family.copies.map(copy => copy.path), originals: family.originals,
        ...family.sharing ? { sharing: family.sharing } : {}, ...family.still ? { still: family.still } : {}, ...family.subtitles.length ? { subtitles: family.subtitles } : {} },
        ...(sizes.every(size => size !== undefined) ? { totalSize: sizes.reduce((total, size) => total + size, 0) } : {}) } : {}),
      uses: { checked: usage.checked, state: mediaUsageState(usage), ...(usage.pages.length ? { pages: usage.pages } : {}), ...(usage.otherUses.length ? { other: usage.otherUses } : {}) },
      ...(description.state === "decorative" ? { decorative: true } : description.state === "described" ? { description: { text: description.text, ...(description.byAgent ? { byAgent: true } : {}) } } : { described: false }),
      ...(record?.collections?.length ? { collections: record.collections } : {}),
      ...(record?.alwaysKeep ? { alwaysKeep: true } : {}),
      ...(paths.some(path => items.get(path)?.draft) ? { draft: true } : {}),
    };
  });
  const report = () => ({ total: all.length, offset: input.offset, count: media.length,
    ...(input.offset + media.length < all.length ? { nextOffset: input.offset + media.length } : {}),
    ...(input.usage.unreadable.length ? { notChecked: input.usage.unreadable } : {}),
    ...(input.note || input.records === undefined ? { note: input.note ?? `${MEDIA_RECORDS_PATH} could not be read; descriptions, collections and Always keep are unknown.` } : {}),
    media });
  while (textBytes(JSON.stringify(report())) > MEDIA_LIST_LIMIT) {
    // A single enormous entry (or unreadable-files list) cannot be paged without losing fields.
    if (media.length <= 1) throw new Error("The media report cannot fit one complete entry. Narrow the folder or shorten its media records.");
    media.pop();
  }
  return report();
}

/** Reads stay in the lazy chunk, including record parsing and the usage scan. */
export async function listWorkspaceMedia(ctx: MediaWorkspaceContext, request: { folder?: string; offset: number; limit: number }) {
  let records: MediaRecords | undefined, note: string | undefined;
  try {
    const source = await ctx.read(MEDIA_RECORDS_PATH);
    ctx.assertLive();
    if (source === undefined && ctx.paths.includes(MEDIA_RECORDS_PATH)) throw new Error("Media records are unreadable.");
    // The editor's own reader: before the first save, starting collections come from the library's folders and old tags.
    records = readSiteMediaRecords(source, ctx.items.map(item => item.path).filter(isImagePath));
  } catch {
    ctx.assertLive();
    note = `${MEDIA_RECORDS_PATH} could not be read or is malformed; descriptions, collections and Always keep are unknown.`;
  }
  const sources: Record<string, string | undefined> = Object.create(null);
  const files = ctx.paths.filter(path => /\.(?:html|css)$/i.test(path) && !path.startsWith("node_modules/"));
  // A dozen reads at a time, as the media workspace reads them.
  for (let index = 0; index < files.length; index += 12) {
    await Promise.all(files.slice(index, index + 12).map(async path => {
      try { sources[path] = await ctx.read(path); } catch { sources[path] = undefined; }
    }));
    ctx.assertLive();
  }
  ctx.assertLive();
  const usage = mediaUsageRecords({ media: ctx.items.map(item => item.path), sources, pages: ctx.pages, components: ctx.components });
  return JSON.stringify(mediaListReport({ ...request, items: ctx.items, paths: ctx.paths, records, note, usage }));
}

export async function previewPicture(blob: Blob, path: string) {
  if (!isPreviewablePicture(path)) throw new Error(picturePreviewRefusal(path));
  let image: ImageBitmap | HTMLImageElement;
  let url: string | undefined;
  try {
    if (/\.svg$/i.test(path)) {
      url = URL.createObjectURL(new Blob([blob], { type: "image/svg+xml" }));
      const element = new Image();
      element.src = url;
      await element.decode();
      image = element;
    } else image = await createImageBitmap(blob);
  } catch {
    if (url) URL.revokeObjectURL(url);
    throw new Error(`${path} could not be decoded as a picture in this browser.`);
  }
  try {
    const originalWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const originalHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (!originalWidth || !originalHeight) throw new Error(`${path} has no picture dimensions.`);
    const scale = Math.min(1, MEDIA_PREVIEW_SIZE / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale)), height = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not draw a picture preview.");
    context.drawImage(image, 0, 0, width, height);
    for (const quality of [0.8, 0.65, 0.5, 0.35, 0.2, 0.1]) {
      let encoded = canvas.toDataURL("image/webp", quality);
      if (!encoded.startsWith("data:image/webp;")) encoded = canvas.toDataURL("image/jpeg", quality);
      const [header, data] = encoded.split(",");
      if (data && data.length <= MEDIA_PREVIEW_LIMIT) return { data, mimeType: header.slice(5, header.indexOf(";")), width, height, originalWidth, originalHeight };
    }
    throw new Error(`${path} could not fit the picture preview size limit.`);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (image instanceof ImageBitmap) image.close();
  }
}
