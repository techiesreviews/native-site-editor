// The site overlay rule: which text a file has now (the open editor's, then
// its browser draft's, then GitHub's at the base), and which paths are new
// drafts. One rule for the preview, the Pages and Files trees, linked styles
// and agent reads (ticket 05 item 3: agents see what the preview shows).

/** The draft fields the rule reads (a SavedDraft or an agent context draft). */
export interface OverlayDraft {
  path: string;
  /** The GitHub blob the draft started from; null for a file new in the drafts. */
  baseSha: string | null;
  deleted?: boolean;
  /** A file renamed or moved here (its new path is a new draft). */
  movedFrom?: string;
  /** An uploaded file (its type and size), held as bytes. */
  upload?: unknown;
  /** A binary or large file whose text the draft does not hold. */
  opaque?: boolean;
}

export interface NewDraftOptions {
  /** Count a renamed or moved file at its new path (default true). */
  moved?: boolean;
  /** Count uploads and opaque files (default true). */
  uploads?: boolean;
  /** Only paths this accepts (say, images). */
  kind?: (path: string) => boolean;
}

/** The draft is a file new in the drafts (no base blob), not deleted. */
export function isNewDraft(draft: OverlayDraft | undefined, options: NewDraftOptions = {}): boolean {
  if (!draft || draft.baseSha !== null || draft.deleted) return false;
  if (options.moved === false && draft.movedFrom) return false;
  if (options.uploads === false && (draft.upload || draft.opaque)) return false;
  return !options.kind || options.kind(draft.path);
}

/** The drafts that are new files, in draft order. */
export function newDrafts<T extends OverlayDraft>(drafts: readonly T[], options: NewDraftOptions = {}): T[] {
  return drafts.filter((draft) => isNewDraft(draft, options));
}

/** The paths of the new files in the drafts, in draft order. */
export function newDraftPaths(drafts: readonly OverlayDraft[], options: NewDraftOptions = {}): string[] {
  return newDrafts(drafts, options).map((draft) => draft.path);
}

/** Where a file's text can come from, top layer first. */
export interface TextLayers {
  /** The text in the open editor, when the file is mounted there. */
  mounted?(path: string): string | undefined;
  /** The file's browser draft. */
  draft?(path: string): { content: string; deleted?: boolean; opaque?: boolean } | undefined;
  /** The file's text on GitHub at the base. */
  base?(path: string): string | undefined;
}

/**
 * The file's text now: the open editor's, else its draft's, else GitHub's.
 * A file deleted in the drafts has none; nor has an opaque one (a binary
 * file moved or uploaded), whose text the draft does not hold.
 */
export function effectiveText(path: string, layers: TextLayers): string | undefined {
  const draft = layers.draft?.(path);
  if (draft?.deleted || draft?.opaque) return undefined;
  return layers.mounted?.(path) ?? (draft ? draft.content : layers.base?.(path));
}
