import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHub, HttpError } from "../worker/github.ts";
import { fileAtRevision, history, restore } from "../worker/history.ts";
import { handle, type Env } from "../worker/app.ts";
import type { Repository } from "../shared/types.ts";

const repo: Repository = {
  id: 1,
  name: "starter",
  full_name: "lex/starter",
  owner: { login: "lex", type: "User" },
  private: true,
  default_branch: "main",
};
const head = "a".repeat(40);
const target = "b".repeat(40);
const headTree = "c".repeat(40);
const targetTree = "d".repeat(40);
const created = "e".repeat(40);

const emptyEnv: Env = {
  ASSETS: { fetch: async () => new Response("UI") },
  SESSIONS: {
    idFromName: (name) => name,
    get: () => ({ fetch: async () => new Response(null, { status: 404 }) }),
  },
};

test("history and restore HTTP endpoints enforce session and same-origin writes", async () => {
  const origin = "https://editor.example";
  const historyResponse = await handle(
    new Request(
      `${origin}/api/history?repo=lex/starter&branch=main&path=src/index.astro`,
    ),
    emptyEnv,
    async () => {
      throw new Error("must not contact GitHub");
    },
  );
  assert.equal(historyResponse.status, 401);
  const restoreResponse = await handle(
    new Request(`${origin}/api/restore?repo=lex/starter`, {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: "main",
        path: "src/index.astro",
        target,
        expectedHead: head,
      }),
    }),
    emptyEnv,
  );
  assert.equal(restoreResponse.status, 403);
  assert.equal(restoreResponse.headers.get("cache-control"), "no-store");
});

test("history freezes pagination at the first page head and maps commit metadata", async () => {
  const calls: string[] = [];
  const github = new GitHub("token", async (input) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname.includes("/branches/"))
      return Response.json({ commit: { sha: head } });
    return Response.json(
      Array.from({ length: 20 }, (_, index) => ({
        sha: String(index).padStart(40, "0"),
        html_url: `https://github.com/lex/starter/commit/${index}`,
        commit: {
          message: index === 0 ? "First line\n\nDetails" : `Commit ${index}`,
          author: { name: "Lex", date: "2026-09-21T10:00:00Z" },
        },
        author: index === 0 ? { login: "lex" } : null,
      })),
    );
  });

  const result = await history(github, repo, {
    branch: "feature/history",
    path: "src/index.astro",
    page: "1",
  });

  assert.equal(result.head, head);
  assert.equal(result.commits.length, 20);
  assert.equal(result.nextPage, 2);
  assert.deepEqual(result.commits[0], {
    sha: "0".repeat(40),
    message: "First line",
    author: "lex",
    date: "2026-09-21T10:00:00Z",
    url: "https://github.com/lex/starter/commit/0",
  });
  assert.ok(calls[0].endsWith("/branches/feature%2Fhistory"));
  assert.ok(calls[1].includes(`sha=${head}`));
  assert.ok(calls[1].includes("path=src%2Findex.astro"));
  assert.ok(calls[1].includes("per_page=20&page=1"));
});

test("history continuation uses its frozen head and bounds pagination", async () => {
  const calls: string[] = [];
  const github = new GitHub("token", async (input) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    return Response.json([]);
  });
  const result = await history(github, repo, {
    branch: "main",
    path: "src/index.astro",
    head,
    page: "2",
  });
  assert.equal(result.head, head);
  assert.equal(result.nextPage, null);
  assert.equal(
    calls.some((call) => call.includes("/branches/")),
    false,
  );
  for (const page of ["0", "1.5", "51", "oops"])
    await assert.rejects(
      () =>
        history(github, repo, {
          branch: "main",
          path: "src/index.astro",
          page,
        }),
      (error: HttpError) => error.status === 400,
    );
});

test("history pages continue without skipping a commit", async () => {
  const github = new GitHub("token", async (input) => {
    const url = new URL(String(input));
    const page = Number(url.searchParams.get("page"));
    const start = (page - 1) * 20;
    return Response.json(
      Array.from({ length: 20 }, (_, offset) => ({
        sha: String(start + offset).padStart(40, "0"),
        html_url: `https://example.com/${start + offset}`,
        commit: {
          message: `Commit ${start + offset}`,
          author: { name: "Lex", date: "2026-09-21T10:00:00Z" },
        },
        author: null,
      })),
    );
  });
  const first = await history(github, repo, {
    branch: "main",
    path: "src/index.astro",
    head,
    page: "1",
  });
  const second = await history(github, repo, {
    branch: "main",
    path: "src/index.astro",
    head,
    page: "2",
  });
  assert.equal(first.commits.at(-1)?.message, "Commit 19");
  assert.equal(second.commits[0].message, "Commit 20");
});

function restoreFixture(
  options: {
    current?: string;
    comparisonStatus?: string;
    targetMissing?: boolean;
    sameBlob?: boolean;
    race?: boolean;
  } = {},
) {
  const current = options.current ?? head;
  const calls: { path: string; method: string; body?: any }[] = [];
  const github = new GitHub("token", async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname, method, body });
    if (method === "POST") return Response.json({ sha: created });
    if (method === "PATCH")
      return options.race
        ? Response.json({}, { status: 422 })
        : Response.json({});
    if (url.pathname.includes("/branches/"))
      return Response.json({ commit: { sha: current } });
    if (url.pathname.includes("/compare/"))
      return Response.json({ status: options.comparisonStatus ?? "ahead" });
    if (url.pathname.endsWith(`/git/commits/${current}`))
      return Response.json({ tree: { sha: headTree } });
    if (url.pathname.endsWith(`/git/commits/${target}`))
      return Response.json({ tree: { sha: targetTree } });
    const treeSha = url.pathname.split("/").at(-1);
    if (treeSha === headTree || treeSha === targetTree)
      return Response.json({
        tree: [
          {
            path: "src",
            type: "tree",
            mode: "040000",
            sha: treeSha === headTree ? "1".repeat(40) : "2".repeat(40),
          },
        ],
        truncated: false,
      });
    const isTarget = treeSha === "2".repeat(40);
    const fileSha = options.sameBlob
      ? "6".repeat(40)
      : isTarget
        ? "7".repeat(40)
        : "6".repeat(40);
    return Response.json({
      tree:
        options.targetMissing && isTarget
          ? []
          : [
              {
                path: "index.astro",
                type: "blob",
                mode: "100644",
                sha: fileSha,
              },
            ],
      truncated: false,
    });
  });
  return { github, calls };
}

test("restore creates a single-file commit and fast-forwards the current head", async () => {
  const { github, calls } = restoreFixture();
  const result = await restore(github, repo, {
    branch: "main",
    path: "src/index.astro",
    target,
    expectedHead: head,
  });
  const commit = calls.find(
    (call) => call.method === "POST" && call.path.endsWith("/git/commits"),
  )!;
  assert.deepEqual(commit.body, {
    message: `Restore src/index.astro from ${target.slice(0, 7)} with Native Site Editor`,
    tree: created,
    parents: [head],
  });
  assert.deepEqual(
    calls.find(
      (call) => call.method === "POST" && call.path.endsWith("/git/trees"),
    )?.body,
    {
      base_tree: headTree,
      tree: [
        {
          path: "src/index.astro",
          mode: "100644",
          type: "blob",
          sha: "7".repeat(40),
        },
      ],
    },
  );
  assert.deepEqual(calls.at(-1)?.body, { sha: created, force: false });
  assert.deepEqual(result, {
    commit: created,
    branch: "main",
    url: `https://github.com/lex/starter/commit/${created}`,
    unchanged: false,
  });
});

test("restore rejects stale heads, non-ancestors, and workflow paths before writing", async () => {
  const stale = restoreFixture({ current: "9".repeat(40) });
  await assert.rejects(
    () =>
      restore(stale.github, repo, {
        branch: "main",
        path: "src/index.astro",
        target,
        expectedHead: head,
      }),
    (error: HttpError) => error.status === 409,
  );
  const unrelated = restoreFixture({ comparisonStatus: "diverged" });
  await assert.rejects(
    () =>
      restore(unrelated.github, repo, {
        branch: "main",
        path: "src/index.astro",
        target,
        expectedHead: head,
      }),
    (error: HttpError) => error.status === 400,
  );
  const workflow = restoreFixture();
  await assert.rejects(
    () =>
      restore(workflow.github, repo, {
        branch: "main",
        path: ".github/workflows/deploy.yml",
        target,
        expectedHead: head,
      }),
    (error: HttpError) => error.status === 403,
  );
  for (const fixture of [stale, unrelated, workflow])
    assert.equal(
      fixture.calls.some((call) => call.method !== "GET"),
      false,
    );
});

test("restoring the current head is idempotent", async () => {
  const { github, calls } = restoreFixture();
  const result = await restore(github, repo, {
    branch: "main",
    path: "src/index.astro",
    target: head,
    expectedHead: head,
  });
  assert.equal(result.unchanged, true);
  assert.equal(result.commit, head);
  assert.equal(
    calls.some((call) => call.method !== "GET"),
    false,
  );
});

test("restore rejects an absent historical file and treats matching blobs as unchanged", async () => {
  const missing = restoreFixture({ targetMissing: true });
  await assert.rejects(
    () =>
      restore(missing.github, repo, {
        branch: "main",
        path: "src/index.astro",
        target,
        expectedHead: head,
      }),
    (error: HttpError) => error.status === 409,
  );
  const same = restoreFixture({ sameBlob: true });
  const result = await restore(same.github, repo, {
    branch: "main",
    path: "src/index.astro",
    target,
    expectedHead: head,
  });
  assert.equal(result.unchanged, true);
  assert.equal(
    same.calls.some((call) => call.method !== "GET"),
    false,
  );
});

test("restore surfaces a concurrent ref race without forcing", async () => {
  const raced = restoreFixture({ race: true });
  await assert.rejects(
    () =>
      restore(raced.github, repo, {
        branch: "main",
        path: "src/index.astro",
        target,
        expectedHead: head,
      }),
    (error: HttpError) => error.status === 409,
  );
  assert.deepEqual(raced.calls.find((call) => call.method === "PATCH")?.body, {
    sha: created,
    force: false,
  });
});

test("a file's text at a commit is read through that commit's tree", async () => {
  const blob = "9".repeat(40);
  const github = new GitHub("token", async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith(`/git/commits/${target}`)) return Response.json({ tree: { sha: targetTree } });
    if (path.endsWith(`/git/trees/${targetTree}`))
      return Response.json({ tree: [{ path: "src", type: "tree", mode: "040000", sha: "2".repeat(40) }], truncated: false });
    if (path.endsWith(`/git/trees/${"2".repeat(40)}`))
      return Response.json({ tree: [{ path: "index.astro", type: "blob", mode: "100644", sha: blob }], truncated: false });
    if (path.endsWith(`/git/blobs/${blob}`))
      return Response.json({ sha: blob, size: 5, encoding: "base64", content: btoa("<h1/>") });
    return Response.json({ message: "Not Found" }, { status: 404 });
  });
  assert.deepEqual(await fileAtRevision(github, repo, { commit: target, path: "src/index.astro" }), { sha: blob, content: "<h1/>" });
  await assert.rejects(fileAtRevision(github, repo, { commit: target, path: "src/missing.astro" }), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(fileAtRevision(github, repo, { commit: "nope", path: "src/index.astro" }), (error: unknown) => error instanceof HttpError && error.status === 400);
});
