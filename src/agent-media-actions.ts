import { OUTSIDE_MEDIA_REFUSED, parseOutlineId, type AgentCommand } from "../shared/agent";
import { MEDIA_RECORDS_PATH } from "../shared/media-records";
import { readSiteMediaRecords } from "./page-builder/media-collections";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./page-builder/media-workspace";
import { createMediaByteCache } from "./page-builder/media-byte-cache";
import { mediaVariants, type MediaImage } from "./page-builder/media-markup";

/** Loaded only when an agent changes Media. All writes use the editor's media transactions. */
export async function applyAgentMedia(
  ctx: MediaWorkspaceContext, command: AgentCommand,
  preparePlacement: (target: { path: string; node: number[] }) => (image: MediaImage, asset?: { path: string; version?: string }) => Promise<void>,
) {
  const args = command.args ?? {};
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
      let alt = "";
      try {
        const records = readSiteMediaRecords(await ctx.read(MEDIA_RECORDS_PATH), ctx.items.map(item => item.path));
        const record = records.files[file];
        alt = record?.decorative ? "" : record?.description?.text || alt;
      } catch { /* Unreadable records do not block placement and are never written. */ }
      ctx.assertLive();
      await place({ path: file, width: data.width, height: data.height, variants: mediaVariants(file, ctx.items.map(item => item.path)), alt }, { path: file, version });
    } finally { cache.dispose(); }
    return;
  }
  const host = createMediaWorkspace(async () => ctx);
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
