// Approvals on the catalogue board: Approve writes src/catalogue/approvals.json through the editor's own Save to
// GitHub (/api/publish, worker/publish.ts), on the editor's repository and branch. That mark is the go-ahead for the
// part's replacement slice; a part without it never replaces anything (atomic catalogue ticket 08's resolution).
import type { PublishResult, Snapshot, TreeEntry } from "../../shared/types";

export const APPROVALS_PATH = "src/catalogue/approvals.json";
/** Where approvals are saved by default: the editor's own repository, on the branch the preview editor ships. */
export const DEFAULT_TARGET: Target = { repo: "techiesreviews/native-site-editor", branch: "dev" };

export interface Approval { on: string; by: string }
export interface Approvals { approved: Record<string, Approval> }
export interface Target { repo: string; branch: string }
export type SaveOutcome =
  | { kind: "saved"; approvals: Approvals }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string };
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** The file's text as approvals; a blank or broken file reads as none, so the next save writes a good one. */
export function parseApprovals(text: string): Approvals {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { approved: {} }; }
  const approved: Record<string, Approval> = {};
  const listed = (data as { approved?: unknown } | null)?.approved;
  if (listed && typeof listed === "object")
    for (const [id, value] of Object.entries(listed)) {
      const mark = value as Partial<Approval> | null;
      if (mark && typeof mark.on === "string" && typeof mark.by === "string") approved[id] = { on: mark.on, by: mark.by };
    }
  return { approved };
}

/** Approvals with `id` approved; an earlier approval of it keeps its date and name. */
export function withApproval(current: Approvals, id: string, by: string, on: Date): Approvals {
  if (current.approved[id]) return current;
  return { approved: { ...current.approved, [id]: { on: on.toISOString().slice(0, 10), by } } };
}

/** The file's text: parts in name order, so each approval is a one-line change in the commit. */
export function serialiseApprovals(approvals: Approvals): string {
  const approved = Object.fromEntries(Object.keys(approvals.approved).sort().map((id) => [id, approvals.approved[id]]));
  return `${JSON.stringify({ approved }, null, 2)}\n`;
}

/** The repository and branch approvals go to: `?repo=owner/name&branch=…` on the board's address, else the editor's. */
export function approvalTarget(search: string): Target {
  const params = new URLSearchParams(search);
  const repo = params.get("repo") ?? "";
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? { repo, branch: params.get("branch") || DEFAULT_TARGET.branch } : DEFAULT_TARGET;
}

async function getJson<T>(fetcher: Fetcher, path: string, params: Record<string, string>): Promise<{ status: number; data: T }> {
  const response = await fetcher(`/api/${path}?${new URLSearchParams(params)}`, { credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => ({})) as T;
  return { status: response.status, data };
}

/** The approvals file's blob in a snapshot, walking folders when GitHub did not list the whole tree. */
async function findFile(fetcher: Fetcher, target: Target, snapshot: Snapshot): Promise<TreeEntry | undefined> {
  if (snapshot.tree) return snapshot.tree.find((entry) => entry.path === APPROVALS_PATH && entry.type === "blob");
  let entries = snapshot.entries;
  const parts = APPROVALS_PATH.split("/");
  for (const [index, name] of parts.entries()) {
    const entry = entries.find((item) => item.path === name || item.path.endsWith(`/${name}`));
    if (!entry || index === parts.length - 1) return entry?.type === "blob" ? entry : undefined;
    entries = (await getJson<{ entries: TreeEntry[] }>(fetcher, "tree", { repo: target.repo, sha: entry.sha })).data.entries ?? [];
  }
  return undefined;
}

interface Read { kind: "read"; approvals: Approvals; commit: string; sha: string | null }
async function read(fetcher: Fetcher, target: Target): Promise<Read | SaveOutcome> {
  const snap = await getJson<Snapshot & { error?: string }>(fetcher, "snapshot", { repo: target.repo, branch: target.branch });
  if (snap.status === 401) return { kind: "signed-out" };
  if (snap.status >= 400) return { kind: "failed", message: snap.data.error ?? "GitHub didn't answer." };
  const entry = await findFile(fetcher, target, snap.data);
  if (!entry) return { kind: "read", approvals: { approved: {} }, commit: snap.data.commit, sha: null };
  const file = await getJson<{ content?: string; error?: string }>(fetcher, "file", { repo: target.repo, sha: entry.sha });
  if (file.status >= 400 || typeof file.data.content !== "string") return { kind: "failed", message: file.data.error ?? "GitHub didn't answer." };
  return { kind: "read", approvals: parseApprovals(file.data.content), commit: snap.data.commit, sha: entry.sha };
}

/** Who is signed in to the editor on this address, if anyone. */
export async function signedInAs(fetcher: Fetcher = fetch): Promise<string | undefined> {
  const { data } = await getJson<{ user?: { login?: string } | null }>(fetcher, "session", {});
  return data.user?.login || undefined;
}

/** The approvals on the target branch now, when signed in (the board starts from the copy it was built with). */
export async function readApprovals(target: Target, fetcher: Fetcher = fetch): Promise<Approvals | undefined> {
  if (!await signedInAs(fetcher)) return undefined;
  const result = await read(fetcher, target);
  return result.kind === "read" ? result.approvals : undefined;
}

/**
 * Approves `id`: reads the file on the target branch, adds the mark and saves it as one commit through Save to GitHub.
 * A save that GitHub refuses because the file changed meanwhile (someone else approved) reads it again and retries once.
 */
export async function saveApproval(id: string, target: Target, fetcher: Fetcher = fetch, now = new Date()): Promise<SaveOutcome> {
  try {
    const login = await signedInAs(fetcher);
    if (!login) return { kind: "signed-out" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await read(fetcher, target);
      if (current.kind !== "read") return current;
      const next = withApproval(current.approvals, id, login, now);
      if (next === current.approvals) return { kind: "saved", approvals: next };
      const response = await fetcher(`/api/publish?${new URLSearchParams({ repo: target.repo })}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: target.branch, head: current.commit, files: [{ path: APPROVALS_PATH, baseSha: current.sha, content: serialiseApprovals(next) }] }),
      });
      if (response.status === 401) return { kind: "signed-out" };
      const data = await response.json().catch(() => ({})) as Partial<PublishResult> & { error?: string; conflicts?: unknown };
      if (response.status === 409 && Array.isArray(data.conflicts) && attempt === 0) continue;
      if (!response.ok) return { kind: "failed", message: data.error ?? "GitHub didn't save it." };
      return { kind: "saved", approvals: next };
    }
    return { kind: "failed", message: "The file kept changing on GitHub." };
  } catch {
    return { kind: "failed", message: "No connection." };
  }
}
