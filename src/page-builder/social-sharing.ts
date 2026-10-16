import { trimmableImages } from "../../shared/media-kinds";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../../shared/media-records";
import type { MediaTrim } from "../../shared/media-records";
import { createMediaWorkspace, type MediaWorkspaceContext, type MediaShareRequest } from "./media-workspace";
import { prepareSocialCopy } from "./social-copy-prepare";
import { socialImageSource, socialImagePath, socialImageAddress, SOCIAL_IMAGE_NOTE } from "./social-image";

export interface SocialSharingRequest {
  value: string; previous: string; page: string; siteUrl?: string; canonical?: string;
  expectedSources: Map<string, string | undefined>;
  trim?: MediaTrim; live(): boolean;
  edits(address: string): ReturnType<MediaShareRequest["edits"]>;
  /** Said after the image, once its edits are planned (Site settings: links moved to a new address). */
  note?: () => string | undefined;
}

export async function shareImage(context: () => Promise<MediaWorkspaceContext>, request: SocialSharingRequest, announce: (message: string) => void) {
  const assert = () => { if (!request.live()) throw new Error("The repository or source changed meanwhile. Reopen settings and try again."); };
  assert();
  const candidate = socialImagePath(request.value, request.page, request.siteUrl, request.canonical);
  if (!candidate || !trimmableImages.test(candidate)) return undefined;
  const ctx = await context(); assert(); ctx.assertLive();
  if (!ctx.paths.includes(candidate)) return undefined;
  const recordText = await ctx.read(MEDIA_RECORDS_PATH); assert(); ctx.assertLive();
  const records = parseMediaRecords(recordText);
  const options = { ...request, paths: ctx.paths, records };
  // An existing sharing copy is linked at the site's full address as it is: no new copy.
  if (records.files[candidate]?.sharing) return { ...socialImageAddress(request.siteUrl, candidate), reused: true as const, path: candidate };
  const source = socialImageSource(options);
  if (!source) return undefined;
  const sourceVersion = ctx.assetVersion(source);
  const blob = await ctx.blob(source); assert(); ctx.assertLive();
  const bytes = new Uint8Array(await blob.arrayBuffer()); assert(); ctx.assertLive();
  if (!socialImageSource({ ...options, bytes })) return undefined;
  const result = await prepareSocialCopy(blob, source, request.trim); assert(); ctx.assertLive();
  if (!result.trim) throw new Error("The sharing image has no frame.");
  const previousPath = socialImagePath(request.previous, request.page, request.siteUrl, request.canonical);
  const previous = previousPath && records.files[previousPath]?.sharing && ctx.paths.includes(previousPath) ? previousPath : undefined;
  let address = socialImageAddress(request.siteUrl, source);
  const path = await createMediaWorkspace(async () => {
    assert(); ctx.assertLive();
    if (await ctx.read(MEDIA_RECORDS_PATH) !== recordText) throw new Error("The media records changed meanwhile. Nothing was saved.");
    assert(); ctx.assertLive(); return ctx;
  }).share({ source, sourceVersion, result, trim: result.trim, previous, live: () => request.live(),
    expectedSources: new Map([...request.expectedSources, [MEDIA_RECORDS_PATH, recordText]]),
    edits(path) { address = socialImageAddress(request.siteUrl, path); return request.edits(address.address); } });
  // Clean-up after the commit may outlast the repository: no success is announced for another one.
  ctx.assertLive();
  const note = request.note?.();
  announce("Social image set as a draft." + (note ? ` ${note}` : "") + (address.missingAddress ? " The image was linked without a web address. " + SOCIAL_IMAGE_NOTE : ""));
  return { path, ...address };
}
