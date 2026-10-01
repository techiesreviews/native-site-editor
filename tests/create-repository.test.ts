import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHub, HttpError } from "../worker/github.ts";
import { EMPTY_COMMIT, type Repository } from "../shared/types.ts";
import { publish } from "../worker/publish.ts";

const created = {
  id: 7,
  name: "my-site",
  full_name: "lex/my-site",
  private: false,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
  extra: "dropped",
};

/** A fake GitHub: `create` answers POST /user/repos; `installations` the installations. */
function fixture(options: { installations?: unknown[]; create?: () => Response } = {}) {
  const calls: { path: string; method: string; body?: any }[] = [];
  const github = new GitHub("secret", async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === "/user/installations")
      return Response.json({
        installations: options.installations ?? [
          { id: 11, account: { type: "Organization", login: "company" } },
          { id: 12, account: { type: "User", login: "LEX" } },
        ],
      });
    if (path === "/orgs/company/repos" && method === "POST")
      return options.create?.() ?? Response.json({ ...created, full_name: "company/my-site", owner: { login: "company", type: "Organization" } }, { status: 201 });
    if (path === "/user/repos" && method === "POST") return options.create?.() ?? Response.json(created, { status: 201 });
    throw new Error(`Unexpected ${method} ${path}`);
  });
  return { github, calls };
}
const rejects = (promise: Promise<unknown>, status: number, message?: RegExp) =>
  assert.rejects(promise, (error: unknown) => error instanceof HttpError && error.status === status && (!message || message.test(error.message)));

test("createRepository makes an empty repository and says which installation it belongs to", async () => {
  const { github, calls } = fixture();
  const repository = await github.createRepository("lex", { name: "my-site", private: true, description: "d".repeat(400) });
  assert.deepEqual(repository, {
    id: 7,
    name: "my-site",
    full_name: "lex/my-site",
    private: false,
    default_branch: "main",
    owner: { login: "lex", type: "User" },
    installation_id: 12,
  });
  const post = calls.find((call) => call.method === "POST")!;
  assert.equal(post.path, "/user/repos");
  assert.equal(post.body.name, "my-site");
  assert.equal(post.body.private, true);
  assert.equal(post.body.auto_init, false);
  assert.equal(post.body.description.length, 350);
});

test("createRepository without a description sends none, and defaults the branch to main", async () => {
  const { github, calls } = fixture({ create: () => Response.json({ ...created, default_branch: "" }, { status: 201 }) });
  const repository = await github.createRepository("lex", { name: "my-site", private: false });
  assert.equal(repository.default_branch, "main");
  assert.equal("description" in calls.find((call) => call.method === "POST")!.body, false);
});

test("an invalid name is refused before GitHub is asked anything", async () => {
  const { github, calls } = fixture();
  await rejects(github.createRepository("lex", { name: "not a name", private: false }), 400);
  await rejects(github.createRepository("lex", { name: "", private: false }), 400);
  assert.deepEqual(calls, []);
});

test("without an installation on the account the answer is 404 and nothing is created", async () => {
  const { github, calls } = fixture({ installations: [{ id: 11, account: { type: "Organization", login: "company" } }] });
  await rejects(github.createRepository("lex", { name: "my-site", private: false }), 404, /not installed/);
  assert.ok(!calls.some((call) => call.method === "POST"));
});

test("GitHub refusing creation (403 or 404) becomes the may-not-create fallback", async () => {
  for (const status of [403, 404]) {
    const { github } = fixture({ create: () => Response.json({ message: "Resource not accessible by integration" }, { status }) });
    await rejects(github.createRepository("lex", { name: "my-site", private: false }), 403, /may not create repositories/);
  }
});

test("a name already taken (GitHub's 422, or a 409) is a 409 that names the problem", async () => {
  for (const status of [422, 409]) {
    const { github } = fixture({ create: () => Response.json({ message: "name already exists on this account" }, { status }) });
    await rejects(github.createRepository("lex", { name: "my-site", private: false }), 409, /my-site/);
  }
});

test("other failures stay failures", async () => {
  const { github } = fixture({ create: () => new Response("boom", { status: 500 }) });
  await rejects(github.createRepository("lex", { name: "my-site", private: false }), 502);
});

test("createRepository in an organisation posts to the organisation and names its installation", async () => {
  const { github, calls } = fixture();
  const repository = await github.createRepository("lex", { name: "my-site", owner: "Company", private: true });
  assert.equal(repository.full_name, "company/my-site");
  assert.equal(repository.owner.type, "Organization");
  assert.equal(repository.installation_id, 11);
  assert.equal(calls.find((call) => call.method === "POST")!.path, "/orgs/company/repos");
});

test("an organisation's taken name is a 409; one forbidden to members says an organisation owner may need to create it", async () => {
  const taken = fixture({ create: () => Response.json({ message: "name already exists" }, { status: 422 }) });
  await rejects(taken.github.createRepository("lex", { name: "my-site", owner: "company", private: false }), 409, /company may already have/);
  for (const status of [403, 404]) {
    const { github } = fixture({ create: () => Response.json({ message: "forbidden" }, { status }) });
    await rejects(github.createRepository("lex", { name: "my-site", owner: "company", private: false }), 403, /company.*organisation owner may need to/);
  }
});

test("an owner without an installation the user can reach is refused before anything is created", async () => {
  const { github, calls } = fixture();
  await rejects(github.createRepository("lex", { name: "my-site", owner: "stranger", private: false }), 403, /not installed on stranger/);
  assert.ok(!calls.some((call) => call.method === "POST"));
  // The user's own login as the owner is the personal account.
  const own = fixture();
  assert.equal((await own.github.createRepository("lex", { name: "my-site", owner: "lex", private: false })).installation_id, 12);
  assert.equal(own.calls.find((call) => call.method === "POST")!.path, "/user/repos");
});

test("a new repository shows up in the next listing", async () => {
  let listed = 0;
  const github = new GitHub("secret", async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/user/installations") return Response.json({ installations: [{ id: 12, account: { type: "User", login: "lex" } }] });
    if (path === "/user/repos" && init?.method === "POST") return Response.json(created, { status: 201 });
    if (path === "/user/installations/12/repositories") {
      listed++;
      return Response.json({ repositories: listed > 1 ? [created] : [] });
    }
    throw new Error(path);
  });
  assert.equal((await github.repositories("lex", 60_000)).length, 0);
  await github.createRepository("lex", { name: "my-site", private: false });
  assert.equal((await github.repositories("lex", 60_000)).length, 1);
});

test("head follows the editor's own commit while GitHub does not list the new branch yet", async () => {
  const repo: Repository = { ...created, installation_id: 12 } as Repository;
  const known = "a".repeat(40);
  const github = new GitHub("secret", async (input) => {
    if (new URL(String(input)).pathname.includes("/branches/")) return Response.json({ message: "Branch not found" }, { status: 404 });
    throw new Error(String(input));
  });
  assert.deepEqual(await github.head(repo, "main", known), { sha: known, tree: undefined });
  await rejects(github.head(repo, "main", EMPTY_COMMIT), 404);
  await rejects(github.head(repo, "main"), 404);
});

const repo: Repository = { id: 7, name: "my-site", full_name: "lex/my-site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } };
const first = "f".repeat(40);

/** A repository with `branches` and a contents API that answers the first commit. */
function emptyRepository(branches: string[] = []) {
  const calls: { path: string; method: string; body?: any }[] = [];
  const github = new GitHub("secret", async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.endsWith("/branches")) return Response.json(branches.map((name) => ({ name })));
    if (method === "PUT") return Response.json({ content: { sha: "1".repeat(40) }, commit: { sha: first } }, { status: 201 });
    throw new Error(`Unexpected ${method} ${path}`);
  });
  return { github, calls };
}

test("a repository with no branches opens at an empty snapshot; a missing branch in a repository with branches is still a 404", async () => {
  const fake = (branches: string[]) =>
    new GitHub("secret", async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/branches")) return Response.json(branches.map((name) => ({ name })));
      if (path.includes("/branches/")) return Response.json({ message: "Branch not found" }, { status: 404 });
      throw new Error(path);
    });
  assert.deepEqual(await fake([]).snapshot(repo, "main"), { entries: [], tree: [], commit: EMPTY_COMMIT, branch: "main", empty: true });
  await rejects(fake(["main"]).snapshot(repo, "gone"), 404);
});

test("the first save to an empty repository is one new file through the contents API", async () => {
  const { github, calls } = emptyRepository();
  const result = await publish(github, repo, {
    branch: "main",
    head: EMPTY_COMMIT,
    files: [{ path: "docs/my page.html", baseSha: null, content: "<h1>Hi</h1>" }],
  });
  const put = calls.find((call) => call.method === "PUT")!;
  assert.equal(put.path, "/repos/lex/my-site/contents/docs/my%20page.html");
  assert.equal(Buffer.from(put.body.content, "base64").toString(), "<h1>Hi</h1>");
  assert.match(put.body.message, /docs\/my page\.html/);
  assert.equal("branch" in put.body, false, "the default branch is made by the commit itself");
  assert.equal(result.commit, first);
  assert.equal(result.branch, "main");
  assert.deepEqual(result.files, [{ path: "docs/my page.html", sha: "1".repeat(40) }]);
  assert.deepEqual(result.deleted, []);
  assert.ok(!calls.some((call) => call.path.includes("/git/")), "the git data API refuses an empty repository");
});

test("a first save on another branch names it", async () => {
  const { github, calls } = emptyRepository();
  await publish(github, repo, { branch: "draft", head: EMPTY_COMMIT, files: [{ path: "index.html", baseSha: null, content: "x" }] });
  assert.equal(calls.find((call) => call.method === "PUT")!.body.branch, "draft");
});

test("the first save refuses anything but one new text file", async () => {
  const { github, calls } = emptyRepository();
  const base = { branch: "main", head: EMPTY_COMMIT };
  await rejects(
    publish(github, repo, { ...base, files: [{ path: "a.html", baseSha: null, content: "a" }, { path: "b.css", baseSha: null, content: "b" }] }),
    400,
    /one new text file/,
  );
  await rejects(publish(github, repo, { ...base, files: [{ path: "a.html", baseSha: "a".repeat(40), content: "a" }] }), 400);
  await rejects(publish(github, repo, { ...base, files: [{ path: "a.png", baseSha: null, content: "", sha: "a".repeat(40) }] }), 400);
  assert.ok(!calls.some((call) => call.method === "PUT"));
});

test("the first save refuses a repository that has branches now", async () => {
  const { github, calls } = emptyRepository(["main"]);
  await rejects(
    publish(github, repo, { branch: "main", head: EMPTY_COMMIT, files: [{ path: "a.html", baseSha: null, content: "a" }] }),
    409,
    /commits on GitHub now/,
  );
  assert.ok(!calls.some((call) => call.method === "PUT"));
});
