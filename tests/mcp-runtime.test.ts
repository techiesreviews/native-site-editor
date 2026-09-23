import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { textHash } from "../shared/agent.ts";

const sha = "a".repeat(40),
  origin = "https://editor.example";
test("MCP protocol reads context, queues guarded drafts, reports application, and revokes access in Workers", async () => {
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
  const repo = {
    id: 1,
    name: "starter",
    full_name: "lex/starter",
    private: true,
    default_branch: "main",
    owner: { login: "lex", type: "User" },
  };
  let allowed = true,
    githubWrites = 0;
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-09-17",
      durableObjects: {
        SESSIONS: { className: "SessionStore", useSQLite: true },
      },
      bindings: {
        GITHUB_CLIENT_ID: "test",
        GITHUB_CLIENT_SECRET: "test",
        GITHUB_APP_SLUG: "test",
      },
      outboundService: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/login/oauth/access_token")
          return Response.json({
            access_token: "github-private-token",
            expires_in: 28800,
          });
        if (request.method !== "GET") githubWrites++;
        if (path === "/user")
          return Response.json({ login: "lex", avatar_url: "" });
        if (path === "/user/installations")
          return Response.json({
            installations: [{ id: 1, account: { type: "User", login: "lex" } }],
          });
        if (path === "/user/installations/1/repositories")
          return Response.json({ repositories: allowed ? [repo] : [] });
        if (path.includes("/git/commits/"))
          return Response.json({ tree: { sha } });
        if (path.includes("/git/trees/"))
          return Response.json({
            tree: [{ path: "index.astro", sha, type: "blob", mode: "100644" }],
            truncated: false,
          });
        throw new Error(`Unexpected GitHub path: ${path}`);
      },
    }),
  );
  let client: Client | undefined;
  try {
    const start = await worker.dispatchFetch(origin + "/auth/login", {
      redirect: "manual",
    });
    const state = new URL(start.headers.get("location")!).searchParams.get(
      "state",
    )!;
    const callback = await worker.dispatchFetch(
      `${origin}/auth/callback?state=${state}&code=x`,
      {
        headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] },
        redirect: "manual",
      },
    );
    const cookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith("__Host-ase_session="))!
      .split(";")[0];
    const post = (path: string, body: unknown) =>
      worker.dispatchFetch(origin + path, {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const connection = await post("/api/agent/connect", {
      repo: repo.full_name,
      repoId: repo.id,
    });
    assert.equal(connection.status, 200);
    const { id, token } = await connection.json();
    const context = {
      repository: { id: 1, fullName: "lex/starter" },
      branch: "main",
      commit: sha,
      file: {
        path: "index.astro",
        baseSha: sha,
        language: "astro",
        readOnly: false,
        original: "<h1>Original</h1>",
        content: "<h1>My draft</h1>",
        selection: { startLine: 1, startColumn: 5, endLine: 1, endColumn: 13 },
        diagnostics: [],
      },
      drafts: [{ path: "index.astro", baseSha: sha, updatedAt: Date.now() }],
    };
    assert.equal(
      (await post(`/api/agent/context?id=${id}`, context)).status,
      200,
    );
    const denied = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    const legacy = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-test", version: "1" } } }),
    });
    assert.equal(legacy.status, 200);
    const legacyBody = await legacy.text();
    assert.ok(legacyBody.includes('"protocolVersion":"2025-11-25"'), legacyBody);
    const transport = new StreamableHTTPClientTransport(
      new URL(origin + "/mcp"),
      {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
        fetch: async (input, init) => {
          const response = await worker.dispatchFetch(
            String(input),
            init as any,
          );
          return new Response(await response.text(), {
            status: response.status,
            headers: response.headers as any,
          });
        },
      },
    );
    client = new Client({ name: "integration-test", version: "1.0.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "update_active_draft"));
    assert.ok(tools.tools.some((tool) => tool.name === "create_file_draft"));
    const read = await client.callTool({
      name: "read_active_file",
      arguments: {},
    });
    assert.ok(JSON.stringify(read).includes("My draft"));
    assert.ok(!JSON.stringify(read).includes("github-private-token"));
    const resource = await client.readResource({
      uri: "astro-editor://context",
    });
    assert.ok(JSON.stringify(resource).includes("index.astro"));
    const args = {
      requestId: "edit-1",
      path: "index.astro",
      branch: "main",
      commit: sha,
      expectedHash: await textHash(context.file.content),
      content: "<h1>Agent draft</h1>",
    };
    const queued = await client.callTool({
      name: "update_active_draft",
      arguments: args,
    });
    assert.equal(queued.isError, undefined, JSON.stringify(queued));
    assert.ok(JSON.stringify(queued).includes("pending"));
    const duplicate = await client.callTool({
      name: "update_active_draft",
      arguments: args,
    });
    assert.ok(JSON.stringify(duplicate).includes("pending"));
    const poll = await worker.dispatchFetch(
      `${origin}/api/agent/connection?id=${id}`,
      { headers: { Cookie: cookie } },
    );
    assert.equal((await poll.json()).commands.length, 1);
    assert.equal(
      (
        await post(`/api/agent/ack?id=${id}`, {
          id: "edit-1",
          state: "applied",
        })
      ).status,
      200,
    );
    const status = await client.callTool({
      name: "get_command_status",
      arguments: { requestId: "edit-1" },
    });
    assert.ok(JSON.stringify(status).includes("applied"));
    context.file.content = "typed meanwhile";
    await post(`/api/agent/context?id=${id}`, context);
    const stale = await client.callTool({
      name: "update_active_draft",
      arguments: { ...args, requestId: "edit-stale" },
    });
    assert.equal(stale.isError, true);
    const created = await client.callTool({
      name: "create_file_draft",
      arguments: {
        requestId: "new-1",
        path: "src/pages/new.astro",
        branch: "main",
        commit: sha,
        content: "<h1>New page</h1>",
      },
    });
    assert.ok(
      JSON.stringify(created).includes("pending"),
      JSON.stringify(created),
    );
    const collision = await client.callTool({
      name: "create_file_draft",
      arguments: {
        requestId: "new-2",
        path: "index.astro",
        branch: "main",
        commit: sha,
        content: "collision",
      },
    });
    assert.equal(collision.isError, true);
    assert.equal(githubWrites, 0, "MCP must not write to GitHub");
    allowed = false;
    await assert.rejects(() => client!.listTools());
    allowed = true;
    await post(`/api/agent/revoke?id=${id}`, {});
    await assert.rejects(() => client!.listTools());
    const reconnected = await (
      await post("/api/agent/connect", {
        repo: repo.full_name,
        repoId: repo.id,
      })
    ).json();
    await post("/auth/logout", {});
    const expired = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reconnected.token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(expired.status, 401);
    assert.equal(expired.headers.get("cache-control"), "no-store");
  } finally {
    await client?.close();
    await worker.dispose();
  }
});
