import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, type Env, type StoredSession } from "../worker/app.ts";

// /auth/install and /auth/callback when installing the App also signs in
// ("Request user authorization during installation"): GitHub may send the
// state back (a) or not (b); then an unused "install pending" cookie decides.

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
          if (request.method === "PUT") { records.set(id, (await request.json()) as StoredSession); return new Response(null, { status: 204 }); }
          if (request.method === "DELETE") { records.delete(id); return new Response(null, { status: 204 }); }
          const value = records.get(id);
          if (new URL(request.url).pathname === "/consume") records.delete(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return { env, records };
}
const origin = "https://editor.example";
const get = (path: string, cookie = "") => new Request(origin + path, { headers: { Cookie: cookie } });
let exchanges = 0;
const github: typeof fetch = async (input) => {
  if (String(input).includes("/access_token")) { exchanges++; return Response.json({ access_token: "tok", expires_in: 28800 }); }
  return Response.json({ login: "lex", avatar_url: "" });
};
const cookieOf = (response: Response, name: string) =>
  response.headers.getSetCookie().find((value) => value.startsWith(`__Host-ase_${name}=`));

async function install(env: Env) {
  const response = await handle(get("/auth/install"), env);
  const target = new URL(response.headers.get("location")!);
  const state = target.searchParams.get("state")!;
  return {
    response,
    target,
    state,
    oauth: cookieOf(response, "oauth")!.split(";")[0],
    pending: cookieOf(response, "install")!.split(";")[0],
  };
}

test("/auth/install goes to the App's installation page with a state, an oauth cookie and a short-lived install pending cookie", async () => {
  const { env } = environment();
  const { response, target, pending } = await install(env);
  assert.equal(response.status, 302);
  assert.equal(target.origin + target.pathname, "https://github.com/apps/test-editor/installations/new");
  assert.match(target.searchParams.get("state")!, /^[a-f0-9]{64}$/);
  const set = cookieOf(response, "install")!;
  assert.match(set, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.match(pending, /^__Host-ase_install=[a-f0-9]{64}$/);
});

test("case (a): the state comes back and matches the browser's state cookie", async () => {
  const { env, records } = environment();
  exchanges = 0;
  const { state, oauth, pending } = await install(env);
  const response = await handle(get(`/auth/callback?code=c&installation_id=5&setup_action=install&state=${state}`, `${oauth}; ${pending}`), env, github);
  assert.equal(response.headers.get("location"), "/");
  assert.ok(cookieOf(response, "session"));
  assert.equal(exchanges, 1);
  assert.ok([...records.values()].some((value) => value.kind === "user"));
  // The pending cookie is spent as well: it cannot sign anyone in later.
  const replay = await handle(get("/auth/callback?code=c", pending), env, github);
  assert.match(replay.headers.get("location")!, /error=/);
});

test("case (a): a state that is not the browser's is refused even with a pending cookie", async () => {
  const { env } = environment();
  exchanges = 0;
  const { oauth, pending } = await install(env);
  const response = await handle(get(`/auth/callback?code=c&state=${"d".repeat(64)}`, `${oauth}; ${pending}`), env, github);
  assert.match(response.headers.get("location")!, /error=/);
  assert.equal(exchanges, 0);
});

test("case (b): no state, but an unused install pending cookie: the code is discarded and the browser goes to a fresh /auth/login", async () => {
  const { env, records } = environment();
  exchanges = 0;
  const { oauth, pending } = await install(env);
  const response = await handle(get("/auth/callback?code=ATTACKERS-CODE&installation_id=5&setup_action=install", `${oauth}; ${pending}`), env, github);
  assert.equal(response.headers.get("location"), "/auth/login");
  assert.equal(exchanges, 0, "a code without a matching state is never exchanged");
  assert.ok(!cookieOf(response, "session"));
  assert.ok(![...records.values()].some((value) => value.kind === "user"));
  assert.match(cookieOf(response, "install")!, /Max-Age=0/);
  // The pending cookie is spent: it cannot be used again.
  const reused = await handle(get("/auth/callback?code=c", `${oauth}; ${pending}`), env, github);
  assert.match(reused.headers.get("location")!, /error=/);
  assert.equal(exchanges, 0);
  // The fresh login has its own state, which does sign in.
  const login = await handle(get("/auth/login"), env);
  const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
  const done = await handle(get(`/auth/callback?code=c&state=${state}`, cookieOf(login, "oauth")!.split(";")[0]), env, github);
  assert.equal(done.headers.get("location"), "/");
  assert.equal(exchanges, 1);
});

test("without state and without the install pending cookie the callback is refused", async () => {
  const { env } = environment();
  exchanges = 0;
  const response = await handle(get("/auth/callback?code=c&installation_id=5"), env, github);
  assert.match(response.headers.get("location")!, /error=/);
  // The oauth cookie alone is not enough without the state being sent back.
  const { oauth } = await install(env);
  const alone = await handle(get("/auth/callback?code=c", oauth), env, github);
  assert.match(alone.headers.get("location")!, /error=/);
  assert.equal(exchanges, 0);
});

test("an expired install pending cookie is refused", async () => {
  const { env, records } = environment();
  exchanges = 0;
  const { oauth, pending } = await install(env);
  const id = pending.split("=")[1];
  records.set(id, { kind: "install", expiresAt: Date.now() - 1 } as unknown as StoredSession);
  const response = await handle(get("/auth/callback?code=c", `${oauth}; ${pending}`), env, github);
  assert.match(response.headers.get("location")!, /error=/);
  assert.equal(exchanges, 0);
});

test("the stateless install return is logged without the code or a token", async () => {
  const { env } = environment();
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    const { oauth, pending } = await install(env);
    await handle(get("/auth/callback?code=secret-code", `${oauth}; ${pending}`), env, github);
  } finally {
    console.log = original;
  }
  assert.ok(lines.some((line) => line.includes("stateless install return")));
  assert.ok(!lines.join("\n").includes("secret-code"));
  assert.ok(!lines.join("\n").includes("tok"));
});

test("owner setup installs through /auth/install, so its sign-in has a state", async () => {
  const { env } = environment();
  env.OWNER_SETUP_TOKEN = "a".repeat(64);
  const status = await (await handle(get("/auth/setup/status"), env)).json();
  assert.equal(status.installUrl, "/auth/install");
  const page = await (await handle(get("/auth/setup"), env)).text();
  assert.ok(!page.includes("github.com/apps/"));
});

test("a sign-in GitHub sends to an alias address without a sign-in started there is handed on to the editor's own address", async () => {
  const { env } = environment();
  env.EDITOR_ORIGIN = origin;
  env.EDITOR_ALIASES = "https://alias.example";
  const before = exchanges;
  const response = await handle(new Request("https://alias.example/auth/callback?code=abc&installation_id=1&setup_action=install"), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${origin}/auth/callback?code=abc&installation_id=1&setup_action=install`);
  assert.equal(exchanges, before, "no code is exchanged on the alias");
});
