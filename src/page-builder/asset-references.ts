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
 * Every page and stylesheet with its references to moved files rewritten, on
 * top of `base` (texts already changed by the same operation, such as page
 * links, keyed by the path each file has after the move). The result holds
 * `base` and the new texts, keyed the same way.
 *
 * A file that moves keeps a relative reference only when it still points at
 * the same file afterwards (both moved together); otherwise the whole move is
 * refused, since rewriting relative paths in moved files is not supported.
 */
export function planAssetReferenceRewrites(sources: Readonly<Record<string, string | undefined>>, moves: readonly { from: string; to: string }[], base: ReadonlyMap<string, string> = new Map()): Map<string, string> {
  const assets = assetMoves(moves);
  const edits = new Map(base);
  if (!assets.length) return edits;
  const moved = new Map(moves.map(({ from, to }) => [from, to]));
  for (const [file, source] of Object.entries(sources)) {
    if (source === undefined || !isText(file)) continue;
    const final = moved.get(file) ?? file;
    const text = base.get(final) ?? source;
    if (final !== file)
      for (const ref of scanMediaReferences(file, source)) {
        if (/^\//.test(ref.value.trim())) continue;
        const after = mediaResolvePath(ref.value, final);
        if (after !== (moved.get(ref.path) ?? ref.path))
          throw new Error(`${file} refers to ${ref.value} by a relative path, which would point elsewhere after the move. Use a path from the site root in it first; nothing was moved.`);
      }
    let next = text;
    for (const { from, to } of assets) next = rewriteMediaReferences(final, next, from, to);
    if (next !== text) edits.set(final, next);
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
