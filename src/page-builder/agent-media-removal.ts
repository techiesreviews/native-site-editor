import type { MediaRecords } from "../../shared/media-records";
import { familyMembers, mediaFamilies, onlineStillMembers } from "./media-families";

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

/** A service-copied still is managed only with its recorded Online video, including its copies. */
export function agentOnlineStillRemovalProblem(files: string[], paths: string[], records: MediaRecords): string | undefined {
  for (const video of records.onlineVideos ?? []) {
    const members = onlineStillMembers(paths, [video]);
    const member = files.find(path => members.has(path));
    if (member) return `${member} belongs to Online video ${video.title ?? `${video.service}:${video.id}`}. Remove the Online video in Media; its copied still cannot be removed on its own.`;
  }
}
