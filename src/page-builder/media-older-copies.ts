import { mediaFamilies, RESPONSIVE_COPY_WIDTHS } from "./media-families";
import { mediaCopyName } from "./media-storage";
import { uploadProblem } from "../uploads";
import { mediaAddingSettings } from "./media-settings";
import { mediaImageRecipe, optimiseMedia, type MediaImageQuality } from "./media-optimise";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaImage } from "./media-markup";

export function olderCopyWidths({ path, width, paths }: { path: string; width?: number; paths: string[] }): number[] {
  if (!/\.(?:jpe?g|png|webp|avif|gif|bmp)$/i.test(path) || /^media\/originals\//i.test(path) || !width || !Number.isFinite(width)) return [];
  const family = mediaFamilies(paths).find(family => family.main === path);
  return family && !family.copies.length ? RESPONSIVE_COPY_WIDTHS.filter(size => size < width) : [];
}

/** A plan must leave every existing family intact and join only the requested copies. */
export function olderCopyPaths(main: string, widths: number[], extension: string, paths: string[]): string[] {
  const primary = main.replace(/\.[^./]+$/, "." + (extension === "jpeg" ? "jpg" : extension));
  const planned = widths.map(width => mediaCopyName(primary, width));
  const taken = paths.map(path => path.toLowerCase()), names = planned.map(path => path.toLowerCase());
  if (new Set(names).size !== names.length || names.some(name => taken.some(path => path === name || path.startsWith(name + "/") || name.startsWith(path + "/")))) return [];
  const before = mediaFamilies(paths), after = mediaFamilies([...paths, ...planned]);
  const family = after.find(family => family.main === main);
  if (!family || family.copies.length !== planned.length || planned.some(path => !family.copies.some(copy => copy.path === path))) return [];
  const unchanged = after.map(family => family.main === main ? { ...family, copies: [] } : family);
  return JSON.stringify(before) === JSON.stringify(unchanged) ? planned : [];
}

export function olderCopyFormat(main: string, widths: number[], extension: string, paths: string[]): string | undefined {
  if (olderCopyPaths(main, widths, extension, paths).length === widths.length && olderCopyPaths(main, widths, "webp", paths).length === widths.length) return extension;
  const own = main.split(".").pop()!.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "avif"].includes(own) && olderCopyPaths(main, widths, own, paths).length === widths.length) return own;
}

/** Read and encode existing pixels without ever returning or uploading the main. */
export async function makeOlderCopies(ctx: MediaWorkspaceContext, image: MediaImage, quality: MediaImageQuality = "balanced", signal?: AbortSignal) {
  const widths = olderCopyWidths({ path: image.path, width: image.width, paths: ctx.paths });
  const options = mediaImageRecipe(quality), extension = olderCopyFormat(image.path, widths, options.format, ctx.paths);
  if (!widths.length) return undefined;
  // No names that join this image's family: placed at full size, with the note.
  if (!extension) throw new Error("No free names for the copies.");
  const version = ctx.assetVersion(image.path), blob = await ctx.blob(image.path);
  ctx.assertLive();
  const format = extension === "jpg" || extension === "jpeg" ? "jpeg" : extension as "png" | "webp" | "avif";
  const result = await optimiseMedia(new File([blob], image.path, { type: blob.type }), options, signal, undefined, false, { widths, format });
  ctx.assertLive();
  const uploads: { path: string; blob: Blob }[] = [], variants: { path: string; width: number }[] = [];
  // Transparency and the AVIF fallback may choose WebP. Validate the actual output as well.
  const actual = result.outputs[0]?.extension;
  if (actual && olderCopyPaths(image.path, widths, actual, ctx.paths).length !== widths.length) throw new Error("No free names for the copies.");
  if (actual) {
    for (const output of result.outputs) {
      const problem = uploadProblem({ name: image.path, size: output.blob.size });
      if (problem) throw new Error(problem);
      if (!output.variantWidth || output.extension !== actual) continue;
      const path = mediaCopyName(image.path.replace(/\.[^./]+$/, "." + actual), output.variantWidth);
      uploads.push({ path, blob: output.blob }); variants.push({ path, width: output.variantWidth });
    }
  }
  return { uploads, variants, version };
}

export const olderCopiesQuality = (adding: Parameters<typeof mediaAddingSettings>[0]) => mediaAddingSettings(adding).image;
export const OLDER_COPIES_FAILED = " Smaller copies could not be made, so the full-size picture is used.";
