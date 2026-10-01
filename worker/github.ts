import type {
  CreateRepositoryRequest,
  Directory,
  Repository,
  Snapshot,
  TreeEntry,
} from "../shared/types";
import { EMPTY_COMMIT, MAX_BATCH_FILES } from "../shared/types";
import { repositoryNameProblem } from "../shared/starting-point";
import { ObjectCache } from "./blob-cache";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public conflicts?: string[],
    /** Of `conflicts`, the paths GitHub deleted (the rest it changed). */
    public gone?: string[],
  ) {
    super(message);
  }
}

const segment = encodeURIComponent;
const apiRoot = "https://api.github.com";
const maxPages = 50;
const maxFileBytes = 1024 * 1024;
const maxAssetBytes = 2 * 1024 * 1024;
const batchConcurrency = 8;

// Selected-repository listings are remembered briefly per access token so the
// editor's burst of requests after sign-in (branches, snapshot, files) does not
// pay for two GitHub round trips each. Entries are scoped to the fetch
// implementation, so tests and fakes with their own fetcher never share state.
// Callers opt in with `maxAge`; the default rechecks membership every request.
interface RepositoryListing {
  fetchedAt: number;
  repos: Promise<Repository[]>;
}
const listings = new WeakMap<typeof fetch, Map<string, RepositoryListing>>();
const maxListings = 500;

export async function boundedJson(
  response: Response,
  limit = 8 * 1024 * 1024,
): Promise<any> {
  if (!response.body)
    throw new HttpError(502, "GitHub returned an empty response. Try again.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(
          413,
          "This response is too large to display. Open a smaller directory or file.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(
      502,
      "GitHub returned an unreadable response. Try again.",
    );
  }
}

/** A blob's text read by `prefetchTexts`, kept in memory only. */
const textKey = (repo: Repository, sha: string) => `${repo.id}/text/${sha}`;

interface GitBlob {
  size: number;
  encoding: string;
  content: string;
}

/**
 * GitHub's answer when it is limiting this account's requests: the hourly
 * budget spent (`x-ratelimit-remaining: 0`), or a secondary (burst) limit,
 * which comes as a 403 or 429 with `retry-after` or only a message saying so.
 */
function limitedError(seconds = 0) {
  const wait = seconds > 90 ? `about ${Math.ceil(seconds / 60)} minutes` : seconds > 0 ? "a minute" : "a few minutes";
  return new HttpError(
    429,
    `GitHub is limiting requests from your account for now. Try again in ${wait}; your drafts are kept.`,
  );
}

/** Blobs asked in one GraphQL query by `prefetchTexts`. */
const textsPerQuery = 100;

async function rateLimit(response: Response): Promise<HttpError | undefined> {
  if (response.status !== 403 && response.status !== 429) return undefined;
  let limited =
    response.status === 429 ||
    response.headers.get("x-ratelimit-remaining") === "0" ||
    response.headers.has("retry-after");
  if (!limited) {
    const body = await response.text().catch(() => "");
    limited = /rate limit/i.test(body.slice(0, 2000));
  }
  if (!limited) return undefined;
  const now = Math.floor(Date.now() / 1000);
  const retry = Number(response.headers.get("retry-after"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  return limitedError(retry > 0 ? retry : reset > now ? reset - now : 0);
}

export class GitHub {
  private objects: ObjectCache;
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {
    this.objects = new ObjectCache(fetcher);
  }

  async get<T>(path: string, limit?: number, fresh = false): Promise<T> {
    return this.request<T>(path, "GET", undefined, limit, fresh);
  }

  async write<T>(path: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<T> {
    return this.request<T>(path, method, body);
  }

  private async request<T>(path: string, method: string, body?: unknown, limit?: number, fresh = false): Promise<T> {
    // Native Workers fetch rejects a GitHub instance as its `this` receiver.
    const fetcher = this.fetcher;
    const response = await fetcher(`${apiRoot}${path}`, {
      method,
      // A branch's head is never taken from a cache between here and GitHub.
      ...(fresh ? { cache: "no-store" as const } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "astro-site-editor",
      },
    }).catch((error) => {
      // The path only; the token is in the headers and never logged.
      console.error(`GitHub ${path.split("?")[0]} unreachable:`, error instanceof Error ? error.message : error);
      throw new HttpError(502, "GitHub could not be reached. Try again.");
    });
    if (!response.ok) {
      if (response.status === 401)
        throw new HttpError(401, "Your GitHub session expired. Connect again.");
      const limited = await rateLimit(response);
      if (limited) throw limited;
      if (method !== "GET" && [409, 422].includes(response.status))
        throw new HttpError(409, "GitHub rejected the update. The branch may have changed or require a pull request. Refresh and review before retrying; your drafts are kept.");
      if (method !== "GET" && response.status === 403)
        throw new HttpError(403, "Publishing needs GitHub App Contents: read/write permission and permission to push to this branch. Accept the updated app permissions, reconnect, and retry.");
      if (response.status === 403)
        throw new HttpError(
          403,
          "GitHub denied access. Check the app’s repository selection and permissions.",
        );
      if (response.status === 404)
        throw new HttpError(
          404,
          "This repository, branch, or file is unavailable. Refresh or check GitHub access.",
        );
      if (response.status === 409)
        throw new HttpError(
          409,
          "This repository is empty. Add your site files on GitHub first.",
        );
      throw new HttpError(
        502,
        "GitHub could not complete the request. Try again.",
      );
    }
    return boundedJson(response, limit);
  }

  async pages<T>(path: string, key?: string): Promise<T[]> {
    const result: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await this.get<any>(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      const rows: T[] = key ? data[key] : data;
      if (!Array.isArray(rows))
        throw new HttpError(502, "GitHub returned an unexpected list.");
      result.push(...rows);
      if (rows.length < 100) return result;
    }
    throw new HttpError(
      413,
      "There are too many results to list safely. Narrow the app’s repository selection.",
    );
  }

  async repositories(login: string, maxAge = 0): Promise<Repository[]> {
    const fetcher = this.fetcher;
    let byToken = listings.get(fetcher);
    if (!byToken) listings.set(fetcher, (byToken = new Map()));
    const key = `${login.toLowerCase()}\n${this.token}`;
    const cached = byToken.get(key);
    const now = Date.now();
    if (cached && maxAge > 0 && now - cached.fetchedAt <= maxAge)
      return cached.repos;
    if (byToken.size >= maxListings) {
      for (const [entry, listing] of byToken)
        if (now - listing.fetchedAt > 60_000) byToken.delete(entry);
      if (byToken.size >= maxListings)
        byToken.delete(byToken.keys().next().value!);
    }
    const repos = this.listRepositories(login);
    byToken.set(key, { fetchedAt: now, repos });
    repos.catch(() => {
      if (byToken!.get(key)?.repos === repos) byToken!.delete(key);
    });
    return repos;
  }

  /** The GitHub App's installations on the personal account `login`. */
  async installations(login: string): Promise<number[]> {
    const installations = await this.pages<{
      id: number;
      account: { type: string; login: string };
    }>("/user/installations", "installations");
    return installations
      .filter(
        (installation) =>
          installation.account.type === "User" &&
          installation.account.login.toLowerCase() === login.toLowerCase(),
      )
      .map((installation) => installation.id);
  }

  /** Forgets the remembered repository listing of `login`, so the next one asks GitHub. */
  forgetRepositories(login: string) {
    listings.get(this.fetcher)?.delete(`${login.toLowerCase()}\n${this.token}`);
  }

  /**
   * Creates an empty repository (no commits) on the signed-in personal
   * account. GitHub allows it to a GitHub App's user token when the App
   * has the Administration (or Repository creation) permission, write, on an
   * installation on the account; a repository the App creates this way is
   * added to an installation limited to selected repositories by itself.
   * Without an installation (404) or that permission (403) the editor sends
   * the user to GitHub's own New repository page instead.
   */
  async createRepository(login: string, input: CreateRepositoryRequest): Promise<Repository> {
    const problem = repositoryNameProblem(input.name);
    if (problem) throw new HttpError(400, problem);
    const installations = await this.installations(login);
    if (!installations.length)
      throw new HttpError(404, "The editor is not installed on your GitHub account yet. Create the repository on GitHub, then give the editor access to it.");
    let created: Repository;
    try {
      created = await this.write<Repository>("/user/repos", "POST", {
        name: input.name,
        private: input.private,
        ...(input.description ? { description: input.description.slice(0, 350) } : {}),
        auto_init: false,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      // GitHub answers 422 for a name already taken on the account.
      if (error.status === 409)
        throw new HttpError(409, `GitHub did not accept the name ${input.name}. You may already have a repository with that name; choose another.`);
      if (error.status === 403 || error.status === 404)
        throw new HttpError(403, "The editor may not create repositories on your account yet. Create it on GitHub, then give the editor access to it.");
      throw error;
    }
    this.forgetRepositories(login);
    return {
      id: created.id,
      name: created.name,
      full_name: created.full_name,
      private: created.private,
      default_branch: created.default_branch || "main",
      owner: { login: created.owner.login, type: created.owner.type },
      installation_id: installations[0],
    };
  }

  private async listRepositories(login: string): Promise<Repository[]> {
    const installations = await this.pages<{
      id: number;
      account: { type: string; login: string };
    }>("/user/installations", "installations");
    const repos = new Map<number, Repository>();
    for (const installation of installations) {
      if (
        installation.account.type !== "User" ||
        installation.account.login.toLowerCase() !== login.toLowerCase()
      )
        continue;
      const rows = await this.pages<Repository>(
        `/user/installations/${installation.id}/repositories`,
        "repositories",
      );
      for (const repo of rows) {
        if (
          repo.owner.type === "User" &&
          repo.owner.login.toLowerCase() === login.toLowerCase()
        ) {
          // Return only the fields the browser needs, not the full GitHub response.
          repos.set(repo.id, {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            default_branch: repo.default_branch,
            owner: { login: repo.owner.login, type: repo.owner.type },
            installation_id: installation.id,
          });
        }
      }
    }
    return [...repos.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async authorizeRepository(
    login: string,
    fullName: string,
    maxAge = 0,
  ): Promise<Repository> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(fullName))
      throw new HttpError(400, "Choose a repository.");
    // Recheck installation membership for every request, including public
    // repos and cached SHAs, unless the caller accepts a listing up to
    // `maxAge` old (the editor's read endpoints and agents do). A repository
    // missing from a reused listing is looked up again, so one just added to
    // the installation works at once; one removed stops within `maxAge`.
    const find = async (age: number) =>
      (await this.repositories(login, age)).find(
        (repo) => repo.full_name === fullName,
      );
    const repo = (await find(maxAge)) ?? (maxAge > 0 ? await find(0) : undefined);
    if (!repo)
      throw new HttpError(
        403,
        "This repository is not selected for this GitHub connection.",
      );
    return repo;
  }

  base(repo: Repository) {
    return `/repos/${segment(repo.owner.login)}/${segment(repo.name)}`;
  }

  async branches(repo: Repository): Promise<string[]> {
    const rows = await this.pages<{ name: string }>(
      `${this.base(repo)}/branches`,
    );
    return rows.map((row) => row.name);
  }

  async tree(repo: Repository, sha: string): Promise<TreeEntry[]> {
    if (!/^[a-f0-9]{40}$/.test(sha))
      throw new HttpError(400, "Invalid revision. Refresh the repository.");
    const data = await this.get<{ tree: TreeEntry[]; truncated: boolean }>(
      `${this.base(repo)}/git/trees/${sha}`,
    );
    if (data.truncated)
      throw new HttpError(
        413,
        "GitHub truncated this directory. Its contents cannot be shown completely.",
      );
    return data.tree.sort(
      (a, b) =>
        Number(b.type === "tree") - Number(a.type === "tree") ||
        a.path.localeCompare(b.path),
    );
  }

  async file(repo: Repository, sha: string): Promise<string> {
    if (!/^[a-f0-9]{40}$/.test(sha))
      throw new HttpError(400, "Invalid file revision.");
    const prefetched = this.objects.held(textKey(repo, sha));
    if (prefetched !== undefined) return prefetched;
    const data = await this.blob(repo, sha, 1536 * 1024);
    if (data.size > maxFileBytes)
      throw new HttpError(413, "Text files open up to 1 MB.");
    if (data.encoding !== "base64")
      throw new HttpError(415, "This file cannot be displayed as text.");
    const bytes = Uint8Array.from(
      atob(data.content.replace(/\s/g, "")),
      (char) => char.charCodeAt(0),
    );
    if (bytes.includes(0))
      throw new HttpError(415, "Binary file. Text preview is unavailable.");
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      throw new HttpError(415, "This file is not UTF-8 text.");
    }
  }

  /** A blob's bytes as base64 (an image for the preview), up to `maxAssetBytes`. */
  async raw(repo: Repository, sha: string): Promise<{ content: string; size: number }> {
    if (!/^[a-f0-9]{40}$/.test(sha))
      throw new HttpError(400, "Invalid file revision.");
    const data = await this.blob(repo, sha, maxAssetBytes * 2);
    if (data.size > maxAssetBytes)
      throw new HttpError(413, "Images in the preview are limited to 2 MB.");
    if (data.encoding !== "base64")
      throw new HttpError(415, "This file cannot be read.");
    return { content: data.content.replace(/\s/g, ""), size: data.size };
  }

  /** A blob as GitHub returns it; blobs never change, so each is read from GitHub once. */
  private blob(repo: Repository, sha: string, limit: number): Promise<GitBlob> {
    return this.objects.through(`${repo.id}/blob/${sha}`, async () => {
      const data = await this.get<GitBlob>(`${this.base(repo)}/git/blobs/${sha}`, limit);
      return { size: data.size, encoding: data.encoding, content: data.content };
    });
  }

  /** Whether `file(repo, sha)` has the text in this isolate's memory. */
  hasText(repo: Repository, sha: string) {
    return this.objects.held(textKey(repo, sha)) !== undefined;
  }

  /**
   * Reads the text of many blobs in a few GraphQL queries (100 blobs each)
   * instead of one REST request per blob, so a whole-site read stays within
   * GitHub's limits and the Worker's subrequests. The texts are kept in this
   * isolate's memory for `file()`; a blob GraphQL does not give whole, as the
   * UTF-8 text of its exact bytes, is left for `file()` to read as usual.
   */
  async prefetchTexts(repo: Repository, shas: string[]): Promise<void> {
    const wanted = [...new Set(shas)].filter(
      (sha) => /^[a-f0-9]{40}$/.test(sha) && !this.hasText(repo, sha),
    );
    const encoder = new TextEncoder();
    for (let start = 0; start < wanted.length; start += textsPerQuery) {
      const chunk = wanted.slice(start, start + textsPerQuery);
      const fields = chunk
        .map((sha, index) => `f${index}: object(oid: "${sha}") { ... on Blob { text isBinary isTruncated byteSize } }`)
        .join("\n");
      const result = await this.request<{
        data?: { repository?: Record<string, { text?: string | null; isBinary?: boolean; isTruncated?: boolean; byteSize?: number } | null> | null };
        errors?: { type?: string }[];
      }>(
        "/graphql",
        "POST",
        {
          query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {\n${fields}\n} }`,
          variables: { owner: repo.owner.login, name: repo.name },
        },
        16 * 1024 * 1024,
      );
      if (result.errors?.some((error) => error.type === "RATE_LIMITED")) throw limitedError();
      const found = result.data?.repository;
      if (!found) return;
      chunk.forEach((sha, index) => {
        const blob = found[`f${index}`];
        const text = blob?.text;
        if (
          typeof text !== "string" ||
          blob!.isBinary ||
          blob!.isTruncated ||
          blob!.byteSize === undefined ||
          blob!.byteSize > maxFileBytes ||
          text.includes("\0") ||
          text.includes("\uFFFD") ||
          encoder.encode(text).length !== blob!.byteSize
        )
          return;
        this.objects.hold(textKey(repo, sha), text);
      });
    }
  }

  /** Reads several blobs concurrently; the first failure rejects the batch. */
  async files(repo: Repository, shas: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(shas)];
    if (!unique.length) throw new HttpError(400, "Choose files to read.");
    if (unique.length > MAX_BATCH_FILES)
      throw new HttpError(400, `Read at most ${MAX_BATCH_FILES} files at once.`);
    for (const sha of unique)
      if (!/^[a-f0-9]{40}$/.test(sha))
        throw new HttpError(400, "Invalid file revision.");
    const result: Record<string, string> = {};
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(batchConcurrency, unique.length) }, async () => {
        while (next < unique.length) {
          const sha = unique[next++];
          result[sha] = await this.file(repo, sha);
        }
      }),
    );
    return result;
  }

  async directory(
    repo: Repository,
    sha: string,
    listed?: TreeEntry[],
  ): Promise<Directory> {
    return { entries: listed ?? (await this.tree(repo, sha)) };
  }

  /**
   * Every file and folder under the tree `sha`, with paths relative to it, in
   * one request (the editor lists `src/pages/` this way to route pages when
   * the snapshot has no whole-commit tree).
   */
  async subtree(repo: Repository, sha: string): Promise<Directory> {
    const tree = await this.recursiveTree(repo, sha);
    if (!tree)
      throw new HttpError(
        413,
        "GitHub truncated this folder. Its contents cannot be listed completely.",
      );
    return { entries: tree };
  }

  /**
   * Every file and folder of the commit `commit`, with full paths (the MCP
   * site tools read and list files at the revision the editor tab shows).
   */
  async commitTree(repo: Repository, commit: string): Promise<TreeEntry[]> {
    if (!/^[a-f0-9]{40}$/.test(commit))
      throw new HttpError(400, "Invalid revision. Refresh the repository.");
    const treeSha = await this.objects.through(`${repo.id}/commit-tree/${commit}`, async () =>
      (await this.get<{ tree: { sha: string } }>(`${this.base(repo)}/git/commits/${commit}`)).tree.sha,
    );
    const tree = await this.recursiveTree(repo, treeSha);
    if (!tree)
      throw new HttpError(
        413,
        "GitHub truncated this repository's file listing. It is too large to list completely.",
      );
    return tree;
  }

  /**
   * The whole commit in one listing when GitHub can return it completely.
   * Returns `undefined` when the listing is truncated or does not actually
   * descend into folders (a fake or proxy ignoring `recursive`), in which case
   * the caller falls back to the top-level directory.
   */
  async recursiveTree(
    repo: Repository,
    sha: string,
  ): Promise<TreeEntry[] | undefined> {
    if (!/^[a-f0-9]{40}$/.test(sha))
      throw new HttpError(400, "Invalid revision. Refresh the repository.");
    // A tree never changes, so its listing (or that it has none) is kept.
    const listed = await this.objects.through(`${repo.id}/tree/${sha}`, async () => {
      const data = await this.get<{ tree: TreeEntry[]; truncated: boolean }>(
        `${this.base(repo)}/git/trees/${sha}?recursive=1`,
      );
      return this.completeTree(data) ?? null;
    });
    return listed ?? undefined;
  }

  private completeTree(data: { tree: TreeEntry[]; truncated: boolean }): TreeEntry[] | undefined {
    if (data.truncated) return undefined;
    // Git has no empty directories, so a complete recursive listing has at
    // least one descendant for every folder it names.
    const folders = data.tree.filter((entry) => entry.type === "tree");
    if (
      folders.some(
        (folder) => !data.tree.some((entry) => entry.path.startsWith(`${folder.path}/`)),
      )
    )
      return undefined;
    return data.tree
      .map(({ path, mode, type, sha, size }) =>
        size === undefined ? { path, mode, type, sha } : { path, mode, type, sha, size },
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * The branch's head commit (and its tree, when GitHub says). GitHub's reads
   * lag behind its writes for a moment: right after a save or a merge the
   * branch can still name the commit before. `known`, a commit the editor
   * already saw on this branch, is the head when it is ahead of the one named.
   */
  async head(repo: Repository, branch: string, known?: string): Promise<{ sha: string; tree?: string }> {
    if (!branch || branch.length > 255)
      throw new HttpError(400, "Choose a branch.");
    type Branch = { commit: { sha: string; commit?: { tree?: { sha?: string } } } };
    const ref = await this.get<Branch>(`${this.base(repo)}/branches/${segment(branch)}`, undefined, true).catch((error): Branch => {
      // Right after the first save to an empty repository GitHub may not
      // list its new branch yet; the commit the editor made is the head.
      if (error instanceof HttpError && error.status === 404 && known && known !== EMPTY_COMMIT && /^[a-f0-9]{40}$/.test(known))
        return { commit: { sha: known } };
      throw error;
    });
    const named = { sha: ref.commit.sha, tree: ref.commit.commit?.tree?.sha };
    if (!known || known === named.sha || !/^[a-f0-9]{40}$/.test(known)) return named;
    const compare = await this.get<{ status?: string }>(
      `${this.base(repo)}/compare/${named.sha}...${known}?per_page=1`,
    ).catch(() => undefined);
    return compare?.status === "ahead" ? { sha: known } : named;
  }

  async snapshot(repo: Repository, branch: string, known?: string): Promise<Snapshot> {
    const ref = await this.head(repo, branch, known);
    // The branch listing already carries the commit's tree; only look the
    // commit up when a minimal response leaves it out.
    let treeSha = ref.tree;
    if (!treeSha || !/^[a-f0-9]{40}$/.test(treeSha)) {
      const commit = await this.get<{ tree: { sha: string } }>(
        `${this.base(repo)}/git/commits/${ref.sha}`,
      );
      treeSha = commit.tree.sha;
    }
    const tree = await this.recursiveTree(repo, treeSha);
    if (!tree)
      return {
        ...(await this.directory(repo, treeSha)),
        commit: ref.sha,
        branch,
      };
    const entries = tree
      .filter((entry) => !entry.path.includes("/"))
      .sort(
        (a, b) =>
          Number(b.type === "tree") - Number(a.type === "tree") ||
          a.path.localeCompare(b.path),
      );
    return {
      ...(await this.directory(repo, treeSha, entries)),
      commit: ref.sha,
      branch,
      tree,
    };
  }
}
