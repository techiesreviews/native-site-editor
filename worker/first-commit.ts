// A new site's first commit: Create site makes the repository and, in the
// same request, commits the chosen starting point so the site exists.
//
// GitHub's git data API (blobs, trees, commits) refuses a repository with no
// commits, but its contents API creates the first commit, and the branch,
// from one file. So the first file goes through the contents API; the rest
// follow as a tree and a commit on top (images as blobs).
import { blankSiteFiles, siteNameFromRepository, type StartingPoint } from "../shared/starting-point";
import type { Repository, StarterFile } from "../shared/types";
import { base64Bytes } from "./blobs";
import { GitHub, HttpError } from "./github";
import { starterFiles } from "./starter";

const encoder = new TextEncoder();
/** One git/trees request stays small. */
const TREE_STEP_ENTRIES = 100;

/** A first commit that stopped part way: which files GitHub has already got (the first one goes in on its own). */
export class StartingPointError extends HttpError {
  constructor(
    status: number,
    message: string,
    /** Paths already committed to the repository. */
    public committed: string[],
    /** Paths still to be added. Empty when the files were never built. */
    public missing: string[],
  ) {
    super(status, message);
  }
}

export interface FirstCommit {
  sha: string;
  branch: string;
  url: string;
  files: number;
}

/** The files of a starting point for a site named `siteName`. */
export async function startingPointFiles(point: StartingPoint, siteName: string, fetcher: typeof fetch = fetch): Promise<StarterFile[]> {
  if (point === "starter") return starterFiles(siteName, fetcher);
  return blankSiteFiles(siteName).map((file) => ({ path: file.path, content: file.content }));
}

/** Text first (a text file of the home page by preference), because the contents API call carries text for the fake and real tree alike. */
function firstFile(files: StarterFile[]): StarterFile {
  return files.find((file) => file.path === "index.html") ?? files.find((file) => "content" in file) ?? files[0];
}

const bytesBase64 = (file: StarterFile) => ("base64" in file ? file.base64 : base64Bytes(encoder.encode(file.content)));

/**
 * Commits `files` to the empty repository `repo`. `retries` are the waits
 * before trying the first file again when GitHub has not finished making the
 * repository (it can answer 404 for a moment).
 */
export async function commitStartingPoint(
  github: GitHub,
  repo: Repository,
  files: StarterFile[],
  message: string,
  retries: number[] = [500, 1500],
): Promise<FirstCommit> {
  if (!files.length) throw new HttpError(502, "There is nothing to add.");
  const branch = repo.default_branch || "main";
  const base = github.base(repo);
  const first = firstFile(files);
  const put = () =>
    github.write<{ commit?: { sha?: string } }>(
      `${base}/contents/${first.path.split("/").map(encodeURIComponent).join("/")}`,
      "PUT",
      { message, content: bytesBase64(first), branch },
    );
  let created: { commit?: { sha?: string } };
  for (let attempt = 0; ; attempt++) {
    try {
      created = await put();
      break;
    } catch (error) {
      if (attempt >= retries.length || !(error instanceof HttpError) || error.status !== 404) throw error;
      await new Promise((resolve) => setTimeout(resolve, retries[attempt]));
    }
  }
  let head = created.commit?.sha;
  if (!head) throw new HttpError(502, "GitHub did not say which commit it made.");
  const rest = files.filter((file) => file !== first);
  try {
    head = await addRest(github, repo, base, branch, head, rest, message);
  } catch (error) {
    const reason = error instanceof HttpError ? error.message : "GitHub could not add the rest of the files.";
    throw new StartingPointError(error instanceof HttpError ? error.status : 502, reason, [first.path], rest.map((file) => file.path));
  }
  return { sha: head, branch, url: `https://github.com/${repo.full_name}/commit/${head}`, files: files.length };
}

/** The tree and commit that add `rest` on top of `head`; the new head. */
async function addRest(github: GitHub, repo: Repository, base: string, branch: string, head: string, rest: StarterFile[], message: string): Promise<string> {
  if (rest.length) {
    const entries: { path: string; mode: "100644"; type: "blob"; content?: string; sha?: string }[] = [];
    for (const file of rest) {
      if ("base64" in file) {
        const blob = await github.write<{ sha: string }>(`${base}/git/blobs`, "POST", { content: file.base64, encoding: "base64" });
        entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      } else entries.push({ path: file.path, mode: "100644", type: "blob", content: file.content });
    }
    const commit = await github.get<{ tree: { sha: string } }>(`${base}/git/commits/${head}`);
    let tree = commit.tree.sha;
    for (let index = 0; index < entries.length; index += TREE_STEP_ENTRIES)
      tree = (
        await github.write<{ sha: string }>(`${base}/git/trees`, "POST", {
          base_tree: tree,
          tree: entries.slice(index, index + TREE_STEP_ENTRIES),
        })
      ).sha;
    const next = await github.write<{ sha: string }>(`${base}/git/commits`, "POST", { message, tree, parents: [head] });
    await github.write(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, "PATCH", { sha: next.sha, force: false });
    head = next.sha;
  }
  return head;
}

/** The site name a starting point is prepared with: the one asked for, else made from the repository name. */
export function startingSiteName(requested: unknown, repositoryName: string): string {
  const name = typeof requested === "string" ? requested.trim().slice(0, 100) : "";
  return name || siteNameFromRepository(repositoryName);
}
