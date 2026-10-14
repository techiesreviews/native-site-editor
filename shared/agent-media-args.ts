import { agentImageTrim } from "./agent-image-frame";
import { isOutsideMediaAddress, OUTSIDE_MEDIA_REFUSED, parseOutlineId, mediaKind, type AgentOperation, type AgentCommandArgs } from "./agent";

/** Worker and lazy tab validation use the same rules before applying media commands. */
export function agentMediaArgsProblem(operation: AgentOperation, args: AgentCommandArgs, path?: string): string | undefined {
  if (operation === "frame_image") {
    if (!path || !/\.html$/i.test(path)) return "Give a page path ending in .html.";
    if (!args.element || !parseOutlineId(args.element)) return "Give an image element id from get_page or inspect_preview.";
    if (args.shape !== undefined && !["original", "square", "4:3", "16:9", "4:5"].includes(args.shape)) return "Choose Original, Square, 4:3, 16:9 or Tall 4:5.";
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
