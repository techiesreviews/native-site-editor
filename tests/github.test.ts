import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHub, HttpError, detectAstro } from "../worker/github.ts";
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

test("truncated directories are never presented as complete", async () => {
  const github = new GitHub("secret", async () =>
    reply({ tree: [], truncated: true }),
  );
  await assert.rejects(
    () => github.tree(repo, sha),
    (error: HttpError) => error.status === 413,
  );
});

test("Astro detection distinguishes dependency, workspace and supporting-file evidence", () => {
  assert.equal(
    detectAstro({ dependencies: { astro: "^7.3.3" } }, []).status,
    "detected",
  );
  assert.equal(detectAstro({ workspaces: ["apps/*"] }, []).status, "ambiguous");
  assert.equal(
    detectAstro(null, [
      { path: "astro.config.mjs", type: "blob", sha, mode: "100644" },
    ]).status,
    "ambiguous",
  );
  assert.equal(
    detectAstro({ dependencies: { vite: "8" } }, []).status,
    "not-detected",
  );
});

test("invalid manifests are ambiguous, and symlink manifests are not followed", async () => {
  for (const mode of ["100644", "120000"]) {
    let blobReads = 0;
    const github = new GitHub("secret", async (input) => {
      if (String(input).includes("/git/trees/"))
        return reply({
          tree: [{ path: "package.json", type: "blob", sha, mode, size: 20 }],
          truncated: false,
        });
      blobReads++;
      return reply({ content: btoa("not json"), encoding: "base64", size: 8 });
    });
    const directory = await github.directory(repo, sha);
    assert.equal(
      directory.detection.status,
      mode === "100644" ? "ambiguous" : "not-detected",
    );
    assert.equal(blobReads, mode === "100644" ? 1 : 0);
  }
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
