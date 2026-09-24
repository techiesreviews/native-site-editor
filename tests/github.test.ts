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

test("repository discovery paginates and excludes organizations and unselected repositories", async () => {
  const calls: string[] = [];
  const github = new GitHub("secret", async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname === "/user/installations")
      return reply({
        installations: [
          { id: 1, account: { type: "User", login: "lex" } },
          { id: 2, account: { type: "Organization", login: "company" } },
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
  const huge = new GitHub("secret", async () =>
    reply({ content: "a".repeat(300_000), encoding: "base64", size: 225_000 }),
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
