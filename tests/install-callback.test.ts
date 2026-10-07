import { repositoryCacheRequest } from "./session-cache-fake";
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
          const cacheResponse = await repositoryCacheRequest(request, records, id);
          if (cacheResponse) return cacheResponse;
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
  assert.equal(response.headers.get("location"), "/auth/login?from=install");
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

// Where a new sign-in goes: the worker decides after the session exists. An
// account without the App goes straight on to GitHub's install page (a case
// (a) return from that trip, or a sign-in that already ended one, is never
// sent back); /api/repositories reports what is left to do for an account with
// nothing to open (onboarding: "install" | "create" | null).

function account(options: { installed: boolean; repositories?: { id: number; name: string }[] }): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("/access_token")) return Response.json({ access_token: "tok", expires_in: 28800 });
    if (url.includes("/user/installations/1/repositories"))
      return Response.json({
        repositories: (options.repositories ?? []).map((repo) => ({
          ...repo,
          full_name: `lex/${repo.name}`,
          private: false,
          default_branch: "main",
          owner: { login: "lex", type: "User" },
        })),
      });
    if (url.includes("/user/installations")) return Response.json({ installations: options.installed ? [{ id: 1, account: { type: "User", login: "lex" } }] : [] });
    return Response.json({ login: "lex", avatar_url: "" });
  };
}

async function signIn(env: Env, fetcher: typeof fetch, path = "/auth/login") {
  const login = await handle(get(path), env);
  const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
  const oauth = cookieOf(login, "oauth")!.split(";")[0];
  return handle(get(`/auth/callback?code=c&state=${state}`, oauth), env, fetcher);
}
const sessionCookie = (response: Response) => cookieOf(response, "session")!.split(";")[0];

test("(a) a new sign-in with no installation goes straight on to /auth/install, signed in", async () => {
  const { env, records } = environment();
  const response = await signIn(env, account({ installed: false }));
  assert.equal(response.headers.get("location"), "/auth/install");
  assert.ok(sessionCookie(response), "the session exists before the trip");
  assert.ok([...records.values()].some((value) => value.kind === "user"));
  // /auth/install then starts the trip as ever.
  const trip = await handle(get("/auth/install", sessionCookie(response)), env);
  assert.match(trip.headers.get("location")!, /github\.com\/apps\/test-editor\/installations\/new/);
});

test("(b) installed but no repositories, and (c) installed with repositories, go to the editor; /api/repositories reports what is left", async () => {
  for (const [repositories, onboarding] of [
    [[], "create"],
    [[{ id: 7, name: "site" }], null],
  ] as const) {
    const { env } = environment();
    const fetcher = account({ installed: true, repositories: [...repositories] });
    const response = await signIn(env, fetcher);
    assert.equal(response.headers.get("location"), "/");
    const listing = await handle(get("/api/repositories", sessionCookie(response)), env, fetcher);
    assert.equal(listing.headers.get("X-Repository-Onboarding"), onboarding ?? "none");
  }
});

test("an account without the App is told to install it by /api/session, and a failed listing says nothing", async () => {
  const { env } = environment();
  const response = await signIn(env, account({ installed: true }));
  const cookie = sessionCookie(response);
  const none = await handle(get("/api/repositories", cookie), env, account({ installed: false }));
  assert.equal(none.headers.get("X-Repository-Onboarding"), "install");
  const broken: typeof fetch = async () => new Response("no", { status: 500 });
  const unknown = await handle(get("/api/repositories?refresh=1", cookie), env, broken);
  assert.equal(unknown.status, 502);
});

test("/api/repositories reuses one installation lookup for empty-account onboarding", async () => {
  for (const installed of [false, true]) {
    const { env } = environment();
    const response = await signIn(env, account({ installed: true }));
    const upstream = account({ installed });
    let lookups = 0;
    const fetcher: typeof fetch = async (input, init) => {
      if (new URL(String(input)).pathname === "/user/installations") lookups++;
      return upstream(input, init);
    };
    const listing = await handle(get("/api/repositories", sessionCookie(response)), env, fetcher);
    assert.deepEqual(await listing.json(), []);
    assert.equal(listing.headers.get("X-Repository-Onboarding"), installed ? "create" : "install");
    assert.equal(lookups, 1);
  }
});

test("no loop: a sign-in that ends the install trip, with the App still missing (cancelled), stays in the editor", async () => {
  // State from /auth/install (case (a) of the return): the sign-in is the end of that trip.
  {
    const { env } = environment();
    const { state, oauth, pending } = await install(env);
    const fetcher = account({ installed: false });
    const response = await handle(get(`/auth/callback?code=c&state=${state}`, `${oauth}; ${pending}`), env, fetcher);
    assert.equal(response.headers.get("location"), "/");
    const listing = await handle(get("/api/repositories", sessionCookie(response)), env, fetcher);
    assert.equal(listing.headers.get("X-Repository-Onboarding"), "install", "the Connect GitHub step offers the retry");
  }
  // The stateless return hands on to a fresh login that remembers it was the install trip.
  {
    const { env } = environment();
    const response = await signIn(env, account({ installed: false }), "/auth/login?from=install");
    assert.equal(response.headers.get("location"), "/");
  }
  // A fresh /auth/login forgets an unfinished trip, so the next sign-in starts it again.
  {
    const { env } = environment();
    const login = await handle(get("/auth/login"), env);
    assert.match(cookieOf(login, "install")!, /Max-Age=0/);
    const response = await signIn(env, account({ installed: false }));
    assert.equal(response.headers.get("location"), "/auth/install");
  }
});

test("an MCP authorization's return and a failed installation lookup are never redirected to the install page", async () => {
  const { env } = environment();
  const target = "/auth/mcp/authorize?client_id=x";
  const response = await signIn(env, account({ installed: false }), `/auth/login?return=${encodeURIComponent(target)}`);
  assert.equal(response.headers.get("location"), target);
  const { env: other } = environment();
  const broken: typeof fetch = async (input) =>
    String(input).includes("/access_token") ? Response.json({ access_token: "tok", expires_in: 28800 }) : String(input).includes("/user/installations") ? new Response("no", { status: 500 }) : Response.json({ login: "lex", avatar_url: "" });
  assert.equal((await signIn(other, broken)).headers.get("location"), "/");
});
