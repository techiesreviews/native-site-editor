import { repositoryCacheRequest } from "./session-cache-fake";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { NATIVE_STARTER_VERSION } from "../shared/native-starter-version.ts";

// Create site on the preview editor (STARTER_SOURCE native-static) is one Worker
// request: it reads the Starter's files through ASSETS, makes the repository and
// commits every file. Cloudflare's Workers Free plan allows 50 subrequests per
// request, and every call through a binding counts. Here every outgoing call
// (GitHub, ASSETS, the session store) counts against that budget, and the 51st
// fails as workerd's does, so the whole Starter must land within 50.

const origin = "https://editor.example";
const sessionId = "d".repeat(64);
const SUBREQUESTS = 50;

function budget() {
  const used = { count: 0, assets: 0, github: 0, sessions: 0 };
  const spend = (kind: "assets" | "github" | "sessions") => {
    used.count++;
    used[kind]++;
    if (used.count > SUBREQUESTS) throw new Error("Too many subrequests.");
  };
  return { used, spend };
}

function environment(spend: (kind: "assets" | "github" | "sessions") => void) {
  const records = new Map<string, StoredSession>([[sessionId, { kind: "user", token: "tok", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000 }]]);
  const env: Env = {
    GITHUB_CLIENT_ID: "c",
    GITHUB_CLIENT_SECRET: "s",
    GITHUB_APP_SLUG: "test-editor",
    STARTER_SOURCE: "native-static",
    ASSETS: {
      fetch: async (request: Request) => {
        spend("assets");
        const path = new URL(request.url).pathname;
        try {
          return new Response(readFileSync("public" + path));
        } catch {
          return new Response("missing", { status: 404 });
        }
      },
    },
    SESSIONS: {
      idFromName: (name) => name,
      idFromString: (id) => id,
      get: (id) => ({
        fetch: async (request) => {
          spend("sessions");
          const cacheResponse = await repositoryCacheRequest(request, records, id);
          if (cacheResponse) return cacheResponse;
          if (request.method === "PUT") { records.set(id, (await request.json()) as StoredSession); return new Response(null, { status: 204 }); }
          if (request.method === "DELETE") { records.delete(id); return new Response(null, { status: 204 }); }
          const value = records.get(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return env;
}

/** GitHub as Create site meets it; the first file's PUT answers 404 `notYet` times, as a repository GitHub is still making does. */
function fakeGitHub(spend: (kind: "github") => void, notYet = 0) {
  const trees: { path: string }[][] = [];
  let missing = notYet;
  const fetcher: typeof fetch = async (input, init) => {
    spend("github");
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname;
    if (path === "/user/installations") return Response.json({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    if (path === "/user/repos") return Response.json({ id: 9, name: body.name, full_name: `lex/${body.name}`, private: body.private, default_branch: "main", owner: { login: "lex", type: "User" } }, { status: 201 });
    if (method === "PUT" && path.startsWith("/repos/lex/my-site/contents/") && missing > 0) { missing--; return Response.json({ message: "Not Found" }, { status: 404 }); }
    if (method === "PUT" && path.startsWith("/repos/lex/my-site/contents/")) return Response.json({ commit: { sha: "1".repeat(40) } }, { status: 201 });
    if (path.endsWith("/git/commits/" + "1".repeat(40))) return Response.json({ tree: { sha: "t0" } });
    if (path.endsWith("/git/blobs")) return Response.json({ sha: "b".repeat(40) }, { status: 201 });
    if (path.endsWith("/git/trees")) { trees.push(body.tree); return Response.json({ sha: "t1" }, { status: 201 }); }
    if (path.endsWith("/git/commits")) return Response.json({ sha: "2".repeat(40) }, { status: 201 });
    if (path.endsWith("/git/refs/heads/main")) return Response.json({});
    throw new Error(`Unexpected ${method} ${path}`);
  };
  return { fetcher, trees };
}

const post = (body: unknown) =>
  new Request(`${origin}/api/repositories`, {
    method: "POST",
    headers: { Origin: origin, Cookie: `__Host-ase_session=${sessionId}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// 0: GitHub has the repository at once; 2: it answers 404 twice first, and Create site waits and tries again both times.
for (const notYet of [0, 2]) test(`Create site with the native static Starter commits every file within the Workers Free plan's 50 subrequests (${notYet} early 404s)`, async () => {
  const { used, spend } = budget();
  const github = fakeGitHub(spend, notYet);
  const response = await handle(post({ name: "my-site", private: true, startingPoint: "starter", siteName: "My site" }), environment(spend), github.fetcher);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.startingPointError, undefined, `stopped part way after ${used.count} subrequests (${used.assets} ASSETS, ${used.github} GitHub, ${used.sessions} session store)`);
  assert.ok(result.commit, "the Starter is committed");
  const manifest = JSON.parse(readFileSync(`public/native-static-starter/${NATIVE_STARTER_VERSION}/manifest.json`, "utf8"));
  const committed = new Set(["index.html", ...github.trees.flat().map((entry) => entry.path)]);
  for (const file of [...manifest.files, ...manifest.inline]) assert.ok(committed.has(file.path), `${file.path} is committed`);
  assert.ok(used.count <= SUBREQUESTS);
});
