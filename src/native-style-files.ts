import type { UnreadableFile } from "./native-boot";

/** What a stylesheet's draft says about it: none, deleted, or a file whose text is not held (an upload). */
export type StyleDraft = { deleted?: boolean; opaque?: boolean } | undefined;

/** The editor state the stylesheet reader works on (src/main.ts). */
export interface StyleFileReads {
  /** The stylesheets the pages link and the files those import that are not among the text sources yet. */
  wanted(): string[];
  /** Known missing or unreadable, or being read by another pass. */
  skipped(path: string): boolean;
  draft(path: string): StyleDraft;
  /** The branch's text of `path` is already read. */
  read(path: string): boolean;
  find(path: string): Promise<{ sha: string } | undefined>;
  readTexts(files: { path: string; sha: string }[]): Promise<{ texts: Map<string, string>; unreadable: UnreadableFile[] }>;
  live(): boolean;
  /** Marks paths as being read by this pass (true) or no longer (false). */
  reading(paths: string[], on: boolean): void;
  /** `path` is a stylesheet the preview shows; with `text`, that is the branch's text just read. */
  shown(path: string, text?: string): void;
  missing(path: string): void;
  unreadable(files: UnreadableFile[]): void;
}

/** How a wanted stylesheet is found: its own draft or text already read, the branch, or nowhere as text. */
export function styleFileHold(draft: StyleDraft, read: boolean): "held" | "branch" | "no-text" | "deleted" {
  if (draft?.deleted) return "deleted";
  // An uploaded (or binary) draft has no text: counting it as held made the preview ask again forever.
  if (draft?.opaque) return "no-text";
  return draft || read ? "held" : "branch";
}

/**
 * Reads the stylesheets the pages link and the files those `@import`, following imports of imports,
 * a level at a time. Each path is asked for once per pass, and only a stylesheet that now has text
 * counts as loaded, so a file that cannot be read as text never makes the preview read again.
 * False when `live` turns false; otherwise true when any stylesheet was taken up.
 */
export async function readStyleFiles(reads: StyleFileReads, rounds = 20): Promise<boolean> {
  const asked = new Set<string>();
  let loaded = false;
  for (let round = 0; round < rounds; round++) {
    const wanted = [...new Set(reads.wanted())].filter(path => !asked.has(path) && !reads.skipped(path));
    if (!wanted.length) break;
    wanted.forEach(path => asked.add(path));
    reads.reading(wanted, true);
    try {
      const found: { path: string; sha: string }[] = [];
      // A level's files are looked up together and read in one request.
      const holds = wanted.map(path => styleFileHold(reads.draft(path), reads.read(path)));
      const entries = await Promise.all(wanted.map((path, index) => holds[index] === "branch" ? reads.find(path) : undefined));
      if (!reads.live()) return false;
      wanted.forEach((path, index) => {
        const hold = holds[index], entry = entries[index];
        if (hold === "held") { reads.shown(path); loaded = true; }
        else if (hold === "no-text") return;
        else if (entry) found.push({ path, sha: entry.sha });
        else reads.missing(path);
      });
      if (!found.length) continue;
      const { texts, unreadable } = await reads.readTexts(found);
      if (!reads.live()) return false;
      // One that cannot be read as text is left out (with a warning), not reported as missing.
      if (unreadable.length) { reads.unreadable(unreadable); loaded = true; }
      for (const file of found) {
        const text = texts.get(file.path);
        if (text === undefined) continue;
        reads.shown(file.path, text);
        loaded = true;
      }
    } finally {
      reads.reading(wanted, false);
    }
  }
  return loaded;
}
