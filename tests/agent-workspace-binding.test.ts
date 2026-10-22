import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { authenticateAgent, createGrant, getGrant, getHub, operateHub, type AgentGrant, type AgentHub } from "../worker/agent-context.ts";
import { handle, type Env } from "../worker/app.ts";
import { hubView, type HubStorage } from "../worker/agent-store.ts";
import { handleOAuth, type OAuthDeps } from "../worker/oauth.ts";
import { PENDING_ROUTE } from "../worker/oauth-pending.ts";
import { notSharingMessage } from "../shared/agent-read.ts";
import type { AgentCommand } from "../shared/agent.ts";
import { fakeHubRoute } from "./native-save/fake-hub.ts";
import { fakeGitHub, githubState, origin, repo, siteContext } from "./mcp-harness.ts";

const sessionId = "a".repeat(64);
const tabId = "tab-workspace-test";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const expiresAt = Date.now() + 3_600_000;
  const user = { kind: "user", login: "lex", token: "github-token", expiresAt };
  const records = new Map<string, unknown>([[sessionId, user]]);
  const values = new Map<string, unknown>();
  const storage: HubStorage = {
    get: async <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
    put: async (entries) => { for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value)); },
    delete: async (keys) => { for (const key of keys) values.delete(key); },
  };
  const github = githubState();
  const fetcher: typeof fetch = (input, init) => fakeGitHub(new Request(input, init), github);
  const calls: string[] = [];
  const ledgers = new Map<string, Map<string, unknown>>();
  const env: Env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SESSIONS: {
      idFromName: (name) => name,
      get: (name: string) => ({ fetch: async (request) => {
        calls.push(name);
        const url = new URL(request.url);
        if (name.startsWith("agent-relay:") && url.pathname === "/agent-metadata") {
          const values = ledgers.get(name) ?? new Map<string, unknown>();
          ledgers.set(name, values);
          const ledger: HubStorage = {
            get: async <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
            put: async entries => { for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value)); },
            delete: async keys => { for (const key of keys) values.delete(key); },
          };
          return (await fakeHubRoute(name, ledger, request))!;
        }
        if (name === `agent-hub:${sessionId}`) {
          const response = await fakeHubRoute(name, storage, request);
          if (response) return response;
          const hub = await storage.get<AgentHub>("session");
          return hub ? Response.json(hubView(hub)) : new Response(null, { status: 404 });
        }
        if (url.pathname === "/repository-cache") return new Response(null, { status: 204 });
        // Pending-authorization caps have their own tests (tests/oauth-pending.test.ts).
        if (url.pathname === PENDING_ROUTE) return Response.json({ allowed: true });
        if (request.method === "PUT") {
          records.set(name, await request.json());
          return new Response(null, { status: 204 });
        }
        const value = records.get(name);
        if (url.pathname === "/consume" || request.method === "DELETE") records.delete(name);
        return value ? Response.json(value) : new Response(null, { status: 404 });
      } }),
    },
  };
  const deps: OAuthDeps = { session: async () => ({ ...user, id: sessionId }), html: (body) => new Response(body), fetcher };
  const connect = () => createGrant(env, { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name, branch: "main", via: "token", expiresAt });
  const post = (path: string, body: unknown, cookie = sessionId) => handle(new Request(origin + path, {
    method: "POST", headers: { Origin: origin, Cookie: `__Host-ase_session=${cookie}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), env, fetcher);
  return { env, storage, records, calls, github, fetcher, deps, connect, post };
}
type Fixture = ReturnType<typeof fixture>;
const command = (grantId: string, extra: Partial<AgentCommand> = {}): AgentCommand => ({
  id: "change-1", grantId, repoId: repo.id, branch: "main", generation: 1, commit: "c".repeat(40),
  operation: "write_file", path: "test.txt", content: "", state: "pending", createdAt: Date.now(), ...extra,
});
const requestFor = (token: string) => new Request(origin + "/mcp", { headers: { Authorization: `Bearer ${token}` } });

for (const other of [
  { repository: { id: 2, fullName: "lex/other" } },
  { repository: { id: repo.id, fullName: "lex/renamed" } },
  { branch: "preview" },
]) test(`shared context ${JSON.stringify(other)} never redirects a grant`, async () => {
  const f = fixture(), { token } = await f.connect();
  const context = { ...await siteContext(), ...other };
  await f.storage.put({ context });
  f.calls.length = 0;
  const connection = await authenticateAgent(requestFor(token), f.env, f.fetcher);
  assert.equal(f.calls.length, 3, "authentication reads grant, sign-in and hub only");
  assert.equal(connection.repo.full_name, repo.full_name);
  assert.deepEqual(connection.workspace, { account: "lex", repoId: repo.id, repo: repo.full_name, branch: "main" });
  assert.equal(connection.hub?.context, undefined);
  const message = notSharingMessage(origin, connection.workspace, context);
  assert.ok(message.includes(`${repo.full_name} on branch main`));
  assert.ok(message.includes(`${context.repository.fullName} on branch ${context.branch}`));
  assert.match(message, /connect the agent again from the tab you want/);
  assert.equal((await getHub(f.env, sessionId))?.context, undefined);
});

test("a branchless legacy grant requires reconnection", async () => {
  const f = fixture(), { id, token } = await f.connect();
  const grant = f.records.get(`agent:${id}`) as Partial<AgentGrant>;
  delete grant.branch;
  await assert.rejects(authenticateAgent(requestFor(token), f.env, f.fetcher),
    { status: 401, message: "This connection was made before connections were tied to one branch; connect the agent again." });
});

for (const change of ["rebound", "removed"] as const) test(`legacy pending commands fail on grant ${change}; content operations stay refused`, async () => {
  const f = fixture(), { id } = await f.connect();
  const hub = (await f.storage.get<AgentHub>("session"))!;
  await f.storage.put({ session: { ...hub, commands: [command(id, { claimedBy: tabId })] } });
  if (change === "rebound") await operateHub(f.env, sessionId, { type: "rebind-grant", id, repoId: repo.id, repo: repo.full_name, branch: "preview", previous: 1, generation: 2 });
  else await operateHub(f.env, sessionId, { type: "remove-grant", id });
  for (const type of ["queue", "claim", "ack"]) await assert.rejects(operateHub(f.env, sessionId, { type }), { status: 400 });
  const result = (await f.storage.get<AgentHub>("session"))!.commands![0];
  assert.equal(result.state, "failed");
  assert.match(result.message!, /moved to another workspace.*rebound/);
});

test("rebind endpoint checks ownership, authorizes the receiver, and increments generation", async () => {
  const f = fixture(), { id } = await f.connect();
  const body = { id, repo: repo.full_name, repoId: repo.id, branch: "preview" };
  assert.equal((await f.post("/api/agent/rebind", { ...body, branch: "bad..branch" })).status, 400);
  assert.equal((await f.post("/api/agent/rebind", { ...body, repo: "lex/forbidden" })).status, 403);
  assert.equal((await f.post("/api/agent/rebind", { ...body, repoId: 999 })).status, 403);
  const otherSession = "b".repeat(64);
  f.records.set(otherSession, { kind: "user", login: "lex", token: "github-token", expiresAt: Date.now() + 60_000 });
  assert.equal((await f.post("/api/agent/rebind", body, otherSession)).status, 403);
  assert.equal((await f.post("/api/agent/rebind", body)).status, 200);
  assert.equal((await getGrant(f.env, id)).generation, 2);
  assert.equal((await getGrant(f.env, id)).branch, "preview");
  assert.equal((await getHub(f.env, sessionId))!.grants[0].generation, 2);
  assert.equal((await f.post("/api/agent/rebind", { ...body, branch: "next" })).status, 200);
  assert.equal((await getGrant(f.env, id)).generation, 3);
});

const clientId = `mcp_${"c".repeat(32)}`;
const callback = "https://client.example/callback";
const verifier = "v".repeat(43);
async function authorize(f: Fixture) {
  f.records.set(`oauth-client:${clientId}`, { kind: "oauth-client", clientId, name: "Test agent", redirectUris: [callback], expiresAt: Date.now() + 60_000 });
  const url = new URL(origin + "/auth/mcp/authorize");
  url.search = new URLSearchParams({ client_id: clientId, response_type: "code", code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") }).toString();
  const response = await handleOAuth(new Request(url), f.env, url, f.deps);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="branch" required/);
  assert.match(html, /data-branch="main"/);
  assert.match(html, /branch only/);
  return { nonce: html.match(/name="request" value="([a-f0-9]+)"/)![1], approval: html.match(/data-approval="([a-f0-9]+)"/)![1] };
}
const consent = (f: Fixture, fields: URLSearchParams) => {
  const url = new URL(origin + "/auth/mcp/authorize");
  return handleOAuth(new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: fields }), f.env, url, f.deps);
};
for (const receiver of [[], [["repo", repo.full_name]], [["branch", "main"]], [["repo", repo.full_name], ["branch", "bad..branch"]], [["repo", repo.full_name], ["branch", "main"], ["branch", "preview"]], [["repo", repo.full_name], ["repo", repo.full_name], ["branch", "main"]]]) {
  test(`consent refuses missing, ambiguous or invalid receiver ${JSON.stringify(receiver)}`, async () => {
    const f = fixture(), { nonce } = await authorize(f);
    const fields = new URLSearchParams({ request: nonce, decision: "allow" });
    for (const [key, value] of receiver) fields.append(key, value);
    const response = await consent(f, fields);
    assert.equal(response.status, 400);
    assert.equal(response.headers.has("Location"), false);
    assert.equal([...f.records.keys()].some((key) => key.startsWith("oauth-code:")), false);
  });
}

test("OAuth code and token preserve the explicit branch and exact approval", async () => {
  const f = fixture(), { nonce, approval } = await authorize(f);
  const response = await consent(f, new URLSearchParams({ request: nonce, decision: "allow", repo: repo.full_name, branch: "feature/site" }));
  assert.equal(response.status, 302);
  const code = new URL(response.headers.get("Location")!).searchParams.get("code")!;
  assert.deepEqual(f.records.get(`oauth-code:${sha256(code)}`), {
    kind: "oauth-code", sessionId, login: "lex", clientId, clientName: "Test agent", redirectUri: callback,
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"), repoId: repo.id, repo: repo.full_name,
    branch: "feature/site", approval, expiresAt: (f.records.get(`oauth-code:${sha256(code)}`) as { expiresAt: number }).expiresAt,
  });
  const url = new URL(origin + "/auth/mcp/token");
  const exchanged = await handleOAuth(new Request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier }) }), f.env, url, f.deps);
  assert.equal(exchanged.status, 200);
  const hub = (await getHub(f.env, sessionId))!;
  assert.equal(hub.grants[0].branch, "feature/site");
  assert.equal(hub.grants[0].approval, approval);
  assert.equal(hub.grants[0].generation, 1);
  const grant = await getGrant(f.env, hub.grants[0].id);
  assert.equal(grant.branch, "feature/site");
  assert.equal(grant.approval, approval);
});

for (const branch of [undefined, "", "bad..branch", "a b", "a\\b", "a@{b", "a/", ".hidden", "a.lock", "a?b", "a[b", "a~b", "a^b", "a:b", "-option", "x".repeat(256)]) {
  test(`token connect refuses invalid branch ${String(branch)}`, async () => {
    const f = fixture();
    assert.equal((await f.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch })).status, 400);
    assert.equal((await getHub(f.env, sessionId)), undefined);
  });
}

test("a late legacy claim after rebind is gone and cannot change stored commands", async () => {
  const f = fixture(), { id } = await f.connect();
  const hub = (await f.storage.get<AgentHub>("session"))!;
  await f.storage.put({ session: { ...hub, commands: [command(id)] } });
  assert.equal((await f.post("/api/agent/rebind", { id, repo: repo.full_name, repoId: repo.id, branch: "preview" })).status, 200);
  const before = await f.storage.get<AgentHub>("session");
  assert.equal((await f.post("/api/agent/claim", { id: "change-1", grantId: id, tabId })).status, 410);
  assert.deepEqual(await f.storage.get("session"), before);
});

test("concurrent rebinds advance one generation without overwriting its receiver", async () => {
  const f = fixture(), { id } = await f.connect();
  const responses = await Promise.all(["preview", "other"].map((branch) => f.post("/api/agent/rebind", { id, repo: repo.full_name, repoId: repo.id, branch })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const grant = await getGrant(f.env, id), listed = (await getHub(f.env, sessionId))!.grants[0];
  assert.equal(grant.generation, 2);
  assert.equal(listed.generation, 2);
  assert.equal(grant.branch, listed.branch);
});

test("a legacy claimed change never blocks rebind, regardless of its age", async () => {
  const f = fixture(), { id } = await f.connect();
  const hub = (await f.storage.get<AgentHub>("session"))!;
  await f.storage.put({ session: { ...hub, commands: [command(id, { claimedBy: tabId, createdAt: Date.now() - 3_600_000 })] } });
  assert.equal((await f.post("/api/agent/rebind", { id, repo: repo.full_name, repoId: repo.id, branch: "preview" })).status, 200);
  assert.equal((await getGrant(f.env, id)).generation, 2);
  const stored = (await f.storage.get<AgentHub>("session"))!;
  assert.equal(stored.grants[0].branch, "preview");
  assert.equal(stored.commands![0].state, "failed");
  assert.equal((await f.post("/api/agent/ack", { id: "change-1", grantId: id, tabId, state: "applied" })).status, 410);
  assert.equal((await f.storage.get<AgentHub>("session"))!.commands![0].state, "failed");
});
