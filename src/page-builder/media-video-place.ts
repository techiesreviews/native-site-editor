// Lazy edit-bar controls and one-Undo video transactions.
import type { EditBarControl } from "../components/edit-bar";
import type { MediaControllerPorts } from "../controllers/media-controller";
import type { MediaWorkspaceContext } from "./media-workspace";
import type { MediaHeldFiles, MediaUsageSource } from "./media-picker";
import type { MediaImage } from "./media-markup";
import type { MediaModule } from "../controllers/media-controller";
import { locateNativeElementRange } from "../native-source-location";
import { isImagePath } from "../native-structure";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../../shared/media-records";
import { mediaAttribute } from "./media-attributes";
import { mediaPlayerPlan, type MediaPlayerKind } from "./player-markup";
import { starterPlayerFiles } from "./starter-loader";
import { isPictureSpot, PICTURE_SPOT_MESSAGE, readLooping, readSectionBackground, sectionBackgroundEdits, writeLooping } from "./looping-video";

export const isVideoPath = (path: string) => /\.(?:mp4|m4v|webm|mov|ogv)$/i.test(path);
type Context = (include?: (path: string) => boolean) => Promise<MediaWorkspaceContext>;
export function createVideoPlaces(ports: MediaControllerPorts, context: Context, load: () => Promise<MediaModule>, usage?: MediaUsageSource) {
  function controls(path: string, node: number[], source: string): EditBarControl[] {
    const range = locateNativeElementRange(source, node);
    if (!range) return [];
    const tag = source.slice(range.tag.start, range.tag.end);
    if (range.tag.name === "video" && !mediaAttribute(source, range.tag, "data-background")) {
      const checked = readLooping(tag), disabled = checked && isPictureSpot(tag);
      return [{ kind: "checkbox", label: "Looping video", checked, disabled,
        title: disabled ? PICTURE_SPOT_MESSAGE : "Plays silently by itself, over and over, with a small pause button",
        onChange: on => { void change(path, node, source, on ? "Video loops silently" : "Video plays with sound on tap", on ? "looping-video" : undefined,
          page => {
            // Children (a subtitles track) stay, so switching looping off again loses nothing.
            const current = locateNativeElementRange(page, node)!;
            return page.slice(0, current.tag.start) + writeLooping(tag, on) + page.slice(current.tag.end);
          }).catch(error => ports.error(error)); } }];
    }
    if (range.tag.name !== "section") return [];
    const old = readSectionBackground(source, range);
    return [{ kind: "button", label: "Background video", onPress: () => { void chooseBackground({ path, node }, source).catch(error => ports.error(error)); } },
      ...old ? [{ kind: "button" as const, label: "Remove background video", onPress: () => {
        void change(path, node, source, "Background video removed", undefined, page => background(page, node)).catch(error => ports.error(error));
      } }] : []];
  }
  function background(source: string, node: number[], video?: { path: string; still?: string }) {
    const range = locateNativeElementRange(source, node);
    if (!range) throw new Error("Choose a section.");
    for (const edit of sectionBackgroundEdits(source, range, video).sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    return source;
  }
  async function change(path: string, node: number[], source: string, label: string, kind: MediaPlayerKind | undefined,
    edit: (source: string, record?: import("../../shared/media-records").MediaFileRecord) => string,
    picked?: MediaImage, cancelled = () => false, held?: MediaHeldFiles, since = ports.stamp()) {
    const epoch = ports.generation();
    const current = () => since.holds() && !ports.viewingVersion() && ports.source(path) === source &&
      (!ports.selected || ports.selected(path, node)) && !cancelled();
    const assert = () => { if (!current()) throw new Error("The source or selection changed. Select the element again."); };
    assert();
    if (ports.openFile() !== path) { await ports.restoreFile(path, epoch); assert(); }
    const ctx = await context(); assert(); ctx.assertLive();
    const metadata = picked ? await ctx.read(MEDIA_RECORDS_PATH) : undefined;
    assert(); ctx.assertLive();
    const record = picked ? parseMediaRecords(metadata).files[picked.path] : undefined;
    let next = edit(source, record);
    const expectedSources = new Map<string, string | undefined>([[path, source]]);
    if (picked) expectedSources.set(MEDIA_RECORDS_PATH, metadata);
    const expectedAssets = new Map<string, string | undefined>();
    if (picked && !held) expectedAssets.set(picked.path, ctx.assetVersion(picked.path));
    let plan;
    if (kind) {
      const input = { pages: [path], sources: { [path]: next }, exists: (file: string) => ctx.paths.includes(file), kinds: [kind] };
      plan = mediaPlayerPlan(input);
      if (plan?.creates.length) {
        const files = await starterPlayerFiles(); assert(); ctx.assertLive();
        plan = mediaPlayerPlan({ ...input, files });
      }
      if (plan?.notes.length) throw new Error(plan.notes.join(" "));
      next = plan?.edits.get(path) ?? next;
    }
    assert(); ctx.assertLive();
    if (held) {
      const saved = await held.save({ label, path, source, live: current, expectedPaths: ctx.paths, expectedAssets,
        records: { text: metadata }, uploads: plan?.creates.map(file => ({ path: file.path, blob: new Blob([file.content], { type: file.path.endsWith(".css") ? "text/css" : "text/javascript" }) })),
        apply: (paths, _requests, records) => {
          const image = held.image(paths);
          const page = background(source, node, { path: image.path, still: records.files[image.path]?.still ?? record?.still });
          return mediaPlayerPlan({ pages: [path], sources: { [path]: page }, exists: () => true, kinds: ["background-video"] })?.edits.get(path) ?? page;
        } });
      if (saved.note) ports.announce(saved.note);
      return;
    }
    const edits = new Map([[path, next]]);
    for (const file of plan?.creates ?? []) { expectedSources.set(file.path, undefined); edits.set(file.path, file.content); }
    await ctx.applyBatch({ label, expectedPaths: ctx.paths, expectedSources, expectedAssets, edits, live: current, moves: [], deletes: [], restores: [], uploads: [] });
    ctx.assertLive();
  }
  async function chooseBackground(target: { path: string; node: number[] }, source: string) {
    const since = ports.stamp();
    const [{ openMediaPicker }, { createMediaWorkspace }] = await Promise.all([load(), import("./media-workspace")]);
    if (!since.holds() || ports.source(target.path) !== source || ports.selected && !ports.selected(target.path, target.node)) return;
    // Only this picker lists videos; the Media screen shows them once every kind is in Media (slice 59).
    const adapter = { ...createMediaWorkspace(() => context(path => isImagePath(path) || isVideoPath(path))), usage };
    await openMediaPicker({ adapter, accept: ".mp4,.m4v,.webm,.mov,.ogv", place: `${ports.placeLabel?.(target.path) ?? target.path} · Background video`, report: ports,
      onPick: async (video, cancelled, held) => {
        if (!isVideoPath(video.path) && !held) throw new Error("Choose a video file.");
        await change(target.path, target.node, source, "Background video set", "background-video",
          (page, record) => background(page, target.node, { path: video.path, still: record?.still }), video, cancelled, held, since);
      } });
  }
  return { controls, chooseBackground };
}
