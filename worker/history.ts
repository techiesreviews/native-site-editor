import type {
  HistoryPage,
  Repository,
  RestoreRequest,
  RestoreResult,
  TreeEntry,
} from "../shared/types";
import { GitHub, HttpError } from "./github";

const pageSize = 20;
const maxPage = 50;
const validSha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);

function validBranch(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255;
}

function validPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\\u0000-\u001f\u007f]/.test(value) &&
    !value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
  );
}

function requirePath(value: unknown): string {
  if (!validPath(value)) throw new HttpError(400, "Choose a valid file.");
  return value;
}

function requireRestorablePath(value: unknown): string {
  const path = requirePath(value);
  if (path.startsWith(".github/workflows/"))
    throw new HttpError(
      403,
      "Restore GitHub Actions workflows on GitHub. Workflow write access is not enabled in this editor.",
    );
  return path;
}

export async function history(
  github: GitHub,
  repo: Repository,
  input: { branch?: unknown; path?: unknown; head?: unknown; page?: unknown },
): Promise<HistoryPage> {
  if (!validBranch(input.branch)) throw new HttpError(400, "Choose a branch.");
  const path = requirePath(input.path);
  const page = input.page === undefined ? 1 : Number(input.page);
  if (!Number.isInteger(page) || page < 1 || page > maxPage)
    throw new HttpError(400, `History pages must be between 1 and ${maxPage}.`);
  if (input.head !== undefined && !validSha(input.head))
    throw new HttpError(
      400,
      "Invalid history revision. Refresh and try again.",
    );

  const base = github.base(repo);
  const head =
    input.head ??
    (
      await github.get<{ commit: { sha: string } }>(
        `${base}/branches/${encodeURIComponent(input.branch)}`,
      )
    ).commit.sha;
  if (!validSha(head))
    throw new HttpError(502, "GitHub returned an invalid revision.");
  const query = new URLSearchParams({
    sha: head,
    path,
    per_page: String(pageSize),
    page: String(page),
  });
  const rows = await github.get<
    {
      sha: string;
      html_url: string;
      author: { login?: string } | null;
      commit: {
        message: string;
        author: { name: string; date: string } | null;
        committer?: { name: string; date: string } | null;
      };
    }[]
  >(`${base}/commits?${query}`, 1024 * 1024);
  if (!Array.isArray(rows))
    throw new HttpError(502, "GitHub returned an unexpected history.");
  return {
    head,
    commits: rows.slice(0, pageSize).map((row) => ({
      sha: row.sha,
      message: row.commit.message.split("\n", 1)[0],
      author:
        row.author?.login ??
        row.commit.author?.name ??
        row.commit.committer?.name ??
        "Unknown",
      date: row.commit.author?.date ?? row.commit.committer?.date ?? "",
      url: row.html_url,
    })),
    nextPage: rows.length === pageSize && page < maxPage ? page + 1 : null,
  };
}

function validateRestore(value: unknown): RestoreRequest {
  const data = value as Partial<RestoreRequest> | null;
  if (
    !data ||
    !validBranch(data.branch) ||
    !validSha(data.target) ||
    !validSha(data.expectedHead)
  )
    throw new HttpError(400, "Choose a valid file revision to restore.");
  requireRestorablePath(data.path);
  return data as RestoreRequest;
}

async function fileAt(
  github: GitHub,
  repo: Repository,
  tree: string,
  path: string,
): Promise<TreeEntry | undefined> {
  const parts = path.split("/");
  let treeSha = tree;
  for (let index = 0; index < parts.length; index++) {
    const entry = (await github.tree(repo, treeSha)).find(
      (candidate) => candidate.path === parts[index],
    );
    if (!entry) return undefined;
    if (index === parts.length - 1) return entry;
    if (entry.type !== "tree") return undefined;
    treeSha = entry.sha;
  }
}

export async function restore(
  github: GitHub,
  repo: Repository,
  input: unknown,
): Promise<RestoreResult> {
  const data = validateRestore(input);
  const base = github.base(repo);
  const branch = await github.get<{ commit: { sha: string } }>(
    `${base}/branches/${encodeURIComponent(data.branch)}`,
  );
  const head = branch.commit.sha;
  if (head !== data.expectedHead)
    throw new HttpError(
      409,
      "The branch changed. Refresh history before restoring.",
    );
  if (data.target === head)
    return {
      commit: head,
      branch: data.branch,
      url: `https://github.com/${repo.full_name}/commit/${head}`,
      unchanged: true,
    };

  const comparison = await github.get<{ status: string }>(
    `${base}/compare/${data.target}...${head}`,
  );
  if (comparison.status !== "ahead" && comparison.status !== "identical")
    throw new HttpError(
      400,
      "Choose a revision from this branch's current history.",
    );

  const [currentCommit, targetCommit] = await Promise.all([
    github.get<{ tree: { sha: string } }>(`${base}/git/commits/${head}`),
    github.get<{ tree: { sha: string } }>(`${base}/git/commits/${data.target}`),
  ]);
  const [currentFile, targetFile] = await Promise.all([
    fileAt(github, repo, currentCommit.tree.sha, data.path),
    fileAt(github, repo, targetCommit.tree.sha, data.path),
  ]);
  if (
    !targetFile ||
    targetFile.type !== "blob" ||
    !["100644", "100755"].includes(targetFile.mode)
  )
    throw new HttpError(
      409,
      "This file does not exist as a regular file at that revision.",
    );
  if (
    !currentFile ||
    currentFile.type !== "blob" ||
    !["100644", "100755"].includes(currentFile.mode)
  )
    throw new HttpError(
      409,
      "The current file changed or no longer exists. Refresh before restoring.",
    );
  if (
    currentFile.sha === targetFile.sha &&
    currentFile.mode === targetFile.mode
  )
    return {
      commit: head,
      branch: data.branch,
      url: `https://github.com/${repo.full_name}/commit/${head}`,
      unchanged: true,
    };

  const tree = await github.write<{ sha: string }>(
    `${base}/git/trees`,
    "POST",
    {
      base_tree: currentCommit.tree.sha,
      tree: [
        {
          path: data.path,
          mode: targetFile.mode,
          type: "blob",
          sha: targetFile.sha,
        },
      ],
    },
  );
  const created = await github.write<{ sha: string }>(
    `${base}/git/commits`,
    "POST",
    {
      message: `Restore ${data.path} from ${data.target.slice(0, 7)} with Astro Site Editor`,
      tree: tree.sha,
      parents: [head],
    },
  );
  await github.write(
    `${base}/git/refs/heads/${encodeURIComponent(data.branch)}`,
    "PATCH",
    { sha: created.sha, force: false },
  );
  return {
    commit: created.sha,
    branch: data.branch,
    url: `https://github.com/${repo.full_name}/commit/${created.sha}`,
    unchanged: false,
  };
}
