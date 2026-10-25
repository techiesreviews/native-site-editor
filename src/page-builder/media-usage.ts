import { isMediaTextFile, mediaMentions, type MediaMentionsCache, type MediaSite } from "./media-mentions";
import { mediaFamilies, familyMembers } from "./media-families";
import { scanMediaReferences, walkMediaReferencePages } from "./media-references";
import type { MediaReference } from "./media-references";
// The lookups live apart so the Media screen can use them without loading the scanner.
export { mediaUsageFor, mediaUsageState } from "./media-usage-text";

export type MediaOtherUseKind = "stylesheet" | "component" | "sharing" | "settings" | "file" | "script" | "data" | "feed" | "notes";
export interface MediaOtherUse { file: string; kind: MediaOtherUseKind }
export interface MediaUsageRecord { main: string; members: string[]; checked: boolean; pages: string[]; otherUses: MediaOtherUse[] }
export interface MediaUsageRecords {
  // Every site text file participates, including raw mentions.
  reach: "text";
  pending: string[];
  unreadable: string[];
  families: MediaUsageRecord[];
}

/** What a check read from each file, kept for the next check while the file's text is the same (ticket 38). */
export interface MediaUsageCache { references: Map<string, { source: string; site: string; refs: MediaReference[] }>; mentions: MediaMentionsCache }
export const mediaUsageCache = (): MediaUsageCache => ({ references: new Map(), mentions: new Map() });

export function mediaUsageRecords(input: {
  media: string[];
  files?: string[];
  site?: MediaSite;
  sources: Record<string, string | undefined>;
  pages: string[];
  components?: Record<string, string>;
  cache?: MediaUsageCache;
}): MediaUsageRecords {
  // A page or component template the scan never read is as incomplete as one that failed to read.
  const required = [...input.pages, ...Object.values(input.components ?? {})];
  const unreadable = [...new Set([
    ...Object.keys(input.sources).filter(file => input.sources[file] === undefined),
    ...required.filter(file => !Object.hasOwn(input.sources, file)),
  ])];
  const pending = (input.files ?? []).filter(file => isMediaTextFile(file) && !Object.hasOwn(input.sources, file));
  const families: MediaUsageRecord[] = mediaFamilies(input.media).map(family => ({
    main: family.main,
    members: familyMembers(family),
    checked: unreadable.length === 0 && pending.length === 0,
    pages: [],
    otherUses: [],
  }));
  const byMember = new Map(families.flatMap(family => family.members.map(member => [member, family] as const)));
  for (const path of input.media) if (!byMember.has(path)) {
    const family: MediaUsageRecord = { main: path, members: [path], checked: unreadable.length === 0 && pending.length === 0, pages: [], otherUses: [] };
    families.push(family);
    byMember.set(path, family);
  }
  const result: MediaUsageRecords = { reach: "text", pending, unreadable, families };

  const sources = Object.fromEntries(Object.entries(input.sources).filter(([file]) => /\.(?:html|css)$/i.test(file) && isMediaTextFile(file)));
  const pages = new Set(input.pages);
  const components = input.components ?? {};
  const templates = new Set(Object.values(components));
  const references = new Map<string, MediaReference[]>();
  const siteKey = `${input.site?.prefix ?? ""}\n${input.site?.origins.join(" ") ?? ""}`;
  for (const [file, source] of Object.entries(sources)) {
    const known = input.cache?.references.get(file), text = source ?? "";
    const refs = known?.source === text && known.site === siteKey ? known.refs : scanMediaReferences(file, text, input.site);
    if (input.cache && refs !== known?.refs) input.cache.references.set(file, { source: text, site: siteKey, refs });
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
  }, input.site?.prefix ?? "");
  for (const [path, uses] of mediaMentions({ media: input.media, sources: input.sources, site: input.site, cache: input.cache?.mentions })) {
    const family = byMember.get(path);
    if (!family) continue;
    for (const use of uses) {
      if (family.otherUses.some(existing => existing.file === use.file) || family.pages.includes(use.file)) continue;
      family.otherUses.push({ ...use, kind: templates.has(use.file) && use.kind === "file" ? "component" : use.kind });
    }
  }
  return result;
}
