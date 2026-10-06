import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHub, HttpError } from "../worker/github.ts";
import type { Repository } from "../shared/types.ts";

const sha = "a".repeat(40);
const repo: Repository = {
  id: 1,
  name: "starter",
  full_name: "lex/starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};
const reply = (data: unknown, status = 200) => Response.json(data, { status });

test("installation repository reads run six at a time and merge in installation order", async () => {
  const pending = new Map<number, (response: Response) => void>();
  let active = 0;
  let peak = 0;
  const installations = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1, account: { type: "Organization", login: `org-${index + 1}` },
  }));
  const github = new GitHub("secret", async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") return reply({ installations: [...installations].reverse() });
    const id = Number(path.split("/")[3]);
    active++;
    peak = Math.max(peak, active);
    const response = await new Promise<Response>((resolve) => pending.set(id, resolve));
    active--;
    return response;
  });
  const listing = github.repositories("lex");
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
  await tick();
  assert.deepEqual([...pending.keys()], [1, 2, 3, 4, 5, 6]);
  const finish = (id: number) => pending.get(id)!(reply({ repositories: [{
    ...repo, id, name: "site", full_name: `org-${id}/site`,
    owner: { login: `org-${id}`, type: "Organization" },
  }] }));
  finish(6);
  await tick();
  assert.ok(pending.has(7), "a completed read frees its slot");
  finish(7);
  await tick();
  assert.ok(pending.has(8));
  for (const id of [8, 5, 4, 3, 2, 1]) finish(id);
  assert.deepEqual((await listing).map((item) => item.installation_id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(peak, 6);
});

test("a partial installation failure rejects the whole listing and is not cached", async () => {
  let fail = true;
  const github = new GitHub("secret", async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") return reply({ installations: [
      { id: 1, account: { type: "User", login: "lex" } },
      { id: 2, account: { type: "Organization", login: "org" } },
    ] });
    if (path.includes("/2/") && fail) return reply({ message: "Forbidden" }, 403);
    return reply({ repositories: path.includes("/1/") ? [repo] : [] });
  });
  await assert.rejects(() => github.repositories("lex", 60_000), (error: HttpError) =>
    error.status === 403 && /GitHub denied access/.test(error.message));
  fail = false;
  assert.deepEqual((await github.repositories("lex", 60_000)).map((item) => item.id), [1]);
});

test("repository discovery can reuse the installation lookup for an empty account", async () => {
  let lookups = 0;
  const github = new GitHub("secret", async (input) => {
    if (new URL(String(input)).pathname === "/user/installations") {
      lookups++;
      return reply({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    }
    return reply({ repositories: [] });
  });
  const owners = github.ownerInstallations("lex");
  assert.deepEqual(await github.repositories("lex", 0, owners), []);
  assert.equal((await owners).length, 1);
  assert.equal(lookups, 1);
});

test("installation failures are reported in installation order despite reverse completion", async () => {
  let finishFirst!: (response: Response) => void;
  const github = new GitHub("secret", async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") return reply({ installations: [
      { id: 1, account: { type: "User", login: "lex" } },
      { id: 2, account: { type: "Organization", login: "org" } },
    ] });
    if (path.includes("/1/")) return new Promise<Response>((resolve) => { finishFirst = resolve; });
    // Let the second installation fail before the first completes.
    setImmediate(() => finishFirst(reply({ message: "Forbidden" }, 403)));
    return reply({ message: "Bad credentials" }, 401);
  });
  await assert.rejects(() => github.repositories("lex"), (error: HttpError) =>
    error.status === 403 && /GitHub denied access/.test(error.message));
});

test("repository discovery paginates and excludes unselected repositories and other personal accounts", async () => {
  const calls: string[] = [];
  const github = new GitHub("secret", async (input, init) => {
    assert.equal(new Headers(init?.headers).get("User-Agent"), "native-site-editor");
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname === "/user/installations")
      return reply({
        installations: [
          { id: 1, account: { type: "User", login: "lex" } },
          { id: 2, account: { type: "User", login: "someone-else" } },
        ],
      });
    if (url.searchParams.get("page") === "1")
      return reply({
        repositories: Array.from({ length: 100 }, (_, index) => ({
          ...repo,
          id: index + 1,
          name: `project-${index}`,
          full_name: `lex/project-${index}`,
        })),
      });
    return reply({ repositories: [repo] });
  });
  assert.equal((await github.repositories("lex")).length, 100);
  assert.ok(calls.some((call) => call.includes("page=2")));
  assert.ok(!calls.some((call) => call.includes("/installations/2/")));
  await assert.rejects(
    () => github.authorizeRepository("lex", "lex/not-selected"),
    (error: HttpError) => error.status === 403,
  );
});

/** A fake GitHub with a personal and an organisation installation, each listing its own repositories. */
function withOrganisation() {
  const calls: string[] = [];
  const mine = { ...repo, id: 1, name: "mine", full_name: "lex/mine" };
  const theirs = { ...repo, id: 2, name: "site", full_name: "company/site", owner: { login: "company", type: "Organization" } };
  const github = new GitHub("secret", async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/user/installations")
      return reply({
        installations: [
          { id: 22, account: { type: "Organization", login: "company" } },
          { id: 11, account: { type: "User", login: "lex" } },
          { id: 33, account: { type: "User", login: "someone-else" } },
        ],
      });
    if (url.pathname === "/user/installations/11/repositories") return reply({ repositories: [mine] });
    // GitHub lists only the organisation repositories the user can reach.
    if (url.pathname === "/user/installations/22/repositories")
      return reply({ repositories: [theirs, { ...theirs, id: 3, name: "x", full_name: "other/x", owner: { login: "other", type: "Organization" } }] });
    if (url.pathname.startsWith("/repos/")) return reply({ name: "ok" });
    throw new Error(`Unexpected ${url.pathname}`);
  });
  return { github, calls };
}

test("the listing merges the personal account's and organisations' repositories, each with its installation", async () => {
  const { github, calls } = withOrganisation();
  const listed = await github.repositories("lex");
  assert.deepEqual(listed.map((item) => [item.full_name, item.owner.type, item.installation_id]), [
    ["lex/mine", "User", 11],
    ["company/site", "Organization", 22],
  ]);
  assert.ok(!calls.includes("/user/installations/33/repositories"), "another personal account's installation is not read");
  assert.deepEqual(await github.ownerInstallations("lex"), [
    { id: 11, login: "lex", type: "User" },
    { id: 22, login: "company", type: "Organization" },
  ]);
});

test("a repository outside the listing is refused, an organisation's inside it is authorised", async () => {
  const { github, calls } = withOrganisation();
  assert.equal((await github.authorizeRepository("lex", "company/site")).installation_id, 22);
  for (const name of ["other/x", "company/hidden", "someone-else/their-site"])
    await assert.rejects(() => github.authorizeRepository("lex", name), (error: HttpError) => error.status === 403, name);
  assert.ok(!calls.some((path) => path.startsWith("/repos/")), "nothing was fetched from a refused repository");
});

test("branch slashes are encoded and the tree is fetched from one resolved commit", async () => {
  const paths: string[] = [];
  const github = new GitHub("secret", async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path.includes("/branches/")) return reply({ commit: { sha } });
    if (path.includes("/git/commits/"))
      return reply({ tree: { sha: "b".repeat(40) } });
    return reply({ tree: [], truncated: false });
  });
  const snapshot = await github.snapshot(repo, "experiment/new-hero");
  assert.equal(snapshot.commit, sha);
  assert.ok(paths[0].endsWith("/experiment%2Fnew-hero"));
  assert.ok(paths[1].endsWith(sha));
  assert.ok(paths[2].endsWith("b".repeat(40)));
});

test("snapshot lists the whole commit from the branch's tree and the recursive listing", async () => {
  const paths: string[] = [];
  const github = new GitHub("secret", async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname + url.search);
    if (url.pathname.includes("/branches/"))
      return reply({ commit: { sha, commit: { tree: { sha: "b".repeat(40) } } } });
    return reply({
      truncated: false,
      tree: [
        { path: "src", type: "tree", mode: "040000", sha: "1".repeat(40) },
        { path: "src/pages", type: "tree", mode: "040000", sha: "2".repeat(40) },
        { path: "src/pages/index.html", type: "blob", mode: "100644", sha: "3".repeat(40), size: 10 },
        { path: "README.md", type: "blob", mode: "100644", sha: "4".repeat(40), size: 5 },
      ],
    });
  });
  const snapshot = await github.snapshot(repo, "main");
  assert.equal(paths.length, 2, "no separate commit lookup when the branch carries the tree");
  assert.ok(paths[1].endsWith(`/git/trees/${"b".repeat(40)}?recursive=1`));
  assert.deepEqual(snapshot.entries.map((entry) => entry.path), ["src", "README.md"]);
  assert.deepEqual(snapshot.tree?.map((entry) => entry.path), ["README.md", "src", "src/pages", "src/pages/index.html"]);
});

test("a listing that does not descend into folders is not presented as the whole commit", async () => {
  const github = new GitHub("secret", async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/branches/")) return reply({ commit: { sha } });
    if (url.pathname.includes("/git/commits/")) return reply({ tree: { sha: "b".repeat(40) } });
    if (url.search.includes("recursive"))
      return reply({ truncated: false, tree: [{ path: "src", type: "tree", mode: "040000", sha: "1".repeat(40) }] });
    return reply({ truncated: false, tree: [{ path: "src", type: "tree", mode: "040000", sha: "1".repeat(40) }] });
  });
  const snapshot = await github.snapshot(repo, "main");
  assert.equal(snapshot.tree, undefined);
  assert.equal(snapshot.entries.length, 1);
  const truncated = new GitHub("secret", async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/branches/")) return reply({ commit: { sha } });
    if (url.pathname.includes("/git/commits/")) return reply({ tree: { sha: "b".repeat(40) } });
    return reply({ truncated: url.search.includes("recursive"), tree: [] });
  });
  assert.equal((await truncated.snapshot(repo, "main")).tree, undefined);
});

test("a folder's subtree is listed in one recursive request, and a truncated one is refused", async () => {
  const calls: string[] = [];
  const github = new GitHub("secret", async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    return reply({
      truncated: false,
      tree: [
        { path: "work", type: "tree", mode: "040000", sha: "1".repeat(40) },
        { path: "work/index.html", type: "blob", mode: "100644", sha: "2".repeat(40), size: 10 },
        { path: "index.html", type: "blob", mode: "100644", sha: "3".repeat(40), size: 10 },
      ],
    });
  });
  const listed = await github.subtree(repo, "c".repeat(40));
  assert.deepEqual(calls, [`/repos/lex/starter/git/trees/${"c".repeat(40)}?recursive=1`]);
  assert.deepEqual(listed.entries.map((entry) => entry.path), ["index.html", "work", "work/index.html"]);
  const truncated = new GitHub("secret", async () => reply({ truncated: true, tree: [] }));
  await assert.rejects(() => truncated.subtree(repo, "c".repeat(40)), (error: HttpError) => error.status === 413);
});

test("selected repositories are rechecked by default and shared briefly on request", async () => {
  let listings = 0;
  const fetcher: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") {
      listings++;
      return reply({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    }
    return reply({ repositories: [repo] });
  };
  const github = new GitHub("token-a", fetcher);
  await Promise.all([
    github.authorizeRepository("lex", repo.full_name, 60_000),
    github.authorizeRepository("lex", repo.full_name, 60_000),
  ]);
  assert.equal(listings, 1, "concurrent reads share one in-flight listing");
  await github.authorizeRepository("lex", repo.full_name, 60_000);
  assert.equal(listings, 1);
  await github.authorizeRepository("lex", repo.full_name);
  assert.equal(listings, 2, "the default always rechecks membership");
  await new GitHub("token-b", fetcher).authorizeRepository("lex", repo.full_name, 60_000);
  assert.equal(listings, 3, "another token never shares a listing");
  await new GitHub("token-a", async (input) => fetcher(input)).authorizeRepository("lex", repo.full_name, 60_000);
  assert.equal(listings, 4, "another fetch implementation never shares a listing");
  const failing = new GitHub("token-c", async () => reply({ message: "nope" }, 500));
  await assert.rejects(() => failing.authorizeRepository("lex", repo.full_name, 60_000));
  let recovered = 0;
  const later = new GitHub("token-c", async () => {
    recovered++;
    return reply({ installations: [] });
  });
  await assert.rejects(() => later.authorizeRepository("lex", repo.full_name, 60_000), (error: HttpError) => error.status === 403);
  assert.ok(recovered >= 1, "a failed listing is not remembered");
  const added = { ...repo, id: 2, name: "added", full_name: "lex/added" };
  const selected = [repo];
  let lookups = 0;
  const growing = new GitHub("token-d", async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") {
      lookups++;
      return reply({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    }
    return reply({ repositories: selected });
  });
  await growing.authorizeRepository("lex", repo.full_name, 60_000);
  selected.push(added);
  assert.equal((await growing.authorizeRepository("lex", added.full_name, 60_000)).id, 2, "a repository missing from a reused listing is looked up again");
  assert.equal(lookups, 2);
  await assert.rejects(() => growing.authorizeRepository("lex", "lex/never", 60_000), (error: HttpError) => error.status === 403);
});

test("batched file reads run concurrently and validate every revision", async () => {
  let inFlight = 0, peak = 0;
  const github = new GitHub("secret", async (input) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    const blob = new URL(String(input)).pathname.split("/").pop()!;
    return reply({ content: btoa(`file ${blob[0]}`), encoding: "base64", size: 6 });
  });
  const shas = ["1", "2", "3", "4"].map((digit) => digit.repeat(40));
  const files = await github.files(repo, [...shas, shas[0]]);
  assert.deepEqual(files, Object.fromEntries(shas.map((sha) => [sha, `file ${sha[0]}`])));
  assert.ok(peak > 1, "blobs are read in parallel");
  await assert.rejects(() => github.files(repo, ["not-a-sha"]), (error: HttpError) => error.status === 400);
  await assert.rejects(() => github.files(repo, []), (error: HttpError) => error.status === 400);
  await assert.rejects(
    () => github.files(repo, Array.from({ length: 65 }, (_, index) => index.toString(16).padStart(40, "0"))),
    (error: HttpError) => error.status === 400,
  );
});

test("truncated directories are never presented as complete", async () => {
  const github = new GitHub("secret", async () =>
    reply({ tree: [], truncated: true }),
  );
  await assert.rejects(
    () => github.tree(repo, sha),
    (error: HttpError) => error.status === 413,
  );
});

test("file reader rejects binary and oversized responses", async () => {
  const binary = new GitHub("secret", async () =>
    reply({ content: btoa("\0binary"), encoding: "base64", size: 7 }),
  );
  await assert.rejects(
    () => binary.file(repo, sha),
    (error: HttpError) => error.status === 415,
  );
  const text = "a".repeat(600_000);
  const large = new GitHub("secret", async () =>
    reply({ content: btoa(text), encoding: "base64", size: text.length }),
  );
  assert.equal(await large.file(repo, sha), text, "text files up to 1 MB are read");
  const huge = new GitHub("secret", async () =>
    reply({ content: "", encoding: "base64", size: 1024 * 1024 + 1 }),
  );
  await assert.rejects(
    () => huge.file(repo, sha),
    (error: HttpError) => error.status === 413,
  );
});

test("empty repositories, expired access and throttling have actionable errors", async () => {
  for (const [upstream, expected] of [
    [409, 409],
    [401, 401],
    [429, 429],
    [404, 404],
  ]) {
    const github = new GitHub("secret", async () => reply({}, upstream));
    await assert.rejects(
      () => github.branches(repo),
      (error: HttpError) => error.status === expected,
    );
  }
});

test("a branch head is read fresh; a commit the tab already saw ahead of it is the head, one behind it is not", async () => {
  const named = "1".repeat(40), known = "2".repeat(40);
  const asked: { path: string; cache?: string }[] = [];
  let status = "ahead";
  const github = new GitHub("secret", async (input, init) => {
    const url = new URL(String(input));
    asked.push({ path: url.pathname, cache: init?.cache });
    if (url.pathname.includes("/branches/")) return reply({ commit: { sha: named } });
    if (url.pathname.includes("/compare/")) return reply({ status });
    if (url.pathname.includes("/git/commits/")) return reply({ tree: { sha: "3".repeat(40) } });
    return reply({ tree: [], truncated: false });
  });
  // GitHub still names the commit before a save: the save's commit is the head.
  assert.deepEqual(await github.head(repo, "main", known), { sha: known, named });
  assert.equal(asked[0].cache, "no-store");
  assert.ok(asked[1].path.endsWith(`/compare/${named}...${known}`));
  assert.equal((await github.snapshot(repo, "main", known)).commit, known);
  // A merge moved the branch past it: GitHub's head.
  status = "behind";
  assert.equal((await github.head(repo, "main", known)).sha, named);
  // Nothing known, or the same: no comparison.
  asked.length = 0;
  assert.equal((await github.head(repo, "main")).sha, named);
  assert.equal((await github.head(repo, "main", named)).sha, named);
  assert.equal(asked.filter((call) => call.path.includes("/compare/")).length, 0);
});

test("GitHub's rate limits, the burst limit that only says so in its message included, read as a wait with drafts kept", async () => {
  const limits: [string, Response, RegExp][] = [
    ["secondary, message only", reply({ message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again." }, 403), /a few minutes/],
    ["secondary, retry-after", new Response("{}", { status: 403, headers: { "retry-after": "120" } }), /about 2 minutes/],
    ["hourly budget spent", new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) } }), /a minute/],
    ["429", reply({}, 429), /a few minutes/],
  ];
  for (const [name, response, wait] of limits) {
    const github = new GitHub("secret", async () => response);
    await assert.rejects(
      () => github.file(repo, sha),
      (error: HttpError) => {
        assert.equal(error.status, 429, name);
        assert.match(error.message, /^GitHub is limiting requests from your account for now\. Try again in /, name);
        assert.match(error.message, wait, name);
        assert.match(error.message, /your drafts are kept/, name);
        return true;
      },
    );
  }
  const denied = new GitHub("secret", async () => reply({ message: "Resource not accessible by integration" }, 403));
  await assert.rejects(() => denied.file(repo, sha), (error: HttpError) => error.status === 403);
  const offline = new GitHub("secret", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(() => offline.file(repo, sha), (error: HttpError) => error.status === 502);
});

test("blobs and trees are read from GitHub once, per repository, and failures are not kept", async () => {
  const asked: string[] = [];
  let fail = true;
  const fetcher = async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    asked.push(path);
    if (path.includes("/git/blobs/")) {
      if (fail) return reply({}, 502);
      return reply({ content: btoa("hello"), encoding: "base64", size: 5 });
    }
    if (path.includes("/git/commits/")) return reply({ tree: { sha: "b".repeat(40) } });
    return reply({ truncated: false, tree: [{ path: "index.html", mode: "100644", type: "blob", sha, size: 5 }] });
  };
  const github = new GitHub("secret", fetcher);
  await assert.rejects(() => github.file(repo, sha), (error: HttpError) => error.status === 502);
  fail = false;
  assert.equal(await github.file(repo, sha), "hello");
  // Another request's GitHub instance, even another token, shares what was read.
  assert.equal(await new GitHub("other", fetcher).file(repo, sha), "hello");
  assert.deepEqual(await github.files(repo, [sha]), { [sha]: "hello" });
  assert.equal((await github.raw(repo, sha)).size, 5);
  assert.equal(asked.filter((path) => path.includes("/git/blobs/")).length, 2, "the failure, then one read");
  // Another repository with the same blob is asked separately.
  await github.file({ ...repo, id: 2, name: "other", full_name: "lex/other" }, sha);
  assert.equal(asked.filter((path) => path.includes("/git/blobs/")).length, 3);

  const commit = "c".repeat(40);
  assert.equal((await github.commitTree(repo, commit)).length, 1);
  assert.equal((await github.commitTree(repo, commit)).length, 1);
  assert.equal(asked.filter((path) => /\/git\/(commits|trees)\//.test(path)).length, 2, "the commit and its tree, once");
});

test("blob texts are read in batched GraphQL queries, and a blob they do not give whole is read on its own", async () => {
  const sha = (n: number) => n.toString(16).padStart(40, "0");
  const texts: Record<string, { text: string | null; isBinary?: boolean; isTruncated?: boolean; byteSize?: number }> = {};
  for (let n = 1; n <= 150; n++) texts[sha(n)] = { text: `file ${n}` };
  texts[sha(1)] = { text: "﻿bom stripped", byteSize: 99 };
  texts[sha(2)] = { text: "cut", isTruncated: true };
  texts[sha(3)] = { text: null, isBinary: true };
  texts[sha(4)] = { text: "bad � bytes" };
  const queries: number[] = [];
  const blobs: string[] = [];
  const github = new GitHub("secret", async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/graphql") {
      const { query, variables } = JSON.parse(String(init!.body));
      assert.deepEqual(variables, { owner: "lex", name: "starter" });
      const repository: Record<string, unknown> = {};
      const asked = [...query.matchAll(/(f\d+): object\(oid: "([a-f0-9]{40})"\)/g)];
      queries.push(asked.length);
      for (const [, alias, oid] of asked) {
        const blob = texts[oid];
        repository[alias] = { isBinary: false, isTruncated: false, byteSize: new TextEncoder().encode(blob.text ?? "").length, ...blob };
      }
      return reply({ data: { repository } });
    }
    blobs.push(path.split("/").pop()!);
    return reply({ size: 4, encoding: "base64", content: btoa("rest") });
  });
  await github.prefetchTexts(repo, Object.keys(texts));
  assert.deepEqual(queries, [100, 50], "100 blobs per query");
  assert.equal(await github.file(repo, sha(5)), "file 5");
  assert.equal(await github.file(repo, sha(150)), "file 150");
  for (const n of [1, 2, 4]) assert.equal(await github.file(repo, sha(n)), "rest", `blob ${n} is read on its own`);
  assert.deepEqual(blobs, [sha(1), sha(2), sha(4)]);
  await github.prefetchTexts(repo, [sha(5), sha(6)]);
  assert.deepEqual(queries, [100, 50], "texts already held are not asked again");

  const limited = new GitHub("secret", async () => reply({ errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }));
  await assert.rejects(() => limited.prefetchTexts(repo, [sha(7)]), (error: HttpError) => error.status === 429 && /GitHub is limiting requests/.test(error.message));
});

test("a Worker subrequest limit is a 503 and any other network failure a 502", async () => {
  const limited = new GitHub("secret", async () => {
    throw new Error("Too many subrequests by single Worker invocation.");
  });
  await assert.rejects(
    () => limited.get("/user"),
    (error: HttpError) => error.status === 503 && /busy reading this site/.test(error.message),
  );
  const down = new GitHub("secret", async () => {
    throw new TypeError("Network connection lost.");
  });
  await assert.rejects(
    () => down.get("/user"),
    (error: HttpError) => error.status === 502 && /could not be reached/.test(error.message),
  );
});
