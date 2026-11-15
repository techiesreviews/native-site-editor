// The Worker's failed sign-in redirect carries a short code, never words: the editor shows that code's fixed text
// (shared/sign-in-error.ts), so a link cannot make the sign-in screen say what it likes (TOOLS-263 S1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { SIGN_IN_ERRORS, signInErrorText } from "../shared/sign-in-error.ts";

const origin = "https://editor.example";
function environment(configured = true) {
  const records = new Map<string, StoredSession>();
  const env: Env = {
    ...(configured ? { GITHUB_CLIENT_ID: "app-client", GITHUB_CLIENT_SECRET: "app-secret", GITHUB_APP_SLUG: "test-editor" } : {}),
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
const code = (response: Response) => {
  const location = new URL(response.headers.get("location")!, origin);
  assert.equal(location.pathname, "/");
  return location.searchParams.get("error");
};

test("a failed sign-in redirects with a code the editor knows, never the error's words", async () => {
  const { env, records } = environment();
  const expired = await handle(new Request(`${origin}/auth/callback?code=x&state=${"a".repeat(64)}`), env);
  assert.equal(code(expired), "expired");
  records.set("b".repeat(64), { kind: "oauth", expiresAt: Date.now() + 60_000 });
  const failing = await handle(new Request(`${origin}/auth/callback?code=x&state=${"b".repeat(64)}`, { headers: { Cookie: `__Host-ase_oauth=${"b".repeat(64)}` } }),
    env, async () => { throw new Error("socket hang up"); });
  assert.equal(code(failing), "failed");
  const unconfigured = await handle(new Request(`${origin}/auth/login`), environment(false).env);
  assert.equal(code(unconfigured), "setup");
  for (const response of [expired, failing, unconfigured]) assert.ok(Object.hasOwn(SIGN_IN_ERRORS, code(response)!));
});

test("access not granted and a used-up daily allowance each have their own code", async () => {
  const { env, records } = environment();
  records.set("c".repeat(64), { kind: "oauth", expiresAt: Date.now() + 60_000 });
  const denied = await handle(new Request(`${origin}/auth/callback?state=${"c".repeat(64)}`, { headers: { Cookie: `__Host-ase_oauth=${"c".repeat(64)}` } }), env);
  assert.equal(code(denied), "denied");
  const full = environment().env;
  full.SESSIONS = { idFromName: (name) => name, get: () => ({ fetch: async () => { throw new Error("Exceeded allowed rows written in Durable Objects free tier."); } }) };
  assert.equal(code(await handle(new Request(`${origin}/auth/login`), full)), "quota");
});

test("an unknown code shows the general failure, never its own words", () => {
  assert.equal(signInErrorText("expired"), SIGN_IN_ERRORS.expired);
  for (const unknown of ["Your account is locked", "__proto__", "toString", ""]) assert.equal(signInErrorText(unknown), SIGN_IN_ERRORS.failed);
});
