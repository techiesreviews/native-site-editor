import { agentImageTrim } from "./agent-image-frame";
import { isOutsideMediaAddress, OUTSIDE_MEDIA_REFUSED, parseOutlineId, mediaKind, type AgentOperation, type AgentCommandArgs } from "./agent";

export const AGENT_KEEP_REFUSED = "Agents may add Always keep but never take it off; ask the user to do it in Media.";

/** Worker and lazy tab validation use the same rules before applying media commands. */
export function agentMediaArgsProblem(operation: AgentOperation, args: AgentCommandArgs, path?: string): string | undefined {
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
  if (operation === "place_media" || operation === "describe_media") {
    if (!args.file || isOutsideMediaAddress(args.file)) return OUTSIDE_MEDIA_REFUSED;
    if (operation === "place_media") {
      if (!args.element || !parseOutlineId(args.element)) return "Give an image element id from get_page or inspect_preview.";
      if (mediaKind(args.file) !== "image") return "Only pictures can be placed for now.";
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
