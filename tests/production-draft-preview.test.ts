import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import {
  createDraftPreview,
  draftPreviewAvailability,
} from "../worker/draft-preview.ts";
import { GitHub, HttpError } from "../worker/github.ts";
import type { Repository } from "../shared/types.ts";

const origin = "https://editor.example";
const repo: Repository = {
  id: 42,
  name: "starter",
  full_name: "lex/starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};
const head = "a".repeat(40);
const rootTree = "b".repeat(40);
const srcTree = "c".repeat(40);
const editorTree = "d".repeat(40);
const githubTree = "e".repeat(40);
const workflowsTree = "f".repeat(40);
const pageSha = "1".repeat(40);
const previewSha = "2".repeat(40);
const workflowSha = "3".repeat(40);
const treeSha = "4".repeat(40);
const commitSha = "5".repeat(40);
const workflow = readFileSync("fixtures/astro-starter/.github/workflows/astro-editor-preview.yml", "utf8");
const legacyWorkflow = workflow.replace(
  /      - name: Preview alias for this branch[\s\S]*?      - name: Upload preview version/,
  `      - name: Preview alias for this branch
        id: alias
        run: echo "name=$(echo "$GITHUB_REF_NAME" | tr -c 'a-zA-Z0-9\\n' '-' | tr 'A-Z' 'a-z' | cut -c1-63)" >> "$GITHUB_OUTPUT"
      - name: Upload preview version`,
);
const previewJson = JSON.stringify({
  provider: "cloudflare-workers-assets",
  worker: "astro-editor-starter",
  subdomain: "lexvd.workers.dev",
  revisionPath: "/.astro-editor/revision.json",
});
const request = {
  sessionId: "tab-1",
  repo: repo.full_name,
  branch: "main",
  baseCommit: head,
  files: [{ path: "src/pages/index.astro", content: "<h1>Draft</h1>" }],
};

function blob(content: string) {
  return {
    content: btoa(content),
    encoding: "base64",
    size: new TextEncoder().encode(content).length,
  };
}

function githubFixture(options: {
  sourceBranch?: string;
  branchHead?: string;
  workflowContent?: string;
  previewContent?: string;
  existingRef?: string | null;
  existingCommit?: { tree: string; parent: string; message: string };
  matchingRefs?: number;
  overlayMode?: string;
  pagesMode?: string;
  refCreateRace?: boolean;
  branchHeads?: string[];
} = {}) {
  const calls: { method: string; path: string; body?: any }[] = [];
  let refCreateAttempts = 0;
  let createdMessage = "";
  let branchReads = 0;
  const workflowContent = options.workflowContent ?? workflow;
  const previewContent = options.previewContent ?? previewJson;
  const sourceBranch = options.sourceBranch ?? "main";
  const sourceBranchPath = encodeURIComponent(sourceBranch);
  const blobContent = new Map([
    [pageSha, "<h1>Original</h1>"],
    [previewSha, previewContent],
    [workflowSha, workflowContent],
  ]);
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path === "/user/installations")
      return Response.json({ installations: [{ id: 7, account: { type: "User", login: "lex" } }] });
    if (path === "/user/installations/7/repositories")
      return Response.json({ repositories: [repo] });
    if (path.endsWith(`/branches/${sourceBranchPath}`))
      return Response.json({ commit: { sha: options.branchHeads?.[branchReads++] ?? options.branchHead ?? head } });
    if (path.endsWith(`/git/commits/${head}`))
      return Response.json({ tree: { sha: rootTree } });
    if (options.existingRef && path.endsWith(`/git/commits/${options.existingRef}`))
      return Response.json({
        tree: { sha: options.existingCommit?.tree ?? treeSha },
        parents: [{ sha: options.existingCommit?.parent ?? head }],
        message: options.existingCommit?.message ?? "",
      });
    if (path.endsWith(`/git/trees/${rootTree}`))
      return Response.json({
        truncated: false,
        tree: [
          { path: "src", type: "tree", mode: "040000", sha: srcTree },
          { path: ".astro-editor", type: "tree", mode: "040000", sha: editorTree },
          { path: ".github", type: "tree", mode: "040000", sha: githubTree },
        ],
      });
    if (path.endsWith(`/git/trees/${srcTree}`))
      return Response.json({
        truncated: false,
        tree: [{ path: "pages", type: options.pagesMode === "100644" ? "blob" : "tree", mode: options.pagesMode ?? "040000", sha: "6".repeat(40) }],
      });
    if (path.endsWith(`/git/trees/${"6".repeat(40)}`))
      return Response.json({
        truncated: false,
        tree: [{ path: "index.astro", type: "blob", mode: options.overlayMode ?? "100644", sha: pageSha }],
      });
    if (path.endsWith(`/git/trees/${editorTree}`))
      return Response.json({
        truncated: false,
        tree: [{ path: "preview.json", type: "blob", mode: "100644", sha: previewSha }],
      });
    if (path.endsWith(`/git/trees/${githubTree}`))
      return Response.json({
        truncated: false,
        tree: [{ path: "workflows", type: "tree", mode: "040000", sha: workflowsTree }],
      });
    if (path.endsWith(`/git/trees/${workflowsTree}`))
      return Response.json({
        truncated: false,
        tree: [{ path: "astro-editor-preview.yml", type: "blob", mode: "100644", sha: workflowSha }],
      });
    const found = blobContent.get(path.split("/").at(-1)!);
    if (found) return Response.json(blob(found));
    if (path.includes("/git/ref/heads/editor/draft-"))
      return options.existingRef || (options.refCreateRace && refCreateAttempts)
        ? Response.json({ object: { sha: options.existingRef ?? commitSha } })
        : Response.json({}, { status: 404 });
    if (path.includes("/git/matching-refs/heads/editor/draft-"))
      return Response.json(
        Array.from({ length: options.matchingRefs ?? 0 }, (_, index) => ({ ref: `refs/heads/editor/draft-x-${index}` })),
      );
    if (path.endsWith("/git/trees") && method === "POST")
      return Response.json({ sha: treeSha });
    if (path.endsWith("/git/commits") && method === "POST") {
      createdMessage = body.message;
      return Response.json({ sha: commitSha });
    }
    if (path.endsWith(`/git/commits/${commitSha}`) && options.refCreateRace)
      return Response.json({
        tree: { sha: treeSha },
        parents: [{ sha: head }],
        message: createdMessage,
      });
    if (path.endsWith("/git/refs") && method === "POST") {
      refCreateAttempts++;
      if (options.refCreateRace) return Response.json({}, { status: 422 });
      return Response.json({ ref: body.ref, object: { sha: body.sha } });
    }
    throw new Error(`Unexpected GitHub call: ${method} ${path}`);
  };
  const github = new GitHub("secret", fetcher);
  return { github, calls, fetcher };
}

function environment() {
  const records = new Map<string, StoredSession>();
  const env: Env = {
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "secret",
    GITHUB_APP_SLUG: "app",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          if (request.method === "PUT") {
            records.set(id, (await request.json()) as StoredSession);
            return new Response(null, { status: 204 });
          }
          const value = records.get(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return { env, records };
}

test("canonical preview workflow hash stays pinned to the starter fixture", () => {
  assert.equal(
    createHash("sha256").update(workflow).digest("hex"),
    "4ea8b0f913934c4caec0e6b583292959f962b307e9b8a3c08013c809aadaec43",
  );
});

test("GET availability requires exact source head and canonical setup", async () => {
  const available = await draftPreviewAvailability(githubFixture().github, repo, "main", head);
  assert.equal(available.available, true);
  if (available.available) {
    assert.equal(available.mode, "github-actions");
    assert.equal(available.revisionPath, "/.astro-editor/revision.json");
  }

  const stale = await draftPreviewAvailability(
    githubFixture({ branchHead: "9".repeat(40) }).github,
    repo,
    "main",
    head,
  );
  assert.equal(stale.available, false);

  const unsupported = await draftPreviewAvailability(
    githubFixture({ workflowContent: "name: custom\n" }).github,
    repo,
    "main",
    head,
  );
  assert.equal(unsupported.available, false);
});

test("GET availability still accepts the legacy canonical preview workflow", async () => {
  assert.equal(
    createHash("sha256").update(legacyWorkflow).digest("hex"),
    "fafd1181be22196f8f3e07f6bdb934bd2e96b7847f44fb5c401b2981cdca40e4",
  );
  const available = await draftPreviewAvailability(
    githubFixture({ workflowContent: legacyWorkflow }).github,
    repo,
    "main",
    head,
  );
  assert.equal(available.available, true);
});

test("POST creates an immutable deterministic draft branch and never patches the source branch", async () => {
  const { github, calls } = githubFixture();
  const result = await createDraftPreview(github, repo, request);
  assert.equal(result.status, "building");
  assert.equal(result.revision, commitSha);
  assert.deepEqual(result.sources, { "src/pages/index.astro": "<h1>Draft</h1>" });
  assert.match(result.previewUrl, /^https:\/\/editor-draft-[a-f0-9]{8}-[a-f0-9]{16}-astro-editor-starter\.lexvd\.workers\.dev\/$/);
  assert.equal(result.revisionUrl, result.previewUrl + ".astro-editor/revision.json");
  assert.equal(calls.some((call) => call.method === "PATCH"), false);
  const refWrite = calls.find((call) => call.path.endsWith("/git/refs") && call.method === "POST")!;
  assert.match(refWrite.body.ref, /^refs\/heads\/editor\/draft-[a-f0-9]{8}-[a-f0-9]{16}$/);
  assert.deepEqual(
    calls.find((call) => call.path.endsWith("/git/trees") && call.method === "POST")?.body,
    {
      base_tree: rootTree,
      tree: [{ path: "src/pages/index.astro", mode: "100644", type: "blob", content: "<h1>Draft</h1>" }],
    },
  );
});

test("POST returns branch preview URLs within Cloudflare alias length limits", async () => {
  const branch = "a".repeat(44);
  const { github } = githubFixture({ sourceBranch: branch });
  const result = await createDraftPreview(github, repo, { ...request, branch });
  const host = new URL(result.previewUrl).hostname.split(".")[0];
  assert.equal(host.length <= 63, true);
  assert.match(host, /^[a-z][a-z0-9-]*[a-z0-9]$/);
  assert.equal(host.startsWith("editor-draft-"), true);
  assert.equal(host.endsWith("-astro-editor-starter"), true);
});

test("POST with an empty overlay creates a base-tree build for undo to clean baseline", async () => {
  const { github, calls } = githubFixture();
  const result = await createDraftPreview(github, repo, { ...request, files: [] });
  assert.equal(result.status, "building");
  assert.deepEqual(result.sources, {});
  assert.deepEqual(
    calls.find((call) => call.path.endsWith("/git/trees") && call.method === "POST")?.body,
    { base_tree: rootTree, tree: [] },
  );
});

test("POST reuses an existing identical draft ref and rejects collisions without overwriting", async () => {
  const first = githubFixture();
  await createDraftPreview(first.github, repo, request);
  const marker = first.calls.find((call) => call.path.endsWith("/git/commits") && call.method === "POST")!.body.message;

  const retry = githubFixture({
    existingRef: commitSha,
    existingCommit: { tree: treeSha, parent: head, message: marker },
  });
  const result = await createDraftPreview(retry.github, repo, request);
  assert.equal(result.revision, commitSha);
  assert.equal(retry.calls.some((call) => call.path.endsWith("/git/refs") && call.method === "POST"), false);

  const collision = githubFixture({
    existingRef: commitSha,
    existingCommit: { tree: "9".repeat(40), parent: head, message: marker },
  });
  await assert.rejects(
    () => createDraftPreview(collision.github, repo, request),
    (error: HttpError) => error.status === 409 && error.message.includes("different content"),
  );
});

test("POST reuses a ref that appears during create-ref retry race", async () => {
  const { github, calls } = githubFixture({ refCreateRace: true });
  const result = await createDraftPreview(github, repo, request);
  assert.equal(result.revision, commitSha);
  assert.equal(calls.filter((call) => call.path.endsWith("/git/refs") && call.method === "POST").length, 1);
  assert.equal(calls.some((call) => call.method === "PATCH"), false);
});

test("POST rechecks the source branch immediately before creating a draft ref", async () => {
  const { github, calls } = githubFixture({ branchHeads: [head, "9".repeat(40)] });
  await assert.rejects(
    () => createDraftPreview(github, repo, request),
    (error: HttpError) => error.status === 409 && error.message.includes("Source branch changed"),
  );
  assert.equal(calls.some((call) => call.path.endsWith("/git/commits") && call.method === "POST"), false);
  assert.equal(calls.some((call) => call.path.endsWith("/git/refs") && call.method === "POST"), false);
});

test("POST rejects stale source, draft source branches, bad paths, non-directory ancestors, symlinks, invalid preview config and session quota", async () => {
  for (const input of [
    { ...request, branch: "editor/draft-abc" },
    { ...request, files: [{ path: ".github/workflows/x.yml", content: "x" }] },
    { ...request, files: [{ path: "../x", content: "x" }] },
    { ...request, files: [{ path: "src/pages/index.astro", content: "x" }, { path: "src/pages/index.astro", content: "y" }] },
    { ...request, files: [{ path: "src/pages/index.astro", content: "x".repeat(128 * 1024 + 1) }] },
    { ...request, files: Array.from({ length: 21 }, (_, index) => ({ path: `src/pages/${index}.astro`, content: "x" })) },
    { ...request, files: Array.from({ length: 9 }, (_, index) => ({ path: `src/pages/${index}.astro`, content: "x".repeat(128 * 1024) })) },
  ])
    await assert.rejects(() => createDraftPreview(githubFixture().github, repo, input), HttpError);

  await assert.rejects(
    () => createDraftPreview(githubFixture({ branchHead: "9".repeat(40) }).github, repo, request),
    (error: HttpError) => error.status === 409,
  );
  await assert.rejects(
    () => createDraftPreview(githubFixture({ overlayMode: "120000" }).github, repo, request),
    (error: HttpError) => error.status === 409,
  );
  await assert.rejects(
    () => createDraftPreview(githubFixture({ pagesMode: "100644" }).github, repo, request),
    (error: HttpError) => error.status === 409 && error.message.includes("parent is not a directory"),
  );
  await assert.rejects(
    () => createDraftPreview(githubFixture({ previewContent: JSON.stringify({ ...JSON.parse(previewJson), revisionPath: "//evil" }) }).github, repo, request),
    (error: HttpError) => error.status === 409,
  );
  await assert.rejects(
    () => createDraftPreview(githubFixture({ matchingRefs: 20 }).github, repo, request),
    (error: HttpError) => error.status === 429,
  );
});

test("unsupported preview setup rejects before any git object mutation", async () => {
  for (const options of [
    { workflowContent: "name: custom\n" },
    { previewContent: JSON.stringify({ ...JSON.parse(previewJson), worker: "bad_worker" }) },
  ]) {
    const { github, calls } = githubFixture(options);
    await assert.rejects(
      () => createDraftPreview(github, repo, request),
      (error: HttpError) => error.status === 409,
    );
    assert.equal(calls.some((call) => call.method === "POST" && /\/git\/(trees|commits|refs)$/.test(call.path)), false);
  }
});

test("HTTP route enforces session, same-origin POST, repository membership and request size", async () => {
  const { env, records } = environment();
  const id = "a".repeat(64);
  records.set(id, { kind: "user", token: "secret", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000 });
  const cookie = `__Host-ase_session=${id}`;

  const unauthenticated = await handle(new Request(`${origin}/api/draft-preview?repo=${repo.full_name}&branch=main&baseCommit=${head}`), env);
  assert.equal(unauthenticated.status, 401);

  const crossOrigin = await handle(new Request(`${origin}/api/draft-preview?repo=${repo.full_name}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: "https://other.example", "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }), env, githubFixture().fetcher);
  assert.equal(crossOrigin.status, 403);

  const tooLarge = await handle(new Request(`${origin}/api/draft-preview?repo=${repo.full_name}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, files: [{ path: "src/pages/index.astro", content: "x".repeat(2 * 1024 * 1024) }] }),
  }), env, githubFixture().fetcher);
  assert.equal(tooLarge.status, 413);

  const denied = await handle(new Request(`${origin}/api/draft-preview?repo=other/private`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, repo: "other/private" }),
  }), env, githubFixture().fetcher);
  assert.equal(denied.status, 403);

  const accepted = await handle(new Request(`${origin}/api/draft-preview?repo=${repo.full_name}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }), env, githubFixture().fetcher);
  assert.equal(accepted.status, 202);
  const body = await accepted.json() as { status: string; revision: string; previewUrl: string };
  assert.equal(body.status, "building");
  assert.equal(body.revision, commitSha);
  assert.match(body.previewUrl, /^https:\/\/editor-draft-/);
});
