import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { agentImageTrim } from "../shared/agent-image-frame";
import type { createMediaController } from "./controllers/media-controller";
import { OUTSIDE_MEDIA_REFUSED, parseOutlineId, type AgentCommand } from "../shared/agent";
import { MEDIA_RECORDS_PATH } from "../shared/media-records";
import { readSiteMediaRecords } from "./page-builder/media-collections";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./page-builder/media-workspace";
import { MEDIA_ADDING_CHOICES, mediaAddingSettings, mediaAddingIsDefault } from "./page-builder/media-settings";
import { createMediaByteCache } from "./page-builder/media-byte-cache";
import { mediaImageForPlacement, type MediaImage } from "./page-builder/media-markup";

/** Loaded only when an agent changes Media. All writes use the editor's media transactions. */
export async function applyAgentMedia(
  ctx: MediaWorkspaceContext, command: AgentCommand,
  preparePlacement: (target: { path: string; node: number[] }) => (image: MediaImage, asset?: { path: string; version?: string }) => Promise<void>,
  prepareFrame?: ReturnType<typeof createMediaController>["prepareFrame"],
): Promise<void | { message: string; result: Record<string, string> }> {
  const args = command.args ?? {};
  const problem = agentMediaArgsProblem(command.operation, args, command.path);
  if (problem) throw new Error(problem);
  if (command.operation === "frame_image") {
    if (!prepareFrame) throw new Error("Image framing is unavailable.");
    const place = prepareFrame({ path: command.path, node: parseOutlineId(args.element!)! });
    const frame = { ...(args.shape !== undefined ? { shape: args.shape } : {}), ...(args.focus !== undefined ? { focus: args.focus } : {}) };
    if (args.trim !== undefined) {
      const trimmed = await place.trim({ trim: agentImageTrim(args.trim), ...(Object.keys(frame).length ? { frame } : {}) });
      if (!trimmed) throw new Error("The trim was cancelled. Nothing was saved.");
      return { message: `Picture trimmed: ${trimmed.path}, unsaved.${trimmed.note}`, result: { path: trimmed.path } };
    }
    if (Object.keys(frame).length) {
      await place.frame(frame);
      return { message: args.shape !== undefined ? "Image shape changed, unsaved." : "Focus point moved, unsaved.", result: {} };
    }
    const metadata = await ctx.read(MEDIA_RECORDS_PATH); ctx.assertLive();
    const records = readSiteMediaRecords(metadata, ctx.items.map(item => item.path));
    return { message: "Image place read.", result: { report: JSON.stringify(await place.read(records)) } };
  }
  if (command.operation === "place_media") {
    const file = args.file!;
    if (!ctx.items.some(item => item.path === file)) throw new Error(OUTSIDE_MEDIA_REFUSED);
    const place = preparePlacement({ path: command.path, node: parseOutlineId(args.element!)! });
    const version = ctx.assetVersion(file);
    const cache = createMediaByteCache({ load: async path => {
      // New or edited SVG text must use the same draft the canvas shows.
      const draft = /\.svg$/i.test(path) ? ctx.drafts.get(ctx.scope, path) : undefined;
      return draft && !draft.deleted && !draft.opaque && !draft.sourceSha && !draft.upload
        ? new Blob([await ctx.read(path) ?? draft.content], { type: "image/svg+xml" }) : ctx.blob(path);
    }, version: path => ctx.assetVersion(path), alive: () => true });
    try {
      const data = await cache.get(file); ctx.assertLive();
      if (ctx.assetVersion(file) !== version) throw new Error("The image changed while preparing placement. Try again.");
      await place(mediaImageForPlacement(file, data, ctx.items.map(item => item.path)), { path: file, version });
    } finally { cache.dispose(); }
    return;
  }
  const host = createMediaWorkspace(async () => ctx);
  if (command.operation === "adding_settings") {
    const { image, video, audio, keepOriginal, reset } = args;
    const change = Object.fromEntries(Object.entries({ image, video, audio, keepOriginal }).filter(([, value]) => value !== undefined));
    const changing = reset === true || Object.keys(change).length > 0;
    if (changing) {
      await host.load(); ctx.assertLive();
      await host.adding(reset ? "reset" : change, true);
    }
    let records, note;
    const source = await ctx.read(MEDIA_RECORDS_PATH); ctx.assertLive();
    try { records = readSiteMediaRecords(source, ctx.items.map(item => item.path)); }
    catch { note = "Media records are unreadable; reporting the default adding settings."; }
    const settings = mediaAddingSettings(records?.adding);
    return { message: changing ? reset ? "Adding settings reset, unsaved." : "Adding settings changed, unsaved." : "Adding settings read.",
      result: { report: JSON.stringify({ ...settings, isDefault: mediaAddingIsDefault(settings), choices: MEDIA_ADDING_CHOICES, ...note ? { note } : {} }) } };
  }
  await host.load(); ctx.assertLive();
  if (command.operation === "describe_media") {
    await host.describe(args.file!, args);
  } else if (command.operation === "change_collection") {
    switch (args.action) {
      case "rename": await host.collections({ kind: "rename", from: args.name!, to: args.to! }); break;
      case "add": case "take-out": await host.collections({ kind: args.action, name: args.name!, paths: args.files! }); break;
      case "new": await host.collections({ kind: "new", name: args.name!, paths: args.files }); break;
      case "delete": await host.collections({ kind: "delete", name: args.name! }); break;
    }
  }
}
