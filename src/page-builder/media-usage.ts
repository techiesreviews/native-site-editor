import { mediaFamilies } from "./media-families";
import { scanMediaReferences, walkMediaReferencePages } from "./media-references";
import type { MediaReference } from "./media-references";

// Settings are reserved for slice 46 / stage 7; today's scan cannot classify them.
export type MediaOtherUseKind = "stylesheet" | "component" | "sharing" | "settings" | "file";
export interface MediaOtherUse { file: string; kind: MediaOtherUseKind }
export interface MediaUsageRecord { main: string; members: string[]; checked: boolean; pages: string[]; otherUses: MediaOtherUse[] }
export interface MediaUsageRecords {
  // Slice 46 widens the files read beyond HTML and CSS.
  reach: "html-css";
  unreadable: string[];
  families: MediaUsageRecord[];
}

export function mediaUsageRecords(input: {
  media: string[];
  sources: Record<string, string | undefined>;
  pages: string[];
  components?: Record<string, string>;
}): MediaUsageRecords {
  // A page or component template the scan never read is as incomplete as one that failed to read.
  const required = [...input.pages, ...Object.values(input.components ?? {})];
  const unreadable = [...new Set([
    ...Object.keys(input.sources).filter(file => input.sources[file] === undefined),
    ...required.filter(file => !Object.hasOwn(input.sources, file)),
  ])];
  const families: MediaUsageRecord[] = mediaFamilies(input.media).map(family => ({
    main: family.main,
    members: [family.main, ...family.copies.map(copy => copy.path), ...family.originals],
    checked: unreadable.length === 0,
    pages: [],
    otherUses: [],
  }));
  const byMember = new Map(families.flatMap(family => family.members.map(member => [member, family] as const)));
  for (const path of input.media) if (!byMember.has(path)) {
    const family: MediaUsageRecord = { main: path, members: [path], checked: unreadable.length === 0, pages: [], otherUses: [] };
    families.push(family);
    byMember.set(path, family);
  }
  const result: MediaUsageRecords = { reach: "html-css", unreadable, families };
  if (unreadable.length) return result;

  const sources = Object.fromEntries(Object.entries(input.sources).filter(([file]) => /\.(?:html|css)$/i.test(file) && !file.startsWith("node_modules/")));
  const pages = new Set(input.pages);
  const components = input.components ?? {};
  const templates = new Set(Object.values(components));
  const references = new Map<string, MediaReference[]>();
  for (const [file, source] of Object.entries(sources)) {
    const refs = scanMediaReferences(file, source!);
    references.set(file, refs.filter(ref => ref.attribute !== "content"));
    for (const ref of refs) {
      const family = byMember.get(ref.path);
      if (!family) continue;
      const kind = ref.attribute === "content" ? "sharing"
        : /\.css$/i.test(file) ? "stylesheet"
        : templates.has(file) ? "component"
        : !pages.has(file) ? "file" : undefined;
      if (kind && !family.otherUses.some(use => use.file === file && use.kind === kind)) family.otherUses.push({ file, kind });
    }
  }
  walkMediaReferencePages(sources, references, input.pages, components, (page, ref) => {
    const family = byMember.get(ref.path);
    if (family && !family.pages.includes(page)) family.pages.push(page);
  });
  return result;
}

export function mediaUsageFor(records: MediaUsageRecords, path: string): MediaUsageRecord {
  return records.families.find(family => family.members.includes(path))
    ?? { main: path, members: [path], checked: false, pages: [], otherUses: [] };
}

export function mediaUsageState(record: MediaUsageRecord): "not-checked" | "used-on-pages" | "other-uses-only" | "no-uses-found" {
  if (!record.checked) return "not-checked";
  if (record.pages.length) return "used-on-pages";
  return record.otherUses.length ? "other-uses-only" : "no-uses-found";
}
