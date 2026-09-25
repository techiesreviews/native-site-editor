import type {
  PublishRequest,
  PublishResult,
  Repository,
  TreeEntry,
} from "../shared/types";
import { GitHub, HttpError } from "./github";

const encoder = new TextEncoder();
const validSha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
/** Paths one commit may change: edits, new files, and both sides of every rename. */
export const MAX_PUBLISH_FILES = 100;
const invalidPath = (path: unknown) =>
  typeof path !== "string" ||
  path.length > 1024 ||
  path
    .split("/")
    .some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.toLowerCase() === ".git",
    ) ||
  /[\\\u0000-\u001f\u007f]/.test(path);
export function validatePublish(value: unknown): PublishRequest {
  const data = value as Partial<PublishRequest> | null;
  if (
    !data ||
    typeof data.branch !== "string" ||
    !data.branch ||
    data.branch.length > 255 ||
    !Array.isArray(data.files) ||
    data.files.length < 1 ||
    data.files.length > MAX_PUBLISH_FILES
  )
    throw new HttpError(
      400,
      `Choose a branch and between 1 and ${MAX_PUBLISH_FILES} changed files.`,
    );
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of data.files) {
    if (
      !file ||
      invalidPath(file.path) ||
      paths.has(file.path) ||
      (file.baseSha !== null && !validSha(file.baseSha)) ||
      typeof file.content !== "string" ||
      file.content.includes("\0") ||
      (file.delete !== undefined && file.delete !== true) ||
      // A deletion removes the blob it began from, and sends nothing.
      (file.delete && (file.baseSha === null || file.content !== "" || file.sha !== undefined)) ||
      // A new path may be an existing blob instead of content.
      (file.sha !== undefined && (!validSha(file.sha) || file.baseSha !== null || file.content !== "")) ||
      (file.mode !== undefined && file.mode !== "100644" && file.mode !== "100755") ||
      (file.movedFrom !== undefined && invalidPath(file.movedFrom))
    )
      throw new HttpError(
        400,
        "Invalid or duplicate file. Refresh the repository and try again.",
      );
    if (file.path.startsWith(".github/workflows/"))
      throw new HttpError(
        403,
        "Edit GitHub Actions workflows on GitHub. Workflow write access is not enabled in this editor.",
      );
    paths.add(file.path);
    const size = encoder.encode(file.content).length;
    bytes += size;
    if (size > 128 * 1024 || bytes > 1024 * 1024)
      throw new HttpError(
        413,
        "Publish supports 128 KB per file and 1 MB per batch.",
      );
  }
  return data as PublishRequest;
}

export async function blobSha(content: string): Promise<string> {
  const body = encoder.encode(content);
  const header = encoder.encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** One commit for selected existing files. Never force a branch or overwrite a changed blob. */
export async function publish(
  github: GitHub,
  repo: Repository,
  input: unknown,
): Promise<PublishResult> {
  const data = validatePublish(input);
  const base = github.base(repo);
  const ref = await github.get<{ commit: { sha: string } }>(
    `${base}/branches/${encodeURIComponent(data.branch)}`,
  );
  const head = ref.commit.sha;
  const commit = await github.get<{ tree: { sha: string } }>(
    `${base}/git/commits/${head}`,
  );
  const trees = new Map<string, TreeEntry[]>();
  const readTree = async (sha: string) => {
    let entries = trees.get(sha);
    if (!entries) {
      entries = await github.tree(repo, sha);
      trees.set(sha, entries);
    }
    return entries;
  };
  async function lookup(path: string) {
    const parts = path.split("/");
    let sha = commit.tree.sha;
    for (let index = 0; index < parts.length; index++) {
      const entry = (await readTree(sha)).find(
        (entry) => entry.path === parts[index],
      );
      if (!entry) return undefined;
      if (index === parts.length - 1) return entry;
      if (entry.type !== "tree")
        throw new HttpError(
          409,
          `Cannot create a file beneath ${parts.slice(0, index + 1).join("/")}. Its parent is not a directory.`,
        );
      sha = entry.sha;
    }
  }
  type Change = { path: string; mode: string; type: "blob" } & (
    { content: string } | { sha: string | null }
  );
  const changes: Change[] = [];
  const files: PublishResult["files"] = [];
  const deleted: string[] = [];
  const conflicts: string[] = [];
  // Edits of files GitHub no longer has: settled in the editor, not by a refresh.
  const gone: string[] = [];
  const isFile = (entry: TreeEntry) =>
    entry.type === "blob" && ["100644", "100755"].includes(entry.mode);
  for (const file of data.files) {
    const existing = await lookup(file.path);
    if (file.delete) {
      // Already gone from the branch: nothing to remove.
      if (!existing) deleted.push(file.path);
      // Removing a file that changed since the draft began would lose that change.
      else if (!isFile(existing) || existing.sha !== file.baseSha) conflicts.push(file.path);
      else {
        changes.push({ path: file.path, mode: existing.mode, type: "blob", sha: null });
        deleted.push(file.path);
      }
      continue;
    }
    const sha = file.sha ?? (await blobSha(file.content));
    files.push({ path: file.path, sha });
    const body = file.sha ? { sha: file.sha } : { content: file.content };
    if (!existing && file.baseSha === null) {
      changes.push({ path: file.path, mode: file.mode ?? "100644", type: "blob", ...body });
    } else if (!existing) {
      gone.push(file.path);
    } else if (
      !isFile(existing) ||
      (existing.sha !== file.baseSha && existing.sha !== sha)
    ) {
      conflicts.push(file.path);
    } else if (existing.sha !== sha) {
      changes.push({ path: file.path, mode: existing.mode, type: "blob", ...body });
    }
  }
  if (conflicts.length || gone.length)
    throw new HttpError(
      409,
      [
        conflicts.length ? `GitHub changed these files: ${conflicts.join(", ")}. Refresh and review the latest version before publishing.` : "",
        gone.length ? `GitHub deleted these files since your drafts began: ${gone.join(", ")}. Discard those drafts or keep them as new files in Save to GitHub.` : "",
        "Your drafts are kept.",
      ].filter(Boolean).join(" "),
      [...conflicts, ...gone],
    );
  let result = head;
  if (changes.length) {
    const tree = await github.write<{ sha: string }>(
      `${base}/git/trees`,
      "POST",
      { base_tree: commit.tree.sha, tree: changes },
    );
    const created = await github.write<{ sha: string }>(
      `${base}/git/commits`,
      "POST",
      {
        message: `${commitSummary(data.files, changes)} with Native Site Editor`,
        tree: tree.sha,
        parents: [head],
      },
    );
    // If another writer advanced the branch, this is no longer a fast-forward.
    await github.write(
      `${base}/git/refs/heads/${encodeURIComponent(data.branch)}`,
      "PATCH",
      { sha: created.sha, force: false },
    );
    result = created.sha;
  }
  return {
    commit: result,
    branch: data.branch,
    url: `https://github.com/${repo.full_name}/commit/${result}`,
    files,
    deleted,
    unchanged: changes.length === 0,
  };
}

/**
 * What the commit does, in words: one change by its path ("Rename a to b",
 * "Delete a", "Update a"), else the counts ("Rename 3 files and delete 1").
 */
export function commitSummary(
  requested: PublishRequest["files"],
  changes: { path: string; sha?: string | null }[],
): string {
  const removed = new Set(changes.filter((change) => "sha" in change && change.sha === null).map((change) => change.path));
  const written = changes.filter((change) => !removed.has(change.path));
  const renames = written.flatMap((change) => {
    const from = requested.find((file) => file.path === change.path)?.movedFrom;
    return from && removed.has(from) ? [{ from, to: change.path }] : [];
  });
  const renamedFrom = new Set(renames.map((rename) => rename.from));
  const renamedTo = new Set(renames.map((rename) => rename.to));
  const updates = written.filter((change) => !renamedTo.has(change.path));
  const deletes = [...removed].filter((path) => !renamedFrom.has(path));
  if (renames.length + updates.length + deletes.length === 1) {
    if (renames.length) return `Rename ${renames[0].from} to ${renames[0].to}`;
    if (deletes.length) return `Delete ${deletes[0]}`;
    return `Update ${updates[0].path}`;
  }
  const count = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;
  const parts = [
    updates.length ? `update ${count(updates.length)}` : "",
    renames.length ? `rename ${updates.length ? renames.length : count(renames.length)}` : "",
    deletes.length ? `delete ${updates.length || renames.length ? deletes.length : count(deletes.length)}` : "",
  ].filter(Boolean);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "Update files";
  return text[0].toUpperCase() + text.slice(1);
}
