// A picture from outside the picker (a session guest's upload, TOOLS-185) held the way the picker holds a
// file added in it: prepared first, then saved together with its placement in one batch, so the new file
// and the page's change are one Undo step (`placeMediaImage`'s held path, src/page-builder/media-place.ts).
import type { MediaHeldFiles } from "./media-picker";
import type { MediaWorkspaceContext } from "./media-workspace";
import { mediaNameAlt, mediaVariantName, mediaVariants, type MediaImage } from "./media-markup";
import { importPreparedMedia, prepareMediaFile } from "./media-prepare";
import { readMediaAddingSettings } from "./media-settings";

import { guestPhotoTypes } from "../../shared/media-kinds";

/** `file` prepared for `folder` with the site's adding choices, as a picture to place and its held file.
 * Nobody on Lex's tab chose it, so a file the editor would add only after asking is refused, not asked about. */
export async function holdUpload(file: File, folder: string, workspaceContext: () => Promise<MediaWorkspaceContext>): Promise<{ image: MediaImage; held: MediaHeldFiles }> {
  // The repository the file is prepared for: saving it anywhere else is refused (`importPreparedMedia`).
  const ctx = await workspaceContext();
  const { image: quality, keepOriginal } = await readMediaAddingSettings(path => ctx.read(path));
  const { request } = await prepareMediaFile(file, file.name, folder, undefined, undefined, undefined, undefined, quality, keepOriginal);
  const main = request.result?.outputs[0];
  const extension = main?.extension ?? file.name.split(".").pop() ?? "";
  // The photo files a held upload may become: never a drawing or a page, which could carry a script.
  if (!Object.hasOwn(guestPhotoTypes, extension.toLowerCase())) throw new Error(`${file.name} is not a photo. Nothing was added.`);
  let size = main?.width ? { width: main.width, height: main.height } : undefined;
  // Stored as it came (a GIF, a small file): its size is read from its bytes.
  if (!size && typeof createImageBitmap === "function") {
    try { const bitmap = await createImageBitmap(main?.blob ?? file); size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); } catch { /* Placed without a size. */ }
  }
  const pending: MediaImage = { path: `pending:${file.name}`, width: size?.width, height: size?.height, alt: "", variants: [] };
  const copies = (path: string) => request.result?.outputs.map(output => output.variantWidth ? mediaVariantName(path, output.variantWidth) : path) ?? [path];
  return {
    image: pending,
    held: {
      image: paths => paths[0] === undefined ? pending : { ...pending, path: paths[0], alt: mediaNameAlt(paths[0]), variants: mediaVariants(paths[0], copies(paths[0])) },
      async save(place) {
        const paths = await importPreparedMedia(ctx, workspaceContext, [request], place);
        return { paths, placed: Boolean(place), note: "" };
      },
    },
  };
}
