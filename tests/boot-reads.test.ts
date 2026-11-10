import { after, test } from "node:test";
import assert from "node:assert/strict";
import { startBootReads, type BootResponse, type BootSession } from "../src/boot-reads.ts";

const scope = { source: "workspace", epoch: 1 };
const signedIn: BootResponse<BootSession> = { value: { user: { login: "lex" } }, sessionTag: "session-a" };
const listing = { value: { repositories: ["lex/site"], onboarding: "none" }, sessionTag: "session-a" };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test("boot starts both reads before either completes and adopts metadata together", async () => {
  const pending = deferred<BootResponse<BootSession>>();
  const calls: string[] = [];
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: () => { calls.push("session"); return pending.promise; },
    readRepositories: async () => { calls.push("repositories"); return listing; },
  });
  assert.deepEqual(calls, ["session", "repositories"]);
  pending.resolve(signedIn);
  assert.equal(await reads.takeRepositories(await reads.session), listing);
});

test("signed-out boot ignores a rejected speculative repository read", async () => {
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: async () => ({ value: { user: null } }),
    readRepositories: async () => { throw new Error("401"); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
});

test("repository failure falls back while session errors still propagate", async () => {
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: async () => signedIn, readRepositories: async () => { throw new Error("offline"); },
  });
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
  let started = false;
  const failed = startBootReads({ scope, isCurrent: () => true,
    readSession: () => { throw new Error("session unavailable"); },
    readRepositories: async () => { started = true; return listing; },
  });
  assert.equal(started, true);
  await assert.rejects(failed.session, /session unavailable/);
});

test("missing or different session tags cannot reuse same-account or other-account results", async () => {
  for (const sessionTag of [undefined, null, "", "same-account-new-session", "other-account-session"]) {
    const reads = startBootReads({ scope, isCurrent: () => true,
      readSession: async () => signedIn, readRepositories: async () => ({ ...listing, sessionTag }),
    });
    assert.equal(await reads.takeRepositories(await reads.session), undefined);
  }
  const reads = startBootReads({ scope, isCurrent: () => true,
    readSession: async () => ({ ...signedIn, sessionTag: undefined }), readRepositories: async () => listing,
  });
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
});

test("superseded source or epoch rejects adoption before and after a pending repository read", async () => {
  for (const next of [{ source: "other", epoch: 1 }, { source: "workspace", epoch: 2 }]) {
    let current = scope;
    const pending = deferred<typeof listing>();
    const reads = startBootReads({ scope, isCurrent: (captured) => captured.source === current.source && captured.epoch === current.epoch,
      readSession: async () => signedIn, readRepositories: () => pending.promise,
    });
    const taking = reads.takeRepositories(await reads.session);
    await Promise.resolve();
    current = next;
    pending.resolve(listing);
    assert.equal(await taking, undefined);
    assert.equal(await reads.takeRepositories(await reads.session), undefined);
  }
});

test("only this boot's resolved session can adopt its result, and scope is captured", async () => {
  const mutable = { ...scope };
  const reads = startBootReads({ scope: mutable, isCurrent: (captured) => captured.epoch === 1,
    readSession: async () => signedIn, readRepositories: async () => listing,
  });
  mutable.epoch = 2;
  assert.equal(await reads.takeRepositories({ ...signedIn }), undefined);
  assert.equal(await reads.takeRepositories(await reads.session), listing);
});

// The page's own first reads (src/boot-early.ts), before the editor's script has loaded.
const { startEarlyReads, takeEarlyRead, takeEarlySnapshot } = await import("../src/boot-reads.ts");
const { writeBootMemory } = await import("../src/boot-memory.ts");
const savedLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
let hash = "";
Object.defineProperty(globalThis, "location", { configurable: true, get: () => ({ hash }) });
after(() => {
  if (savedLocation) Object.defineProperty(globalThis, "location", savedLocation);
  else Reflect.deleteProperty(globalThis, "location");
  globalThis.aseEarlyReads = undefined;
});
function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
function fetcher() {
  const asked: { url: string; init?: RequestInit; answer: ReturnType<typeof deferred<Response>> }[] = [];
  const ask = ((url: string, init?: RequestInit) => {
    const answer = deferred<Response>();
    asked.push({ url, init, answer });
    return answer.promise;
  }) as typeof globalThis.fetch;
  return { fetch: ask, asked, urls: () => asked.map((entry) => entry.url) };
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
const sha = "1".repeat(40);

test("early: the session, the listing and the address's remembered repository's snapshot are asked at once", async () => {
  hash = "#repo=501&branch=main";
  const storage = memoryStore(), f = fetcher();
  writeBootMemory(storage, { login: "lex", repoId: 501, fullName: "lex/site", branch: "main", commit: sha, files: [] });
  let runtime = 0;
  startEarlyReads({ fetcher: f.fetch, storage, preloadRuntime: () => { runtime++; } });
  assert.deepEqual(f.urls(), ["/api/session", "/api/repositories", "/api/snapshot?repo=lex%2Fsite&branch=main"]);
  assert.equal(runtime, 0, "not before the session says a site will show");
  f.asked[0].answer.resolve(Response.json({ user: { login: "lex" } }));
  await settle();
  assert.equal(runtime, 1, "signed in, the repository named: its preview runtime is asked for");
  // The same request as the boot's own (src/github-reads.ts apiResponse) and the page's preloads.
  assert.equal(f.asked[0].init?.credentials, "include");
  assert.equal(f.asked[0].init?.cache, "no-store");
});

test("early, nothing remembered: the snapshot is asked as soon as the listing names the repository, not after the session; the boot still reads the listing", async () => {
  hash = "#repo=501&branch=main";
  const f = fetcher();
  const reads = startEarlyReads({ fetcher: f.fetch, storage: memoryStore() });
  assert.deepEqual(f.urls(), ["/api/session", "/api/repositories"]);
  f.asked[1].answer.resolve(Response.json([{ id: 7, full_name: "lex/other" }, { id: 501, full_name: "lex/site" }]));
  await settle();
  assert.deepEqual(f.urls(), ["/api/session", "/api/repositories", "/api/snapshot?repo=lex%2Fsite&branch=main"], "the session is still unanswered");
  const found = await reads.snapshot!.read;
  assert.equal(found?.fullName, "lex/site");
  assert.deepEqual(await (await reads.repositories!).json(), [{ id: 7, full_name: "lex/other" }, { id: 501, full_name: "lex/site" }]);
});

test("early: a listing that does not name the repository (or a signed-out 401) asks no snapshot", async () => {
  hash = "#repo=501&branch=main";
  for (const answer of [Response.json([{ id: 7, full_name: "lex/other" }]), Response.json({ error: "Sign in" }, { status: 401 })]) {
    const f = fetcher();
    const reads = startEarlyReads({ fetcher: f.fetch });
    f.asked[1].answer.resolve(answer);
    assert.equal(await reads.snapshot!.read, undefined);
    assert.equal(f.asked.length, 2);
  }
});

test("early: no repository in the address, no snapshot and no preview runtime", () => {
  hash = "";
  const f = fetcher();
  let runtime = 0;
  const reads = startEarlyReads({ fetcher: f.fetch, preloadRuntime: () => { runtime++; } });
  assert.deepEqual(f.urls(), ["/api/session", "/api/repositories"]);
  assert.equal(reads.snapshot, undefined);
  assert.equal(runtime, 0);
});

test("early: a try with no answer in the read timeout is given up, so the boot reads again", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  hash = "";
  const f = fetcher();
  startEarlyReads({ fetcher: f.fetch });
  const signal = f.asked[0].init?.signal;
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(8000);
  assert.equal(signal?.aborted, true);
});

test("the boot takes each early read once; a snapshot for another repository or branch is thrown away", async () => {
  hash = "#repo=501&branch=main";
  const f = fetcher();
  const reads = startEarlyReads({ fetcher: f.fetch, storage: memoryStore() });
  const { session, repositories, snapshot } = reads;
  globalThis.aseEarlyReads = reads;
  assert.equal(takeEarlyRead("session"), session);
  assert.equal(takeEarlyRead("session"), undefined, "asked afresh from now on");
  assert.equal(takeEarlyRead("repositories"), repositories);
  assert.equal(takeEarlySnapshot(501, "draft"), undefined);
  assert.equal(takeEarlySnapshot(501, "main"), undefined, "gone with the mismatch");
  globalThis.aseEarlyReads = { snapshot };
  assert.equal(takeEarlySnapshot(501, "main"), snapshot!.read);
});

test("the boot first: its claim leaves the early script nothing to ask", async () => {
  globalThis.aseEarlyReads = undefined;
  assert.equal(takeEarlyRead("session"), undefined);
  const claimed = globalThis.aseEarlyReads;
  assert.deepEqual(claimed, {});
  const savedFetch = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = (async () => { asked++; return new Response("{}"); }) as typeof fetch;
  try {
    await import("../src/boot-early.ts");
  } finally {
    globalThis.fetch = savedFetch;
  }
  assert.equal(asked, 0);
  assert.equal(globalThis.aseEarlyReads, claimed);
});

test("early: no preview runtime for a signed-out visit, or for an account whose list does not name the repository", async () => {
  hash = "#repo=501&branch=main";
  for (const [session, list] of [
    [Response.json({ user: null }), Response.json({ error: "Sign in" }, { status: 401 })],
    [Response.json({ user: { login: "other" } }), Response.json([{ id: 7, full_name: "other/site" }])],
  ] as const) {
    const f = fetcher();
    let runtime = 0;
    const reads = startEarlyReads({ fetcher: f.fetch, preloadRuntime: () => { runtime++; } });
    f.asked[0].answer.resolve(session);
    f.asked[1].answer.resolve(list);
    assert.equal(await reads.snapshot!.read, undefined);
    await settle();
    assert.equal(runtime, 0);
  }
});

test("early: a listing with no answer in the read timeout is given up, and no snapshot is asked", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  hash = "#repo=501&branch=main";
  // A fetch that never answers fails as the browser's does once its signal aborts.
  const asked: { url: string; signal?: AbortSignal | null }[] = [];
  const silent = ((url: string, init?: RequestInit) => {
    asked.push({ url, signal: init?.signal });
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
  }) as typeof fetch;
  const reads = startEarlyReads({ fetcher: silent, storage: memoryStore() });
  t.mock.timers.tick(8000);
  assert.equal(asked[1].signal?.aborted, true);
  assert.equal(await reads.snapshot!.read, undefined);
  assert.deepEqual(asked.map((entry) => entry.url), ["/api/session", "/api/repositories"]);
});

test("the boot takes only what the early script could have put there: anything else under the name is ignored", () => {
  hash = "";
  globalThis.aseEarlyReads = { session: "not a promise", repositories: {}, snapshot: { repoId: 501, branch: "main", read: 42 } } as never;
  assert.equal(takeEarlyRead("session"), undefined);
  assert.equal(takeEarlyRead("repositories"), undefined);
  assert.equal(takeEarlySnapshot(501, "main"), undefined);
  globalThis.aseEarlyReads = "taken" as never;
  assert.equal(takeEarlyRead("session"), undefined);
  globalThis.aseEarlyReads = undefined;
});
