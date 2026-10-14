import { mediaCollectionNameProblem } from "./media-collections";
import { mediaLibraryTiles } from "./media-library-filter";
import type { MediaLibrary } from "./media-picker";

/** What the name field says before saving: nothing when the name can be used.
 * A taken name is refused, never merged (ticket 15); `renaming` may keep its own name. */
export function mediaCollectionNameMessage(collections: string[], name: string, renaming?: string): string | undefined {
  const problem = mediaCollectionNameProblem({ collections }, name, renaming);
  if (problem === "empty") return "Enter a name for the collection.";
  if (problem === "taken") return `"${name.trim()}" is already taken by another collection. Choose another name.`;
}

/** How many tiles (one per Image family) each collection holds, in the library's order. */
export function mediaCollectionSizes(library: Pick<MediaLibrary, "collections" | "items" | "metadata">): Map<string, number> {
  const sizes = new Map(library.collections.map(name => [name, 0]));
  for (const item of mediaLibraryTiles(library.items))
    for (const name of library.metadata[item.path]?.tags ?? []) if (sizes.has(name)) sizes.set(name, sizes.get(name)! + 1);
  return sizes;
}

export const filesLabel = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/** The selection bar's actions: Take out only while viewing a collection, Remove file always,
 * as separate buttons (ticket 15). */
export function mediaSelectionActions(count: number, viewing: string) {
  return {
    count: `${count} selected`,
    ...(viewing ? { takeOut: `Take out of ${viewing}` } : {}),
    remove: count === 1 ? "Remove file" : "Remove files",
  };
}

/** Details' collections: the ticked ones plus an optional new name, which must not be taken. */
export function detailCollections(collections: string[], ticked: string[], fresh: string):
  { tags: string[]; created?: string } | { problem: string } {
  const tags = collections.filter(name => ticked.includes(name));
  if (!fresh.trim()) return { tags };
  const problem = mediaCollectionNameMessage(collections, fresh);
  if (problem) return { problem };
  return { tags: [...tags, fresh.trim()], created: fresh.trim() };
}
