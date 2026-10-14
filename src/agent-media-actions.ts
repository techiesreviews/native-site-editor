import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { agentImageTrim } from "../shared/agent-image-frame";
import type { createMediaController } from "./controllers/media-controller";
import { OUTSIDE_MEDIA_REFUSED, MEDIA_LIST_LIMIT, parseOutlineId, type AgentCommand } from "../shared/agent";
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
  const versions = new Map(ctx.paths.map(path => [path, ctx.assetVersion(path)]));
  const metadataSource = command.operation === "replace_media" ? await ctx.read(MEDIA_RECORDS_PATH) : undefined;
  ctx.assertLive();
  const library = await host.load(); ctx.assertLive();
  const report = (message: string, value: unknown) => {
    const report = JSON.stringify(value);
    if (report.length > MEDIA_LIST_LIMIT) throw new Error("The media report is too large. Request fewer files.");
    return { message, result: { report } };
  };
  if (command.operation === "remove_media") {
    const { agentRemovalPaths } = await import("./page-builder/agent-media-removal");
    ctx.assertLive();
    const files = agentRemovalPaths(args.files!, ctx.paths);
    const outcome = report(`Agent removed ${files.length} files, unsaved.`, { files });
    await host.remove(args.files!, false, true);
    return outcome;
  }
  if (command.operation === "keep_media") {
    if (args.files!.some(file => !ctx.items.some(item => item.path === file))) throw new Error(OUTSIDE_MEDIA_REFUSED);
    const files = [...new Set(args.files!)].filter(file => !library.keep.includes(file));
    const outcome = report(files.length ? "Agent added Always keep, unsaved." : "These files already have Always keep.", { files });
    if (files.length) await host.metadata(Object.fromEntries(files.map(file => [file, { alwaysKeep: true }])), true);
    return outcome;
  }
  if (command.operation === "restore_media") {
    if (!args.files) {
      const today = (ctx.now ?? Date.now)();
      return report("Recently removed read.", { removed: library.removed.map(entry => ({
        path: entry.path, removedDate: entry.date,
        daysLeft: Math.max(0, 30 - Math.floor((Date.parse(new Date(today).toISOString().slice(0, 10)) - Date.parse(entry.date)) / 86400000)),
        family: [entry.path, ...entry.family?.map(member => member.path) ?? []],
        browserOnly: [entry, ...entry.family ?? []].some(member => Boolean(member.browserKey)),
      })) });
    }
    const entries = [...new Set(args.files)].map(path => {
      const entry = library.removed.find(entry => entry.path === path);
      if (!entry) throw new Error(`${path} is no longer in Recently removed.`);
      return { path, id: (entry.sha ?? entry.browserKey)! };
    });
    const outcome = report("Agent restored media families, unsaved.", { files: entries.map(entry => entry.path) });
    await host.restore(entries, true);
    return outcome;
  }
  if (command.operation === "replace_media") {
    if ([args.file!, args.with!].some(file => !ctx.items.some(item => item.path === file))) throw new Error(OUTSIDE_MEDIA_REFUSED);
    const [{ replaceChoiceProblem }, { replacementFamilies }, { prepareMediaReplacement }] = await Promise.all([
      import("./page-builder/media-replace-rules"), import("./page-builder/replace-everywhere"), import("./page-builder/media-replace-prepare"),
    ]);
    ctx.assertLive();
    const problem = replaceChoiceProblem(args.file!, args.with!, ctx.paths);
    if (problem) throw new Error(problem);
    const records = readSiteMediaRecords(metadataSource, ctx.items.map(item => item.path));
    replacementFamilies(args.file!, ctx.paths, records);
    replacementFamilies(args.with!, ctx.paths, records);
    const live = () => versions.size === ctx.paths.length && ctx.paths.every(path => versions.get(path) === ctx.assetVersion(path));
    const assertLive = () => {
      ctx.assertLive();
      if (!live()) throw new Error("Media changed while preparing replacement. Try again.");
    };
    const prepared = await prepareMediaReplacement({ path: args.with!, paths: ctx.paths, key: ctx.key, adding: library.adding,
      blob: path => ctx.blob(path), ask: async () => true, assertLive });
    assertLive();
    if (await ctx.read(MEDIA_RECORDS_PATH) !== metadataSource) throw new Error("Media records changed while preparing replacement. Try again.");
    assertLive();
    const notices: string[] = prepared.warning ? [prepared.warning] : [];
    const path = await host.replace({ path: args.file!, result: prepared.result, original: prepared.original,
      ...(args.keepOldUrl !== undefined ? { keepOldAddress: args.keepOldUrl } : {}), live, notice: text => notices.push(text) }, true);
    return { message: "Agent replaced picture everywhere, unsaved.", result: { path, notices: JSON.stringify(notices) } };
  }
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
