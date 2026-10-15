import type { MediaControllerPorts } from "../controllers/media-controller";
import { mediaImageMarkup, mediaAttributes, mediaPictureUnwrap, type MediaMeasured, type MediaImage } from "./media-markup";
import { mediaPageEdits } from "./media-page-markup";
import { readSource } from "./source-tree";

/** The exact swap shared by picker Use, Replace, agent placement and trims. */
export function mediaPlaceSwap(
  latest: string, target: { node: number[] }, expected: string, image: MediaImage,
  measured: MediaMeasured | undefined, locate: NonNullable<MediaControllerPorts["locateElement"]>,
  framed: (tag: string) => string = tag => tag, prefix: string,
) {
  const range = locate(latest, target.node);
  if (!range || range.tag.name !== "img") throw new Error("Choose an image place.");
  const parentNode = target.node.slice(0, -1), parent = locate(latest, parentNode);
  const tree = parent?.tag.name === "picture" ? readSource(latest) : undefined;
  const picture = tree?.elements().find(element => element.type === "element" && element.tag.start === parent!.tag.start);
  const unwrap = mediaPictureUnwrap(latest, { start: range.tag.start, end: range.tag.end }, picture && tree!.range(picture));
  const next = unwrap ? parentNode : target.node;
  const note = unwrap?.artDirected ? " The new picture is now used on all screens." : "";
  const pageRules = mediaPageEdits(latest, measured, target.node, locate);
  // Page places use the rules below; picker alt defaults belong to component and settings fields.
  const swap = (alt: string | undefined, picked = image) => {
    let markup = framed(mediaImageMarkup({ ...picked, alt: alt ?? "" }, expected, pageRules.placement, alt === undefined, prefix));
    if (unwrap?.slot !== undefined) markup = mediaAttributes(markup, { slot: unwrap.slot });
    const edits = [...pageRules.edits, ...(unwrap?.edits ?? []), { start: range.tag.start, end: range.tag.end, text: markup }];
    let page = latest;
    for (const edit of edits.sort((a, b) => b.start - a.start)) page = page.slice(0, edit.start) + edit.text + page.slice(edit.end);
    return { markup, page, edits };
  };
  return { swap, next, note };
}
