import { expect, test, type APIRequestContext } from "@playwright/test";

// The fake GitHub's onboarding controls (see the comment at the top of
// server.ts), driven through the real worker's API: creating a repository,
// the first save to an empty repository, and the starter tarball. No editor UI.

test.beforeEach(async ({ page, baseURL }) => {
  // A document load mints this browser session's cookie.
  await page.goto(`${baseURL}/`);
});

const control = (request: APIRequestContext, baseURL: string | undefined, body: unknown) =>
  request.post(`${baseURL}/__demo/onboarding`, { data: body });
const state = async (request: APIRequestContext, baseURL: string | undefined) =>
  (await request.get(`${baseURL}/__demo/onboarding`)).json();
const create = (request: APIRequestContext, baseURL: string | undefined, name: string, extra: object = {}) =>
  request.post(`${baseURL}/api/repositories`, { data: { name, ...extra }, headers: { Origin: baseURL! } });
const publish = (request: APIRequestContext, baseURL: string | undefined, body: unknown, repo = "blank-repo") =>
  request.post(`${baseURL}/api/publish?repo=${encodeURIComponent(`native-demo-user/${repo}`)}`, { data: body, headers: { Origin: baseURL! } });
const upload = (request: APIRequestContext, baseURL: string | undefined, bytes: Buffer, repo = "blank-repo") =>
  request.post(`${baseURL}/api/blob?repo=${encodeURIComponent(`native-demo-user/${repo}`)}`, {
    data: bytes,
    headers: { Origin: baseURL!, "Content-Type": "application/octet-stream" },
  });
const snapshot = (request: APIRequestContext, baseURL: string | undefined, branch: string, repo = "blank-repo") =>
  request.get(`${baseURL}/api/snapshot?repo=${encodeURIComponent(`native-demo-user/${repo}`)}&branch=${branch}`);
const names = async (request: APIRequestContext, baseURL: string | undefined) =>
  ((await (await request.get(`${baseURL}/api/repositories`)).json()) as { name: string }[]).map((repo) => repo.name);

test("an account with no repositories lists none, then the ones the test adds", async ({ page, baseURL }) => {
  const request = page.request;
  expect((await names(request, baseURL)).length).toBeGreaterThan(1);
  await control(request, baseURL, { repositories: "none" });
  expect(await names(request, baseURL)).toEqual([]);
  await control(request, baseURL, { add: [{ name: "blank-repo", kind: "empty" }, { name: "notes", kind: "no-site" }] });
  expect(await names(request, baseURL)).toEqual(["blank-repo", "notes"]);
  expect((await state(request, baseURL)).repositories).toEqual(["blank-repo", "notes"]);
  await control(request, baseURL, { repositories: "all" });
  expect(await names(request, baseURL)).toContain("native-demo");
  await control(request, baseURL, { reset: true });
  expect(await names(request, baseURL)).not.toContain("notes");
});

test("an empty repository opens as an empty snapshot; the contents API makes the first commit and the git-data flow then works", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] });
  const slug = encodeURIComponent("native-demo-user/blank-repo");
  expect((await request.get(`${baseURL}/__demo/head?repo=blank-repo`)).ok()).toBe(true);
  expect((await (await request.get(`${baseURL}/__demo/head?repo=blank-repo`)).json()).commit).toBeNull();
  const empty = await request.get(`${baseURL}/api/snapshot?repo=${slug}&branch=main`);
  expect(await empty.json()).toEqual({ entries: [], tree: [], commit: "0".repeat(40), branch: "main", empty: true });
  // Nothing can be read from it yet, and git data calls are refused as GitHub does.
  expect((await request.get(`${baseURL}/__demo/file?repo=blank-repo&path=index.html`)).status()).toBe(404);
  const early = await upload(request, baseURL, Buffer.from("PNGDATA"));
  expect(early.status(), "a blob cannot be made before the first commit").toBe(409);

  const first = await publish(request, baseURL, {
    branch: "main",
    head: "0".repeat(40),
    files: [{ path: "index.html", baseSha: null, content: "<h1>First</h1>\n" }],
  });
  expect(first.status(), await first.text()).toBe(200);
  const firstCommit = (await first.json()).commit as string;
  expect((await (await request.get(`${baseURL}/__demo/head?repo=blank-repo`)).json()).commit).toBe(firstCommit);
  expect(await (await request.get(`${baseURL}/__demo/file?repo=blank-repo&path=index.html`)).text()).toBe("<h1>First</h1>\n");

  const opened = await (await snapshot(request, baseURL, "main")).json();
  expect(opened).toMatchObject({ commit: firstCommit, branch: "main" });
  expect(opened.empty).toBeUndefined();
  expect(opened.entries.map((entry: { path: string }) => entry.path)).toEqual(["index.html"]);

  // After the first commit an uploaded file (an image draft) works: the editor's
  // second step saves the rest of its drafts, images included.
  const blob = await upload(request, baseURL, Buffer.from("PNGDATA"));
  expect(blob.status(), await blob.text()).toBe(200);
  const withImage = await publish(request, baseURL, {
    branch: "main",
    head: firstCommit,
    files: [{ path: "images/logo.png", baseSha: null, content: "", sha: (await blob.json()).sha }],
  });
  expect(withImage.status(), await withImage.text()).toBe(200);
  expect(await (await request.get(`${baseURL}/__demo/file?repo=blank-repo&path=images/logo.png`)).text()).toBe("PNGDATA");
  const afterImage = (await withImage.json()).commit as string;

  // A second save on top goes through git trees and commits as for any repository.
  const second = await publish(request, baseURL, {
    branch: "main",
    head: afterImage,
    files: [{ path: "styles/site.css", baseSha: null, content: "body{}\n" }],
  });
  expect(second.status(), await second.text()).toBe(200);
  expect((await second.json()).commit).not.toBe(firstCommit);
  expect(await (await request.get(`${baseURL}/__demo/file?repo=blank-repo&path=styles/site.css`)).text()).toBe("body{}\n");
  expect(await (await request.get(`${baseURL}/__demo/file?repo=blank-repo&path=index.html`)).text()).toBe("<h1>First</h1>\n");

  // The repository has commits now, so another first save is refused.
  const again = await publish(request, baseURL, {
    branch: "main",
    head: "0".repeat(40),
    files: [{ path: "other.html", baseSha: null, content: "x" }],
  });
  expect(again.status()).toBe(409);
});

test("a first save on another branch makes that branch and leaves main missing", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { add: [{ name: "branchy", kind: "empty" }] });
  const first = await publish(request, baseURL, {
    branch: "draft",
    head: "0".repeat(40),
    files: [{ path: "index.html", baseSha: null, content: "<h1>Draft</h1>\n" }],
  }, "branchy");
  expect(first.status(), await first.text()).toBe(200);
  const result = await first.json();
  expect(result.branch).toBe("draft");
  const branches = await request.get(`${baseURL}/api/branches?repo=${encodeURIComponent("native-demo-user/branchy")}`);
  expect(await branches.json()).toEqual(["draft"]);
  const opened = await (await snapshot(request, baseURL, "draft", "branchy")).json();
  expect(opened).toMatchObject({ commit: result.commit, branch: "draft" });
  expect(opened.entries.map((entry: { path: string }) => entry.path)).toEqual(["index.html"]);
  expect((await snapshot(request, baseURL, "main", "branchy")).status()).toBe(404);
  expect((await (await request.get(`${baseURL}/__demo/head?repo=branchy`)).json()).commit).toBeNull();
});

test("a repository with commits but no home page has its README and nothing else", async ({ page, baseURL }) => {
  const request = page.request;
  await control(request, baseURL, { add: [{ name: "notes", kind: "no-site" }] });
  expect((await (await request.get(`${baseURL}/__demo/head?repo=notes`)).json()).commit).toMatch(/^[a-f0-9]{40}$/);
  expect(await (await request.get(`${baseURL}/__demo/file?repo=notes&path=README.md`)).text()).toContain("no website yet");
  expect((await request.get(`${baseURL}/__demo/file?repo=notes&path=index.html`)).status()).toBe(404);
});

test("creating a repository adds an empty one to the listing; the fallback modes answer as GitHub does", async ({ page, baseURL }) => {
  const request = page.request;
  const made = await create(request, baseURL, "my-site", { private: true, description: "Mine" });
  expect(made.status(), await made.text()).toBe(201);
  expect(await made.json()).toMatchObject({ name: "my-site", full_name: "native-demo-user/my-site", private: true, default_branch: "main", installation_id: 1 });
  expect(await names(request, baseURL)).toContain("my-site");
  expect((await state(request, baseURL)).created).toEqual([{ name: "my-site", private: true, description: "Mine" }]);
  expect((await state(request, baseURL)).heads).toEqual({ "my-site": null });

  // The same name again is taken.
  const taken = await create(request, baseURL, "my-site");
  expect(taken.status()).toBe(409);
  expect(await taken.text()).toContain("my-site");

  await control(request, baseURL, { create: "taken" });
  expect((await create(request, baseURL, "fresh-name")).status()).toBe(409);
  await control(request, baseURL, { create: "forbidden" });
  const forbidden = await create(request, baseURL, "fresh-name");
  expect(forbidden.status()).toBe(403);
  expect(await forbidden.text()).toContain("may not create");
  expect(await names(request, baseURL)).not.toContain("fresh-name");

  await control(request, baseURL, { create: "ok", installed: false });
  expect((await create(request, baseURL, "fresh-name")).status()).toBe(404);
  await control(request, baseURL, { installed: true });
  expect((await create(request, baseURL, "fresh-name")).status()).toBe(201);
});

test("the starter tarball is served from the fixture, prepared for the new site", async ({ page, baseURL }) => {
  const request = page.request;
  const response = await request.get(`${baseURL}/api/starter?name=${encodeURIComponent("Tea shop")}`);
  expect(response.status(), await response.text()).toBe(200);
  const { files } = (await response.json()) as { files: { path: string; content?: string; base64?: string }[] };
  const paths = files.map((file) => file.path);
  expect(paths).toEqual([".editor/config.json", "404.html", "README.md", "images/logo.svg", "index.html", "styles/site.css"]);
  const byPath = Object.fromEntries(files.map((file) => [file.path, file]));
  expect(JSON.parse(byPath[".editor/config.json"].content!)).toEqual({ site: { name: "Tea shop" } });
  expect(byPath["index.html"].content).not.toMatch(/starter-test\.example|noindex/);
  expect(byPath["404.html"].content).toContain("noindex");
  expect(byPath["README.md"].content).not.toContain("Deploying");
  expect((await state(request, baseURL)).starterFetches).toBe(1);

  await control(request, baseURL, { starter: "unavailable" });
  expect((await request.get(`${baseURL}/api/starter?name=x`)).status()).toBe(502);
});

test("each browser session has its own onboarding state", async ({ page, browser, baseURL }) => {
  await control(page.request, baseURL, { repositories: "none" });
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`${baseURL}/`);
  expect(await names(otherPage.request, baseURL)).toContain("native-demo");
  expect(await names(page.request, baseURL)).toEqual([]);
  await other.close();
});
