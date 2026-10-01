import { expect, test, type APIRequestContext } from "@playwright/test";

// The publishing endpoints (/api/publish/*, docs/publishing-hosts.md) through
// the real worker over the fake GitHub's hosting controls (the comment at the
// top of server.ts). API only, no editor UI.

const CF_TOKEN = "cf-test-token-0123456789abcdefghijklmnopqrstuvwxyz";
const ACCOUNT = "b9b9a2b4c908c9d03abe92a52c2d0f43";
const REPO = "native-demo-user/native-demo";

test.beforeEach(async ({ page, baseURL }) => {
  // A document load mints this browser session's cookie.
  await page.goto(`${baseURL}/`);
});

const control = (request: APIRequestContext, baseURL: string | undefined, body: unknown) =>
  request.post(`${baseURL}/__demo/hosting`, { data: body });
const state = async (request: APIRequestContext, baseURL: string | undefined) =>
  (await request.get(`${baseURL}/__demo/hosting`)).json();
const get = (request: APIRequestContext, baseURL: string | undefined, path: string, extra = "") =>
  request.get(`${baseURL}/api/publish/${path}?repo=${encodeURIComponent(REPO)}&branch=main${extra}`);
const post = (request: APIRequestContext, baseURL: string | undefined, path: string, data: object) =>
  request.post(`${baseURL}/api/publish/${path}`, { data: { repo: REPO, ...data }, headers: { Origin: baseURL! } });

test("status, then Pages on, a custom domain with its DNS records, and the DNS check", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { reset: true });
  const status = await (await get(request, baseURL, "status")).json();
  expect(status.pages.enabled).toBe(false);
  expect(status.pages).toMatchObject({ rootServed: false, rootReason: "project-path", privateRepository: true });
  expect(status.nojekyll).toBe(false);
  expect(status.commit).toMatch(/^[a-f0-9]{40}$/);

  const enabled = await post(request, baseURL, "pages", { branch: "main" });
  expect(enabled.status(), await enabled.text()).toBe(200);
  const result = await enabled.json();
  expect(result).toMatchObject({ created: true, needsNojekyll: true, nojekyllFile: { path: ".nojekyll", content: "" } });
  expect(result.pages).toMatchObject({ enabled: true, source: { branch: "main", path: "/" } });
  expect((await state(request, baseURL)).pages["native-demo"]).toMatchObject({ build_type: "legacy", source: { branch: "main", path: "/" } });

  const domain = await post(request, baseURL, "pages/domain", { domain: "Example.com" });
  expect(domain.status(), await domain.text()).toBe(200);
  const records = await domain.json();
  expect(records).toMatchObject({ domain: "example.com", kind: "apex" });
  expect(records.dns.filter((record: { type: string }) => record.type === "A")).toHaveLength(4);
  expect(records.dns.filter((record: { type: string }) => record.type === "AAAA")).toHaveLength(4);
  expect(records.pages).toMatchObject({ cname: "example.com", rootServed: true });
  expect((await post(request, baseURL, "pages/domain", { domain: "https://example.com/x" })).status()).toBe(400);

  expect((await (await get(request, baseURL, "pages/domain/health")).json()).state).toBe("pending");
  expect(await (await get(request, baseURL, "pages/domain/health")).json()).toMatchObject({ state: "ready", host: "example.com" });
  const cleared = await post(request, baseURL, "pages/domain", { domain: "" });
  expect((await cleared.json()).dns).toEqual([]);
  expect((await state(request, baseURL)).pages["native-demo"].cname).toBeNull();
});

test("Pages errors: a private repository on a free plan, and an App without the Pages permission", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { reset: true, pagesMode: "private-free" });
  const plan = await post(request, baseURL, "pages", { branch: "main" });
  expect(plan.status()).toBe(422);
  expect((await plan.json()).error).toMatch(/public repositories/);
  await control(request, baseURL, { pagesMode: "forbidden" });
  const forbidden = await post(request, baseURL, "pages", { branch: "main" });
  expect(forbidden.status()).toBe(403);
  expect((await forbidden.json()).error).toBe("The editor needs the Pages permission: ask the owner to accept it.");
  expect((await (await get(request, baseURL, "status")).json()).pages).toMatchObject({ enabled: null });
  await control(request, baseURL, { reset: true });
});

test("a Cloudflare token is verified, stored as sealed secrets, and never echoed", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { reset: true });
  const verified = await post(request, baseURL, "cloudflare/verify", { token: CF_TOKEN, workerName: "native-demo" });
  expect(verified.status(), await verified.text()).toBe(200);
  const body = await verified.text();
  expect(body).not.toContain(CF_TOKEN);
  expect(JSON.parse(body).accounts).toEqual([
    { id: ACCOUNT, name: "Demo account", subdomain: "demo", needsSubdomain: false, workersDevUrl: "https://native-demo.demo.workers.dev", scriptsAccess: true },
  ]);
  const wrong = await post(request, baseURL, "cloudflare/verify", { token: "wrong-token-0123456789abcdefghijklmnop" });
  expect(wrong.status()).toBe(400);
  expect(await wrong.text()).not.toContain("wrong-token");

  const stored = await post(request, baseURL, "cloudflare/secrets", { token: CF_TOKEN, accountId: ACCOUNT });
  expect(stored.status(), await stored.text()).toBe(200);
  const storedBody = await stored.text();
  expect(storedBody).not.toContain(CF_TOKEN);
  expect(JSON.parse(storedBody)).toEqual({ provider: "cloudflare", stored: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] });
  // The fake opened both with the repository's key; only names and lengths are kept.
  expect((await state(request, baseURL)).secrets["native-demo"]).toEqual({
    CLOUDFLARE_API_TOKEN: { decrypted: true, length: CF_TOKEN.length },
    CLOUDFLARE_ACCOUNT_ID: { decrypted: true, length: ACCOUNT.length },
  });
  const status = await (await get(request, baseURL, "status")).json();
  expect(status.cloudflare.secrets).toEqual({ state: "ok", names: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] });
  expect(status.cloudflare.secretsPresent).toBe(true);

  const spacefast = await post(request, baseURL, "secrets", { provider: "spacefast", token: "sf_ci_0123456789abcdef" });
  expect((await spacefast.json()).stored).toEqual(["SPACEFAST_TOKEN"]);

  await control(request, baseURL, { secretsMode: "forbidden" });
  const refused = await post(request, baseURL, "cloudflare/secrets", { token: CF_TOKEN, accountId: ACCOUNT });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toMatch(/Secrets permission/);
  await control(request, baseURL, { reset: true });
});

test("the pipeline files save with Save to GitHub once the App may write workflows, and status then sees them", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { reset: true, workflowsMode: "refuse" });
  const pipeline = await (await get(request, baseURL, "pipeline", "&provider=cloudflare")).json();
  expect(pipeline.files.map((file: { path: string }) => file.path)).toEqual([".github/workflows/deploy.yml", "wrangler.jsonc", ".assetsignore"]);
  const head = (await (await request.get(`${baseURL}/api/head?repo=${encodeURIComponent(REPO)}&branch=main`)).json()).commit as string;
  const save = (allowGithubConfig?: boolean) =>
    request.post(`${baseURL}/api/publish?repo=${encodeURIComponent(REPO)}`, {
      data: { branch: "main", head, ...(allowGithubConfig ? { allowGithubConfig } : {}), files: pipeline.files.map((file: { path: string; content: string }) => ({ ...file, baseSha: null })) },
      headers: { Origin: baseURL! },
    });
  // Without the user's confirmation, workflow files are refused before GitHub is asked.
  const unconfirmed = await save();
  expect(unconfirmed.status()).toBe(403);
  expect((await unconfirmed.json()).error).toContain(".github/workflows/deploy.yml");
  expect((await state(request, baseURL)).workflowRefusals).toBe(0);
  // Not only workflows: any .github file needs the same confirmation.
  const action = await request.post(`${baseURL}/api/publish?repo=${encodeURIComponent(REPO)}`, {
    data: { branch: "main", head, files: [{ path: ".github/actions/x/action.yml", baseSha: null, content: "name: x\n" }] },
    headers: { Origin: baseURL! },
  });
  expect(action.status()).toBe(403);
  const refused = await save(true);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toMatch(/Workflows permission/);
  expect((await state(request, baseURL)).workflowRefusals).toBe(1);

  await control(request, baseURL, { workflowsMode: "ok" });
  const saved = await save(true);
  expect(saved.status(), await saved.text()).toBe(200);
  const status = await (await get(request, baseURL, "status")).json();
  expect(status.cloudflare.workflow).toBe(".github/workflows/deploy.yml");
  expect(status.cloudflare.workerName).toBe("native-demo");
  await control(request, baseURL, { reset: true });
});

test("other hosts show up from the commit's deployments and statuses", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, {
    reset: true,
    deployments: [{ id: 1, environment: "Production", creator: "vercel[bot]", state: "success", environment_url: "https://demo.vercel.app", target_url: "https://vercel.com/demo" }],
    statuses: [{ context: "netlify/demo/deploy-preview", state: "pending" }],
  });
  const status = await (await get(request, baseURL, "status")).json();
  expect(status.othersAvailable).toBe(true);
  expect(status.others).toEqual([
    { provider: "Vercel", state: "success", url: "https://demo.vercel.app", logUrl: "https://vercel.com/demo", source: "deployment" },
    { provider: "Netlify", state: "pending", url: null, logUrl: null, source: "status" },
  ]);
  await control(request, baseURL, { deploymentsMode: "forbidden" });
  expect((await (await get(request, baseURL, "status")).json()).othersAvailable).toBe(false);
  await control(request, baseURL, { reset: true });
});

test("publishing endpoints refuse a foreign origin and other repositories", async ({ page, baseURL }) => {
  const request = page.request;
  const foreign = await request.post(`${baseURL}/api/publish/pages`, { data: { repo: REPO, branch: "main" }, headers: { Origin: "https://evil.example" } });
  expect(foreign.status()).toBe(403);
  const other = await request.get(`${baseURL}/api/publish/status?repo=someone/else&branch=main`);
  expect(other.status()).toBe(403);
});
