// Download unsaved changes: when this browser stops keeping agent edits (its storage is full or
// unavailable, src/agent-records.ts `agentStorageStatus`), the agent menu offers a .zip of the
// unsaved drafts this tab still holds, with each upload's bytes this browser still has. It only
// reads: no draft, upload or record changes, and nothing missing is claimed as included.
import { draftStore, type DraftScope, type SavedDraft } from "./drafts";
import { uploadBytes, uploadKey, type UploadBytes } from "./uploads";

/** One unsaved change, as the export lists it in changes.json and README.txt. */
export interface RecoveryEntry {
  path: string;
  change: "changed" | "new" | "moved" | "deleted" | "uploaded";
  movedFrom?: string;
  /**
   * `included`: under files/ in the export. `missing`: this browser no longer has its bytes.
   * `on-github`: its content is a repository file the draft only names. `deleted`: no file to keep.
   */
  status: "included" | "missing" | "on-github" | "deleted";
}
export interface RecoveryExport { zip: Uint8Array; name: string; entries: RecoveryEntry[] }

/** `files/<path>`, with no segment that leaves the folder. */
const inside = (path: string) => `files/${path.split("/").filter((part) => part && part !== "." && part !== "..").join("/")}`;

function readme(repository: string, branch: string, at: Date, entries: RecoveryEntry[]) {
  const count = entries.filter((entry) => entry.status === "included").length;
  const lines = [
    `Unsaved changes to ${repository} (branch ${branch}), downloaded ${at.toISOString()}.`,
    "",
    "This browser could not keep saving your work, so this is a copy of the unsaved changes the editor tab still had.",
    `The folder "files" holds ${count} file${count === 1 ? "" : "s"}, each as it is in your changes. changes.json lists every change.`,
  ];
  const left = entries.filter((entry) => entry.status !== "included");
  if (left.length) {
    lines.push("", "Not in the folder:");
    for (const entry of left) lines.push(`- ${entry.path}: ${entry.status === "missing" ? "this browser no longer has the uploaded file; upload it again"
      : entry.status === "deleted" ? "deleted in your changes" : `unchanged content of ${entry.movedFrom ?? entry.path} on GitHub`}`);
  }
  return `${lines.join("\n")}\n`;
}

/** The export of `drafts` (all of one workspace's): what they hold, upload bytes read from `bytes`. */
export async function buildRecoveryExport(input: { repository: string; scope: DraftScope; drafts: SavedDraft[]; bytes?: UploadBytes; now?: Date }): Promise<RecoveryExport> {
  const { scope } = input, at = input.now ?? new Date();
  const files: Record<string, string | Uint8Array> = {};
  const entries: RecoveryEntry[] = [];
  for (const draft of [...input.drafts].sort((a, b) => a.path.localeCompare(b.path))) {
    const change: RecoveryEntry["change"] = draft.deleted ? "deleted" : draft.upload ? "uploaded" : draft.movedFrom ? "moved" : draft.baseSha === null ? "new" : "changed";
    const entry: RecoveryEntry = { path: draft.path, change, ...(draft.movedFrom ? { movedFrom: draft.movedFrom } : {}), status: "included" };
    entries.push(entry);
    if (draft.deleted) { entry.status = "deleted"; continue; }
    if (!draft.opaque) { files[inside(draft.path)] = draft.content; continue; }
    // Bytes this browser keeps: an upload's, or an existing file's replaced ones.
    const read = async () => {
      const blob = draft.sourceSha && input.bytes ? await input.bytes.get(uploadKey(scope, draft.sourceSha)) : undefined;
      return blob && new Uint8Array(await blob.arrayBuffer());
    };
    // Unreadable bytes count as missing; the rest of the export goes on.
    const bytes = await read().catch(() => undefined);
    if (bytes) files[inside(draft.path)] = bytes;
    else entry.status = draft.upload || (draft.baseSha !== null && draft.sourceSha !== draft.baseSha) ? "missing" : "on-github";
  }
  files["changes.json"] = `${JSON.stringify({ repository: input.repository, branch: scope.branch, downloadedAt: at.toISOString(), changes: entries }, null, 2)}\n`;
  files["README.txt"] = readme(input.repository, scope.branch, at, entries);
  const { zipFiles } = await import("./zip");
  const name = `${input.repository.split("/").pop()?.replace(/[^A-Za-z0-9._-]+/g, "-") || "site"}-unsaved-changes.zip`;
  return { zip: zipFiles(files, at), name, entries };
}

/** Where the download reads and saves (the tab's draft store, upload bytes and a file save; tests inject them). */
interface DownloadPorts {
  drafts(scope: DraftScope): SavedDraft[];
  bytes(): UploadBytes | undefined;
  /** Loads the file save, which then runs at once (no await between the last check and it). */
  saver(): Promise<(zip: Uint8Array, name: string) => void>;
}
const browserPorts: DownloadPorts = {
  drafts: (scope) => draftStore().list(scope),
  bytes: () => { try { return uploadBytes(); } catch { return undefined; /* No upload storage: uploads are listed as missing. */ } },
  saver: async () => (await import("./site-download")).saveBytes,
};

/**
 * Downloads this tab's unsaved drafts of the open workspace; resolves to what the file holds, or
 * undefined (nothing downloaded) once `current` says the menu or workspace moved on meanwhile.
 */
export async function downloadUnsavedWork(input: { account: string; repository: { id: number; fullName: string; branch: string } },
  current: () => boolean = () => true, ports: DownloadPorts = browserPorts) {
  const scope: DraftScope = { account: input.account, repoId: input.repository.id, repo: input.repository.fullName, branch: input.repository.branch };
  const result = await buildRecoveryExport({ repository: input.repository.fullName, scope, drafts: ports.drafts(scope), bytes: ports.bytes() });
  const save = await ports.saver();
  if (!current()) return undefined;
  save(result.zip, result.name);
  return result;
}
