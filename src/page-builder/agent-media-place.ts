import { playableVideos } from "../../shared/media-kinds";
// Agent placement uses the picker's transactions; loaded only when placing Media.
import type { MediaImage } from "./media-markup";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaControllerPorts } from "../controllers/media-controller";
import type { Stamp } from "../guarded-edit";
import { placeMediaImage } from "./media-place";
import { placeChosenMedia, locatePageElement, insertedNode } from "./media-insert";
import { clickTarget } from "./block-insert";
import { mediaKind } from "./media-library-filter";
import { isPictureSpot } from "./looping-video";

/** A picture spot shows a picture or a silent Looping video, never sound, a download or an online player. */
export const PICTURE_SPOT_REFUSED = "A picture spot takes only a picture or a video, which loops silently there. Place audio, downloads and online videos in a section instead.";
import { parseOnlineVideoAddress } from "./online-video";
import { placeOnlineVideo } from "./online-video-place";
import { createMediaWorkspace } from "./media-workspace";

export async function placeAgentMedia(
  ports: MediaControllerPorts, context: () => Promise<MediaWorkspaceContext>, target: { path: string; node: number[] }, image: MediaImage,
  proof: { stamp: Stamp; epoch: number; source: string; expected: string; initialAlt?: string; asset?: { path: string; version?: string } },
  templates: (tag: string) => { path: string; source?: string } | undefined,
): Promise<number[] | undefined> {
  const online = parseOnlineVideoAddress(image.path), kind = mediaKind(image.path);
  if (!online && kind === "image") {
    // A picture spot's looping video takes a picture back, as the Media popup's Replace writes it (ticket 119).
    const at = (ports.locateElement ?? locatePageElement)(proof.source, target.node);
    const spotVideo = at?.tag.name === "video" && isPictureSpot(proof.source.slice(at.tag.start, at.tag.end));
    if (at?.tag.name !== "img" && !spotVideo) throw new Error("That element is not an image; place_media fills an existing image. Add a section or component with an image first.");
    await placeMediaImage(ports, context, target, image, proof, () => false);
    return target.node;
  }
  const locate = ports.locateElement ?? locatePageElement;
  const range = locate(proof.source, target.node), parent = locate(proof.source, target.node.slice(0, -1));
  const spot = range && isPictureSpot(proof.source.slice(range.tag.start, range.tag.end)) ||
    range?.tag.name === "img" && parent?.tag.name === "picture" && isPictureSpot(proof.source.slice(parent.tag.start, parent.tag.end));
  if (spot) {
    if (online || kind !== "video" || !playableVideos.test(image.path)) throw new Error(PICTURE_SPOT_REFUSED);
    await placeChosenMedia(ports, context, { kind: "spot", ...target }, image, proof, () => false);
    return range?.tag.name === "img" && parent?.tag.name === "picture" ? target.node.slice(0, -1) : target.node;
  }
  const at = clickTarget(proof.source, "media", target.node, tag => templates(tag)?.source);
  if (!at.ok) throw new Error(at.reason);
  const place = { path: target.path, parent: at.parent, index: at.index, wrap: at.wrap, slot: at.slot };
  if (online) {
    // An address selects a recorded video and keeps its start time; the engine takes the recorded branch.
    await placeOnlineVideo(ports, context, { place, templates }, { address: image.path }, createMediaWorkspace(context), proof, () => false, {}, true);
  } else await placeChosenMedia(ports, context, { kind: "insert", place, templates }, image, proof, () => false);
  return insertedNode(place);
}
