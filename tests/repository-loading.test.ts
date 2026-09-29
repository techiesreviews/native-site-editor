import { test } from "node:test";
import assert from "node:assert/strict";
import { loadNativeAssetRequests } from "../src/native-assets.ts";
import { RepositoryIndex, readFileTexts } from "../src/repository-loading.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";

const repo: Repository = {
  id: 1,
  name: "starter",
  full_name: "lex/starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};

const blob = (path: string, sha = path.padEnd(40, "0").slice(0, 40)): TreeEntry => ({ path, sha, type: "blob", mode: "100644" });
const tree = (path: string, sha = path.padEnd(40, "1").slice(0, 40)): TreeEntry => ({ path, sha, type: "tree", mode: "040000" });
const snapshot = (entries: TreeEntry[], commit = "c".repeat(40)): Snapshot => ({ branch: "main", commit, entries });

test("repository file reads keep only two batches in flight and reuse cache entries", async () => {
  let inFlight = 0, peak = 0, calls = 0;
  const api = async <T>(path: string, params?: Record<string, string>): Promise<T> => {
    assert.equal(path, "files", "large reads must not fall back to single-file reads");
    calls++;
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    const files = Object.fromEntries(params!.shas.split(",").map((sha) => [sha, `text ${sha}`]));
    return { files } as T;
  };
  const cache = new Map<string, Promise<string>>();
  const shas = Array.from({ length: 121 }, (_, index) => index.toString(16).padStart(40, "0"));
  const read = await readFileTexts(api, cache, 2, repo.full_name, [...shas, shas[0]]);
  assert.equal(Object.keys(read).length, 121);
  assert.equal(calls, 4);
  assert.equal(peak, 2);
  await readFileTexts(api, cache, 400, repo.full_name, shas.slice(0, 10));
  assert.equal(calls, 5);
});

test("repository file reads keep cache hits even when new batch entries evict the cache", async () => {
  const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40), d = "d".repeat(40);
  const cache = new Map<string, Promise<string>>([[`${repo.full_name}\n${a}`, Promise.resolve("cached a")]]);
  const asked: string[] = [];
  const api = async <T>(path: string, params?: Record<string, string>): Promise<T> => {
    assert.equal(path, "files", "cached hit must not fall back to a single file request");
    asked.push(...params!.shas.split(","));
    return { files: Object.fromEntries(params!.shas.split(",").map((sha) => [sha, `text ${sha}`])) } as T;
  };
  const read = await readFileTexts(api, cache, 2, repo.full_name, [a, b, c, d]);
  assert.equal(read[a], "cached a");
  assert.deepEqual(asked, [b, c, d]);
});

test("repository file read batches share the global queue across concurrent callers", async () => {
  let inFlight = 0, peak = 0;
  const api = async <T>(path: string, params?: Record<string, string>): Promise<T> => {
    assert.equal(path, "files");
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return { files: Object.fromEntries(params!.shas.split(",").map((sha) => [sha, sha])) } as T;
  };
  await Promise.all([
    readFileTexts(api, new Map(), 400, repo.full_name, Array.from({ length: 81 }, (_, index) => `a${index}`.padStart(40, "0"))),
    readFileTexts(api, new Map(), 400, repo.full_name, Array.from({ length: 81 }, (_, index) => `b${index}`.padStart(40, "0"))),
  ]);
  assert.equal(peak, 2);
});

test("overlapping repository file reads share in-flight blobs even after cache eviction", async () => {
  const cache = new Map<string, Promise<string>>();
  const asked: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const api = async <T>(path: string, params?: Record<string, string>): Promise<T> => {
    assert.equal(path, "files");
    const shas = params!.shas.split(",");
    asked.push(...shas);
    await gate;
    return { files: Object.fromEntries(shas.map((sha) => [sha, sha])) } as T;
  };
  const shas = Array.from({ length: 500 }, (_, index) => index.toString(16).padStart(40, "0"));
  const first = readFileTexts(api, cache, 2, repo.full_name, shas);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = readFileTexts(api, cache, 2, repo.full_name, shas);
  release();
  await Promise.all([first, second]);
  assert.equal(new Set(asked).size, 500);
  assert.equal(asked.length, 500);
});

test("failed repository file batches are not kept", async () => {
  let fail = true, calls = 0;
  const api = async <T>(): Promise<T> => {
    calls++;
    if (fail) throw new Error("nope");
    return { files: { ["a".repeat(40)]: "ok" } } as T;
  };
  const cache = new Map<string, Promise<string>>();
  await assert.rejects(() => readFileTexts(api, cache, 400, repo.full_name, ["a".repeat(40)]));
  fail = false;
  assert.deepEqual(await readFileTexts(api, cache, 400, repo.full_name, ["a".repeat(40)]), { ["a".repeat(40)]: "ok" });
  assert.equal(calls, 2);
});

test("fallback repository listing indexes paths and findEntry reuses them", async () => {
  const index = new RepositoryIndex();
  const root = snapshot([tree("pages", "p".repeat(40)), blob("index.html", "i".repeat(40))]);
  const calls: string[] = [];
  const api = async <T>(path: string, params?: Record<string, string>): Promise<T> => {
    calls.push(`${path}:${params?.sha}:${params?.recursive ?? ""}`);
    return { entries: [blob("about.html", "a".repeat(40)), tree("nested", "n".repeat(40))] } as T;
  };
  assert.deepEqual(await index.listRepositoryFiles(api, repo, root), ["index.html", "pages/about.html"]);
  assert.equal((await index.find(api, repo, root, "pages/about.html"))?.sha, "a".repeat(40));
  assert.deepEqual(calls, [`tree:${"p".repeat(40)}:1`]);
});

test("fallback repository listing keeps root and folder order after concurrent folder reads", async () => {
  const index = new RepositoryIndex();
  const root = snapshot([blob("a.html", "a".repeat(40)), tree("first", "1".repeat(40)), tree("second", "2".repeat(40)), blob("z.html", "z".repeat(40))]);
  const api = async <T>(_path: string, params?: Record<string, string>): Promise<T> => {
    if (params?.sha === "1".repeat(40)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { entries: [blob("one.html", "o".repeat(40))] } as T;
    }
    return { entries: [blob("two.html", "t".repeat(40))] } as T;
  };
  assert.deepEqual(await index.listRepositoryFiles(api, repo, root), ["a.html", "z.html", "first/one.html", "second/two.html"]);
});

test("repository index is scoped by repository and can be cleared on repository switch", async () => {
  const index = new RepositoryIndex();
  const first = snapshot([blob("index.html", "a".repeat(40))], "1".repeat(40));
  const second = { ...repo, id: 2, full_name: "lex/other" };
  index.seed(repo, first);
  index.seed(second, snapshot([blob("index.html", "b".repeat(40))], "1".repeat(40)));
  assert.equal(index.entry(repo, first, "index.html")?.sha, "a".repeat(40));
  assert.equal(index.entry(second, first, "index.html")?.sha, "b".repeat(40));
  index.clear();
  assert.equal(index.entry(repo, first, "index.html"), undefined);
});

test("directory cache stores relative entries so the same tree sha can appear under different folders", async () => {
  const index = new RepositoryIndex();
  const shared = "s".repeat(40);
  const root = snapshot([tree("one", shared), tree("two", shared)]);
  const api = async <T>(): Promise<T> => ({ entries: [blob("index.html", "i".repeat(40))] }) as T;
  assert.equal((await index.find(api, repo, root, "one/index.html"))?.path, "one/index.html");
  assert.equal((await index.find(api, repo, root, "two/index.html"))?.path, "two/index.html");
});

test("native asset loading runs four at a time and reports each loaded image progressively", async () => {
  let inFlight = 0, peak = 0;
  const progress: string[] = [];
  const loaded: string[] = [];
  await loadNativeAssetRequests({
    requests: Array.from({ length: 9 }, (_, index) => ({ path: `${index}.png`, type: "image/png" })),
    live: () => true,
    load: async (path) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return btoa(path);
    },
    onLoaded: (path, dataUrl) => {
      loaded.push(path);
      assert.match(dataUrl, /^data:image\/png;base64,/);
    },
    onMissing: () => assert.fail("all assets load"),
    onProgress: () => progress.push("tick"),
  });
  assert.equal(peak, 4);
  assert.equal(loaded.length, 9);
  assert.equal(progress.length, 9);
});

test("native asset loading drops stale completions", async () => {
  let live = true;
  const loaded: string[] = [];
  await loadNativeAssetRequests({
    requests: [{ path: "a.png", type: "image/png" }, { path: "b.png", type: "image/png" }],
    live: () => live,
    load: async (path) => {
      if (path === "a.png") live = false;
      return "x";
    },
    onLoaded: (path) => loaded.push(path),
    onMissing: () => assert.fail("stale loads do not report missing"),
    onProgress: () => assert.fail("stale loads do not update preview"),
  });
  assert.deepEqual(loaded, []);
});
