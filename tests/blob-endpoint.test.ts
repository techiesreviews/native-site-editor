import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { assetType, blobUrl, isFontType } from "../shared/asset-types.ts";

const origin = "https://editor.example";
const id = "c".repeat(64);
const sha = "d".repeat(40);
const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
const bytes = new Uint8Array([0, 1, 2, 250, 255]);

function environment() {
  const records = new Map<string, StoredSession>([[id, { kind: "user", token: "secret", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000 }]]);
  const env: Env = {
    GITHUB_CLIENT_ID: "app-client",
    GITHUB_CLIENT_SECRET: "app-secret",
    GITHUB_APP_SLUG: "test-editor",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name) => name,
      get: (key) => ({
        fetch: async () => {
          const value = records.get(key);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return env;
}

// A fresh fetcher per test: the repository listing and blob caches are kept per fetcher.
function github() {
  const asked: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    asked.push(path);
    if (path === "/user/installations") return Response.json({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    if (path === "/user/installations/1/repositories")
      return Response.json({ repositories: [{ id: 7, name: "site", full_name: "lex/site", private: true, default_branch: "main", owner: { login: "lex", type: "User" } }] });
    if (path === `/repos/lex/site/git/blobs/${sha}`) {
      const content = blobContent;
      return Response.json({ size: content.length, encoding: "base64", content: btoa(String.fromCharCode(...content)).replace(/(.{20})/g, "$1\n") });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetcher, asked };
}
let blobContent: Uint8Array = new TextEncoder().encode(svg);

const get = (path: string, cookie = `__Host-ase_session=${id}`) => new Request(origin + path, { headers: { Cookie: cookie } });

test("GET /api/blob answers a blob's bytes, cached privately for good and sandboxed", async () => {
  blobContent = new TextEncoder().encode(svg);
  const { fetcher } = github();
  const response = await handle(get(`/api/blob?repo=lex/site&sha=${sha}&type=svg`), environment(), fetcher);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), svg);
  assert.equal(response.headers.get("Content-Type"), "image/svg+xml");
  assert.equal(response.headers.get("Cache-Control"), "private, max-age=31536000, immutable");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Vary"), "Cookie", "another account's cached copy is never reused");
  const csp = response.headers.get("Content-Security-Policy") ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /(^|; )sandbox($|;)/, "an SVG opened on its own runs no script in the editor's origin");
  assert.doesNotMatch(csp, /script-src/);
  assert.equal(response.headers.get("Content-Disposition"), null);
});

test("GET /api/blob keeps binary bytes exact and names fonts and images by extension", async () => {
  blobContent = bytes;
  const { fetcher, asked } = github();
  const env = environment();
  for (const [type, expected] of [["png", "image/png"], ["JPG", "image/jpeg"], ["woff2", "font/woff2"], ["webp", "image/webp"]]) {
    const response = await handle(get(`/api/blob?repo=lex/site&sha=${sha}&type=${type}`), env, fetcher);
    assert.equal(response.status, 200, type);
    assert.equal(response.headers.get("Content-Type"), expected);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
  assert.equal(asked.filter((path) => path.includes("/git/blobs/")).length, 1, "the blob is read from GitHub once");
});

test("GET /api/blob without a type is a download, never shown inline", async () => {
  blobContent = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const { fetcher } = github();
  const response = await handle(get(`/api/blob?repo=lex/site&sha=${sha}`), environment(), fetcher);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(response.headers.get("Content-Disposition"), "attachment");
  assert.equal(response.headers.get("Cache-Control"), "private, max-age=31536000, immutable");
});

test("GET /api/blob refuses types it does not show, bad revisions, strangers and repositories not selected", async () => {
  blobContent = bytes;
  const env = environment();
  const html = await handle(get(`/api/blob?repo=lex/site&sha=${sha}&type=html`), env, github().fetcher);
  assert.equal(html.status, 415);
  assert.equal(html.headers.get("Cache-Control"), "no-store", "errors are never cached");
  assert.equal((await handle(get(`/api/blob?repo=lex/site&sha=nothex&type=png`), env, github().fetcher)).status, 400);
  const { fetcher, asked } = github();
  const stranger = await handle(get(`/api/blob?repo=lex/site&sha=${sha}&type=png`, ""), env, fetcher);
  assert.equal(stranger.status, 401);
  assert.equal(stranger.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(asked, [], "no session, no GitHub request");
  const other = await handle(get(`/api/blob?repo=lex/other&sha=${sha}&type=png`), env, fetcher);
  assert.equal(other.status, 403);
  assert.equal(asked.filter((path) => path.includes("/git/blobs/")).length, 0);
});

test("POST /api/blob is still the upload, with its origin check", async () => {
  const response = await handle(new Request(`${origin}/api/blob?repo=lex/site`, {
    method: "POST",
    headers: { Cookie: `__Host-ase_session=${id}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  }), environment(), github().fetcher);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("blob addresses name the repository, the SHA and the asset's type", () => {
  assert.equal(blobUrl("lex/site", sha, "images/Photo.PNG"), `/api/blob?repo=lex%2Fsite&sha=${sha}&type=png`);
  assert.equal(blobUrl("lex/site", sha, "fonts/a.woff2"), `/api/blob?repo=lex%2Fsite&sha=${sha}&type=woff2`);
  assert.equal(blobUrl("lex/site", sha, "docs/a.pdf"), `/api/blob?repo=lex%2Fsite&sha=${sha}`, "other files are plain bytes");
  assert.equal(blobUrl("lex/site", sha), `/api/blob?repo=lex%2Fsite&sha=${sha}`);
  assert.equal(blobUrl("lex/site", sha, "images.v2/logo"), `/api/blob?repo=lex%2Fsite&sha=${sha}`, "a dot in a folder is no extension");
  assert.equal(assetType("a/b.SVG"), "image/svg+xml");
  assert.equal(assetType("a/b.html"), undefined);
  assert.equal(assetType("a/constructor"), undefined);
  assert.ok(isFontType(assetType("x.ttf")));
  assert.ok(!isFontType(assetType("x.png")));
});
