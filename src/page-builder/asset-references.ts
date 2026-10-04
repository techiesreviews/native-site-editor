/**
 * What renaming, moving or deleting a site file (an image, a stylesheet, a
 * download) does to the pages and stylesheets that use it. References are
 * found and rewritten with the image manager's matcher (media-references.ts):
 * src, href, srcset, poster, image meta tags, inline style and CSS url().
 * Pages are not handled here; their links follow Change URL.
 */
import { mediaResolvePath, rewriteMediaReferences, scanMediaReferences } from "./media-references";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { readSidecar } from "./document-collections";

const isPage = (path: string) => /\.html?$/i.test(path);
const isText = (path: string) => /\.(?:html?|css)$/i.test(path);

/** The moves among `moves` that are site files other than pages. */
export function assetMoves(moves: readonly { from: string; to: string }[]) {
  return moves.filter(({ from }) => !isPage(from));
}

/**
 * The new text of every page and stylesheet that refers to a moved file.
 * Refuses a moving stylesheet (or other non-page text) that refers to files
 * by relative paths, which would need rebasing, and a moving file that refers
 * to another moving file; those are moved one at a time.
 */
export function planAssetReferenceRewrites(sources: Readonly<Record<string, string | undefined>>, moves: readonly { from: string; to: string }[]): Map<string, string> {
  const assets = assetMoves(moves);
  const edits = new Map<string, string>();
  if (!assets.length) return edits;
  const moving = new Set(moves.map(({ from }) => from));
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined || !isText(file)) continue;
    if (moving.has(file) && !isPage(file) && scanMediaReferences(file, source).some((ref) => !/^\//.test(ref.value.trim())))
      throw new Error(`${file} refers to other files by relative paths, which would break when it moves. Use paths from the site root in it first.`);
    let next = source;
    for (const { from, to } of assets) next = rewriteMediaReferences(file, next, from, to);
    if (next === source) continue;
    if (moving.has(file)) throw new Error(`${file} uses a file that moves with it. Move them one at a time.`);
    edits.set(file, next);
  }
  return edits;
}

/**
 * The files that still use any of `paths` (pages, stylesheets, and the
 * editor's page data: card templates and stored values), leaving out files
 * among `paths` themselves. Empty when nothing uses them.
 */
export function assetUsers(sources: Readonly<Record<string, string | undefined>>, paths: readonly string[]): Map<string, string[]> {
  const gone = new Set(paths.filter((path) => !isPage(path)));
  const users = new Map<string, string[]>();
  const use = (asset: string, file: string) => { const list = users.get(asset) ?? users.set(asset, []).get(asset)!; if (!list.includes(file)) list.push(file); };
  if (!gone.size) return users;
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined || !isText(file) || paths.includes(file)) continue;
    for (const ref of scanMediaReferences(file, source)) if (gone.has(ref.path)) use(ref.path, file);
  }
  const sidecar = sources[EDITOR_PAGE_BUILDER_PATH];
  if (sidecar !== undefined) {
    const document = readSidecar(sidecar);
    for (const collection of Object.values(document.collections)) {
      for (const ref of scanMediaReferences(collection.pagePath, collection.template)) if (gone.has(ref.path)) use(ref.path, EDITOR_PAGE_BUILDER_PATH);
      for (const fields of Object.values(collection.overrides)) for (const value of Object.values(fields)) {
        const path = mediaResolvePath(value, collection.pagePath);
        if (path && gone.has(path)) use(path, EDITOR_PAGE_BUILDER_PATH);
      }
    }
    for (const [file, page] of Object.entries(document.pages)) for (const value of Object.values(page.fields ?? {})) {
      const path = mediaResolvePath(value, file);
      if (path && gone.has(path)) use(path, EDITOR_PAGE_BUILDER_PATH);
    }
  }
  return users;
}

/** A refusal naming what still uses the files, or undefined. */
export function assetInUseProblem(users: Map<string, string[]>): string | undefined {
  if (!users.size) return undefined;
  const lines = [...users].map(([asset, files]) => `${asset} is used by ${files.join(", ")}`);
  return `${lines.join("; ")}. Remove or replace those references first; nothing was deleted.`;
}
