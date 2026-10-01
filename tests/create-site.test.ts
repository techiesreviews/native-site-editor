import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { tarball } from "./tar-helper.ts";

// Create site: POST /api/repositories with a startingPoint makes the repository
// and commits the starting point as its first commit, in one request.

const origin = "https://editor.example";
const sessionId = "c".repeat(64);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
const template = {
  "index.html": "<!doctype html><h1>Starter</h1>",
  "styles/site.css": "body{}",
  "images/logo.png": png,
  ".editor/config.json": JSON.stringify({ site: { name: "Starter", url: "https://starter.example" } }),
  "wrangler.jsonc": "{}",
  ".github/workflows/deploy.yml": "name: deploy",
};

function environment() {
  const records = new Map<string, StoredSession>([[sessionId, { kind: "user", token: "tok", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000 }]]);
  const env: Env = {
    GITHUB_CLIENT_ID: "c",
    GITHUB_CLIENT_SECRET: "s",
    GITHUB_APP_SLUG: "test-editor",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          if (request.method === "PUT") { records.set(id, (await request.json()) as StoredSession); return new Response(null, { status: 204 }); }
          if (request.method === "DELETE") { records.delete(id); return new Response(null, { status: 204 }); }
          const value = records.get(id);
          if (new URL(request.url).pathname === "/consume") records.delete(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return env;
}

interface Call { method: string; path: string; body?: any }
function fakeGitHub(options: { failTree?: boolean } = {}) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.hostname === "codeload.github.com" ? "codeload" : url.pathname, body });
    if (url.hostname === "codeload.github.com") return new Response(tarball(template) as BodyInit);
    const path = url.pathname;
    if (path === "/user/installations") return Response.json({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    if (path === "/user/repos") return Response.json({ id: 9, name: body.name, full_name: `lex/${body.name}`, private: body.private, default_branch: "main", owner: { login: "lex", type: "User" } }, { status: 201 });
    if (method === "PUT" && path.startsWith("/repos/lex/my-site/contents/")) return Response.json({ commit: { sha: "1".repeat(40) } }, { status: 201 });
    if (path.endsWith("/git/commits/" + "1".repeat(40))) return Response.json({ tree: { sha: "t0" } });
    if (path.endsWith("/git/blobs")) return Response.json({ sha: "b".repeat(40) }, { status: 201 });
    if (path.endsWith("/git/trees")) {
      if (options.failTree) return new Response("{}", { status: 422 });
      return Response.json({ sha: "t1" }, { status: 201 });
    }
    if (path.endsWith("/git/commits")) return Response.json({ sha: "2".repeat(40) }, { status: 201 });
    if (path.endsWith("/git/refs/heads/main")) return Response.json({});
    throw new Error(`Unexpected ${method} ${path}`);
  };
  return { fetcher, calls };
}

const post = (body: unknown) =>
  new Request(`${origin}/api/repositories`, {
    method: "POST",
    headers: { Origin: origin, Cookie: `__Host-ase_session=${sessionId}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("Create site with the Starter site commits it, an image included, without the template's deployment", async () => {
  const github = fakeGitHub();
  const response = await handle(post({ name: "my-site", private: false, startingPoint: "starter", siteName: "My site" }), environment(), github.fetcher);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.full_name, "lex/my-site");
  assert.equal(result.startingPointError, undefined);
  assert.equal(result.commit.sha, "2".repeat(40));
  assert.equal(result.commit.branch, "main");
  const put = github.calls.find((call) => call.method === "PUT")!;
  assert.equal(put.path, "/repos/lex/my-site/contents/index.html");
  assert.equal(put.body.branch, "main");
  assert.equal(atob(put.body.content), template["index.html"]);
  const blob = github.calls.find((call) => call.path.endsWith("/git/blobs"))!;
  assert.deepEqual([...Uint8Array.from(atob(blob.body.content), (c) => c.charCodeAt(0))], [...png]);
  const tree = github.calls.find((call) => call.path.endsWith("/git/trees"))!;
  const paths = tree.body.tree.map((entry: { path: string }) => entry.path).sort();
  assert.deepEqual(paths, [".editor/config.json", "images/logo.png", "styles/site.css"]);
  assert.equal(tree.body.tree.find((entry: { path: string }) => entry.path === "images/logo.png").sha, "b".repeat(40));
  const config = JSON.parse(tree.body.tree.find((entry: { path: string }) => entry.path === ".editor/config.json").content);
  assert.deepEqual(config, { site: { name: "My site" } });
  assert.ok(!github.calls.some((call) => /wrangler|\.github/.test(JSON.stringify(call.body ?? ""))));
  const ref = github.calls.find((call) => call.method === "PATCH")!;
  assert.deepEqual(ref.body, { sha: "2".repeat(40), force: false });
});

test("Create site with a blank page commits the page, its stylesheet and the settings, and fetches no template", async () => {
  const github = fakeGitHub();
  const response = await handle(post({ name: "my-site", private: true, startingPoint: "blank" }), environment(), github.fetcher);
  const result = await response.json();
  assert.equal(result.commit.files, 3);
  assert.ok(!github.calls.some((call) => call.path === "codeload"));
  assert.equal(github.calls.find((call) => call.method === "PUT")!.path, "/repos/lex/my-site/contents/index.html");
  const tree = github.calls.find((call) => call.path.endsWith("/git/trees"))!;
  assert.deepEqual(tree.body.tree.map((entry: { path: string }) => entry.path).sort(), [".editor/config.json", "styles/site.css"]);
  assert.match(atob(github.calls.find((call) => call.method === "PUT")!.body.content), /My site/);
});

test("a failed first commit leaves the repository and says startingPointError", async () => {
  const github = fakeGitHub({ failTree: true });
  const response = await handle(post({ name: "my-site", private: false, startingPoint: "starter" }), environment(), github.fetcher);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.full_name, "lex/my-site");
  assert.equal(result.commit, undefined);
  assert.match(result.startingPointError, /GitHub rejected|could not/);
  // index.html is already committed; the rest is missing, so the editor can finish without overwriting.
  assert.deepEqual(result.committed, ["index.html"]);
  assert.deepEqual([...result.missing].sort(), [".editor/config.json", "images/logo.png", "styles/site.css"]);
});

test("an unreachable template is a startingPointError too, and an unknown starting point is refused before anything is made", async () => {
  const failing: typeof fetch = async (input, init) => {
    if (new URL(String(input)).hostname === "codeload.github.com") return new Response("no", { status: 404 });
    return fakeGitHub().fetcher(input, init);
  };
  const result = await (await handle(post({ name: "my-site", private: false, startingPoint: "starter" }), environment(), failing)).json();
  assert.equal(result.full_name, "lex/my-site");
  assert.match(result.startingPointError, /starter site could not be read/);
  assert.deepEqual(result.committed, []);
  const github = fakeGitHub();
  const refused = await handle(post({ name: "my-site", private: false, startingPoint: "mystery" }), environment(), github.fetcher);
  assert.equal(refused.status, 400);
  assert.equal(github.calls.length, 0);
});

test("without a startingPoint the answer is the plain repository, as before", async () => {
  const github = fakeGitHub();
  const result = await (await handle(post({ name: "my-site", private: false }), environment(), github.fetcher)).json();
  assert.equal(result.full_name, "lex/my-site");
  assert.ok(!("commit" in result));
  assert.ok(!github.calls.some((call) => call.method === "PUT"));
});
