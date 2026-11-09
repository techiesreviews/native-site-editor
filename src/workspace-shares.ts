// Share to edit and Share preview for the workspace shown (slices 30 and 35): both built from the editor's state in
// one place, so src/main.ts wires them with one line. Only what the project menu needs before it opens stays in the
// editor's boot; their control and menu items load on the menu's first open (src/shares-later.ts).
import type { NativePreview } from "./components/native-preview";
import type { SharesMenuPort } from "./components/repository-menu";
import { createPreviewShare } from "./preview-share";
import type { SiteFiles } from "./site-download";
import type { SessionStamp, WorkspaceScope } from "./workspace-session";

/**
 * `createShareControl`'s view of the editor (src/main.ts): the GitHub branch shown while a site is open, with its
 * repository's name as the site's and Lex's login; and a stamp that holds until another project or branch opens.
 */
export function shareWorkspace(editor: { shown(): WorkspaceScope | undefined; siteOpen(): boolean; login(): string | undefined; begin(): SessionStamp }) {
  return {
    workspace() {
      const scope = editor.shown();
      if (scope?.kind !== "github" || !editor.siteOpen()) return undefined;
      return { repo: scope.repo, branch: scope.branch, site: scope.repo.split("/").pop() ?? scope.repo, host: editor.login() ?? "" };
    },
    stamp() { const since = editor.begin(); return { holds: () => since.changed() !== "scope" }; },
  };
}

export function createWorkspaceShares(editor: Parameters<typeof shareWorkspace>[0] & {
  /** The editing preview now. */
  preview: () => NativePreview | undefined;
  /** Whether this editor has a preview Worker (the session's `previewLinks`). */
  previewLinks: () => boolean;
  /** The site as edited (src/site-loading.ts `nativeSiteFiles`). */
  files: () => Promise<SiteFiles | undefined>;
}) {
  const shown = shareWorkspace(editor);
  let control: ReturnType<typeof import("./shares-later").createShareControl> | undefined;
  // The project tile, and the way to mark it once the control has loaded.
  let tile: HTMLElement | undefined, mark: (() => void) | undefined;
  const share: SharesMenuPort & { check(): void } = {
    offered: () => true,
    draw: (actionClass, root) => import("./shares-later").then(({ createShareControl, shareItems, editTile }) => {
      if (!control) { control = createShareControl({ preview: editor.preview, ...shown }); mark = editTile(control, () => tile); }
      return shareItems(control, actionClass, root);
    }),
    tile(trigger) { tile = trigger; mark?.(); },
    /** After a load: a session of another project or branch than the one shown ends (none before the menu opened). */
    check: () => control?.check(),
  };
  return {
    share,
    preview: createPreviewShare({ workspace: () => shown.workspace(), enabled: editor.previewLinks, files: editor.files, start: () => editor.preview()?.shownRoute() ?? "/" }),
  };
}
