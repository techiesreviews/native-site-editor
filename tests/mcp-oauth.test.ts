import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientProvider,
} from "@modelcontextprotocol/client";
import { editorTab, origin, payload, repo, signIn, siteContext, startWorker, workerFetch } from "./mcp-harness.ts";
import { handleOAuth, redirectUriProblem } from "../worker/oauth.ts";
import { REGISTRATION_ROUTE } from "../worker/oauth-registration.ts";

const callback = "https://client.example/oauth/callback";

// An MCP client's OAuth state, kept in memory; the authorization URL is
// captured instead of opening a browser.
function memoryProvider() {
  const saved: Record<string, any> = {};
  const provider: OAuthClientProvider & { authorizationUrl?: URL } = {
    get redirectUrl() {
      return callback;
    },
    get clientMetadata() {
      return {
        client_name: "Test Claude",
        redirect_uris: [callback],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },
    state: () => "state-123",
    clientInformation: () => saved.client,
    saveClientInformation: (info) => void (saved.client = info),
    tokens: () => saved.tokens,
    saveTokens: (tokens) => void (saved.tokens = tokens),
    redirectToAuthorization(url) {
      provider.authorizationUrl = url;
    },
    saveCodeVerifier: (verifier) => void (saved.verifier = verifier),
    codeVerifier: () => saved.verifier,
    saveDiscoveryState: (state) => void (saved.discovery = state),
    discoveryState: () => saved.discovery,
  };
  return { provider, saved };
}

async function consentForm(worker: Awaited<ReturnType<typeof startWorker>>["worker"], url: URL, cookie: string) {
  const page = await worker.dispatchFetch(url.href, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") ?? "", /form-action 'self' https:\/\/client\.example/);
  const html = await page.text();
  assert.match(html, /Connect Test Claude to your site/);
  assert.match(html, /lex\/starter/);
  return html.match(/name="request" value="([a-f0-9]{64})"/)![1];
}
const consent = (worker: Awaited<ReturnType<typeof startWorker>>["worker"], cookie: string, fields: Record<string, string>, from = origin) =>
  worker.dispatchFetch(`${origin}/auth/mcp/authorize`, {
    method: "POST",
    headers: { Origin: from, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });

test("redirect URIs are HTTPS or loopback HTTP", () => {
  assert.equal(redirectUriProblem("https://claude.ai/api/mcp/auth_callback"), undefined);
  assert.equal(redirectUriProblem("http://localhost:33418/callback"), undefined);
  assert.equal(redirectUriProblem("http://127.0.0.1:5000/cb"), undefined);
  assert.ok(redirectUriProblem("http://evil.example/cb"));
  assert.ok(redirectUriProblem("https://client.example/cb#fragment"));
  assert.ok(redirectUriProblem("javascript:alert(1)"));
});

// A fake SESSIONS namespace that answers the budget route with a fixed
// decision and records every client PUT, so we can prove a denied or
// unavailable limiter writes no client Durable Object at all.
function registerWith(budget: "allow" | "deny" | "unavailable") {
  const clientPuts: string[] = [];
  const env = {
    SESSIONS: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        fetch: async (request: Request) => {
          if (new URL(request.url).pathname === REGISTRATION_ROUTE) {
            if (budget === "unavailable") return new Response(null, { status: 500 });
            return Response.json({ allowed: budget === "allow", retryAfter: 60 });
          }
          if (request.method === "PUT" && id.startsWith("oauth-client:")) {
            clientPuts.push(id);
            return new Response(null, { status: 204 });
          }
          return new Response(null, { status: 404 });
        },
      }),
    },
  } as any;
  const deps = {
    session: async () => null,
    html: (body: string) => new Response(body, { headers: { "Content-Type": "text/html" } }),
    fetcher: (...args: Parameters<typeof fetch>) => fetch(...args),
  } as any;
  const request = new Request(`${origin}/auth/mcp/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }),
  });
  return { promise: handleOAuth(request, env, new URL(request.url), deps), clientPuts };
}

test("a denied limiter writes no client record and returns 429", async () => {
  const { promise, clientPuts } = registerWith("deny");
  const response = await promise;
  assert.equal(response.status, 429);
  assert.deepEqual(clientPuts, [], "no client Durable Object is written");
});

test("an unavailable limiter fails closed: no client record, 503", async () => {
  const { promise, clientPuts } = registerWith("unavailable");
  const response = await promise;
  assert.equal(response.status, 503);
  assert.deepEqual(clientPuts, [], "no client Durable Object is written");
});

test("an allowed limiter writes exactly one client record (control)", async () => {
  const { promise, clientPuts } = registerWith("allow");
  const response = await promise;
  assert.equal(response.status, 201);
  assert.equal(clientPuts.length, 1);
});

const gzip = (text: string) =>
  new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();

const oauthDeps = {
  session: async () => null,
  html: (body: string) => new Response(body, { headers: { "Content-Type": "text/html" } }),
  fetcher: (...args: Parameters<typeof fetch>) => fetch(...args),
} as any;

test("the token endpoint bounds a streamed over-limit form through handleOAuth and cancels it early", async () => {
  let pulled = 0;
  const chunk = new Uint8Array(1024).fill(0x61); // 'a'
  const body = new ReadableStream({
    pull(controller) {
      pulled++;
      if (pulled > 100_000) controller.close();
      else controller.enqueue(chunk);
    },
  });
  const request = new Request(`${origin}/auth/mcp/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    duplex: "half",
  } as RequestInit);
  const response = await handleOAuth(request, {} as any, new URL(request.url), oauthDeps);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "invalid_request");
  assert.ok(pulled < 10_000, `the over-limit body is cancelled early, not read in full (pulled ${pulled})`);
});

test("the token endpoint bounds a gzipped over-limit form", async () => {
  const { worker } = await startWorker();
  try {
    const response = await worker.dispatchFetch(`${origin}/auth/mcp/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Encoding": "gzip" },
      body: await gzip("grant_type=authorization_code&code=" + "a".repeat(20_000)),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, "invalid_request");
  } finally {
    await worker.dispose();
  }
});

test("the consent endpoint bounds a gzipped over-limit form with an error page, not the generic handler", async () => {
  const { worker } = await startWorker();
  try {
    const response = await worker.dispatchFetch(`${origin}/auth/mcp/authorize`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Encoding": "gzip",
      },
      body: await gzip("request=" + "a".repeat(8_000)),
      redirect: "manual",
    });
    assert.equal(response.status, 413);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await response.text(), /too large/);
  } finally {
    await worker.dispose();
  }
});

test("an MCP client connects by OAuth: discovery, registration, sign-in and consent, PKCE token exchange, then the site tools", async () => {
  const { worker } = await startWorker();
  let client: Client | undefined;
  try {
    // Discovery documents.
    const unauthorized = await worker.dispatchFetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("www-authenticate") ?? "", /resource_metadata=/);
    const resource = await (await worker.dispatchFetch(`${origin}/.well-known/oauth-protected-resource/mcp`)).json();
    assert.equal(resource.resource, `${origin}/mcp`);
    assert.deepEqual(resource.authorization_servers, [origin]);
    const metadata = await (await worker.dispatchFetch(`${origin}/.well-known/oauth-authorization-server`)).json();
    assert.equal(metadata.issuer, origin);
    assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
    const preflight = await worker.dispatchFetch(`${origin}/auth/mcp/token`, { method: "OPTIONS" });
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    const badClient = await worker.dispatchFetch(`${origin}/auth/mcp/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }),
    });
    assert.equal(badClient.status, 400);
    assert.equal((await badClient.json()).error, "invalid_redirect_uri");

    // The editor tab of the signed-in session shares the site.
    const { cookie } = await signIn(worker);
    const tab = editorTab(worker, cookie);

    // The official client discovers, registers and asks for authorization.
    const { provider, saved } = memoryProvider();
    const fetch = workerFetch(worker);
    let transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { authProvider: provider, fetch: (...args: Parameters<typeof fetch>) => fetch(...args) });
    client = new Client({ name: "oauth-test", version: "1.0.0" });
    await assert.rejects(() => client!.connect(transport), (error) => error instanceof UnauthorizedError);
    assert.match(saved.client.client_id, /^mcp_[a-f0-9]{32}$/);
    const authorizationUrl = provider.authorizationUrl!;
    assert.equal(authorizationUrl.origin + authorizationUrl.pathname, `${origin}/auth/mcp/authorize`);
    assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");

    // Not signed in: the editor's GitHub sign-in comes first and returns here.
    const anonymous = await worker.dispatchFetch(authorizationUrl.href, { redirect: "manual" });
    assert.equal(anonymous.status, 302);
    const login = new URL(anonymous.headers.get("location")!, origin);
    assert.equal(login.pathname, "/auth/login");
    const signedIn = await signIn(worker, login.searchParams.get("return")!);
    assert.equal(signedIn.location, `${authorizationUrl.pathname}${authorizationUrl.search}`);

    // Consent names the app and the repositories; a foreign origin, another
    // session and Cancel are refused.
    const nonce = await consentForm(worker, authorizationUrl, cookie);
    assert.equal((await consent(worker, cookie, { request: nonce, repo: repo.full_name, decision: "allow" }, "https://evil.example")).status, 403);
    assert.equal((await consent(worker, signedIn.cookie, { request: nonce, repo: repo.full_name, decision: "allow" })).status, 403, "the consent belongs to the session that saw it");
    const denyNonce = await consentForm(worker, authorizationUrl, cookie);
    const denied = new URL((await consent(worker, cookie, { request: denyNonce, decision: "deny" })).headers.get("location")!);
    assert.equal(denied.searchParams.get("error"), "access_denied");
    const allowNonce = await consentForm(worker, authorizationUrl, cookie);
    const allowed = await consent(worker, cookie, { request: allowNonce, repo: repo.full_name, decision: "allow" });
    assert.equal(allowed.status, 302);
    const redirect = new URL(allowed.headers.get("location")!);
    assert.equal(redirect.origin + redirect.pathname, callback);
    assert.equal(redirect.searchParams.get("state"), "state-123");
    assert.equal(redirect.searchParams.get("iss"), origin);
    const code = redirect.searchParams.get("code")!;

    // A wrong verifier does not get a token (and does not burn a good code:
    // the code used here is a second one).
    const again = await consent(worker, cookie, { request: await consentForm(worker, authorizationUrl, cookie), repo: repo.full_name, decision: "allow" });
    const secondCode = new URL(again.headers.get("location")!).searchParams.get("code")!;
    const wrong = await worker.dispatchFetch(`${origin}/auth/mcp/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: secondCode,
        client_id: saved.client.client_id,
        redirect_uri: callback,
        code_verifier: randomBytes(32).toString("base64url"),
      }).toString(),
    });
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).error, "invalid_grant");

    // The client exchanges the code with its PKCE verifier.
    await transport.finishAuth(redirect.searchParams);
    assert.match(saved.tokens.access_token, /^ase_[a-f0-9]{64}$/);
    assert.equal(saved.tokens.token_type.toLowerCase(), "bearer");
    const reused = await worker.dispatchFetch(`${origin}/auth/mcp/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: saved.client.client_id, redirect_uri: callback, code_verifier: saved.verifier }).toString(),
    });
    assert.equal((await reused.json()).error, "invalid_grant", "a code works once");
    assert.equal(createHash("sha256").update(saved.verifier).digest("base64url"), authorizationUrl.searchParams.get("code_challenge"));

    // The editor tab lists the OAuth connection and shares its context; the tools work.
    const hub = await tab.hub();
    assert.deepEqual(hub.grants.map((grant: any) => [grant.via, grant.client, grant.repo]), [["oauth", "Test Claude", "lex/starter"]]);
    await tab.share(await siteContext());
    transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { authProvider: provider, fetch: (...args: Parameters<typeof fetch>) => fetch(...args) });
    client = new Client({ name: "oauth-test", version: "1.0.0" });
    await client.connect(transport);
    const site = payload(await client.callTool({ name: "get_site", arguments: {} }));
    assert.equal(site.repository, "lex/starter");
    const queued = payload(await client.callTool({ name: "open_page", arguments: { page: "/about/", waitSeconds: 0 } }));
    assert.equal(queued.state, "pending");
    assert.equal((await tab.hub()).commands[0].path, "about/index.html");

    // Revoking in the editor ends it.
    assert.equal((await tab.post("/api/agent/revoke", { all: true, repoId: repo.id })).status, 200);
    await assert.rejects(() => client!.callTool({ name: "get_site", arguments: {} }));
  } finally {
    await client?.close().catch(() => undefined);
    await worker.dispose();
  }
});
