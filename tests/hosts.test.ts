// The /api/publish/* endpoints through the worker handler (worker/app.ts),
// over a fake GitHub and a fake Cloudflare API (tests/hosts-fake.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import sodium from "libsodium-wrappers";
import { GitHub, HttpError, WORKFLOWS_PERMISSION_MESSAGE } from "../worker/github.ts";
import { PAGES_PERMISSION_MESSAGE, PAGES_PLAN_MESSAGE, SECRETS_PERMISSION_MESSAGE } from "../worker/hosts.ts";
import { cloudflarePipelineFiles, spacefastPipelineFiles } from "../shared/hosting.ts";
import {
  ACCOUNT_ID,
  CF_TOKEN,
  GITHUB_TOKEN,
  captureLogs,
  editor,
  githubAndCloudflare,
  newWorld,
  origin,
  starterFiles,
} from "./hosts-fake.ts";

const SITE = "lex/site";
const q = (repo = SITE, extra = "") => `?repo=${encodeURIComponent(repo)}&branch=main${extra}`;

test("status of a site with nothing set up", async () => {
  const world = await newWorld();
  const call = editor(world);
  const { status, json } = await call(`/api/publish/status${q()}`);
  assert.equal(status, 200);
  assert.equal(json.repo, SITE);
  assert.equal(json.commit, "c".repeat(40));
  assert.deepEqual(json.site, { name: "Larkspur", url: "https://larkspur.example" });
  assert.equal(json.nojekyll, false);
  assert.equal(json.pages.enabled, false);
  assert.equal(json.pages.rootServed, false);
  assert.equal(json.pages.rootReason, "project-path");
  assert.match(json.pages.rootMessage, /lex\.github\.io\/site\//);
  assert.equal(json.pages.privateRepository, false);
  assert.equal(json.cloudflare.workflow, null);
  assert.deepEqual(json.cloudflare.secrets, { state: "ok", names: [] });
  assert.equal(json.cloudflare.secretsPresent, false);
  assert.equal(json.spacefast.beta, true);
  assert.deepEqual(json.deploy, { state: "waiting" });
  assert.deepEqual(json.others, []);
  assert.equal(json.othersAvailable, true);
});

test("status of a repository named owner.github.io serves the root", async () => {
  const world = await newWorld();
  world.pages = { source: { branch: "main", path: "/" }, build_type: "legacy", cname: null, https_enforced: false };
  const { json } = await editor(world)(`/api/publish/status${q("lex/lex.github.io")}`);
  assert.equal(json.pages.rootServed, true);
  assert.equal(json.pages.rootReason, "user-site");
});

test("status reads the Cloudflare pipeline from the repository, secrets by name, and other hosts from the commit", async () => {
  const [workflow, wrangler, ignore] = cloudflarePipelineFiles({ repositoryName: "site", defaultBranch: "main" });
  const world = await newWorld({
    ...starterFiles,
    ".editor/config.json": JSON.stringify({
      site: { name: "Larkspur", url: "https://larkspur.example" },
      hosting: { cloudflare: { url: "https://site.lex.workers.dev" } },
    }),
    [workflow.path]: workflow.content,
    [wrangler.path]: wrangler.content,
    [ignore.path]: ignore.content,
    ".nojekyll": "",
  });
  world.secrets.set("CLOUDFLARE_API_TOKEN", "x");
  world.secrets.set("CLOUDFLARE_ACCOUNT_ID", "y");
  world.pages = { source: { branch: "main", path: "/" }, build_type: "legacy", cname: "larkspur.example", https_enforced: true };
  world.runs = [{ name: "Deploy to Cloudflare", status: "completed", conclusion: "success" }];
  world.deployments = [
    { id: 11, environment: "Production", creator: "vercel[bot]", status: { state: "success", environment_url: "https://site.vercel.app", target_url: "https://vercel.com/log" } },
    { id: 12, environment: "github-pages", creator: "github-actions[bot]", status: { state: "success", environment_url: "https://lex.github.io/site/" } },
    { id: 13, environment: "preview", creator: "github-actions[bot]", status: { state: "pending" } },
  ];
  world.statuses = [
    { context: "netlify/site/deploy-preview", state: "success", target_url: "https://app.netlify.com/log" },
    { context: "ci/tests", state: "success" },
  ];
  const { json } = await editor(world)(`/api/publish/status${q()}`);
  assert.equal(json.nojekyll, true);
  assert.equal(json.cloudflare.workflow, ".github/workflows/deploy.yml");
  assert.equal(json.cloudflare.workerName, "site");
  assert.equal(json.cloudflare.url, "https://site.lex.workers.dev");
  assert.deepEqual(json.cloudflare.secrets, { state: "ok", names: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] });
  assert.equal(json.cloudflare.secretsPresent, true);
  assert.equal(json.spacefast.workflow, null);
  assert.equal(json.spacefast.secretsPresent, false);
  assert.equal(json.pages.enabled, true);
  assert.equal(json.pages.url, "https://larkspur.example/");
  assert.equal(json.pages.cname, "larkspur.example");
  assert.equal(json.pages.rootServed, true);
  assert.equal(json.pages.httpsEnforced, true);
  assert.equal(json.pages.httpsState, "new");
  assert.deepEqual(json.pages.source, { branch: "main", path: "/" });
  assert.equal(json.deploy.state, "live");
  assert.deepEqual(json.others, [
    { provider: "Vercel", state: "success", url: "https://site.vercel.app", logUrl: "https://vercel.com/log", source: "deployment" },
    { provider: "preview", state: "pending", url: null, logUrl: null, source: "deployment" },
    { provider: "Netlify", state: "success", url: null, logUrl: "https://app.netlify.com/log", source: "status" },
  ]);
  // No secret value is ever read.
  assert.ok(!world.calls.some((entry) => entry.path.includes("/actions/secrets/") && entry.method === "GET"));
});

test("status says what it could not read when the App lacks permissions", async () => {
  const world = await newWorld();
  world.pagesForbidden = true;
  world.secretsForbidden = true;
  world.deploymentsForbidden = true;
  const { status, json } = await editor(world)(`/api/publish/status${q()}`);
  assert.equal(status, 200);
  assert.equal(json.pages.enabled, null);
  assert.equal(json.pages.problem, PAGES_PERMISSION_MESSAGE);
  assert.deepEqual(json.cloudflare.secrets, { state: "unavailable", names: [] });
  assert.equal(json.othersAvailable, false);
});

test("status of a repository with no commits has no head and still answers", async () => {
  const world = await newWorld();
  world.empty = true;
  const call = editor(world);
  const { status, json } = await call(`/api/publish/status${q()}`);
  assert.equal(status, 200);
  assert.equal(json.commit, null);
  assert.equal(json.nojekyll, null);
  assert.deepEqual(json.deploy, { state: "none" });
  assert.equal(json.pages.enabled, false);
  assert.equal((await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } })).status, 409);
});

test("every endpoint needs a session, an allowed repository, and the right method and origin", async () => {
  const world = await newWorld();
  const call = editor(world);
  assert.equal((await call(`/api/publish/status${q()}`, { signedIn: false })).status, 401);
  assert.equal((await call(`/api/publish/status${q("lex/other")}`)).status, 403);
  assert.equal((await call(`/api/publish/status`)).status, 400);
  assert.equal((await call("/api/publish/nope")).status, 404);
  assert.equal((await call("/api/publish/pages", { method: "GET" })).status, 405);
  assert.equal((await call("/api/publish/status", { method: "POST", body: {} })).status, 405);
  assert.equal((await call("/api/publish/pages", { body: { repo: SITE, branch: "main" }, headers: { Origin: "https://evil.example" } })).status, 403);
  assert.equal((await call("/api/publish/pages", { body: { repo: SITE, branch: "main" }, signedIn: false })).status, 401);
  assert.equal((await call("/api/publish/pages", { body: { repo: "lex/other", branch: "main" } })).status, 403);
  assert.equal((await call("/api/publish/cloudflare/verify", { body: { token: CF_TOKEN }, headers: { Origin: "https://evil.example" } })).status, 403);
  assert.equal((await call("/api/publish/cloudflare/verify", { body: { token: CF_TOKEN }, signedIn: false })).status, 401);
  assert.equal(world.calls.filter((entry) => entry.host === "api.cloudflare.com").length, 0);
});

test("enabling Pages turns it on from the branch root and asks for .nojekyll as a draft", async () => {
  const world = await newWorld();
  const call = editor(world);
  const { status, json } = await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  assert.equal(status, 200);
  assert.deepEqual(world.calls.find((entry) => entry.method === "POST" && entry.path === "/repos/lex/site/pages")?.body, {
    build_type: "legacy",
    source: { branch: "main", path: "/" },
  });
  assert.equal(json.created, true);
  assert.equal(json.updated, false);
  assert.equal(json.pages.enabled, true);
  assert.equal(json.pages.url, "https://lex.github.io/site/");
  assert.equal(json.needsNojekyll, true);
  assert.deepEqual(json.nojekyllFile, { path: ".nojekyll", content: "" });
  // Nothing was committed by the endpoint.
  assert.ok(!world.calls.some((entry) => entry.path.includes("/git/") && entry.method !== "GET"));
});

test("enabling Pages again changes nothing, a different branch updates the source, and a saved .nojekyll is not asked for", async () => {
  const world = await newWorld({ ...starterFiles, ".nojekyll": "" });
  const call = editor(world);
  await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  world.calls.length = 0;
  const again = await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  assert.equal(again.json.created, false);
  assert.equal(again.json.updated, false);
  assert.equal(again.json.needsNojekyll, false);
  assert.equal(again.json.nojekyllFile, undefined);
  assert.ok(!world.calls.some((entry) => entry.method !== "GET" && entry.path.endsWith("/pages")));
  // Pages was set to another branch, or to a workflow build.
  world.pages = { source: { branch: "gh-pages", path: "/docs" }, build_type: "workflow", cname: null, https_enforced: false };
  const moved = await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  assert.equal(moved.json.updated, true);
  assert.deepEqual(world.pages, { source: { branch: "main", path: "/" }, build_type: "legacy", cname: null, https_enforced: false });
});

test("enabling Pages explains a private repository on a free plan and a missing permission", async () => {
  const world = await newWorld();
  const call = editor(world);
  world.pagesCreate = { status: 422, message: "Your current plan does not support GitHub Pages for this repository." };
  const plan = await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  assert.equal(plan.status, 422);
  assert.equal(plan.json.error, PAGES_PLAN_MESSAGE);
  assert.match(plan.json.error, /public|Cloudflare/);
  // A private repository answered with a bare 422 gets the same advice.
  world.pagesCreate = { status: 422, message: "Validation Failed" };
  const bare = await call("/api/publish/pages", { body: { repo: "lex/secret-site", branch: "main" } });
  assert.equal(bare.json.error, PAGES_PLAN_MESSAGE);
  world.pagesCreate = undefined;
  world.pagesForbidden = true;
  const forbidden = await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.error, "The editor needs the Pages permission: ask the owner to accept it.");
});

test("a custom domain is validated, set with its DNS records, and cleared", async () => {
  const world = await newWorld();
  const call = editor(world);
  const post = (domain: unknown, extra: object = {}) => call("/api/publish/pages/domain", { body: { repo: SITE, domain, ...extra } });
  // Pages must be on first.
  assert.equal((await post("example.com")).status, 409);
  await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  world.calls.length = 0;
  for (const bad of ["https://example.com", "example.com/x", "nodots", "*.example.com"]) {
    const rejected = await post(bad);
    assert.equal(rejected.status, 400, bad);
  }
  assert.equal(world.calls.filter((entry) => entry.path.includes("/pages")).length, 0, "an invalid domain never reaches Pages");

  const apex = await post("Example.com");
  assert.equal(apex.status, 200);
  assert.equal(world.pages!.cname, "example.com");
  assert.equal(apex.json.kind, "apex");
  assert.equal(apex.json.dns.filter((record: any) => record.type === "A").length, 4);
  assert.equal(apex.json.dns.filter((record: any) => record.type === "AAAA").length, 4);
  assert.deepEqual(apex.json.optionalDns, [{ type: "CNAME", host: "www.example.com", name: null, value: "lex.github.io" }]);
  assert.equal(apex.json.pages.cname, "example.com");
  assert.equal(apex.json.pages.rootServed, true);
  assert.match(apex.json.httpsNote, /24 hours/);

  const sub = await post("www.example.com", { enforceHttps: true });
  assert.equal(sub.json.kind, "subdomain");
  assert.deepEqual(sub.json.dns, [{ type: "CNAME", host: "www.example.com", name: null, value: "lex.github.io" }]);
  assert.deepEqual(sub.json.optionalDns, []);
  assert.equal(world.pages!.https_enforced, true);
  assert.equal(sub.json.httpsNote, "HTTPS is enforced.");

  // Left to the label count, an apex claims no name.
  const guessed = await post("example.org");
  assert.equal(guessed.json.kind, "apex");
  assert.equal(guessed.json.kindAssumed, true);
  assert.ok(guessed.json.dns.every((record: any) => record.name === null));
  const deep = await post("docs.eu.example.com");
  assert.deepEqual(deep.json.dns, [{ type: "CNAME", host: "docs.eu.example.com", name: null, value: "lex.github.io" }]);
  assert.match(deep.json.dnsNote, /docs\.eu\.example\.com/);
  const taken = await post("taken.example.com");
  assert.equal(taken.status, 422);

  for (const none of ["", null]) {
    const cleared = await post(none);
    assert.equal(cleared.status, 200);
    assert.equal(world.pages!.cname, null);
    assert.deepEqual(cleared.json.dns, []);
    assert.equal(cleared.json.domain, null);
  }
});

test("the domain health check answers pending, then ready or a problem, and none without a domain", async () => {
  const world = await newWorld();
  const call = editor(world);
  await call("/api/publish/pages", { body: { repo: SITE, branch: "main" } });
  const health = () => call(`/api/publish/pages/domain/health${q()}`);
  assert.equal((await health()).json.state, "none");
  await call("/api/publish/pages/domain", { body: { repo: SITE, domain: "example.com" } });
  assert.equal((await health()).json.state, "pending");
  const ready = (await health()).json;
  assert.equal(ready.state, "ready");
  assert.equal(ready.host, "example.com");
  assert.equal(ready.dnsResolves, true);
  world.healthDomain = { host: "example.com", is_valid: false, dns_resolves: false, reason: "InvalidDNSError" };
  const problem = (await health()).json;
  assert.equal(problem.state, "problem");
  assert.equal(problem.reason, "InvalidDNSError");
});

test("verifying a Cloudflare token lists accounts, their workers.dev subdomain and whether they need one", async () => {
  const world = await newWorld();
  world.cloudflare.accounts.push({ id: "a".repeat(32), name: "Second", subdomain: null });
  const call = editor(world);
  const { status, json, text } = await captureLogs(world, () =>
    call("/api/publish/cloudflare/verify", { body: { token: CF_TOKEN, workerName: "site" } }),
  );
  assert.equal(status, 200);
  assert.deepEqual(json.accounts, [
    { id: ACCOUNT_ID, name: "Lex's account", subdomain: "lex", needsSubdomain: false, workersDevUrl: "https://site.lex.workers.dev", scriptsAccess: true },
    { id: "a".repeat(32), name: "Second", subdomain: null, needsSubdomain: true, workersDevUrl: null, scriptsAccess: true },
  ]);
  assert.equal(json.canDeploy, true);
  assert.ok(!text.includes(CF_TOKEN));
  assert.ok(!world.logs.join("\n").includes(CF_TOKEN));
  // The token went to Cloudflare only, as a Bearer header; no GitHub call carries it.
  assert.ok(world.calls.filter((entry) => entry.host !== "api.cloudflare.com").every((entry) => !JSON.stringify(entry).includes(CF_TOKEN)));
});

test("verifying an account-owned Cloudflare token falls back to the account's own verify", async () => {
  const world = await newWorld();
  world.cloudflare.userVerify = false;
  const { status, json } = await editor(world)("/api/publish/cloudflare/verify", { body: { token: CF_TOKEN } });
  assert.equal(status, 200);
  assert.equal(json.accounts.length, 1);
  assert.ok(world.calls.some((entry) => entry.path.endsWith(`/accounts/${ACCOUNT_ID}/tokens/verify`)));
});

test("a bad Cloudflare token is refused without echoing it", async () => {
  const world = await newWorld();
  const call = editor(world);
  const wrong = "wrong_token_0123456789ABCDEFGHIJKLMNOPQRSTUV";
  const refused = await captureLogs(world, () => call("/api/publish/cloudflare/verify", { body: { token: wrong } }));
  assert.equal(refused.status, 400, "not 401, which the editor reads as an expired GitHub session");
  assert.ok(!refused.text.includes(wrong));
  assert.ok(!world.logs.join("\n").includes(wrong));
  const malformed = await call("/api/publish/cloudflare/verify", { body: { token: "short token" } });
  assert.equal(malformed.status, 400);
  assert.ok(!malformed.text.includes("short token"));
  assert.equal((await call("/api/publish/cloudflare/verify", { body: {} })).status, 400);
  world.cloudflare.scriptsAccess = false;
  const limited = await call("/api/publish/cloudflare/verify", { body: { token: CF_TOKEN } });
  assert.equal(limited.json.canDeploy, false);
});

test("Cloudflare secrets are stored as sealed boxes GitHub's key opens, and nothing returns or logs the token", async () => {
  const world = await newWorld();
  const call = editor(world);
  const stored = await captureLogs(world, () =>
    call("/api/publish/cloudflare/secrets", { body: { repo: SITE, token: CF_TOKEN, accountId: ACCOUNT_ID } }),
  );
  assert.equal(stored.status, 200);
  assert.deepEqual(stored.json, { provider: "cloudflare", stored: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] });
  assert.equal(world.secrets.get("CLOUDFLARE_API_TOKEN"), CF_TOKEN);
  assert.equal(world.secrets.get("CLOUDFLARE_ACCOUNT_ID"), ACCOUNT_ID);
  assert.ok(!stored.text.includes(CF_TOKEN));
  assert.ok(!world.logs.join("\n").includes(CF_TOKEN));
  const puts = world.calls.filter((entry) => entry.method === "PUT");
  assert.equal(puts.length, 2);
  for (const put of puts) {
    assert.deepEqual(Object.keys(put.body).sort(), ["encrypted_value", "key_id"]);
    assert.ok(!JSON.stringify(put.body).includes(CF_TOKEN));
  }
  // The status then lists the names.
  const status = await call(`/api/publish/status${q()}`);
  assert.equal(status.json.cloudflare.secretsPresent, true);
  assert.ok(!status.text.includes(CF_TOKEN));
});

test("the secrets endpoint is parameterised by provider, and validates what it stores", async () => {
  const world = await newWorld();
  const call = editor(world);
  const spacefast = await call("/api/publish/secrets", { body: { repo: SITE, provider: "spacefast", token: "sf_ci_0123456789abcdef", space: "my-space" } });
  assert.deepEqual(spacefast.json, { provider: "spacefast", stored: ["SPACEFAST_TOKEN", "SPACEFAST_SPACE"] });
  assert.equal(world.secrets.get("SPACEFAST_TOKEN"), "sf_ci_0123456789abcdef");
  assert.equal(world.secrets.get("SPACEFAST_SPACE"), "my-space");
  const withoutSpace = await call("/api/publish/spacefast/secrets", { body: { repo: SITE, token: "sf_ci_0123456789abcdef" } });
  assert.deepEqual(withoutSpace.json.stored, ["SPACEFAST_TOKEN"]);
  for (const body of [
    { provider: "nope", token: CF_TOKEN },
    { provider: "cloudflare", token: "short", accountId: ACCOUNT_ID },
    { provider: "cloudflare", token: CF_TOKEN, accountId: "not-an-id" },
    { provider: "spacefast", token: "has space", space: "s" },
    { provider: "spacefast", token: "sf_ci_0123456789abcdef", space: "bad space!" },
  ]) {
    const refused = await call("/api/publish/secrets", { body: { repo: SITE, ...body } });
    assert.equal(refused.status, 400, JSON.stringify(body));
    assert.ok(!refused.text.includes(CF_TOKEN));
  }
});

test("storing secrets without the Secrets permission says so", async () => {
  const world = await newWorld();
  world.secretsForbidden = true;
  const { status, json, text } = await editor(world)("/api/publish/cloudflare/secrets", {
    body: { repo: SITE, token: CF_TOKEN, accountId: ACCOUNT_ID },
  });
  assert.equal(status, 403);
  assert.equal(json.error, SECRETS_PERMISSION_MESSAGE);
  assert.ok(!text.includes(CF_TOKEN));
});

test("the pipeline endpoint returns the files to draft, and the secrets each reads", async () => {
  const world = await newWorld();
  const call = editor(world);
  const cloudflare = await call(`/api/publish/pipeline${q(SITE, "&provider=cloudflare")}`);
  assert.deepEqual(cloudflare.json.files, cloudflarePipelineFiles({ repositoryName: "site", defaultBranch: "main" }));
  assert.deepEqual(cloudflare.json.secrets, ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);
  assert.equal(cloudflare.json.workerName, "site");
  assert.equal(cloudflare.json.needsPermission, "workflows");
  const spacefast = await call(`/api/publish/pipeline${q(SITE, "&provider=spacefast")}`);
  assert.deepEqual(spacefast.json.files, spacefastPipelineFiles({ defaultBranch: "main" }));
  assert.equal(spacefast.json.beta, true);
  assert.equal((await call(`/api/publish/pipeline${q(SITE, "&provider=other")}`)).status, 400);
});

test("GitHub's refusal to let an App write a workflow becomes a clear message", async () => {
  const world = await newWorld();
  world.refuseWorkflows = true;
  const github = new GitHub(GITHUB_TOKEN, githubAndCloudflare(world));
  await assert.rejects(
    github.write("/repos/lex/site/git/refs/heads/main", "PATCH", { sha: "e".repeat(40), force: false }),
    (error: HttpError) => error.status === 403 && error.message === WORKFLOWS_PERMISSION_MESSAGE,
  );
  assert.match(WORKFLOWS_PERMISSION_MESSAGE, /Workflows permission/);
  // Other refused writes keep their own messages.
  world.refuseWorkflows = false;
  const other = new GitHub(GITHUB_TOKEN, (async () => Response.json({ message: "Reference update failed" }, { status: 422 })) as typeof fetch);
  await assert.rejects(other.write("/repos/lex/site/git/refs/heads/main", "PATCH", {}), (error: HttpError) => error.status === 409);
});

test("the sealed box runs in the real Worker runtime and GitHub's key opens what it makes", async () => {
  await sodium.ready;
  const world = await newWorld();
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
  const fetcher = githubAndCloudflare(world);
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-09-17",
      durableObjects: { SESSIONS: { className: "SessionStore", useSQLite: true } },
      bindings: { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/user") return Response.json({ login: "lex", avatar_url: "" });
        return fetcher(request.url, { method: request.method, headers: request.headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text() });
      },
    }),
  );
  try {
    const { signIn } = await import("./mcp-harness.ts");
    const { cookie } = await signIn(worker);
    const response = await worker.dispatchFetch(`${origin}/api/publish/cloudflare/secrets`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ repo: SITE, token: CF_TOKEN, accountId: ACCOUNT_ID }),
    });
    assert.equal(response.status, 200);
    assert.equal(world.secrets.get("CLOUDFLARE_API_TOKEN"), CF_TOKEN);
  } finally {
    await worker.dispose();
  }
});

