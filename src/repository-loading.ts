import type { Directory, FilesResult, Repository, Snapshot, TreeEntry } from "../shared/types";
import { MAX_BATCH_FILES } from "../shared/types";

export type RepositoryApi = <T>(path: string, params?: Record<string, string>) => Promise<T>;

type FileCache = Map<string, Promise<string>>;

const repositoryKey = (repo: string, commit: string) => `${repo}\n${commit}`;
export const fileKey = (repo: string, sha: string) => `${repo}\n${sha}`;
const directoryKey = (repo: string, sha: string) => `${repo}\n${sha}`;
const BATCH_LIMIT = 2;
const TREE_LIMIT = 4;

function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let index = 0;
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) await task(items[index++]);
  }));
}

class AsyncQueue {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>) {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

const fileBatchQueue = new AsyncQueue(BATCH_LIMIT);
const inflightByCache = new WeakMap<FileCache, Map<string, Promise<string>>>();

function inflightFiles(cache: FileCache) {
  let inflight = inflightByCache.get(cache);
  if (!inflight) {
    inflight = new Map();
    inflightByCache.set(cache, inflight);
  }
  return inflight;
}

export function rememberFile(cache: FileCache, limit: number, key: string, content: Promise<string>) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, content);
  content.catch(() => {
    if (cache.get(key) === content) cache.delete(key);
  });
  return content;
}

export function readFileText(api: RepositoryApi, cache: FileCache, limit: number, repo: string, sha: string): Promise<string> {
  const key = fileKey(repo, sha);
  const inflight = inflightFiles(cache);
  const content = cache.get(key) ?? inflight.get(key);
  if (content) return content;
  const requested = api<{ content: string }>("file", { repo, sha }).then((file) => file.content);
  inflight.set(key, requested);
  requested.then(() => {
    if (inflight.get(key) === requested) inflight.delete(key);
  }, () => {
    if (inflight.get(key) === requested) inflight.delete(key);
  });
  return rememberFile(cache, limit, key, requested);
}

export async function readFileTexts(api: RepositoryApi, cache: FileCache, limit: number, repo: string, shas: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(shas)];
  const inflight = inflightFiles(cache);
  const local = new Map<string, Promise<string>>();
  for (const sha of unique) {
    const key = fileKey(repo, sha);
    const content = cache.get(key) ?? inflight.get(key);
    if (content) local.set(sha, content);
  }
  const missing = unique.filter((sha) => !local.has(sha));
  const chunks: string[][] = [];
  for (let start = 0; start < missing.length; start += MAX_BATCH_FILES) chunks.push(missing.slice(start, start + MAX_BATCH_FILES));
  for (const chunk of chunks) {
    const batch = fileBatchQueue.run(() => api<FilesResult>("files", { repo, shas: chunk.join(",") }));
    void batch.catch(() => {});
    for (const sha of chunk) {
      const key = fileKey(repo, sha);
      const content = batch.then((result) => {
        if (typeof result.files[sha] !== "string") throw new Error("Could not read this file.");
        return result.files[sha];
      });
      local.set(sha, content);
      inflight.set(key, content);
      content.then(() => {
        if (inflight.get(key) === content) inflight.delete(key);
      }, () => {
        if (inflight.get(key) === content) inflight.delete(key);
      });
      rememberFile(cache, limit, key, content);
    }
  }
  const result: Record<string, string> = {};
  await Promise.all(unique.map(async (sha) => {
    result[sha] = await local.get(sha)!;
  }));
  return result;
}

export class RepositoryIndex {
  private byPath = new Map<string, Map<string, TreeEntry>>();
  private directories = new Map<string, Promise<TreeEntry[]>>();
  private seeded = new Set<string>();

  clear() {
    this.byPath.clear();
    this.directories.clear();
    this.seeded.clear();
  }

  seed(repo: Repository, snapshot: Snapshot) {
    const key = repositoryKey(repo.full_name, snapshot.commit);
    if (this.seeded.has(key)) return;
    const entries = snapshot.tree ?? snapshot.entries;
    this.index(key, entries);
    this.seeded.add(key);
  }

  entry(repo: Repository, snapshot: Snapshot, path: string) {
    return this.byPath.get(repositoryKey(repo.full_name, snapshot.commit))?.get(path);
  }

  async find(api: RepositoryApi, repo: Repository, snapshot: Snapshot, path: string): Promise<TreeEntry | undefined> {
    this.seed(repo, snapshot);
    const key = repositoryKey(repo.full_name, snapshot.commit);
    const known = this.byPath.get(key)?.get(path);
    if (known) return known.type === "blob" ? known : undefined;
    if (snapshot.tree) return undefined;
    let entries = snapshot.entries;
    let prefix = "";
    for (const part of path.split("/")) {
      const current = prefix ? `${prefix}/${part}` : part;
      const entry = entries.find((item) => item.path === part || item.path === current);
      if (!entry) return undefined;
      if (current === path) return entry.type === "blob" ? entry : undefined;
      if (entry.type !== "tree") return undefined;
      prefix = current;
      entries = await this.listDirectory(api, repo, snapshot, entry, prefix, false);
    }
    return undefined;
  }

  async listRepositoryFiles(api: RepositoryApi, repo: Repository, snapshot: Snapshot): Promise<string[]> {
    this.seed(repo, snapshot);
    if (snapshot.tree) return snapshot.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
    const root = snapshot.entries.filter((entry) => entry.type === "blob").map((entry) => entry.path);
    const folders = snapshot.entries.filter((entry) => entry.type === "tree" && entry.path !== "node_modules");
    const byFolder = new Map<string, string[]>();
    await runLimited(folders, TREE_LIMIT, async (folder) => {
      const listed = await this.listDirectory(api, repo, snapshot, folder, folder.path, true);
      byFolder.set(folder.path, listed.filter((entry) => entry.type === "blob").map((entry) => entry.path));
    });
    return [...new Set([...root, ...folders.flatMap((folder) => byFolder.get(folder.path) ?? [])])];
  }

  private async listDirectory(api: RepositoryApi, repo: Repository, snapshot: Snapshot, entry: TreeEntry, prefix: string, recursive: boolean) {
    const key = directoryKey(repo.full_name, entry.sha) + (recursive ? "\nrecursive" : "");
    let listed = this.directories.get(key);
    if (!listed) {
      listed = api<Directory>("tree", { repo: repo.full_name, sha: entry.sha, ...(recursive ? { recursive: "1" } : {}) }).then((directory) => directory.entries);
      this.directories.set(key, listed);
      listed.catch(() => {
        if (this.directories.get(key) === listed) this.directories.delete(key);
      });
    }
    const entries = (await listed).map((item) => ({ ...item, path: `${prefix}/${item.path}` }));
    this.index(repositoryKey(repo.full_name, snapshot.commit), entries);
    return entries;
  }

  private index(key: string, entries: TreeEntry[]) {
    let map = this.byPath.get(key);
    if (!map) {
      map = new Map();
      this.byPath.set(key, map);
    }
    for (const entry of entries) map.set(entry.path, entry);
  }
}
