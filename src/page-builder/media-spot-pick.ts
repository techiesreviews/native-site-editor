import { agentVideos } from "../../shared/media-kinds";
import { VIDEO_ACCEPT } from "../../shared/media-kinds-policies";
// A picture spot's picker (media slices 64 and 119): it lists pictures and videos, and a video
// chosen there loops silently in the spot. Shared by the edit bar's picker, the Image popup's
// Replace and the Media popup's Replace. Small; the placing code loads on Use.
import type { Stamp } from "../guarded-edit";
import type { MediaImage } from "./media-markup";
import type { MediaHeldFiles } from "./media-picker";
import type { MediaWorkspaceContext } from "./media-workspace";

export { VIDEO_ACCEPT };
export const SPOT_ACCEPT = `image/*,${VIDEO_ACCEPT}`;
export const isVideoName = (name: string) => agentVideos.test(name);
/** The note beside a chosen file in a picture spot's picker. */
export const spotNote = (name: string) => isVideoName(name) ? "loops silently here" : undefined;

/** A file added in the picker is routed by what it became (a GIF becomes a looping MP4), not its own name. */
export function pickedVideo(image: MediaImage, held?: MediaHeldFiles) {
  const added = held?.chosen?.()?.request, output = added?.result?.outputs[0]?.extension;
  return isVideoName(added ? output ? `added.${output}` : added.file.name : image.path);
}

/** A video chosen for a picture spot goes in as its silent Looping video, as one Undo step. */
export async function placeSpotVideo(
  ports: Parameters<typeof import("./media-insert")["placeChosenMedia"]>[0],
  workspaceContext: (include?: (path: string) => boolean) => Promise<MediaWorkspaceContext>,
  target: { path: string; node: number[] }, image: MediaImage, proof: { stamp: Stamp; epoch: number; source: string },
  cancelled: () => boolean, held?: MediaHeldFiles,
) {
  const { placeChosenMedia } = await import("./media-insert");
  await placeChosenMedia(ports, workspaceContext, { kind: "spot", ...target }, image, proof, cancelled, held);
}
