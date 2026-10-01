import type {
  PublishRequest,
  PublishResult,
  Repository,
  TreeEntry,
} from "../shared/types";
import { EMPTY_COMMIT } from "../shared/types";
import { GitHub, HttpError } from "./github";
import { base64Bytes } from "./blobs";
import { touchesGithubConfig } from "../shared/protected-paths";

const encoder = new TextEncoder();
const validSha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
/** Paths one commit may change: edits, new files, and both sides of every rename. */
export const MAX_PUBLISH_FILES = 2000;
/** Text one commit may carry, per file and in all; beyond what browser drafts can hold. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_BYTES = 24 * 1024 * 1024;
/** The publish request, unpacked: the files' text and their JSON around it. */
export const MAX_PUBLISH_REQUEST_BYTES = 32 * 1024 * 1024;
/** One git/trees request stays small; a larger commit's tree is built in steps. */
const TREE_STEP_ENTRIES = 200;
const TREE_STEP_BYTES = 4 * 1024 * 1024;
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
    (data.head !== undefined && !validSha(data.head)) ||
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
    // Workflow files (the deploy pipeline of Publish is one) only with the
    // user's confirmation, checked after the loop. Without the App's
    // Workflows permission GitHub refuses the ref update, which github.ts
    // reports as WORKFLOWS_PERMISSION_MESSAGE.
    paths.add(file.path);
    const size = encoder.encode(file.content).length;
    bytes += size;
    if (size > MAX_FILE_BYTES || bytes > MAX_BATCH_BYTES)
      throw new HttpError(
        413,
        "Publish supports 4 MB per file and 24 MB per commit.",
      );
  }
  for (const flag of [data.allowGithubConfig, data.allowWorkflows])
    if (flag !== undefined && typeof flag !== "boolean") throw new HttpError(400, "Invalid request.");
  const workflows = [
    ...new Set(data.files.flatMap((file) => [file.path, ...(file.movedFrom ? [file.movedFrom] : [])]).filter(touchesGithubConfig)),
  ];
  if (workflows.length && !confirmedGithubConfig(data))
    throw new HttpError(403, githubConfigMessage(workflows));
  return data as PublishRequest;
}

/** The user confirmed a save that changes `.github` (`allowGithubConfig`; `allowWorkflows` is the older name). */
const confirmedGithubConfig = (data: Pick<PublishRequest, "allowGithubConfig" | "allowWorkflows">) => data.allowGithubConfig === true || data.allowWorkflows === true;
const githubConfigMessage = (paths: string[]) =>
  `Saving changes to .github (${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ", …" : ""}) needs your confirmation, because GitHub Actions workflows and actions run with the repository's secrets. Review them in the Save panel and confirm, or leave them out.`;

const retryable = () =>
  new HttpError(503, "GitHub could not be asked whether this save brings in changes to .github. Try again in a moment; your drafts are kept.");

type GithubEntries = Map<string, string>;

/**
 * Every entry of a commit's root tree that counts as `.github` (any case: `.GitHub` too), by its exact name,
 * with its type, mode and SHA. `undefined` commit: no entries (a repository with no commits). Any failure
 * but a session or rate limit is a retryable 503: unknown never means absent.
 */
async function githubEntriesAt(github: GitHub, repo: Repository, commit: string | undefined): Promise<GithubEntries> {
  const entries: GithubEntries = new Map();
  if (!commit) return entries;
  try {
    const base = github.base(repo);
    const { tree } = await github.get<{ tree: { sha: string } }>(`${base}/git/commits/${commit}`);
    const root = await github.get<{ tree: { path: string; sha: string; type: string; mode?: string }[]; truncated?: boolean }>(`${base}/git/trees/${tree.sha}`);
    if (root.truncated) throw new Error("truncated");
    for (const entry of root.tree) if (touchesGithubConfig(entry.path)) entries.set(entry.path, `${entry.type} ${entry.mode ?? ""} ${entry.sha}`);
    return entries;
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 429)) throw error;
    throw retryable();
  }
}

/** The names whose entry was added, removed or changed between two sets. */
function changedEntries(before: GithubEntries, after: GithubEntries): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name));
}

/** The branch's head by a direct read of its ref; `undefined` when GitHub does not say. */
async function readRef(github: GitHub, repo: Repository, branch: string): Promise<string | undefined> {
  const ref = await github.exchange(`${github.base(repo)}/git/ref/heads/${encodeURIComponent(branch)}`, "GET").catch((error) => {
    if (error instanceof HttpError && (error.status === 401 || error.status === 429)) throw error;
    return undefined;
  });
  const sha = ref?.ok ? ref.data?.object?.sha : undefined;
  return typeof sha === "string" && /^[a-f0-9]{40}$/.test(sha) ? sha : undefined;
}

/**
 * The branch's head this save is validated against, and, for a head the editor names that the branch does not
 * name (ahead of it, as a lagging read or as any commit descending from it, such as one from a fork; or a
 * branch GitHub does not list yet), the check that what it holds under `.github` is what the branch has. Every
 * root entry that counts as `.github` (any case) is compared by exact name, type, mode and SHA: any added,
 * removed or changed entry needs the user's confirmation (`confirmed` skips only that refusal). When the
 * branch's head cannot be established (not listed, ref unreadable) the save is refused as retryable (503):
 * unknown never means absent. The one exception is a repository GitHub says has no branches at all, whose
 * base is taken to have no `.github`. `undefined` is that empty base.
 */
async function validatedBase(
  github: GitHub,
  repo: Repository,
  branch: string,
  resolved: { sha: string; named?: string; unlisted?: true },
  supplied: string | undefined,
  confirmed: boolean,
): Promise<string | undefined> {
  if (!supplied || !(resolved.named || resolved.unlisted)) return resolved.sha;
  let actual = resolved.named;
  if (!actual) {
    actual = await readRef(github, repo, branch);
    if (!actual) {
      const branches = await github.branches(repo).catch((error) => {
        if (error instanceof HttpError && (error.status === 401 || error.status === 429)) throw error;
        throw retryable();
      });
      if (branches.length) throw retryable();
    }
  }
  if (actual === supplied) return actual;
  if (!confirmed) {
    const [before, after] = await Promise.all([githubEntriesAt(github, repo, actual), githubEntriesAt(github, repo, supplied)]);
    const changed = changedEntries(before, after);
    if (changed.length) throw new HttpError(403, githubConfigMessage(changed.map((name) => `${name} (in the commit this save builds on)`)));
  }
  return actual;
}

/**
 * Immediately before the branch is moved: GitHub's REST ref update has no compare-and-swap, so re-read the ref.
 * If the branch is no longer where the save was validated, and what it holds under `.github` differs from what
 * was validated, or the save would not be a fast-forward of it, refuse with 409. (A write between this read
 * and the update remains possible; see docs/publishing-hosts.md, Known limits.)
 */
async function refuseMovedBranch(github: GitHub, repo: Repository, branch: string, validated: string | undefined, created: string, unlisted: boolean) {
  const current = await readRef(github, repo, branch);
  // Only a repository that had no commit at all when the save was checked may still have no readable
  // branch (a first save's lag): nothing under `.github` existed for a later write to undo. Anywhere
  // else an unreadable branch is refused, since it may have moved since the check.
  if (!current && unlisted && !validated) return;
  if (!current) throw retryable();
  if (current === validated) return;
  const moved = new HttpError(409, "The branch changed on GitHub while saving, so nothing was saved. Refresh and review the latest version; your drafts are kept.");
  const [was, now] = await Promise.all([githubEntriesAt(github, repo, validated), githubEntriesAt(github, repo, current)]);
  if (changedEntries(was, now).length) throw moved;
  const compare = await github
    .get<{ status?: string }>(`${github.base(repo)}/compare/${current}...${created}?per_page=1`)
    .catch(() => undefined);
  if (compare?.status !== "ahead" && compare?.status !== "identical") throw moved;
}

/** The git blob SHA of text (as UTF-8) or of bytes (an uploaded file). */
export async function blobSha(content: string | Uint8Array): Promise<string> {
  const body = typeof content === "string" ? encoder.encode(content) : content;
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
  if (data.head === EMPTY_COMMIT) return startRepository(github, repo, data);
  const base = github.base(repo);
  // The head the editor saw (its last save, say) is trusted over a lagging read.
  const resolved = await github.head(repo, data.branch, data.head);
  const head = resolved.sha;
  const validated = await validatedBase(github, repo, data.branch, resolved, data.head, confirmedGithubConfig(data));
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
  // The whole tree in one listing, when GitHub gives it completely: a commit
  // touching many folders then stays within the Worker's subrequests.
  const whole = await github.recursiveTree(repo, commit.tree.sha);
  const listed = whole && new Map(whole.map((entry) => [entry.path, entry]));
  async function lookup(path: string) {
    const parts = path.split("/");
    if (listed) {
      for (let index = 1; index < parts.length; index++) {
        const parent = listed.get(parts.slice(0, index).join("/"));
        if (!parent) return undefined;
        if (parent.type !== "tree")
          throw new HttpError(
            409,
            `Cannot create a file beneath ${parts.slice(0, index).join("/")}. Its parent is not a directory.`,
          );
      }
      return listed.get(path);
    }
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
      gone,
    );
  let result = head;
  if (changes.length) {
    // Each step's tree is the next one's base, so the commit still has one tree.
    let tree = commit.tree.sha;
    for (const step of treeSteps(changes)) {
      tree = (await github.write<{ sha: string }>(
        `${base}/git/trees`,
        "POST",
        { base_tree: tree, tree: step },
      )).sha;
    }
    const created = await github.write<{ sha: string }>(
      `${base}/git/commits`,
      "POST",
      {
        message: `${commitSummary(data.files, changes)} with Native Site Editor`,
        tree,
        parents: [head],
      },
    );
    await refuseMovedBranch(github, repo, data.branch, validated, created.sha, Boolean(resolved.unlisted));
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
 * The first save to an empty repository (the editor showed it at
 * EMPTY_COMMIT). GitHub's git data API (blobs, trees, commits, refs) refuses
 * a repository with no commits, but its contents API creates the first
 * commit, and the branch, from one file. So the first save is one new text
 * file; the editor sends the rest of its drafts as a second save on top
 * (src/components/publish-menu.ts).
 */
async function startRepository(github: GitHub, repo: Repository, data: PublishRequest): Promise<PublishResult> {
  const branches = await github.branches(repo);
  if (branches.length)
    throw new HttpError(409, "This repository has commits on GitHub now. Refresh to load them; your drafts are kept.");
  const [file] = data.files;
  if (data.files.length !== 1 || file.baseSha !== null || file.delete || file.sha !== undefined)
    throw new HttpError(400, "The first save to an empty repository is one new text file. Refresh and try again.");
  const created = await github.write<{ content?: { sha?: string }; commit?: { sha?: string } }>(
    `${github.base(repo)}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`,
    "PUT",
    {
      message: `Add ${file.path} with Native Site Editor`,
      content: base64Bytes(encoder.encode(file.content)),
      // An empty repository's first commit makes its default branch.
      ...(data.branch !== repo.default_branch ? { branch: data.branch } : {}),
    },
  );
  const commit = created.commit?.sha;
  if (!commit || !validSha(commit)) throw new HttpError(502, "GitHub did not say which commit it made. Refresh to see it.");
  return {
    commit,
    branch: data.branch,
    url: `https://github.com/${repo.full_name}/commit/${commit}`,
    files: [{ path: file.path, sha: created.content?.sha ?? (await blobSha(file.content)) }],
    deleted: [],
    unchanged: false,
  };
}

/** Changes split into git/trees requests of at most TREE_STEP_ENTRIES entries and TREE_STEP_BYTES of text. */
export function treeSteps<T extends { content: string } | { sha: string | null }>(changes: T[]): T[][] {
  const steps: T[][] = [];
  let step: T[] = [], bytes = 0;
  for (const change of changes) {
    const size = "content" in change ? encoder.encode(change.content).length : 0;
    if (step.length && (step.length >= TREE_STEP_ENTRIES || bytes + size > TREE_STEP_BYTES)) {
      steps.push(step);
      step = []; bytes = 0;
    }
    step.push(change);
    bytes += size;
  }
  if (step.length) steps.push(step);
  return steps;
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
