import { sharingImages } from "../../shared/media-kinds";
import { sharingImageExtensions } from "../../shared/media-kinds-policies";
import { readMediaPrefix } from "./media-prefix";
import { NATIVE_CONFIG_PATH, nativeSiteSettings } from "../../shared/native-project";
import { sitePathPrefix } from "../../shared/site-path-prefix";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords, type MediaRecords } from "../../shared/media-records";
import { encodeSharingJpeg, isSharingImage, sharingJpegPath, sharingImageDetail, sharingMetaName } from "./sharing-jpeg";
import { socialImageAddress, SOCIAL_IMAGE_NOTE } from "./social-image";
import { improveImagesPlan } from "./improve-images";
import { isMediaTextFile } from "./media-mentions";
import { rewriteMediaMentions, rewriteMediaRedirects } from "./media-rename";
import { mediaFamilyOf } from "./media-families";
import { suggestMediaName } from "./media-names";
import { mediaCopyName } from "./media-storage";
import { mediaResolvePath } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";
import { mediaAddingSettings } from "./media-settings";
import { mediaImageRecipe, optimiseMedia } from "./media-optimise";
import { makeOlderCopies } from "./media-older-copies";
import { mediaAttributes, mediaImageMarkup, mediaSrcset, type MediaImage, type MediaMeasured } from "./media-markup";
import { mediaPageEdits } from "./media-page-markup";
import { readSource, parseSource, type SourceTree } from "./source-tree";
import { readPage, locateNativeElementRange } from "../native-source-location";
import { startTags, startTagAttribute } from "../../shared/html-source";
import { replacementImageSize } from "./replace-everywhere";
import { uploadImageType, uploadProblem } from "../uploads";
import type { MediaWorkspaceBatch, MediaWorkspaceContext } from "./media-workspace";

export interface ImproveRequest {
  row: string;
  siteUrl?: string;
  files: Parameters<typeof improveImagesPlan>[0]["files"];
  measure?(file: string, node: number[], image: MediaImage): Promise<MediaMeasured | undefined>;
  live?: () => boolean;
  signal?: AbortSignal;
  progress?: (state: string) => void;
}
export interface ImproveResult { label: string; changed: boolean; notes: string[] }
/** Seams for tests: production uses the adding recipe's worker and the browser's page reader (node paths match the preview). */
export interface ImprovePorts { encode?: typeof optimiseMedia; copies?: typeof makeOlderCopies; tree?: (source: string) => SourceTree<unknown> }
function locations<N>(tree: SourceTree<N>) {
  return {
    elements: () => tree.elements().map(element => ({ range: tree.range(element), node: tree.path(element) })),
    at: (node: number[]) => { const element = tree.at(node); return element ? tree.range(element) : undefined; },
  };
}
const apply = (source: string, edits: { start: number; end: number; text: string }[]) => edits.sort((a, b) => b.start - a.start)
  .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
const ownChanges = new Set(["lighten", "copies", "size", "sizes", "loading"]);

/** Prepare one row completely before handing its single draft batch to the host. */
export async function prepareImproveHeavy(ctx: MediaWorkspaceContext, request: ImproveRequest, ports: ImprovePorts = {}): Promise<{ batch: MediaWorkspaceBatch; result: ImproveResult }> {
  const holds = () => !request.signal?.aborted && (request.live?.() ?? true);
  const guard = () => {
    ctx.assertLive();
    if (!holds()) throw new DOMException("Improve images cancelled.", "AbortError");
  };
  guard();
  const paths = [...ctx.paths], versions = new Map(paths.map(path => [path, ctx.assetVersion(path)]));
  const batch: MediaWorkspaceBatch = { label: "", expectedPaths: paths, expectedSources: new Map(), expectedAssets: versions,
    edits: new Map(), moves: [], deletes: [], restores: [], uploads: [], live: holds };
  const prefix = await readMediaPrefix(ctx, batch.expectedSources); guard();
  if (request.siteUrl !== undefined && sitePathPrefix(request.siteUrl) !== prefix)
    throw new Error("The site address changed. Try again.");
  // The proven address; a batch that did not read the settings keeps the request's (its prefix matched above).
  const siteUrl = nativeSiteSettings(batch.expectedSources.get(NATIVE_CONFIG_PATH)).url ?? request.siteUrl;
  const sources: Record<string, string | undefined> = {};
  for (const file of new Set([...paths.filter(isMediaTextFile), MEDIA_RECORDS_PATH, "_redirects"])) {
    const text = await ctx.read(file); guard();
    if (paths.includes(file) && text === undefined) throw new Error(`Could not read ${file}; image usage is incomplete. Refresh and try again.`);
    if (batch.expectedSources.has(file) && batch.expectedSources.get(file) !== text) throw new Error(`${file} changed while preparing image changes. Try again.`);
    sources[file] = text; if (!ctx.items.some(item => item.path === file)) batch.expectedSources.set(file, text);
  }
  const records = parseMediaRecords(sources[MEDIA_RECORDS_PATH]);
  const files = Object.fromEntries(paths.map(path => [path, request.files[path] ?? {}]));
  const site = { prefix, origins: ctx.origins ?? [], pages: ctx.pages, components: ctx.components };
  const plan = improveImagesPlan({ sources, pages: ctx.pages, components: ctx.components, files, records, site });
  const row = plan.rows.find(row => row.file === request.row);
  const result: ImproveResult = { label: row?.label ?? request.row, changed: false, notes: [] };
  if (!row) return { batch, result };
  batch.label = `Improve images: ${row.label}`;
  if (new Set(row.pictures.map(p => p.tag.start)).size < row.pictures.length)
    throw new Error("This component picture resolves to different files on its pages. Use a site-root address before improving it.");
  const quality = mediaAddingSettings(records.adding).image;
  const next = structuredClone(records);
  const images = new Map<string, MediaImage>();
  const created = new Map<string, string>(), reused = new Map<string, string>();
  const sharing = new Map<string, { path: string; width: number; height: number } | undefined>();
  const descriptorWidths = new Map<string, number>();
  const targets: { node: number[]; key: string; svg: boolean; adopted: boolean }[] = [];
  const treeFor = (source: string) => locations(ports.tree ? ports.tree(source) : readPage(source));
  const tree = treeFor(sources[row.file]!);
  const usable = row.pictures.filter(p => p.ticked && p.path && p.changes.length && p.changes.every(c => ownChanges.has(c)));
  for (const picture of usable) {
    guard();
    const old = picture.path!, family = mediaFamilyOf(old, paths);
    const standard = (family?.copies ?? []).filter(copy => /-(?:480|960|1600|\d+w)\.[^./]+$/i.test(copy.path));
    const adopted = plan.rows.flatMap(row => row.pictures).filter(p => p.path === old).some(p => (p.adopted ?? []).some(path => !standard.some(copy => copy.path === path)));
    // A set written by hand on any place of this picture serves its plain places too: no second set.
    const handMade = [...family?.copies ?? [], ...writtenVariants(plan.rows, sources, old, paths, site)]
      .filter((variant, index, all) => all.findIndex(other => other.width === variant.width) === index);
    let image = images.get(old);
    if (!image) {
      image = { path: old, ...files[old], alt: "", variants: handMade };
      if (picture.changes.includes("lighten")) {
        request.progress?.(quality === "smallest" ? "Preparing (slower)…" : "Preparing…"); guard();
        const existing = Object.entries(next.files).find(([path, record]) => record.lighterFrom === old && paths.includes(path) && path !== old);
        let main: string | undefined, width: number | undefined, height: number | undefined;
        if (existing) {
          main = existing[0];
          const blob = await ctx.blob(main); guard();
          const oldBlob = await ctx.blob(old); guard();
          if (blob.size >= oldBlob.size) main = undefined;
          else {
            const bytes = await blob.arrayBuffer(); guard();
            const size = replacementImageSize(new Uint8Array(bytes));
            width = size?.width ?? files[main]?.width; height = size?.height ?? files[main]?.height;
            if (!width || !height) throw new Error(`Could not read ${main}'s dimensions. Nothing was improved.`);
          }
        }
        if (!main) {
          const blob = await ctx.blob(old); guard();
          const encoded = await (ports.encode ?? optimiseMedia)(new File([blob], old.split("/").at(-1)!, { type: blob.type || uploadImageType(old) }),
            { ...mediaImageRecipe(quality), responsive: !adopted }, request.signal); guard();
          if (encoded.note) result.notes.push(encoded.note);
          const primary = encoded.outputs.find(output => output.variantWidth === undefined);
          if (!primary || !primary.width || !primary.height) throw new Error(`${old} could not be prepared. Nothing was improved.`);
          if (primary.blob.size >= blob.size) result.notes.push(`${old} was left at its address because the new file was not lighter.`);
          else {
            const outputs = adopted ? [primary] : encoded.outputs;
            const candidate = old.replace(/\.[^./]+$/, "." + primary.extension);
            const taken = (name: string) => {
              // Reserve omitted standard widths too: existing copies must never join the new main.
              const stem = name.replace(/\.[^./]+$/, ""), extension = name.slice(stem.length);
              if ([...paths, ...batch.uploads.map(upload => upload.path)].some(path => {
                const suffix = path.slice(stem.length);
                return path.startsWith(stem) && /^-(?:\d+w?|\d+x\d+)\.[^./]+$/i.test(suffix) && suffix.toLowerCase().endsWith(extension.toLowerCase());
              })) return true;
              if (sharingImages.test(name) && [...paths, ...batch.uploads.map(upload => upload.path)].some(path =>
                [stem + "-sharing.jpg", ...sharingImageExtensions.map(extension => stem + "." + extension)].some(target => path.toLowerCase() === target.toLowerCase()
                  || path.toLowerCase().startsWith(target.toLowerCase() + "/") || target.toLowerCase().startsWith(path.toLowerCase() + "/")))) return true;
              return outputs.some(output => {
              const target = output.variantWidth === undefined ? name : mediaCopyName(name, output.variantWidth);
              return [...paths, ...batch.uploads.map(upload => upload.path)].some(path => path.toLowerCase() === target.toLowerCase()
                || path.toLowerCase().startsWith(target.toLowerCase() + "/") || target.toLowerCase().startsWith(path.toLowerCase() + "/"));
              });
            };
            main = taken(candidate) ? suggestMediaName(candidate, taken) : candidate;
            width = primary.width; height = primary.height;
            for (const output of outputs) {
              const path = output.variantWidth === undefined ? main : mediaCopyName(main, output.variantWidth);
              const problem = uploadProblem({ name: path, size: output.blob.size });
              if (problem) throw new Error(problem);
              batch.uploads.push({ path, blob: output.blob });
              files[path] = { size: output.blob.size, width: output.width ?? output.variantWidth, height: output.height };
            }
            const previous = records.files[old];
            next.files[main] = { lighterFrom: old, ...previous?.description ? { description: previous.description } : {},
              ...previous?.decorative ? { decorative: previous.decorative } : {}, ...previous?.collections ? { collections: previous.collections } : {} };
          }
        }
        if (main) {
          const mapping = batch.uploads.some(upload => upload.path === main) ? created : reused;
          mapping.set(old, main);
          const newPaths = [...paths, ...batch.uploads.map(upload => upload.path)];
          const variants = mediaFamilyOf(main, newPaths)?.copies ?? [];
          if (!adopted) for (const copy of standard) {
            mapping.set(copy.path, variants.find(v => v.width === copy.width)?.path ?? main);
            if (!variants.some(v => v.width === copy.width)) descriptorWidths.set(copy.path, width!);
          }
          descriptorWidths.set(old, width!);
          image = { path: main, width, height, alt: "", variants: adopted ? handMade : variants };
        }
      }
      // A main that could not be made lighter still gets the copies a heavy picture lacks.
      const copiesOnly = picture.changes.includes("copies") || picture.changes.includes("lighten") && !adopted && !family?.copies.length;
      if (image.path === old && copiesOnly) {
        request.progress?.(quality === "smallest" ? "Preparing (slower)…" : "Preparing…"); guard();
        const guardedContext = { ...ctx, paths, assertLive: guard };
        const copies = await (ports.copies ?? makeOlderCopies)(guardedContext, image, quality, request.signal); guard();
        if (copies?.uploads.length) { batch.uploads.push(...copies.uploads); image = { ...image, variants: copies.variants }; }
        else if (picture.changes.includes("copies")) result.notes.push(`Smaller copies were not made for ${old}.`);
      }
      images.set(old, image);
    }
    const element = tree.elements().find(element => element.range?.tag.start === picture.tag.start);
    if (element) targets.push({ node: element.node, key: old, svg: picture.kind === "svg", adopted });
  }
  // Creation owns outside mentions. Other heavy rows retain their own source and Undo boundary.
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined || file === MEDIA_RECORDS_PATH) continue;
    const mapping = new Map(created);
    if (file === row.file) for (const entry of reused) mapping.set(...entry);
    else for (const other of plan.rows.filter(other => other.file === file)) for (const picture of other.pictures)
      if (picture.ticked && picture.changes.includes("lighten") && picture.path) {
        mapping.delete(picture.path);
        for (const copy of mediaFamilyOf(picture.path, paths)?.copies ?? []) mapping.delete(copy.path);
      }
    if (!mapping.size) continue;
    const skip = [...plan.protectedRanges[file] ?? []];
    if (/\.html?$/i.test(file)) {
      const visit = (nodes: ReturnType<typeof parseSource>) => { for (const node of nodes) if (node.type === "element") {
        if (["pre", "code", "samp", "kbd", "xmp", "textarea", "template", "noscript"].includes(node.name)
          || node.name === "script" && startTagAttribute(source, node.tag, "type")?.value === "application/ld+json") skip.push({ start: node.start, end: node.end });
        else visit(node.children);
      } };
      visit(parseSource(source));
    }
    const tags = /\.html?$/i.test(file) ? startTags(source) : [], sharingEdits = new Map<number, string>();
    let og: { path: string; width: number; height: number } | undefined;
    for (const [index, tag] of tags.entries()) if (tag.name === "meta") {
      if (skip.some(range => tag.start < range.end && tag.end > range.start)) continue;
      const name = sharingMetaName(source, tag);
      const address = startTagAttribute(source, tag, "content")?.value;
      const old = address && mediaResolvePath(decodeHtmlEntities(address, true), file, site);
      const mapped = old && mapping.get(old);
      const lighter = mapped ? [...images].find(([, image]) => image.path === mapped || image.variants?.some(copy => copy.path === mapped)) : undefined;
      const main = lighter ? lighter[1].path : mapped;
      let content: string | undefined;
      if (isSharingImage(name)) {
        if (name === "og:image") og = undefined;
        if (old && main && sharingImages.test(main)) {
          skip.push(tag);
          if (!sharing.has(main)) {
            sharing.set(main, undefined);
            // Old responsive addresses can map to this main too; encode its original picture once.
            const [original, image] = lighter!;
            const existing = mediaFamilyOf(main, [...paths, ...batch.uploads.map(upload => upload.path)])?.sharing;
            if (existing) {
              sharing.set(main, { path: existing, width: image.width!, height: image.height! });
              next.files[existing] = { ...next.files[existing], sharing: true };
            } else {
              const blob = await ctx.blob(original); guard();
              const jpeg = await encodeSharingJpeg({ blob, source: original, width: image.width!, height: image.height!,
                maxWidth: reused.has(original) ? image.width! : mediaImageRecipe(quality).maxWidth,
                encode: ports.encode ?? optimiseMedia, signal: request.signal, guard,
                error: `${old}'s sharing picture could not be prepared as a JPEG at the lighter picture's size. Nothing was improved.` });
              if (jpeg.blob.size >= blob.size) result.notes.push(`Sharing pictures keep ${old} because the JPEG was not lighter.`);
              else {
                const path = sharingJpegPath(main);
                if (paths.some(taken => taken.toLowerCase() === path.toLowerCase() || taken.toLowerCase().startsWith(path.toLowerCase() + "/") || path.toLowerCase().startsWith(taken.toLowerCase() + "/")))
                  throw new Error(`${path} is taken. Nothing was improved.`);
                const problem = uploadProblem({ name: path, size: jpeg.blob.size });
                if (problem) throw new Error(problem);
                batch.uploads.push({ path, blob: jpeg.blob });
                next.files[path] = { sharing: true };
                sharing.set(main, { path, width: jpeg.width!, height: jpeg.height! });
              }
            }
          }
          const copy = sharing.get(main);
          if (name.startsWith("og:")) og = copy;
          if (copy) {
            const address = socialImageAddress(siteUrl, copy.path);
            content = address.address;
            if (address.missingAddress && !result.notes.includes(SOCIAL_IMAGE_NOTE)) result.notes.push(SOCIAL_IMAGE_NOTE);
          }
        } else if (name.startsWith("og:")) og = undefined;
      } else if (og && /^og:image:(?:type|width|height)$/.test(name)) {
        content = sharingImageDetail(name, og);
        skip.push(tag);
      }
      if (content !== undefined) sharingEdits.set(index, mediaAttributes(source.slice(tag.start, tag.end), { content }));
    }
    const component = Object.values(ctx.components).includes(file);
    const input = { from: "", to: "", paths, sources: component ? sources : { [file]: source }, records, site: component ? site : { prefix, origins: site.origins } };
    const rewritten = new Set<string>();
    const options = { only: file, skip: { [file]: skip }, widths: descriptorWidths, reference: (referenceFile: string, _start: number, _end: number, path: string) => {
      if (referenceFile === file) rewritten.add(path);
    } };
    let edited = file === "_redirects" ? rewriteMediaRedirects(input, mapping, options) : rewriteMediaMentions(input, mapping, options).get(file);
    if (sharingEdits.size) {
      const text = edited ?? source, rewrittenTags = startTags(text);
      edited = apply(text, [...sharingEdits].map(([index, text]) => ({ ...rewrittenTags[index], text })));
    }
    if (edited !== undefined && edited !== source) batch.edits.set(file, edited);
    for (const [old, main] of mapping) movePlaces(next, old, main, file, rewritten.has(old));
  }
  let source = batch.edits.get(row.file) ?? sources[row.file]!;
  const protectedNodes = new Set(tree.elements().filter(element => {
    const tag = element.range?.tag;
    return tag && (plan.protectedRanges[row.file]?.some(range => tag.start >= range.start && tag.end <= range.end)
      || row.pictures.some(picture => picture.tag.start === tag.start && (picture.kind === "svg" || picture.changes.some(change => !ownChanges.has(change)))));
  }).map(element => JSON.stringify(element.node)));
  for (const target of targets) {
    const image = images.get(target.key)!;
    const range = treeFor(source).at(target.node);
    if (!range || range.tag.name !== "img") continue;
    const existing = source.slice(range.tag.start, range.tag.end);
    if (target.svg) {
      const text = mediaAttributes(existing, { ...image.width ? { width: String(image.width) } : {}, ...image.height ? { height: String(image.height) } : {} });
      source = apply(source, [{ start: range.tag.start, end: range.tag.end, text }]); continue;
    }
    let measured: MediaMeasured | undefined;
    try { measured = await request.measure?.(row.file, target.node, image); } catch { /* Unshown pages and templates use the placement fallback. */ }
    guard();
    const locate = ports.tree ? (text: string, node: number[]) => treeFor(text).at(node) : locateNativeElementRange;
    const safe = measured && { ...measured, images: measured.images.filter(item => !protectedNodes.has(JSON.stringify(item.node)) && !targets.some(target => target.svg && JSON.stringify(target.node) === JSON.stringify(item.node))) };
    const { edits, placement } = mediaPageEdits(source, safe, target.node, locate);
    let text = mediaImageMarkup(image, existing, placement, true, prefix);
    if (target.adopted) {
      const srcset = startTagAttribute(existing, startTags(existing)[0], "srcset")?.value;
      // A written picture/source set stays as written; a name-based family gets one srcset.
      const originalElement = tree.at(target.node);
      const originalTag = originalElement && sources[row.file]!.slice(originalElement.tag.start, originalElement.tag.end);
      const hasWrittenSet = !!originalTag && !!startTagAttribute(originalTag, startTags(originalTag)[0], "srcset") || currentTreeHasPictureSet(source, range.tag.start);
      text = mediaAttributes(text, { srcset: srcset ?? (hasWrittenSet ? undefined : mediaSrcset(image, prefix)), sizes: placement.sizes });
    }
    // No description is introduced when the old place had no alt attribute either.
    if (!startTagAttribute(existing, startTags(existing)[0], "alt")) text = mediaAttributes(text, { alt: undefined });
    edits.push({ start: range.tag.start, end: range.tag.end, text });
    source = apply(source, edits);
  }
  if (source !== sources[row.file]) batch.edits.set(row.file, source);
  if (serializeMediaRecords(next) !== serializeMediaRecords(records)) batch.edits.set(MEDIA_RECORDS_PATH, serializeMediaRecords(next));
  guard();
  result.changed = batch.edits.size > 0 || batch.uploads.length > 0;
  return { batch, result };
}

/** Future own-file, outside-picture and video planners can extend the prepared row before this one commit. */
export async function improveHeavy(ctx: MediaWorkspaceContext, request: ImproveRequest, ports: ImprovePorts = {}): Promise<ImproveResult> {
  const { batch, result } = await prepareImproveHeavy(ctx, request, ports);
  ctx.assertLive();
  if (!batch.live?.()) throw new DOMException("Improve images cancelled.", "AbortError");
  if (result.changed) await ctx.applyBatch(batch);
  return result;
}

/** `url NNNw` candidates of every place's own srcset for this picture, resolved to repository files. */
function writtenVariants(rows: ReturnType<typeof improveImagesPlan>["rows"], sources: Record<string, string | undefined>, old: string, paths: string[], site: Parameters<typeof mediaResolvePath>[2]) {
  const found: { path: string; width: number }[] = [];
  for (const row of rows) for (const picture of row.pictures) {
    if (picture.path !== old) continue;
    const tag = (sources[row.file] ?? "").slice(picture.tag.start, picture.tag.end), start = startTags(tag)[0];
    const srcset = start && startTagAttribute(tag, start, "srcset")?.value;
    for (const candidate of srcset ? decodeHtmlEntities(srcset, true).split(",") : []) {
      const match = /^\s*(\S+)\s+(\d+)w\s*$/.exec(candidate), path = match && mediaResolvePath(match[1], row.file, site);
      if (path && path !== old && paths.includes(path)) found.push({ path, width: Number(match![2]) });
    }
  }
  return found;
}

function currentTreeHasPictureSet(source: string, start: number): boolean {
  const tree = readSource(source, { page: true });
  const element = tree.elements().find(element => tree.range(element)?.tag.start === start);
  return element?.type === "element" && element.parent?.name === "picture" && element.parent.children.some(child => child.type === "element" && child.name === "source" && tree.attribute(child, "srcset") !== undefined) || false;
}

function movePlaces(records: MediaRecords, old: string, main: string, file: string, changed: boolean) {
  const place = records.files[old]?.places?.[file];
  if (!changed || !place || !records.files[main]) return;
  records.files[main].places = { ...records.files[main].places, [file]: place };
  delete records.files[old].places![file];
}
