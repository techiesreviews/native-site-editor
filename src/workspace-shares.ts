// Share to edit and Share preview for the workspace shown (slices 30 and 35): both built from the editor's state in
// one place, so src/main.ts wires them with one line.
import type { NativePreview } from "./components/native-preview";
import { createPreviewShare } from "./preview-share";
import { createShareControl, shareWorkspace } from "./share-control";
import type { SiteFiles } from "./site-download";

export function createWorkspaceShares(editor: Parameters<typeof shareWorkspace>[0] & {
  /** The editing preview now. */
  preview: () => NativePreview | undefined;
  /** Whether this editor has a preview Worker (the session's `previewLinks`). */
  previewLinks: () => boolean;
  /** The site as edited (src/site-loading.ts `nativeSiteFiles`). */
  files: () => Promise<SiteFiles | undefined>;
}) {
  const shown = shareWorkspace(editor);
  return {
    share: createShareControl({ preview: editor.preview, ...shown }),
    preview: createPreviewShare({ workspace: () => shown.workspace(), enabled: editor.previewLinks, files: editor.files, start: () => editor.preview()?.shownRoute() ?? "/" }),
  };
}
