import { agentCommandSignals, mediaCommandPins } from "./agent-tools";
import { payloadIdentity, workspaceKey, type JsonValue } from "../shared/agent-command";
import { textHash } from "../shared/agent";
import { draftKey, type DraftStore } from "./drafts";
import type { AgentRecords } from "./agent-records";
import type { createAgentOwner } from "./agent-owner";
import type { AgentTextCommit } from "./editor-workspace";
import type { MediaWorkspaceBatch } from "./page-builder/media-workspace";

import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { parseOnlineVideoAddress } from "../shared/online-video-address";
import { agentImageTrim } from "../shared/agent-image-frame";
import type { MediaControllerPorts } from "./controllers/media-controller";
import { mediaCommandProofs } from "./agent-tools-media";
import { createMediaController } from "./controllers/media-controller";
import { pinnedPorts } from "./background-page";
import { mediaChanges, type MediaTool } from "../shared/agent-media";
import { placeAgentMedia } from "./page-builder/agent-media-place";
import { createVideoPlaces } from "./page-builder/media-video-place";
import { framePlace } from "./page-builder/place-frame";
import { trimPlace } from "./page-builder/place-trim";
import { componentPicture, agentComponentRead, agentComponentChange, agentTrimRequest } from "./page-builder/component-shapes";
import { nativeSitePrefix, NATIVE_CONFIG_PATH } from "../shared/native-project";
import { locatePageElement } from "./page-builder/media-insert";
import { mediaAttribute, mediaExistingAlt } from "./page-builder/media-attributes";
import { decodeHtmlEntities } from "./page-builder/html-entities";
import { OUTSIDE_MEDIA_REFUSED, MEDIA_LIST_LIMIT, textBytes, mediaKind, parseOutlineId, type AgentCommand } from "../shared/agent";
import { MEDIA_RECORDS_PATH } from "../shared/media-records";
import { readSiteMediaRecords } from "./page-builder/media-collections";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./page-builder/media-workspace";
import { MEDIA_ADDING_CHOICES, mediaAddingSettings, mediaAddingIsDefault } from "./page-builder/media-settings";
import { createMediaByteCache } from "./page-builder/media-byte-cache";
import { mediaImageForPlacement, type MediaImage } from "./page-builder/media-markup";

/** Loaded only when an agent changes Media. All writes use the editor's media transactions. */
async function executeAgentMedia(
  ctx: MediaWorkspaceContext, command: AgentCommand,
  preparePlacement: (target: { path: string; node: number[] }) => (image: MediaImage, asset?: { path: string; version?: string }) => Promise<void | number[]>,
  prepareFrame?: ReturnType<typeof createMediaController>["prepareFrame"],
  prepareLoop?: ReturnType<typeof createMediaController>["prepareLoop"],
  moment?: (blob: Blob, seconds: number) => Promise<Blob>,
  improve?: import("./agent-improve-images").AgentImproveHost,
  improvePorts?: import("./agent-improve-images").AgentImprovePorts,
  stagingPorts?: MediaControllerPorts,
  seenSources?: ReadonlyMap<string, string | undefined>,
): Promise<void | { message: string; result: Record<string, string> }> {
  void stagingPorts; void seenSources;
  const args = command.args ?? {};
  const problem = agentMediaArgsProblem(command.operation, args, command.path);
  if (problem) throw new Error(problem);
  if (command.operation === "improve_images") {
    const { agentImproveImages } = await import("./agent-improve-images");
    return agentImproveImages(improve ?? { context: async () => ctx }, args.row, improvePorts);
  }
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
  if (command.operation === "loop_video") {
    const { locatePageElement } = await import("./page-builder/media-insert");
    const { readLooping } = await import("./page-builder/looping-video");
    const source = await ctx.read(command.path); ctx.assertLive();
    const range = source === undefined ? undefined : locatePageElement(source, parseOutlineId(args.element!)!);
    if (!range || range.tag.name !== "video") throw new Error("Choose a video.");
    if (args.looping !== undefined) {
      if (!prepareLoop) throw new Error("Video controls are unavailable.");
      await prepareLoop({ path: command.path, node: parseOutlineId(args.element!)! })(args.looping);
    }
    return { message: args.looping === undefined ? "Looping video read." : "Looping video changed, unsaved.", result: { report: JSON.stringify({ looping: args.looping ?? readLooping(source!.slice(range.tag.start, range.tag.end)) }) } };
  }
  if (command.operation === "video_still" || command.operation === "write_subtitles") {
    if ([args.file!, ...args.picture ? [args.picture] : []].some(file => !ctx.items.some(item => item.path === file))) throw new Error(OUTSIDE_MEDIA_REFUSED);
    const versions = new Map(ctx.paths.map(path => [path, ctx.assetVersion(path)]));
    const assertLive = () => {
      ctx.assertLive();
      if (ctx.paths.length !== versions.size || ctx.paths.some(path => versions.get(path) !== ctx.assetVersion(path))) throw new Error("Media changed while preparing the change. Try again.");
    };
    const host = createMediaWorkspace(async () => ({ ...ctx, assertLive }));
    await host.load(); assertLive();
    if (command.operation === "write_subtitles") {
      const format = args.format ?? (/^\uFEFF?WEBVTT(?:\s|$)/.test(args.text!) ? "vtt" : "srt");
      await host.subtitles(args.file!, { name: `subtitles.${format}`, text: args.text! }, true);
      return { message: "Subtitles written, unsaved; marked by agent in To check.", result: {} };
    }
    if (args.picture) await host.still(args.file!, { path: args.picture });
    else {
      const capture = moment ?? (await import("./page-builder/video-moment")).videoMoment;
      assertLive();
      const input = await ctx.blob(args.file!); assertLive();
      const blob = await capture(input, args.moment!); assertLive();
      await host.still(args.file!, { blob });
    }
    return { message: "Still picture changed everywhere, unsaved.", result: {} };
  }
  if (command.operation === "place_media") {
    const file = args.file!;
    if (!parseOnlineVideoAddress(file) && !ctx.items.some(item => item.path === file)) throw new Error(OUTSIDE_MEDIA_REFUSED);
    const place = preparePlacement({ path: command.path, node: parseOutlineId(args.element!)! });
    if (parseOnlineVideoAddress(file) || mediaKind(file) !== "image") {
      const node = await place({ path: file, alt: "" });
      return { message: `Placed ${file}, unsaved.`, result: node ? { element: node.join(".") } : {} };
    }
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
    if (textBytes(report) > MEDIA_LIST_LIMIT) throw new Error("The media report is too large. Request fewer files.");
    return { message, result: { report } };
  };
  if (command.operation === "remove_media") {
    const { agentRemovalPaths } = await import("./page-builder/agent-media-removal");
    ctx.assertLive();
    const files = agentRemovalPaths(args.files!, ctx.paths);
    const outcome = report(`Agent removed ${files.length} files, unsaved.`, { files });
    await host.remove(args.files!, false, true, versions);
    return outcome;
  }
  if (command.operation === "keep_media") {
    if (args.files!.some(file => !ctx.items.some(item => item.path === file))) throw new Error(OUTSIDE_MEDIA_REFUSED);
    const files = [...new Set(args.files!)].filter(file => !library.keep.includes(file));
    const outcome = report(files.length ? "Agent added Always keep, unsaved." : "These files already have Always keep.", { files });
    if (files.length) await host.metadata(Object.fromEntries(files.map(file => [file, { alwaysKeep: true }])), true, versions);
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
    await host.restore(entries, true, versions);
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

// Kept in this lazy chunk: media never adds records, ownership or source-editor code to boot.
const mediaOwners = new Map<string, Promise<{ records: AgentRecords; owner: ReturnType<typeof createAgentOwner> }>>();
const portOwners = new WeakMap<AgentRecords, typeof mediaOwners>();

/** Prepare every batch before committing any of them. More than one batch refuses the whole command. */
export async function applyAgentMedia(...parameters: Parameters<typeof executeAgentMedia>): ReturnType<typeof executeAgentMedia> {
  const [ctx, input] = parameters;
  const command = structuredClone(input), args = command.args ?? {};
  const changing = mediaChanges(command.operation as import("../shared/agent-media").MediaTool, args);
  const signal = agentCommandSignals.get(input), mediaProof = mediaCommandProofs.get(input);
  const proof = () => { signal?.throwIfAborted(); mediaProof?.(); };
  if (!changing) { parameters[0] = { ...ctx, agent: true }; return executeAgentMedia(...parameters); }
  const refuse = (error: unknown): never => {
    // Whether the edit was kept is unproven (src/agent-records.ts "unknown"): never claim nothing changed.
    if (error instanceof Error && error.name === "AgentRecordsError" && (error as Error & { code: string }).code === "unknown") throw new Error(error.message);
    throw new Error(`${error instanceof Error ? error.message : "Browser storage failed."} Nothing was changed; your drafts are as they were.`);
  };
  // Argument and captured editor proofs keep their specific refusals even without storage.
  const problem = agentMediaArgsProblem(command.operation, args, command.path);
  if (problem) return refuse(new Error(problem));
  if (command.operation === "place_media" && !parseOnlineVideoAddress(args.file ?? "") && !ctx.items.some(item => item.path === args.file))
    return refuse(new Error(OUTSIDE_MEDIA_REFUSED));
  const pageChange = ["place_media", "frame_image", "loop_video"].includes(command.operation);
  if (pageChange && !parameters[8]) return refuse(new Error("Staged media edit ports are unavailable."));
  // Sources seen when the command arrived (before any module load) stay the proof: a page edited meanwhile refuses.
  const dependencies = new Map<string, string | undefined>(parameters[9] ?? []);
  const versions = new Map(ctx.paths.map(path => [path, ctx.assetVersion(path)]));
  let applied = false;
  const assertCurrent = () => {
    ctx.assertLive();
    if (!applied) {
      // The live executor's proof carries the relay deadline and socket liveness (src/agent-tools-media.ts).
      proof?.();
    }
    if (!applied && parameters[8] && [...dependencies].some(([path, source]) => parameters[8]!.source(path) !== source))
      throw new Error("The source changed while preparing the media command.");
    if (!applied && (ctx.paths.length !== versions.size || ctx.paths.some(path => versions.get(path) !== ctx.assetVersion(path))))
      throw new Error("Media changed while preparing the command. Try again.");
  };
  // A host without authorization/storage must still surface the operation's own validation.
  // Run only as far as its first write boundary; no batch or browser copy can be changed.
  const validateBeforeRefusal = async (error: unknown): Promise<never> => {
    if (pageChange) return refuse(error);
    const stop = () => { throw error; };
    const wrap = (context: MediaWorkspaceContext): MediaWorkspaceContext => ({ ...context, agent: true,
      assertLive: () => { assertCurrent(); context.assertLive(); }, applyBatch: async () => stop(), blob: async () => stop(),
      removedCopies: context.removedCopies && { ...context.removedCopies, put: async () => stop(), delete: async () => stop() } });
    const validation: Parameters<typeof executeAgentMedia> = [...parameters];
    validation[0] = wrap(ctx); validation[1] = command;
    const improve = parameters[6];
    if (command.operation === "improve_images") validation[6] = { ...improve, show: undefined,
      context: async () => { assertCurrent(); const context = improve ? await improve.context() : ctx; assertCurrent(); return wrap(context); } };
    try { assertCurrent(); await executeAgentMedia(...validation); assertCurrent(); }
    catch (problem) { return refuse(problem); }
    return refuse(error);
  };
  if (!command.grantId) return validateBeforeRefusal(new Error("Agent media edits require an authorization id (grantId)."));
  const scope = { ...ctx.scope }, workspace = { account: scope.account, repoId: scope.repoId, branch: scope.branch };
  // Narrow the app's actual store by its runtime ports; test/manual DraftAccess adapters cannot persist agent edits.
  const store = ctx.drafts;
  const isAgentStore = (value: typeof store): value is DraftStore =>
    ["fenceAgent", "stageAgent", "publishAgent", "announceAgent", "refresh"].every(key => key in value && typeof Reflect.get(value, key) === "function");
  if (!isAgentStore(store)) return validateBeforeRefusal(new Error("Browser draft storage is unavailable for agent edits."));
  let outcome: Awaited<ReturnType<typeof executeAgentMedia>> = undefined;
  try {
    assertCurrent();
    // Hash the canonical arguments as a whole: no subtitle text, descriptions or byte strings in receipts.
    const argsHash = await textHash(payloadIdentity(JSON.parse(JSON.stringify(args)) as JsonValue));
    assertCurrent();
    const identity = command.requestIdentity ?? payloadIdentity(JSON.parse(JSON.stringify({ operation: command.operation, path: command.path,
      branch: command.branch, commit: command.commit, argsHash })) as JsonValue);
    const key = JSON.stringify([workspaceKey(workspace), command.ownerGeneration ?? null]);
    let owners = mediaOwners;
    if (ctx.agentRecords) {
      owners = portOwners.get(ctx.agentRecords) ?? new Map();
      portOwners.set(ctx.agentRecords, owners);
    }
    let loading = owners.get(key);
    if (!loading) {
      loading = (async () => {
        const [{ indexedDbAgentRecords }, { createAgentOwner }] = await Promise.all([import("./agent-records"), import("./agent-owner")]);
        const records = ctx.agentRecords ?? indexedDbAgentRecords(), state = await records.workspace(workspace);
        return { records, owner: createAgentOwner({ workspace, fence: command.ownerGeneration ?? state.generation, records,
          reload: async () => {} }) };
      })();
      owners.set(key, loading);
      void loading.catch(() => { if (owners.get(key) === loading) owners.delete(key); });
    }
    const { records, owner } = await loading.catch(validateBeforeRefusal);
    assertCurrent();
    const receipt = { operationId: command.id, authorizationId: command.grantId, payloadIdentity: identity,
      outcome: {} as JsonValue, createdAt: Date.now(), issuedAt: command.createdAt };
    const existing = await records.receipt(workspace, command.id, command.grantId).catch(validateBeforeRefusal);
    assertCurrent();
    if (existing) {
      const result = await owner.commit({ workspace, fence: owner.fence, expectedRevision: 0, expectedDrafts: [], drafts: [], receipt });
      return result.receipt.outcome as Exclude<typeof outcome, void>;
    }
    const batches: MediaWorkspaceBatch[] = [];
    const wrap = (context: MediaWorkspaceContext): MediaWorkspaceContext => ({ ...context, agent: true,
      assertLive: () => { assertCurrent(); context.assertLive(); },
      // Adding settings reports its prepared metadata before the buffered batch is published.
      read: async path => command.operation === "adding_settings" && batches[0]?.edits.has(path)
        ? batches[0].edits.get(path) : context.read(path),
      applyBatch: async batch => { context.assertLive(); batches.push(batch); } });
    parameters[0] = wrap(ctx);
    const stagingPorts = parameters[8];
    if (stagingPorts && pageChange) {
      // The controller's shared transforms prepare against live ports; write ports only buffer.
      // No page model or draft changes until the outer durable media transaction publishes.
      const stage = async (batch: MediaWorkspaceBatch) => { assertCurrent(); batches.push(batch); };
      const ports: MediaControllerPorts = { ...stagingPorts, selected: undefined,
        source(path, scope) { const source = stagingPorts.source(path, scope); if (!dependencies.has(path)) dependencies.set(path, source); return source; },
        stamp: () => { const stamp = stagingPorts.stamp(); return { holds: () => { assertCurrent(); return stamp.holds(); }, changed: () => stamp.changed() }; },
        applyBatch: async (_scope, _stamp, batch) => stage(batch),
        change(path, source, edits, _node, label) {
          assertCurrent();
          let content = source;
          for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
            content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
          }
          batches.push({ label, expectedPaths: [...ctx.paths], expectedSources: new Map([[path, source]]), expectedAssets: new Map(),
            edits: new Map([[path, content]]), moves: [], deletes: [], restores: [], uploads: [] });
          return true;
        },
      };
      const context = async () => wrap(ctx);
      const capture = (target: { path: string; node: number[] }) => {
        assertCurrent();
        const source = ports.source(target.path), locate = ports.locateElement ?? locatePageElement;
        const range = source === undefined ? undefined : locate(source, target.node);
        if (!range || source === undefined) throw new Error("That element is no longer on the page.");
        return { source, expected: source.slice(range.tag.start, range.tag.end), stamp: ports.stamp(), epoch: ports.generation() };
      };
      parameters[2] = target => {
        const proof = capture(target);
        const templates = (tag: string) => { const path = ctx.components[tag]; return path ? { path, source: ports.source(path) } : undefined; };
        return (image, asset) => placeAgentMedia(ports, context, target, image, { ...proof, initialAlt: mediaExistingAlt(proof.expected), asset }, templates);
      };
      parameters[3] = target => {
        const proof = capture(target), locate = ports.locateElement ?? locatePageElement;
        const parent = locate(proof.source, target.node.slice(0, -1))?.tag.name ?? "";
        if (parent.includes("-")) for (const base of [`components/${parent}/${parent}`, `components/${parent}`])
          for (const suffix of [".html", ".css"]) ports.source(base + suffix);
        const component = componentPicture(proof.source, target.node, path => ports.source(path));
        const prefix = nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH));
        return {
          read: async records => agentComponentRead(proof.expected, records, target.path, component, prefix),
          frame: change => framePlace(ports, target, agentComponentChange(change, component), proof),
          trim: request => trimPlace(ports, context, target, agentTrimRequest(request, proof.expected, target.path, component, prefix), proof),
        };
      };
      parameters[4] = target => {
        const proof = capture(target);
        return looping => createVideoPlaces(ports, context, () => ports.load()).toggleLooping(target.path, target.node, proof.source, looping);
      };
    }
    parameters[1] = command;
    if (command.operation === "improve_images") {
      const improve = parameters[6];
      parameters[6] = { ...improve, context: async () => {
        assertCurrent();
        const context = improve ? await improve.context() : ctx;
        assertCurrent();
        return wrap(context);
      } };
    }
    outcome = await executeAgentMedia(...parameters);
    assertCurrent();
    if (batches.length > 1) throw new Error("This media command needs more than one batch. Request one change at a time.");
    if (command.operation === "improve_images" && batches.length && outcome?.result.report
      && (JSON.parse(outcome.result.report) as { failed: unknown[] }).failed.length)
      throw new Error("Some image improvements failed. Request one change at a time.");
    outcome ??= { message: "Media changed in the editor as an unsaved draft.", result: {} };
    const planned = async (path: string) => batches[0]?.edits.get(path) ?? await ctx.read(path) ?? "";
    if (["place_media", "frame_image"].includes(command.operation)) {
      const page = await planned(command.path); assertCurrent();
      outcome.result.hash = await textHash(page); assertCurrent();
      if (command.operation === "place_media") {
        const range = locatePageElement(page, parseOutlineId(args.element!)!);
        outcome.result.alt = range ? decodeHtmlEntities(mediaAttribute(page, range.tag, "alt")?.value ?? "", true) : "";
        outcome.message = `Placed ${args.file} in ${args.element} on ${command.path}, unsaved.`;
      }
    }
    if (command.operation === "describe_media") {
      const page = await planned(args.page ?? MEDIA_RECORDS_PATH); assertCurrent();
      outcome = { message: `Changed description of ${args.file}, unsaved.`, result: { hash: await textHash(page) } }; assertCurrent();
    }
    if (command.operation === "change_collection") outcome = { message: `Changed collection ${args.name}, unsaved.`, result: {} };
    if (new TextEncoder().encode(JSON.stringify(outcome)).byteLength > 8 * 1024 * 1024 - 4096)
      throw new Error("The media result is too large; narrow the folder or page with offset/limit.");
    for (const [path, source] of dependencies) batches[0]?.expectedSources.set(path, source);
    receipt.outcome = outcome;
    let expectedRevision = 0;
    const context: AgentTextCommit = {
      async fence(draftScope, paths) {
        assertCurrent();
        if (ctx.flushTyping) ctx.flushTyping(draftScope, paths);
        else {
          const { flushAgentTyping } = await import("./components/source-editor");
          assertCurrent();
          flushAgentTyping(draftScope, paths);
        }
        assertCurrent();
        const release = await store.fenceAgent(draftScope, paths);
        try {
          assertCurrent();
          expectedRevision = (await records.workspace(workspace)).revision;
          assertCurrent();
          return release;
        } catch (error) { release(); throw error; }
      },
      async commit(before, after, current) {
        store.stageAgent(after);
        assertCurrent();
        if (!current()) throw new Error("Media changed before the change could be applied.");
        const result = await owner.commit({ workspace, fence: owner.fence, expectedRevision,
          expectedDrafts: [...before].map(([path, record]) => [draftKey(scope, path), record ?? null]),
          drafts: [...after].map(([path, record]) => [draftKey(scope, path), record ?? null]), receipt });
        applied = true;
        outcome = result.receipt.outcome as Exclude<typeof outcome, void>;
        return !result.duplicate;
      },
      publish(changes, apply) {
        const result = store.publishAgent(scope, changes, apply);
        store.announceAgent(scope, [...changes.keys()]);
        return result;
      },
      async settle(changes) {
        await store.refresh([...changes.keys()].map(path => draftKey(scope, path)));
        store.announceAgent(scope, [...changes.keys()]);
      },
    };
    const batch = batches[0];
    if (batch) {
      await ctx.applyBatch({ ...batch, agent: context });
      if (!applied) throw new Error("The media host did not commit the agent transaction.");
    }
    else {
      const release = await context.fence(scope, []);
      try { await context.commit(new Map(), new Map(), () => { assertCurrent(); return true; }); }
      finally { release(); }
    }
    return outcome;
  } catch (error) {
    if (applied) return outcome;
    return refuse(error);
  }
}

/**
 * Main's adapter lives in this lazy chunk, including all media preparation.
 * `page` and `taken`: the page and the stamp the caller took before loading this chunk; `background`
 * makes the background page's own controller (tests give theirs). A change that
 * arrived in a workspace pinned as it came (ticket 27) runs in that workspace's background page: a
 * controller of its own over the pinned ports, so every read, write and measurement is that
 * workspace's whatever is shown; its proof is its page as it read on arrival (src/agent-tools-media.ts).
 */
export async function runAgentMedia(shown: ReturnType<typeof createMediaController>, live: MediaControllerPorts, command: AgentCommand,
  page = live.source(command.path), taken = live.stamp(),
  background = (ports: MediaControllerPorts) => createMediaController(ports, () => import("./controllers/media-actions"))) {
  const held = mediaCommandPins.get(command), pin = held?.pin, ports = pinnedPorts(live, pin, command.path);
  if (held) page = held.page;
  const controller = pin ? background(ports) : shown;
  const since = pin ? ports.stamp() : taken, proof = mediaCommandProofs.get(command), signal = agentCommandSignals.get(command);
  const check = () => { signal?.throwIfAborted(); proof?.(); if (!since.holds()) throw new Error("The editor moved to another site or branch meanwhile. Nothing was changed."); };
  check();
  // Lex's own Media work comes first while the workspace is shown: the shown controller knows whether
  // its pane is busy (the background controller has no pane), asked as it starts and before each context.
  const paneFree = () => { if (pin && pin.here()) shown.prepareImprove(); };
  const own = command.operation === "improve_images" ? controller.prepareImprove() : undefined;
  if (own) paneFree();
  const improve = own && pin ? { ...own, context: async () => { paneFree(); const ctx = await own.context(); paneFree(); return ctx; } } : own;
  const target = () => ({ path: command.path, node: parseOutlineId(command.args!.element!)! });
  const { isAgentMediaPath } = await import("./agent-media"); check();
  const context = await controller.workspaceContext(isAgentMediaPath); check();
  const readingFrame = command.operation === "frame_image" && !mediaChanges("frame_image", command.args ?? {});
  if (readingFrame) { await context.read(command.path); check(); }
  const frame = readingFrame ? controller.prepareFrame(target()) : undefined;
  const ctx: MediaWorkspaceContext = { ...context, assertLive: () => { check(); context.assertLive(); } };
  return applyAgentMedia(ctx, command, () => { throw new Error("Media placement was not staged."); }, frame ? () => frame : undefined,
    undefined, undefined, improve, undefined, ports,
    ["place_media", "frame_image", "loop_video"].includes(command.operation) && mediaChanges(command.operation as MediaTool, command.args ?? {}) ? new Map([[command.path, page]]) : undefined);
}
