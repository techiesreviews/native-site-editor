import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { repositoryCacheRequest } from "./session-cache-fake.ts";

function fixture() {
  const records = new Map<string, StoredSession>();
  const env: Env = {
    GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret", GITHUB_APP_SLUG: "editor",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({ fetch: async (request) => {
        const cached = await repositoryCacheRequest(request, records, id);
        if (cached) return cached;
        const value = records.get(id);
        return value ? Response.json(value) : new Response(null, { status: 404 });
      } }),
    },
  };
  const fetcher: typeof fetch = async (input) => Response.json(String(input).includes("/repositories")
    ? { repositories: [{ id: 1, name: "site", full_name: "lex/site", private: true, default_branch: "main", owner: { login: "lex", type: "User" } }] }
    : { installations: [{ id: 1, account: { login: "lex", type: "User" } }] });
  const read = (path: string, id?: string) => handle(new Request(`https://editor.example${path}`, {
    headers: id ? { Cookie: `__Host-ase_session=${id}` } : {},
  }), env, fetcher);
  return { records, read };
}

test("authenticated boot GETs carry matching noncredential session tags and retain JSON/header contracts", async () => {
  const { records, read } = fixture();
  const first = "a".repeat(64), second = "b".repeat(64), other = "c".repeat(64);
  for (const id of [first, second, other]) records.set(id, { kind: "user", token: "private-token", login: id === other ? "other" : "lex", avatar_url: "", expiresAt: Date.now() + 60000 });
  const tags: string[] = [];
  for (const id of [first, second, other]) {
    const session = await read("/api/session", id);
    const repos = await read("/api/repositories", id);
    assert.equal(session.status, 200);
    assert.equal(repos.status, 200);
    const tag = session.headers.get("X-Editor-Session")!;
    assert.match(tag, /^[a-f0-9]{64}$/);
    assert.equal(repos.headers.get("X-Editor-Session"), tag);
    assert.notEqual(tag, id);
    assert.equal(tag.includes("private-token"), false);
    assert.equal((await read("/api/repositories", tag)).status, 401);
    assert.equal(session.headers.get("cache-control"), "no-store");
    assert.equal(repos.headers.get("X-Repository-Onboarding"), id === other ? "install" : "none");
    const sessionBody = await session.json() as { user: { login: string } };
    assert.equal(sessionBody.user.login, id === other ? "other" : "lex");
    assert.equal("sessionId" in sessionBody, false);
    assert.equal("token" in sessionBody, false);
    assert.equal(JSON.stringify(sessionBody).includes(id), false);
    assert.equal(JSON.stringify(sessionBody).includes("private-token"), false);
    assert.ok(Array.isArray(await repos.json()));
    tags.push(tag);
  }
  assert.equal(new Set(tags).size, 3);
});

test("signed-out and expired sessions expose no boot tag and cannot list repositories", async () => {
  const { records, read } = fixture();
  const expired = "d".repeat(64);
  records.set(expired, { kind: "user", token: "private-token", login: "lex", avatar_url: "", expiresAt: 1 });
  for (const id of [undefined, expired]) {
    const session = await read("/api/session", id);
    const repos = await read("/api/repositories", id);
    assert.equal((await session.json() as { user: null }).user, null);
    assert.equal(session.headers.has("X-Editor-Session"), false);
    assert.equal(repos.status, 401);
    assert.equal(repos.headers.has("X-Editor-Session"), false);
  }
});
