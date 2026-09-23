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
export function validatePublish(value: unknown): PublishRequest {
  const data = value as Partial<PublishRequest> | null;
  if (
    !data ||
    typeof data.branch !== "string" ||
    !data.branch ||
    data.branch.length > 255 ||
    !Array.isArray(data.files) ||
    data.files.length < 1 ||
    data.files.length > 20
  )
    throw new HttpError(
      400,
      "Choose a branch and between 1 and 20 changed files.",
    );
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of data.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      file.path.length > 1024 ||
      file.path
        .split("/")
        .some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            part.toLowerCase() === ".git",
        ) ||
      /[\\\u0000-\u001f\u007f]/.test(file.path) ||
      paths.has(file.path) ||
      (file.baseSha !== null && !validSha(file.baseSha)) ||
      typeof file.content !== "string" ||
      file.content.includes("\0")
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
  const changes: {
    path: string;
    mode: string;
    type: "blob";
    content: string;
  }[] = [];
  const files: PublishResult["files"] = [];
  const conflicts: string[] = [];
  for (const file of data.files) {
    const existing = await lookup(file.path);
    const sha = await blobSha(file.content);
    files.push({ path: file.path, sha });
    if (!existing && file.baseSha === null) {
      changes.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        content: file.content,
      });
    } else if (
      !existing ||
      existing.type !== "blob" ||
      !["100644", "100755"].includes(existing.mode) ||
      (existing.sha !== file.baseSha && existing.sha !== sha)
    ) {
      conflicts.push(file.path);
    } else if (existing.sha !== sha) {
      changes.push({
        path: file.path,
        mode: existing.mode,
        type: "blob",
        content: file.content,
      });
    }
  }
  if (conflicts.length)
    throw new HttpError(
      409,
      `GitHub changed these files: ${conflicts.join(", ")}. Refresh and review the latest version before publishing. Your drafts are kept.`,
      conflicts,
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
        message: `Update ${changes.length === 1 ? changes[0].path : `${changes.length} files`} with Astro Site Editor`,
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
    unchanged: changes.length === 0,
  };
}
