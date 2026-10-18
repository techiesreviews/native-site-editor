import type { AgentCommandArgs } from "./agent";

export const mediaTools = ["list_media", "preview_media", "remove_media", "keep_media", "restore_media", "replace_media",
  "frame_image", "place_media", "improve_images", "loop_video", "video_still", "write_subtitles", "describe_media", "change_collection", "adding_settings"] as const;
export type MediaTool = typeof mediaTools[number];
export interface AgentMedia {
  operation: "media"; tool: MediaTool; path: string; args: AgentCommandArgs;
  id: string; grantId: string; generation?: number; createdAt: number;
}

/** The read-only forms never create receipts or cancellation tombstones. */
export function mediaChanges(tool: MediaTool, args: AgentCommandArgs) {
  if (tool === "list_media" || tool === "preview_media") return false;
  if (tool === "restore_media") return args.files !== undefined;
  if (tool === "frame_image") return args.trim !== undefined || args.shape !== undefined || args.focus !== undefined;
  if (tool === "loop_video") return args.looping !== undefined;
  if (tool === "adding_settings") return args.reset === true || [args.image, args.video, args.audio, args.keepOriginal].some(value => value !== undefined);
  return true;
}
