import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, type Env, type StoredSession } from "../worker/app.ts";

function environment() {
  const records = new Map<string, StoredSession>();
  const env: Env = {
    GITHUB_CLIENT_ID: "app-client",
    GITHUB_CLIENT_SECRET: "app-secret",
    GITHUB_APP_SLUG: "test-editor",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          if (request.method === "PUT") {
            records.set(id, (await request.json()) as StoredSession);
            return new Response(null, { status: 204 });
          }
          if (request.method === "DELETE") {
            records.delete(id);
            return new Response(null, { status: 204 });
          }
          const value = records.get(id);
          if (new URL(request.url).pathname === "/consume") records.delete(id);
          return value
            ? Response.json(value)
            : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return { env, records };
}
const origin = "https://editor.example";
const request = (path: string, cookie = "") =>
  new Request(origin + path, { headers: { Cookie: cookie } });

test("unauthenticated API calls fail without contacting GitHub", async () => {
  const { env } = environment();
  const response = await handle(request("/api/repositories"), env, async () => {
    throw new Error("must not call");
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("OAuth binds one-use state to the browser and stores tokens only server-side", async () => {
  const { env, records } = environment();
  const login = await handle(request("/auth/login"), env);
  const state = new URL(login.headers.get("location")!).searchParams.get(
    "state",
  )!;
  const stateCookie = `__Host-ase_oauth=${state}`;
  assert.match(
    login.headers.get("set-cookie")!,
    /HttpOnly; SameSite=Lax; Max-Age=600; Secure/,
  );
  let exchanges = 0;
  const github: typeof fetch = async (input) => {
    if (String(input).includes("/access_token")) {
      exchanges++;
      return Response.json({
        access_token: "never-send-to-browser",
        expires_in: 28800,
      });
    }
    return Response.json({
      login: "lex",
      avatar_url: "https://avatars.githubusercontent.com/u/1",
    });
  };
  const bad = await handle(
    request(`/auth/callback?code=code&state=${state}`),
    env,
    github,
  );
  assert.match(bad.headers.get("location")!, /error=/);
  assert.equal(exchanges, 0);
  const callback = await handle(
    request(`/auth/callback?code=code&state=${state}`, stateCookie),
    env,
    github,
  );
  assert.equal(callback.headers.get("location"), "/");
  assert.equal(exchanges, 1);
  const cookie = callback.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Host-ase_session="))!
    .split(";")[0];
  assert.ok(!cookie.includes("never-send-to-browser"));
  assert.ok(
    [...records.values()].some(
      (value) =>
        value.kind === "user" && value.token === "never-send-to-browser",
    ),
  );
  const info = await handle(request("/api/session", cookie), env, github);
  const text = await info.text();
  assert.ok(text.includes("lex"));
  assert.ok(!text.includes("never-send-to-browser"));
  const replay = await handle(
    request(`/auth/callback?code=code&state=${state}`, stateCookie),
    env,
    github,
  );
  assert.match(replay.headers.get("location")!, /error=/);
  assert.equal(exchanges, 1);
});

test("expired sessions and OAuth state cannot be used", async () => {
  const { env, records } = environment();
  const id = "a".repeat(64);
  records.set(id, {
    kind: "user",
    token: "secret",
    login: "lex",
    avatar_url: "",
    expiresAt: Date.now() - 1,
  });
  assert.equal(
    (
      await handle(
        request("/api/repositories", `__Host-ase_session=${id}`),
        env,
      )
    ).status,
    401,
  );
  records.set(id, { kind: "oauth", expiresAt: Date.now() - 1 });
  const response = await handle(
    request(`/auth/callback?state=${id}&code=x`, `__Host-ase_oauth=${id}`),
    env,
  );
  assert.match(response.headers.get("location")!, /error=/);
});

test("logout rejects cross-origin requests and invalidates the server session", async () => {
  const { env, records } = environment();
  const id = "b".repeat(64);
  records.set(id, {
    kind: "user",
    token: "secret",
    login: "lex",
    avatar_url: "",
    expiresAt: Date.now() + 60_000,
  });
  for (const allowed of [false, true]) {
    const response = await handle(
      new Request(origin + "/auth/logout", {
        method: "POST",
        headers: {
          Origin: allowed ? origin : "https://other.example",
          Cookie: `__Host-ase_session=${id}`,
        },
      }),
      env,
    );
    assert.equal(response.status, allowed ? 204 : 403);
    assert.equal(records.has(id), !allowed);
  }
});

test("several GitHub accounts stay signed in, switch, and sign out one at a time", async () => {
  const { env, records } = environment();
  const cookies = new Map<string, string>();
  const jar = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const keep = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";");
      const [name, value] = pair.split("=");
      if (attributes.some((part) => part.trim() === "Max-Age=0")) cookies.delete(name);
      else cookies.set(name, value);
    }
  };
  async function signIn(login: string, add = false) {
    const start = await handle(request(add ? "/auth/login?add=1" : "/auth/login", jar()), env);
    const target = new URL(start.headers.get("location")!);
    assert.equal(target.searchParams.get("prompt"), add ? "select_account" : null);
    keep(start);
    const state = target.searchParams.get("state")!;
    const callback = await handle(request(`/auth/callback?code=code&state=${state}`, jar()), env, async (input) =>
      String(input).includes("/access_token")
        ? Response.json({ access_token: `token-${login}`, expires_in: 28800 })
        : Response.json({ login, avatar_url: `https://avatars.githubusercontent.com/${login}` }),
    );
    assert.equal(callback.headers.get("location"), "/");
    keep(callback);
  }
  const accounts = async () => {
    const info = await (await handle(request("/api/session", jar()), env, async () => Response.json({ installations: [] }))).json();
    return info.accounts.map((account: { login: string; current: boolean }) => `${account.login}${account.current ? "*" : ""}`);
  };
  await signIn("lex");
  await signIn("work", true);
  assert.deepEqual(await accounts(), ["work*", "lex"]);
  // Signing in to an account already here replaces its session.
  await signIn("lex", true);
  assert.deepEqual(await accounts(), ["lex*", "work"]);
  assert.equal([...records.values()].filter((value) => value.kind === "user").length, 2);
  const post = (path: string, body?: unknown, from = origin) =>
    new Request(origin + path, {
      method: "POST",
      headers: { Origin: from, Cookie: jar(), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal((await handle(post("/api/accounts/switch", { login: "work" }, "https://other.example"), env)).status, 403);
  assert.equal((await handle(post("/api/accounts/switch", { login: "stranger" }), env)).status, 404);
  const switched = await handle(post("/api/accounts/switch", { login: "work" }), env);
  assert.equal(switched.status, 204);
  keep(switched);
  assert.deepEqual(await accounts(), ["work*", "lex"]);
  const first = await handle(post("/auth/logout"), env);
  assert.deepEqual(await first.json(), { login: "lex" });
  keep(first);
  assert.deepEqual(await accounts(), ["lex*"]);
  const last = await handle(post("/auth/logout"), env);
  assert.equal(last.status, 204);
  keep(last);
  assert.equal([...records.values()].filter((value) => value.kind === "user").length, 0);
  assert.equal(cookies.size, 0);
});

test("all repository data endpoints recheck the selected repository boundary", async () => {
  const { env, records } = environment();
  const id = "c".repeat(64);
  records.set(id, {
    kind: "user",
    token: "secret",
    login: "lex",
    avatar_url: "",
    expiresAt: Date.now() + 60_000,
  });
  for (const endpoint of ["branches", "snapshot", "tree", "file", "files"]) {
    const response = await handle(
      request(
        `/api/${endpoint}?repo=other/private&sha=${"a".repeat(40)}`,
        `__Host-ase_session=${id}`,
      ),
      env,
      async (input) => {
        assert.equal(new URL(String(input)).pathname, "/user/installations");
        return Response.json({ installations: [] });
      },
    );
    assert.equal(response.status, 403);
  }
});

test("publish requires same-origin JSON, POST, a valid session and selected repository membership", async () => {
  const { env, records } = environment();
  const id = "d".repeat(64);
  records.set(id, { kind: "user", token: "secret", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000 });
  for (const scenario of [
    { method: "GET", origin, cookie: id, status: 405 },
    { method: "POST", origin: "https://other.example", cookie: id, status: 403 },
    { method: "POST", origin, cookie: "", status: 401 },
    { method: "POST", origin, cookie: id, status: 403 },
  ]) {
    let calls = 0;
    const response = await handle(new Request(origin + "/api/publish?repo=other/private", {
      method: scenario.method,
      headers: { Origin: scenario.origin, "Content-Type": "application/json", Cookie: `__Host-ase_session=${scenario.cookie}` },
      body: scenario.method === "POST" ? JSON.stringify({ branch: "main", files: [] }) : undefined,
    }), env, async () => { calls++; return Response.json({ installations: [] }); });
    assert.equal(response.status, scenario.status);
    assert.equal(calls, scenario.cookie === id && scenario.origin === origin && scenario.method === "POST" ? 1 : 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
