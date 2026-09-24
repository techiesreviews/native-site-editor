import type {
  Directory,
  Repository,
  Snapshot,
  TreeEntry,
} from "../shared/types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public conflicts?: string[],
  ) {
    super(message);
  }
}

const segment = encodeURIComponent;
const apiRoot = "https://api.github.com";
const maxPages = 50;
const maxFileBytes = 128 * 1024;
export const maxBatchFiles = 64;
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

export class GitHub {
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  async get<T>(path: string, limit?: number): Promise<T> {
    return this.request<T>(path, "GET", undefined, limit);
  }

  async write<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
    return this.request<T>(path, method, body);
  }

  private async request<T>(path: string, method: string, body?: unknown, limit?: number): Promise<T> {
    // Native Workers fetch rejects a GitHub instance as its `this` receiver.
    const fetcher = this.fetcher;
    const response = await fetcher(`${apiRoot}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "astro-site-editor",
      },
    });
    if (!response.ok) {
      if (response.status === 401)
        throw new HttpError(401, "Your GitHub session expired. Connect again.");
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after")))
      ) {
        throw new HttpError(
          429,
          "GitHub is limiting requests. Wait a little, then refresh.",
        );
      }
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
    // `maxAge` old (the editor's own read endpoints do; agents never do).
    const repo = (await this.repositories(login, maxAge)).find(
      (repo) => repo.full_name === fullName,
    );
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
    const data = await this.get<{
      size: number;
      encoding: string;
      content: string;
    }>(`${this.base(repo)}/git/blobs/${sha}`, 256 * 1024);
    if (data.size > maxFileBytes)
      throw new HttpError(413, "File preview is limited to 128 KB.");
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

  /** Reads several blobs concurrently; the first failure rejects the batch. */
  async files(repo: Repository, shas: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(shas)];
    if (!unique.length) throw new HttpError(400, "Choose files to read.");
    if (unique.length > maxBatchFiles)
      throw new HttpError(400, `Read at most ${maxBatchFiles} files at once.`);
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
   * The whole commit in one listing when GitHub can return it completely.
   * Returns `undefined` when the listing is truncated or does not actually
   * descend into folders (a fake or proxy ignoring `recursive`), in which case
   * the caller falls back to the top-level directory.
   */
  private async recursiveTree(
    repo: Repository,
    sha: string,
  ): Promise<TreeEntry[] | undefined> {
    if (!/^[a-f0-9]{40}$/.test(sha))
      throw new HttpError(400, "Invalid revision. Refresh the repository.");
    const data = await this.get<{ tree: TreeEntry[]; truncated: boolean }>(
      `${this.base(repo)}/git/trees/${sha}?recursive=1`,
    );
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

  async snapshot(repo: Repository, branch: string): Promise<Snapshot> {
    if (!branch || branch.length > 255)
      throw new HttpError(400, "Choose a branch.");
    const ref = await this.get<{
      commit: { sha: string; commit?: { tree?: { sha?: string } } };
    }>(`${this.base(repo)}/branches/${segment(branch)}`);
    // The branch listing already carries the commit's tree; only look the
    // commit up when a minimal response leaves it out.
    let treeSha = ref.commit.commit?.tree?.sha;
    if (!treeSha || !/^[a-f0-9]{40}$/.test(treeSha)) {
      const commit = await this.get<{ tree: { sha: string } }>(
        `${this.base(repo)}/git/commits/${ref.commit.sha}`,
      );
      treeSha = commit.tree.sha;
    }
    const tree = await this.recursiveTree(repo, treeSha);
    if (!tree)
      return {
        ...(await this.directory(repo, treeSha)),
        commit: ref.commit.sha,
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
      commit: ref.commit.sha,
      branch,
      tree,
    };
  }
}
