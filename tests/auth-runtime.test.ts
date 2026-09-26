import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("Workers runtime completes GitHub sign-in and lists selected repositories", async () => {
  const { outputFiles } = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
    target: "es2022",
  });
  const repo = {
    id: 1,
    name: "starter",
    full_name: "test-user/starter",
    private: true,
    default_branch: "main",
    owner: { login: "test-user", type: "User" },
  };
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
      // Keep native Workers fetch intact; mock only the remote GitHub service.
      outboundService: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/login/oauth/access_token")
          return Response.json({
            access_token: "fixture-token",
            expires_in: 28800,
          });
        if (path === "/user")
          return Response.json({
            login: "test-user",
            avatar_url: "https://example.com/avatar",
          });
        if (path === "/user/installations")
          return Response.json({
            installations: [
              { id: 1, account: { type: "User", login: "test-user" } },
            ],
          });
        if (path === "/user/installations/1/repositories")
          return Response.json({ repositories: [repo] });
        throw new Error(`Unexpected fixture request: ${path}`);
      },
    }),
  );
  try {
    const origin = "https://editor.example";
    const start = await worker.dispatchFetch(`${origin}/auth/login`, {
      redirect: "manual",
    });
    const state = new URL(start.headers.get("location")!).searchParams.get(
      "state",
    )!;
    const oauthCookie = start.headers.get("set-cookie")!.split(";")[0];
    const callback = await worker.dispatchFetch(
      `${origin}/auth/callback?${new URLSearchParams({ state, code: "fixture-code" })}`,
      { headers: { Cookie: oauthCookie }, redirect: "manual" },
    );
    assert.equal(
      callback.headers.get("location"),
      "/",
      "Successful GitHub authorization must not return the generic error page",
    );
    const sessionCookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith("__Host-ase_session="))!
      .split(";")[0];
    const info = await worker.dispatchFetch(`${origin}/api/session`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal((await info.json()).user.login, "test-user");
    const repositories = await worker.dispatchFetch(
      `${origin}/api/repositories`,
      { headers: { Cookie: sessionCookie } },
    );
    assert.equal(repositories.status, 200);
    assert.deepEqual(await repositories.json(), [{ ...repo, installation_id: 1 }]);
  } finally {
    await worker.dispose();
  }
});
