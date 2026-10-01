import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handle, type Env, type StoredValue } from "../worker/app.ts";
import { githubAppManifest } from "../worker/owner-setup.ts";

const origin = "https://editor.techies.tools";
const ownerToken = "a".repeat(64);

function environment() {
  const records = new Map<string, StoredValue>();
  const config = new Map<string, unknown>();
  const env: Env = {
    OWNER_SETUP_TOKEN: ownerToken,
    EDITOR_ORIGIN: origin,
    EDITOR_ALIASES: "https://native-site-editor.pages.dev",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          const path = new URL(request.url).pathname;
          if (path === "/config") {
            if (request.method === "PUT") {
              if (config.has(id)) return new Response(null, { status: 409 });
              config.set(id, await request.json());
              return new Response(null, { status: 204 });
            }
            const value = config.get(id);
            return value
              ? Response.json(value)
              : new Response(null, { status: 404 });
          }
          if (request.method === "PUT") {
            records.set(id, (await request.json()) as StoredValue);
            return new Response(null, { status: 204 });
          }
          if (request.method === "DELETE") {
            records.delete(id);
            return new Response(null, { status: 204 });
          }
          const value = records.get(id);
          if (path === "/consume") records.delete(id);
          return value
            ? Response.json(value)
            : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return { env, records, config };
}

test("manifest registers the private hosted App with exact permissions and callbacks", () => {
  const manifest = githubAppManifest(origin, ["https://native-site-editor.pages.dev"]);
  assert.equal(manifest.name, "native-site-editor-techies");
  assert.equal(manifest.public, true);
  assert.equal(manifest.url, origin);
  assert.equal(manifest.redirect_url, `${origin}/auth/setup/callback`);
  assert.ok(manifest.callback_urls.includes(`${origin}/auth/callback`));
  assert.ok(
    manifest.callback_urls.includes("https://native-site-editor.pages.dev/auth/callback"),
  );
  assert.deepEqual(manifest.default_permissions, {
    contents: "write",
    metadata: "read",
    actions: "read",
    administration: "write",
    pages: "write",
    workflows: "write",
    secrets: "write",
    statuses: "read",
    deployments: "read",
  });
  assert.equal(manifest.request_oauth_on_install, true);
  assert.equal((manifest as { setup_url?: string }).setup_url, undefined);
  assert.deepEqual(manifest.hook_attributes, {
    active: false,
    url: `${origin}/auth/setup/webhook`,
  });
});

test("owner setup requires canonical origin, fragment unlock token, and same-origin POST", async () => {
  const { env } = environment();
  assert.equal((await handle(new Request("https://native-site-editor.pages.dev/auth/setup"), env)).status, 403);
  assert.equal((await handle(new Request(`${origin}/auth/setup`), env)).status, 200);
  assert.equal(
    (
      await handle(
        new Request(`${origin}/auth/setup/unlock`, {
          method: "POST",
          headers: { Origin: "https://other.example", "Content-Type": "application/json" },
          body: JSON.stringify({ token: ownerToken }),
        }),
        env,
      )
    ).status,
    403,
  );
  const unlock = await handle(
    new Request(`${origin}/auth/setup/unlock`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: ownerToken }),
    }),
    env,
  );
  assert.equal(unlock.status, 200);
  assert.match(unlock.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
  assert.match(await unlock.text(), /"state":"[a-f0-9]{64}"/);
});

test("without EDITOR_ORIGIN, owner setup runs at the address the request came to", async () => {
  const { env } = environment();
  delete env.EDITOR_ORIGIN;
  delete env.EDITOR_ALIASES;
  const other = "https://editor.example.com";
  assert.equal((await handle(new Request(`${other}/auth/setup`), env)).status, 200);
  const manifest = await (await handle(new Request(`${other}/auth/setup/manifest`), env)).json();
  assert.equal(manifest.redirect_url, `${other}/auth/setup/callback`);
  assert.deepEqual(manifest.callback_urls, [`${other}/auth/callback`]);
});

test("setup callback consumes state once, persists credentials, and redacts secrets from browser responses", async () => {
  const { env, config } = environment();
  const unlock = await handle(
    new Request(`${origin}/auth/setup/unlock`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: ownerToken }),
    }),
    env,
  );
  const state = ((await unlock.json()) as { state: string }).state;
  const cookie = unlock.headers.get("set-cookie")!.split(";")[0];
  let conversions = 0;
  const callback = await handle(
    new Request(`${origin}/auth/setup/callback?code=fixture&state=${state}`, {
      headers: { Cookie: cookie },
    }),
    env,
    async () => {
      conversions++;
      return Response.json({
        client_id: "Iv1.fixture",
        client_secret: "secret-value",
        slug: "native-site-editor-techies",
        pem: "discard",
        webhook_secret: "discard",
      });
    },
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/auth/setup");
  assert.equal(conversions, 1);
  assert.deepEqual(config.get("native-site-editor/config"), {
    clientId: "Iv1.fixture",
    clientSecret: "secret-value",
    slug: "native-site-editor-techies",
  });
  assert.ok(!(await callback.text()).includes("secret-value"));
  const replay = await handle(
    new Request(`${origin}/auth/setup/callback?code=fixture&state=${state}`, {
      headers: { Cookie: cookie },
    }),
    env,
    async () => {
      conversions++;
      return Response.json({});
    },
  );
  assert.equal(replay.status, 302);
  assert.equal(replay.headers.get("location"), "/auth/setup");
  assert.equal(conversions, 1);
});

test("persisted GitHub App config is used for normal OAuth without exposing the secret", async () => {
  const { env, config } = environment();
  config.set("native-site-editor/config", {
    clientId: "Iv1.persisted",
    clientSecret: "persisted-secret",
    slug: "native-site-editor-techies",
  });
  const login = await handle(new Request(`${origin}/auth/login`), env);
  assert.equal(
    new URL(login.headers.get("location")!).searchParams.get("client_id"),
    "Iv1.persisted",
  );
  const info = await handle(new Request(`${origin}/api/session`), env);
  const text = await info.text();
  assert.ok(text.includes("native-site-editor-techies"));
  assert.ok(!text.includes("persisted-secret"));
});

test("Durable Object stores config write-once and preserves it across session delete", async () => {
  const { outputFiles } = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
    target: "es2022",
  });
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-09-17",
      durableObjects: {
        SESSIONS: { className: "SessionStore", useSQLite: true },
      },
      bindings: { OWNER_SETUP_TOKEN: ownerToken },
      outboundService: async (request) => {
        const path = new URL(request.url).pathname;
        if (path.includes("/app-manifests/"))
          return Response.json({
            client_id: "Iv1.runtime",
            client_secret: "runtime-secret",
            slug: "runtime-editor",
          });
        if (path === "/login/oauth/access_token")
          return Response.json({ access_token: "user-token", expires_in: 28800 });
        if (path === "/user")
          return Response.json({ login: "owner", avatar_url: "" });
        return Response.json({});
      },
    }),
  );
  try {
    const unlock = await worker.dispatchFetch(`${origin}/auth/setup/unlock`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: ownerToken }),
    });
    const state = ((await unlock.json()) as { state: string }).state;
    const cookie = unlock.headers.get("set-cookie")!.split(";")[0];
    const callback = await worker.dispatchFetch(
      `${origin}/auth/setup/callback?code=fixture&state=${state}`,
      { headers: { Cookie: cookie }, redirect: "manual" },
    );
    assert.equal(callback.status, 302);
    const info = await worker.dispatchFetch(`${origin}/api/session`);
    assert.equal((await info.json()).configured, true);
    const second = await worker.dispatchFetch(`${origin}/auth/setup/unlock`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: ownerToken }),
    });
    assert.equal(second.status, 409);
    const login = await worker.dispatchFetch(`${origin}/auth/login`, {
      redirect: "manual",
    });
    const oauthState = new URL(login.headers.get("location")!).searchParams.get(
      "state",
    )!;
    const oauthCookie = login.headers.get("set-cookie")!.split(";")[0];
    const userCallback = await worker.dispatchFetch(
      `${origin}/auth/callback?code=user-code&state=${oauthState}`,
      { headers: { Cookie: oauthCookie }, redirect: "manual" },
    );
    const sessionCookie = userCallback.headers
      .getSetCookie()
      .find((value) => value.startsWith("__Host-ase_session="))!
      .split(";")[0];
    await worker.dispatchFetch(`${origin}/auth/logout`, {
      method: "POST",
      headers: { Origin: origin, Cookie: sessionCookie },
    });
    const afterLogout = await worker.dispatchFetch(`${origin}/api/session`);
    assert.equal((await afterLogout.json()).configured, true);
  } finally {
    await worker.dispose();
  }
});

test("docs/native-github-app.json asks for the manifest's permissions", async () => {
  const { readFile } = await import("node:fs/promises");
  const doc = JSON.parse(await readFile("docs/native-github-app.json", "utf8"));
  const { administration, pages, workflows, secrets, statuses, deployments, contents, metadata, actions } = doc.parameters;
  assert.deepEqual(
    { contents, metadata, actions, administration, pages, workflows, secrets, statuses, deployments },
    githubAppManifest(origin).default_permissions,
  );
  const url = new URL(doc.registration_url);
  for (const key of ["pages", "workflows", "secrets", "statuses", "deployments"])
    assert.equal(url.searchParams.get(key), doc.parameters[key]);
});
