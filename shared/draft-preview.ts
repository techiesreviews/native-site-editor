// Shared contract for real Astro draft previews.
//
// GET  /api/draft-preview  => { available: true, previewOrigin }  (404/unavailable
//   preserves the committed-preview behavior).
// POST /api/draft-preview  receives a DraftPreviewRequest and returns, on success,
//   a DraftBuildSuccess. `files` is the COMPLETE current draft overlay; any file not
//   listed uses its immutable original baseline. The backend performs a real isolated
//   Astro build — the client never synthesizes HTML.

export interface DraftFile {
  path: string;
  content: string;
}

export interface DraftPreviewAvailability {
  available: true;
  mode?: "local" | "warm" | "github-actions";
  previewOrigin?: string;
}

export interface DraftPreviewRequest {
  /** Stable per browser tab. */
  sessionId: string;
  repo: string;
  branch: string;
  baseCommit: string;
  /** Complete draft overlay; omitted paths use the immutable baseline. */
  files: DraftFile[];
}

export interface DraftBuildSuccess {
  /** sha256 of the compiled draft. */
  revision: string;
  /** Absolute directory URL ending in a slash: .../drafts/<session>/<revision>/ */
  previewUrl: string;
  /** Actual compiled source snapshot; the NEW mapping baseline for the panel. */
  sources: Record<string, string>;
}

export interface DraftBuildPending {
  status: "building";
  revision: string;
  previewUrl: string;
  revisionUrl: string;
  sources: Record<string, string>;
}

export type DraftBuildResult =
  | { ok: true; build: DraftBuildSuccess }
  | { ok: false; status: number; error?: string };

/** Build inputs that define one compiled draft. Route is deliberately excluded:
 *  it selects which page of a build is loaded, not what is compiled. */
export function buildSignature(
  request: Pick<DraftPreviewRequest, "sessionId" | "repo" | "branch" | "baseCommit" | "files">,
): string {
  const files = request.files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => [file.path, file.content]);
  return JSON.stringify([request.sessionId, request.repo, request.branch, request.baseCommit, files]);
}

/** Join a build's directory URL with a page route (leading slash removed). */
export function draftPageUrl(previewUrl: string, pageRoute: string): string {
  return previewUrl + pageRoute.replace(/^\//, "");
}
