// Onboarding through the real Worker in Miniflare: creating a repository,
// the Starter site, and what MCP tools say before there is a site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { EMPTY_COMMIT } from "../shared/types.ts";
import type { EditorContext } from "../shared/types.ts";
import { notSharingMessage } from "../worker/mcp.ts";
import { editorTab, origin, payload, repo, signIn, startWorker, workerFetch } from "./mcp-harness.ts";
import { tarball } from "./tar-helper.ts";

const created = {
  id: 9,
  name: "my-site",
  full_name: "lex/my-site",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};

/** The Worker over a fake GitHub that can create repositories and serve the starter tarball. */
async function onboardingWorker(github: { installations: number; create: number; requests: { path: string; body?: any }[] }) {
  const { outputFiles } = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["workerd"],
    external: ["cloudflare:workers"],
    target: "es2022",
  });
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-09-17",
      durableObjects: { SESSIONS: { className: "SessionStore", useSQLite: true } },
      bindings: { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/login/oauth/access_token") return Response.json({ access_token: "token", expires_in: 28800 });
        if (url.hostname === "codeload.github.com")
          return new Response(
            tarball({
              "index.html": "<h1>Starter</h1>",
              "wrangler.jsonc": "{}",
              ".editor/config.json": JSON.stringify({ site: { name: "Starter", url: "https://starter.example" } }),
            }) as BodyInit,
          );
        if (url.pathname === "/user") return Response.json({ login: "lex", avatar_url: "" });
        if (url.pathname === "/user/installations")
          return Response.json({
            installations: github.installations ? [{ id: github.installations, account: { type: "User", login: "lex" } }] : [],
          });
        if (url.pathname === "/user/installations/1/repositories") return Response.json({ repositories: [] });
        if (url.pathname === "/user/repos" && request.method === "POST") {
          github.requests.push({ path: url.pathname, body: await request.json() });
          if (github.create === 201) return Response.json(created, { status: 201 });
          return Response.json({ message: "x" }, { status: github.create });
        }
        throw new Error(`Unexpected GitHub request: ${request.method} ${url.pathname}`);
      },
    }),
  );
}

const post = (worker: Miniflare, cookie: string, body: unknown, headers: Record<string, string> = { Origin: origin }) =>
  worker.dispatchFetch(`${origin}/api/repositories`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("POST /api/repositories creates a repository on the signed-in account", async () => {
  const github = { installations: 1, create: 201, requests: [] as { path: string; body?: any }[] };
  const worker = await onboardingWorker(github);
  try {
    const { cookie } = await signIn(worker);
    const response = await post(worker, cookie, { name: " my-site ", private: true, description: "Mine" });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ...created, installation_id: 1 });
    assert.deepEqual(github.requests[0].body, { name: "my-site", private: true, description: "Mine", auto_init: false });
    // Privacy is opt-in: anything but true is a public repository.
    await post(worker, cookie, { name: "other", private: "yes" });
    assert.equal(github.requests[1].body.private, false);
  } finally {
    await worker.dispose();
  }
});

test("POST /api/repositories checks origin, session, body and name", async () => {
  const github = { installations: 1, create: 201, requests: [] as { path: string; body?: any }[] };
  const worker = await onboardingWorker(github);
  try {
    const { cookie } = await signIn(worker);
    assert.equal((await post(worker, cookie, { name: "a" }, {})).status, 403);
    assert.equal((await post(worker, cookie, { name: "a" }, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await post(worker, "", { name: "a" })).status, 401);
    assert.equal((await post(worker, cookie, { name: "no spaces allowed" })).status, 400);
    assert.equal((await post(worker, cookie, {})).status, 400);
    assert.equal((await post(worker, cookie, "{not json")).status, 400);
    const put = await worker.dispatchFetch(`${origin}/api/repositories`, { method: "PUT", headers: { Origin: origin, Cookie: cookie }, body: "{}" });
    assert.equal(put.status, 405);
    assert.deepEqual(github.requests, [], "nothing reached GitHub");
  } finally {
    await worker.dispose();
  }
});

test("POST /api/repositories reports no installation (404) and no permission (403)", async () => {
  const none = { installations: 0, create: 201, requests: [] as { path: string; body?: any }[] };
  let worker = await onboardingWorker(none);
  try {
    const { cookie } = await signIn(worker);
    assert.equal((await post(worker, cookie, { name: "my-site" })).status, 404);
  } finally {
    await worker.dispose();
  }
  const denied = { installations: 1, create: 403, requests: [] as { path: string; body?: any }[] };
  worker = await onboardingWorker(denied);
  try {
    const { cookie } = await signIn(worker);
    const response = await post(worker, cookie, { name: "my-site" });
    assert.equal(response.status, 403);
    assert.match(((await response.json()) as { error?: string }).error ?? "", /may not create/);
  } finally {
    await worker.dispose();
  }
});

test("GET /api/starter returns the prepared starter files for the named site", async () => {
  const github = { installations: 1, create: 201, requests: [] as { path: string; body?: any }[] };
  const worker = await onboardingWorker(github);
  try {
    const { cookie } = await signIn(worker);
    const response = await worker.dispatchFetch(`${origin}/api/starter?name=${encodeURIComponent("My site")}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const { files } = (await response.json()) as { files: { path: string; content: string }[] };
    assert.deepEqual(files.map((file) => file.path), [".editor/config.json", "index.html"]);
    assert.deepEqual(JSON.parse(files[0].content), { site: { name: "My site" } });
    assert.equal((await worker.dispatchFetch(`${origin}/api/starter`)).status, 401);
  } finally {
    await worker.dispose();
  }
});

/** An editor context for a repository with no commits (or commits but no home page). */
function emptyContext(commit: string): EditorContext {
  return { repository: { id: repo.id, fullName: repo.full_name }, branch: "main", commit, file: null, drafts: [] };
}

test("MCP before there is a site: guidance to sign in, open a repository, or start the site", async () => {
  const { worker } = await startWorker();
  let client: Client | undefined;
  try {
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);
    const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id })).json();
    client = new Client({ name: "onboarding-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(origin + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: workerFetch(worker) }),
    );
    const call = (name: string, args: Record<string, unknown> = {}) => client!.callTool({ name, arguments: args });
    const guidance = notSharingMessage(origin);

    // No tab shares anything yet.
    const none = payload(await call("get_site"));
    assert.equal(none.available, false);
    assert.equal(none.note, guidance);
    assert.match(none.note, /Continue with GitHub/);
    assert.match(none.note, /Get started/);
    assert.match(none.note, /gh repo create/);
    assert.ok(none.note.includes(origin));
    for (const [name, args] of [["read_file", { path: "index.html" }], ["list_files", {}], ["write_file", { path: "a.txt", content: "x" }]] as const) {
      const result = (await call(name, args)) as { isError?: boolean };
      assert.equal(result.isError, true, name);
      assert.ok(JSON.stringify(result).includes("Continue with GitHub"), name);
    }

    // The tab shares an empty repository.
    assert.equal((await tab.share(emptyContext(EMPTY_COMMIT))).status, 200);
    const empty = payload(await call("get_site"));
    assert.equal(empty.native, false);
    assert.equal(empty.empty, true);
    assert.match(empty.start, /no index\.html/);
    assert.match(empty.start, /write_file/);
    const noPage = (await call("create_page", { title: "About" })) as { isError?: boolean };
    assert.equal(noPage.isError, true);
    assert.match(JSON.stringify(noPage), /no site yet/);

    // The tab shares a repository that has commits but no home page.
    assert.equal((await tab.share(emptyContext("a".repeat(40)))).status, 200);
    const noHome = payload(await call("get_site"));
    assert.equal(noHome.native, false);
    assert.equal("empty" in noHome, false);
    assert.match(noHome.start, /no site yet/);
    assert.equal(((await call("create_page", { title: "About" })) as { isError?: boolean }).isError, true);
    assert.equal(((await call("get_page", { page: "/" })) as { isError?: boolean }).isError, true);
  } finally {
    await client?.close();
    await worker.dispose();
  }
});
