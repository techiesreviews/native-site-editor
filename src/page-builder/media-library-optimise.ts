import { formatBytes } from "../uploads";
import { basename } from "./media-library-filter";
import { buildMediaImportRequests, mediaOptimiseStart } from "./media-library-optimise-rules";
import { button, node } from "../ui/dom";
import { cancellation } from "./media-busy-lock";
import { input, select, field, check } from "./media-library-fields";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import { mediaImageRecipe, mediaSavings, optimiseMedia, type MediaOptimiseResult, type MediaOptimiseOptions } from "./media-optimise";

type OptimiseContext = Pick<LibrarySheetContext, "alive" | "library" | "task" | "adapter" | "cache" | "refresh" | "tell">;

/** The Optimise sheet; `folder` is the folder filter, the default destination for new files,
 * which join `collection` (the one being viewed when they were dropped). */
export function showMediaOptimise(
  sheet: LibrarySheet, c: OptimiseContext, folder: string,
  files: File[], existing = false, receipts = new Map<string, string | undefined>(), collection = "",
) {
  const { element } = sheet, { task, cache, tell } = c;
  if (!c.alive()) return;
  takeSheet(sheet);
  delete element.dataset.mode;
  const defaults = mediaOptimiseStart(c.library().adding);
  element.append(node("h3", "", "Optimise"), node("p", "media-library__muted",
    `${files.length} ${files.length === 1 ? "image" : "images"} · ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))} before`));
  // Empty keeps the full size (Higher quality).
  const width = input("Maximum width", "number"); width.min = "1"; width.max = "10000"; width.value = defaults.maxWidth === null ? "" : String(defaults.maxWidth);
  width.placeholder = "Full size";
  const quality = input("Image quality", "number"); quality.min = "1"; quality.max = "100"; quality.value = String(defaults.quality); quality.required = true;
  const format = select("Image format", [["webp", "WebP"], ["avif", "AVIF"], ["png", "PNG"], ["jpeg", "JPEG"]]); format.value = defaults.format;
  const responsive = input("Responsive sizes", "checkbox"); responsive.checked = defaults.responsive;
  const original = input("Keep original", "checkbox"); original.checked = defaults.keepOriginal;
  const update = input("Update existing references", "checkbox"); update.checked = true;
  const destination = input("Upload folder", "text"); destination.value = folder && folder !== "/" ? folder : "media/images";
  element.append(field("Max width (px)", width), field("Format", format), field("Quality", quality),
    check("Responsive sizes · 480 / 960 / 1600 px", responsive), check("Keep original bytes and metadata", original),
    node("p", "media-library__hint",
      "Re-encoding strips EXIF and GPS metadata for privacy. WebP keeps transparency; a smaller transparent PNG is kept instead. SVG/GIF stay untouched."));
  if (existing) element.append(check("Update references to the new files", update), node("p", "media-library__hint",
    "Optimised copies are new files. Originals stay available. Existing alt text and classes stay intact."));
  else element.append(field("Destination folder", destination));
  const results = node("div", "media-library__results");
  let prepared: { file: File; result: MediaOptimiseResult }[] = [];
  let prepareVersion = 0;
  const add = button(existing ? "Add optimised copies" : "Add to library", () => void task(async () => {
    const requests = buildMediaImportRequests(
      prepared, existing, destination.value, c.library().metadata, update.checked, receipts, collection,
    );
    await c.adapter.import(requests);
    cache.clear(); await c.refresh(); element.hidden = true; tell("Images added as drafts. Choose an image to use it on the page.");
  }), "button"); add.disabled = true;
  const prepare = button("Preview optimisation", () => void task(async () => {
    if (!width.checkValidity() || !quality.checkValidity()) throw new Error("Enter a width from 1 to 10000 (or none for full size) and quality from 1 to 100.");
    const settings: MediaOptimiseOptions = {
      maxWidth: width.value ? Number(width.value) : null, quality: Number(quality.value), format: format.value as MediaOptimiseOptions["format"],
      ...format.value === "avif" ? { speed: mediaImageRecipe("smallest").speed } : {}, responsive: responsive.checked, keepOriginal: original.checked,
    };
    prepared = []; add.disabled = true; results.replaceChildren(node("p", "", "Optimising in your browser…"));
    sheet.work?.abort();
    const controller = new AbortController(); sheet.work = controller;
    const request = ++prepareVersion, panel = sheet.version;
    for (const file of files) {
      const result = await optimiseMedia(file, settings, controller.signal);
      if (!c.alive() || panel !== sheet.version || request !== prepareVersion) return;
      prepared.push({ file, result });
    }
    results.replaceChildren();
    for (const { file, result } of prepared) {
      const preview = node("img", "media-library__preview"); preview.alt = ""; preview.src = cache.objectUrl(result.outputs[0].blob);
      const savings = mediaSavings(result.before, result.after);
      results.append(preview,
        node("p", "", `${basename(file.name)} · ${formatBytes(result.before)} → ${formatBytes(result.after)}, ${savings >= 0 ? "−" : "+"}${Math.abs(savings)}%`),
        node("p", "media-library__hint",
          `${result.outputs.length - 1} responsive variants · ${formatBytes(result.outputs.reduce((sum, output) => sum + output.blob.size, 0))} total${result.note ? ` · ${result.note}` : " · Metadata stripped"}`));
    }
    add.disabled = false;
  }, true, true));
  for (const control of [width, quality, format, responsive, original]) control.addEventListener("input", () => {
    prepareVersion++; sheet.work?.abort(); prepared = [];
    add.disabled = true; results.replaceChildren();
  });
  element.append(prepare, results, add, cancellation("Cancel", () => { sheet.version++; sheet.work?.abort(); element.hidden = true; }));
  width.focus();
}
