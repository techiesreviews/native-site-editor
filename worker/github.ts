import type {
  Detection,
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

export function detectAstro(
  manifest: unknown,
  entries: TreeEntry[],
): Detection {
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
    const pkg = manifest as Record<string, any>;
    const version = pkg.dependencies?.astro ?? pkg.devDependencies?.astro;
    if (typeof version === "string")
      return {
        status: "detected",
        version,
        message:
          "Astro dependency found. Build compatibility has not been tested.",
      };
    if (pkg.workspaces)
      return {
        status: "ambiguous",
        message:
          "Workspace repository. Open a package folder to look for its Astro setup.",
      };
  }
  if (
    entries.some(
      (entry) =>
        /^astro\.config\.(js|mjs|cjs|ts|mts)$/.test(entry.path) ||
        entry.path.endsWith(".astro"),
    )
  ) {
    return {
      status: "ambiguous",
      message:
        "Astro files found, but no Astro dependency in this folder’s package.json.",
    };
  }
  return {
    status: "not-detected",
    message:
      "No Astro dependency detected in this folder. Nested folders are checked when opened.",
  };
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
          "This repository is empty. Add your Astro starter on GitHub first.",
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

  async repositories(login: string): Promise<Repository[]> {
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
  ): Promise<Repository> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(fullName))
      throw new HttpError(400, "Choose a repository.");
    // Recheck installation membership for every request, including public repos and cached SHAs.
    const repo = (await this.repositories(login)).find(
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

  async directory(repo: Repository, sha: string): Promise<Directory> {
    const entries = await this.tree(repo, sha);
    const manifest = entries.find(
      (entry) =>
        entry.path === "package.json" &&
        entry.type === "blob" &&
        entry.mode !== "120000",
    );
    let parsed: unknown = null;
    if (manifest) {
      if ((manifest.size ?? Infinity) > 64 * 1024) {
        return {
          entries,
          detection: {
            status: "ambiguous",
            message: "package.json exceeds the 64 KB detection limit.",
          },
        };
      }
      try {
        parsed = JSON.parse(await this.file(repo, manifest.sha));
      } catch (error) {
        if (
          error instanceof SyntaxError ||
          (error instanceof HttpError && [413, 415].includes(error.status))
        ) {
          return {
            entries,
            detection: {
              status: "ambiguous",
              message:
                "package.json could not be inspected. It must be valid UTF-8 JSON.",
            },
          };
        }
        throw error;
      }
    }
    return { entries, detection: detectAstro(parsed, entries) };
  }

  async snapshot(repo: Repository, branch: string): Promise<Snapshot> {
    if (!branch || branch.length > 255)
      throw new HttpError(400, "Choose a branch.");
    const ref = await this.get<{ commit: { sha: string } }>(
      `${this.base(repo)}/branches/${segment(branch)}`,
    );
    const commit = await this.get<{ tree: { sha: string } }>(
      `${this.base(repo)}/git/commits/${ref.commit.sha}`,
    );
    return {
      ...(await this.directory(repo, commit.tree.sha)),
      commit: ref.commit.sha,
      branch,
    };
  }
}
