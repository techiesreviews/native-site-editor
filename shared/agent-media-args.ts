import { agentImageTrim } from "./agent-image-frame";
import { isOutsideMediaAddress, OUTSIDE_MEDIA_REFUSED, parseOutlineId, mediaKind, type AgentOperation, type AgentCommandArgs } from "./agent";
import { parseOnlineVideoAddress } from "./online-video-address";

export { NEW_ONLINE_VIDEO_REFUSED } from "./online-video-address";

export const AGENT_KEEP_REFUSED = "Agents may add Always keep but never take it off; ask the user to do it in Media.";

/** Worker and lazy tab validation use the same rules before applying media commands. */
export function agentMediaArgsProblem(operation: AgentOperation, args: AgentCommandArgs, path?: string): string | undefined {
  if (operation === "improve_images" && args.row !== undefined &&
    (typeof args.row !== "string" || args.row.length > 1024 || !/\.html$/i.test(args.row) || /^(?:[a-z]+:|[\\/])|(?:^|[\\/])\.\.?(?:[\\/]|$)|[?#\\]/i.test(args.row)))
    return "Give a page or component template path ending in .html, as listed by get_site.";
  if (operation === "keep_media" && args.keep === false) return AGENT_KEEP_REFUSED;
  if (["remove_media", "keep_media", "restore_media"].includes(operation)) {
    if (operation !== "restore_media" || args.files !== undefined) {
      if (!Array.isArray(args.files) || args.files.length < 1 || args.files.length > 200) return "Give between 1 and 200 files.";
      if (args.files.some(file => typeof file !== "string" || !file || file.length > 1024 || isOutsideMediaAddress(file))) return OUTSIDE_MEDIA_REFUSED;
    }
  }
  if (operation === "replace_media") {
    if (!args.file || !args.with || [args.file, args.with].some(isOutsideMediaAddress)) return OUTSIDE_MEDIA_REFUSED;
    if ([args.file, args.with].some(file => mediaKind(file) !== "image")) return "Only pictures can be replaced.";
    if (args.file === args.with) return "That is the picture being replaced. Choose a different one.";
  }
  if (operation === "frame_image") {
    if (!path || !/\.html$/i.test(path)) return "Give a page path ending in .html.";
    if (!args.element || !parseOutlineId(args.element)) return "Give an image element id from get_page or inspect_preview.";
    if (args.shape !== undefined && !["original", "square", "4:3", "16:9", "4:5", "component"].includes(args.shape)) return "Choose Original, Square, 4:3, 16:9, Tall 4:5 or component (the component's own shape).";
    if (args.focus !== undefined && (!args.focus || ![args.focus.x, args.focus.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100)))
      return "Focus must use percentages between 0 and 100.";
    if (args.trim !== undefined) {
      try { agentImageTrim(args.trim); } catch (error) { return error instanceof Error ? error.message : "Invalid trim."; }
    }
  }
  if (operation === "loop_video") {
    if (!path || !/\.html$/i.test(path)) return "Give a page path ending in .html.";
    if (!args.element || !parseOutlineId(args.element)) return "Give a video element id from get_page or inspect_preview.";
    if (args.looping !== undefined && typeof args.looping !== "boolean") return "Looping must be true or false.";
  }
  if (operation === "video_still" || operation === "write_subtitles") {
    if (!args.file || isOutsideMediaAddress(args.file)) return OUTSIDE_MEDIA_REFUSED;
    if (operation === "video_still") {
      if (mediaKind(args.file) !== "video") return "Only a video has a still picture.";
      if ((args.moment !== undefined) === (args.picture !== undefined)) return "Give exactly one of moment or picture.";
      if (args.moment !== undefined && (!Number.isFinite(args.moment) || args.moment < 0)) return "Moment must be seconds from the start, zero or more.";
      if (args.picture !== undefined && (!args.picture || isOutsideMediaAddress(args.picture))) return OUTSIDE_MEDIA_REFUSED;
      if (args.picture !== undefined && mediaKind(args.picture) !== "image") return "Choose a picture for the still.";
    } else {
      if (!["video", "audio"].includes(mediaKind(args.file))) return "Only a video or audio file has subtitles.";
      if (typeof args.text !== "string") return "Give subtitles as WebVTT or SubRip text.";
      if (args.format !== undefined && !["vtt", "srt"].includes(args.format)) return "Choose vtt or srt.";
      if (new TextEncoder().encode(args.text).length > 2 * 1024 * 1024) return "Subtitles must be no larger than 2 MB.";
    }
  }
  if (operation === "place_media" || operation === "describe_media") {
    if (!args.file || isOutsideMediaAddress(args.file) && !(operation === "place_media" && parseOnlineVideoAddress(args.file))) return OUTSIDE_MEDIA_REFUSED;
    if (operation === "place_media") {
      if (!args.element || !parseOutlineId(args.element)) return "Give an image element id from get_page or inspect_preview.";
    } else {
      if ((args.text !== undefined) === (args.decorative !== undefined)) return "Give exactly one of text or decorative.";
      if (args.text !== undefined && !args.text.trim()) return "Use decorative: true for a picture that adds nothing to the page.";
      if (args.element !== undefined && (!args.page || !parseOutlineId(args.element))) return "Give a page and an image element id.";
    }
  }
  if (operation === "adding_settings" && args.reset &&
    [args.image, args.video, args.audio, args.keepOriginal].some(value => value !== undefined)) return "Reset cannot be combined with adding choices.";
  if (operation === "change_collection") {
    if (!args.action || !["new", "add", "take-out", "rename", "delete"].includes(args.action)) return "Choose a collection action: new, add, take-out, rename or delete.";
    if (!args.name?.trim()) return "Enter a collection name.";
    if (args.action === "rename" && !args.to?.trim()) return "Rename needs to.";
    if (["add", "take-out"].includes(args.action) && !args.files?.length) return "Add and take-out need files.";
    if (args.files?.some(isOutsideMediaAddress)) return OUTSIDE_MEDIA_REFUSED;
  }
}
