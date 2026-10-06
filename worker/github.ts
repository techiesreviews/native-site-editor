import type {
  CreateRepositoryRequest,
  Directory,
  OwnerInstallation,
  Repository,
  Snapshot,
  TreeEntry,
} from "../shared/types";
import { EMPTY_COMMIT, MAX_BATCH_FILES } from "../shared/types";
import { repositoryNameProblem } from "../shared/starting-point";
import { ObjectCache } from "./blob-cache";
import { baseFetch } from "./timing";

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
const installationConcurrency = 6;

// Selected-repository listings are remembered briefly per access token so the
// editor's burst of requests after sign-in (branches, snapshot, files) does not
// pay for two GitHub round trips each. Entries are scoped to the fetch
// implementation, so tests and fakes with their own fetcher never share state.
// Callers opt in with `maxAge`; the default rechecks membership every request.
// Kept per fetch implementation, under any per-request wrapper (worker/timing.ts).
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
const blobKey = (repo: Repository, sha: string) => `${repo.id}/blob/${sha}`;

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

/** GitHub refuses a GitHub App's change to .github/workflows/* without the Workflows permission. */
export const WORKFLOWS_PERMISSION_MESSAGE =
  "Saving the deploy workflow needs the Workflows permission. Ask the editor's owner to add Workflows: Read and write to the GitHub App and accept it for this repository, or add the workflow on GitHub yourself. Your drafts are kept.";

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

  private async send(path: string, method: string, body?: unknown, fresh = false): Promise<Response> {
    // Native Workers fetch rejects a GitHub instance as its `this` receiver.
    const fetcher = this.fetcher;
    return fetcher(`${apiRoot}${path}`, {
      method,
      // A branch's head is never taken from a cache between here and GitHub.
      ...(fresh ? { cache: "no-store" as const } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "native-site-editor",
      },
    }).catch((error) => {
      // The path only; the token is in the headers and never logged.
      const message = error instanceof Error ? error.message : String(error);
      if (/too many subrequests/i.test(message)) {
        console.error(`GitHub ${path.split("?")[0]} not attempted: the Worker's subrequest limit was reached (${message})`);
        throw new HttpError(503, "The editor is busy reading this site. Try again in a moment.");
      }
      console.error(`GitHub ${path.split("?")[0]} unreachable:`, message);
      throw new HttpError(502, "GitHub could not be reached. Try again.");
    });
  }

  /**
   * A call whose failure statuses the caller reads itself (publishing to a
   * host: Pages not enabled is a 404, a pending DNS check a 202). Only an
   * expired session and GitHub's rate limiting are errors here. `data` is the
   * JSON answer when there is one (an error's `message` included).
   */
  async exchange(
    path: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<{ status: number; ok: boolean; data: any }> {
    const response = await this.send(path, method, body);
    if (response.status === 401) throw new HttpError(401, "Your GitHub session expired. Connect again.");
    const limited = await rateLimit(response.clone());
    if (limited) throw limited;
    let data: any;
    if (response.status !== 204 && response.body) data = await boundedJson(response, 1024 * 1024).catch(() => undefined);
    return { status: response.status, ok: response.ok, data };
  }

  private async request<T>(path: string, method: string, body?: unknown, limit?: number, fresh = false): Promise<T> {
    const response = await this.send(path, method, body, fresh);
    if (!response.ok) {
      if (response.status === 401)
        throw new HttpError(401, "Your GitHub session expired. Connect again.");
      // GitHub's reason for a refused write, read before rateLimit() consumes the body.
      const detail = method === "GET" ? "" : await response.clone().text().then((text) => text.slice(0, 2000), () => "");
      const limited = await rateLimit(response);
      if (limited) throw limited;
      if (method !== "GET" && /workflow/i.test(detail) && /permission/i.test(detail))
        throw new HttpError(403, WORKFLOWS_PERMISSION_MESSAGE);
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

  /** With maxAge 0, callers may share a request-local installation lookup for onboarding. */
  async repositories(login: string, maxAge = 0, installations?: Promise<OwnerInstallation[]>): Promise<Repository[]> {
    const fetcher = this.fetcher;
    let byToken = listings.get(baseFetch(fetcher));
    if (!byToken) listings.set(baseFetch(fetcher), (byToken = new Map()));
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
    const repos = this.listRepositories(login, installations);
    byToken.set(key, { fetchedAt: now, repos });
    repos.catch(() => {
      if (byToken!.get(key)?.repos === repos) byToken!.delete(key);
    });
    return repos;
  }

  /**
   * The GitHub App's installations the user can reach: on their personal
   * account `login` and on organisations they belong to (GitHub's
   * /user/installations lists only installations the user can access).
   * Installations on another personal account are left out.
   */
  async ownerInstallations(login: string): Promise<OwnerInstallation[]> {
    const installations = await this.pages<{
      id: number;
      account?: { type: string; login: string };
    }>("/user/installations", "installations");
    const owners: OwnerInstallation[] = [];
    for (const installation of installations) {
      const account = installation.account;
      if (!account || typeof account.login !== "string") continue;
      const personal = account.type === "User";
      if (personal && account.login.toLowerCase() !== login.toLowerCase()) continue;
      if (!personal && account.type !== "Organization") continue;
      owners.push({ id: installation.id, login: account.login, type: personal ? "User" : "Organization" });
    }
    // The personal account first, then organisations by name.
    return owners.sort((a, b) => Number(b.type === "User") - Number(a.type === "User") || a.login.localeCompare(b.login));
  }

  /** Forgets the remembered repository listing of `login`, so the next one asks GitHub. */
  forgetRepositories(login: string) {
    listings.get(baseFetch(this.fetcher))?.delete(`${login.toLowerCase()}\n${this.token}`);
  }

  /**
   * Creates an empty repository (no commits) on the signed-in personal
   * account, or on the organisation `input.owner` when the user has an
   * installation of the App on it. GitHub allows it to a GitHub App's user
   * token when the App has the Administration (or Repository creation)
   * permission, write, on an installation on the account or organisation; a
   * repository the App creates this way is added to an installation limited
   * to selected repositories by itself. Without an installation (404) or that
   * permission (403), or when an organisation does not let members create
   * repositories, the editor sends the user to GitHub's own New repository
   * page instead.
   */
  async createRepository(login: string, input: CreateRepositoryRequest): Promise<Repository> {
    const problem = repositoryNameProblem(input.name);
    if (problem) throw new HttpError(400, problem);
    const owners = await this.ownerInstallations(login);
    const wanted = (input.owner || login).toLowerCase();
    const target = owners.find((owner) => owner.login.toLowerCase() === wanted);
    if (!target) {
      // Never trust the client's owner: only the user or an organisation with an installation they can reach.
      if (input.owner && wanted !== login.toLowerCase())
        throw new HttpError(403, `The editor is not installed on ${input.owner}, or you cannot reach it. Choose another owner.`);
      throw new HttpError(404, "The editor is not installed on your GitHub account yet. Create the repository on GitHub, then give the editor access to it.");
    }
    const organisation = target.type === "Organization";
    let created: Repository;
    try {
      created = await this.write<Repository>(organisation ? `/orgs/${segment(target.login)}/repos` : "/user/repos", "POST", {
        name: input.name,
        private: input.private,
        ...(input.description ? { description: input.description.slice(0, 350) } : {}),
        auto_init: false,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      // GitHub answers 422 for a name already taken on the account; request() reports it as 409.
      if (error.status === 409)
        throw new HttpError(409, `GitHub did not accept the name ${input.name}. ${organisation ? `${target.login} may already have` : "You may already have"} a repository with that name; choose another.`);
      if (error.status === 403 || error.status === 404)
        throw new HttpError(
          403,
          organisation
            ? `The editor may not create repositories in ${target.login}, or the organisation does not let members create them. Create it on GitHub (an organisation owner may need to), then give the editor access to it.`
            : "The editor may not create repositories on your account yet. Create it on GitHub, then give the editor access to it.",
        );
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
      installation_id: target.id,
    };
  }

  private async listRepositories(login: string, owners?: Promise<OwnerInstallation[]>): Promise<Repository[]> {
    const installations = await (owners ?? this.ownerInstallations(login));
    const complete: ((listing: PromiseSettledResult<Repository[]>) => void)[] = [];
    const listings = installations.map(() => new Promise<PromiseSettledResult<Repository[]>>((resolve) => {
      complete.push(resolve);
    }));
    let next = 0;
    let stopped = false;
    for (let worker = 0; worker < Math.min(installationConcurrency, installations.length); worker++) void (async () => {
      while (!stopped && next < installations.length) {
        const index = next++;
        try {
          // GitHub intersects an installation's repositories with the user's own access.
          complete[index]({ status: "fulfilled", value: await this.pages<Repository>(
            `/user/installations/${installations[index].id}/repositories`,
            "repositories",
          ) });
        } catch (reason) {
          complete[index]({ status: "rejected", reason });
        }
      }
    })();
    const repos = new Map<number, Repository>();
    for (const [index, installation] of installations.entries()) {
      const listing = await listings[index];
      // Merge and report failures in installation order, regardless of completion order.
      if (listing.status === "rejected") {
        stopped = true;
        throw listing.reason;
      }
      for (const repo of listing.value) {
        if (repo.owner.login.toLowerCase() === installation.login.toLowerCase()) {
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
    return this.objects.through(blobKey(repo, sha), async () => {
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
   * isolate's memory for `file()`; `cacheBlobs` also fills the shared blob
   * cache for editor file batches. A blob GraphQL
   * does not give whole, as the UTF-8 text of its exact bytes, is left for
   * `file()` to read as usual.
   */
  async prefetchTexts(repo: Repository, shas: string[], cacheBlobs = false): Promise<void> {
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
      await Promise.all(chunk.map(async (sha, index) => {
        const blob = found[`f${index}`];
        const text = blob?.text;
        const bytes = typeof text === "string" ? encoder.encode(text) : undefined;
        if (
          typeof text !== "string" ||
          blob!.isBinary ||
          blob!.isTruncated ||
          blob!.byteSize === undefined ||
          blob!.byteSize > maxFileBytes ||
          text.includes("\0") ||
          text.includes("\uFFFD") ||
          bytes!.length !== blob!.byteSize
        )
          return;
        this.objects.hold(textKey(repo, sha), text);
        if (!cacheBlobs) return;
        let binary = "";
        for (let offset = 0; offset < bytes!.length; offset += 8192)
          binary += String.fromCharCode(...bytes!.subarray(offset, offset + 8192));
        await this.objects.put(blobKey(repo, sha), JSON.stringify({
          size: blob!.byteSize,
          encoding: "base64",
          content: btoa(binary),
        } satisfies GitBlob));
      }));
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
    const candidates = unique.filter((sha) => !this.hasText(repo, sha));
    const cached = await Promise.all(candidates.map((sha) => this.objects.get(blobKey(repo, sha))));
    try {
      await this.prefetchTexts(repo, candidates.filter((_, index) => cached[index] === undefined), true);
    } catch (error) {
      // Unsupported or unavailable GraphQL reads use the existing REST path.
      // Authentication, rate limits and subrequest limits must still stop here.
      if (!(error instanceof HttpError) || [401, 429, 503].includes(error.status)) throw error;
    }
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
  async head(repo: Repository, branch: string, known?: string): Promise<{ sha: string; tree?: string; named?: string; unlisted?: true }> {
    if (!branch || branch.length > 255)
      throw new HttpError(400, "Choose a branch.");
    type Branch = { commit: { sha: string; commit?: { tree?: { sha?: string } } } };
    let unlisted = false;
    const ref = await this.get<Branch>(`${this.base(repo)}/branches/${segment(branch)}`, undefined, true).catch((error): Branch => {
      // Right after the first save to an empty repository GitHub may not
      // list its new branch yet; the commit the editor made is the head.
      if (error instanceof HttpError && error.status === 404 && known && known !== EMPTY_COMMIT && /^[a-f0-9]{40}$/.test(known)) {
        unlisted = true;
        return { commit: { sha: known } };
      }
      throw error;
    });
    // `unlisted`: GitHub named no such branch, so `known` is taken on trust and what it holds is unchecked.
    if (unlisted) return { sha: ref.commit.sha, unlisted: true };
    const named = { sha: ref.commit.sha, tree: ref.commit.commit?.tree?.sha };
    if (!known || known === named.sha || !/^[a-f0-9]{40}$/.test(known)) return named;
    const compare = await this.get<{ status?: string }>(
      `${this.base(repo)}/compare/${named.sha}...${known}?per_page=1`,
    ).catch(() => undefined);
    // `named`: the commit the branch itself names, when `known` is taken over it.
    return compare?.status === "ahead" ? { sha: known, named: named.sha } : named;
  }

  async snapshot(repo: Repository, branch: string, known?: string): Promise<Snapshot> {
    const ref = await this.head(repo, branch, known).catch(async (error) => {
      // A repository with no commits has no branch to name: it opens empty
      // at EMPTY_COMMIT, so drafts can be written before the first save.
      if (error instanceof HttpError && error.status === 404 && !(await this.branches(repo)).length)
        return undefined;
      throw error;
    });
    if (!ref) return { entries: [], tree: [], commit: EMPTY_COMMIT, branch, empty: true };
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
