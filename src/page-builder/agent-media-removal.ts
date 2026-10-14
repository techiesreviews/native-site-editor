import type { MediaRecords } from "../../shared/media-records";
import { familyMembers, mediaFamilies } from "./media-families";

/** Agent removals always operate on the whole family, even when a copy was named. */
export function agentRemovalPaths(files: string[], paths: string[]): string[] {
  const families = mediaFamilies(paths);
  return [...new Set(files.flatMap(path => {
    const family = families.find(family => familyMembers(family).includes(path));
    return family ? familyMembers(family) : [path];
  }))];
}

/** Also used by agent delete_file, including folders containing only part of a family. */
export function agentKeptRemovalProblem(files: string[], paths: string[], records: MediaRecords): string | undefined {
  const kept = agentRemovalPaths(files, paths).find(path => records.files[path]?.alwaysKeep);
  return kept ? `${kept} is marked Always keep. Agents never remove an Always keep file or its Image family.` : undefined;
}
