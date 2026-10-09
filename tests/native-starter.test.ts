import { repositoryCacheRequest } from "./session-cache-fake";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { handle, type Env, type StoredSession } from "../worker/app.ts";
import { HttpError } from "../worker/github.ts";
import { NATIVE_STARTER_VERSION, nativeStarterFiles, parseNativeManifest, starterProvider } from "../worker/starter.ts";
import { tarball } from "./tar-helper.ts";

// The native static Starter: vendored ready files read through ASSETS only.

const base = `public/native-static-starter/${NATIVE_STARTER_VERSION}/`;
const manifest = JSON.parse(readFileSync(base + "manifest.json", "utf8"));
const routes = ["404.html", "index.html", "about/index.html", "work/fern-and-kettle/index.html", "work/harbour-lane-pottery/index.html", "work/meadow-row-allotments/index.html"];
const testHost = "https://native-site-editor-starter-test.lexvd.workers.dev";

/** ASSETS backed by public/, recording each path; `override` replaces a body by path. */
function assets(override: Record<string, Uint8Array | string | null> = {}) {
  const paths: string[] = [];
  return {
    paths,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      assert.equal(url.hostname, "assets.invalid");
      paths.push(url.pathname);
      const relative = url.pathname.replace(`/native-static-starter/${NATIVE_STARTER_VERSION}/`, "");
      if (relative in override) return override[relative] === null ? new Response("not found", { status: 404 }) : new Response(override[relative]);
      try {
        return new Response(readFileSync("public" + url.pathname));
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  };
}
const noNetwork: typeof fetch = async (input) => {
  throw new Error(`unexpected network fetch ${String(input)}`);
};
const text = (files: { path: string }[], path: string) => {
  const file = files.find((entry) => entry.path === path);
  assert.ok(file && "content" in file, `${path} is text`);
  return (file as { content: string }).content;
};

test("the vendored files match the manifest's sizes and checksums, and the manifest is valid", () => {
  const checked = parseNativeManifest(manifest);
  assert.equal(`v${checked.version}`, NATIVE_STARTER_VERSION);
  for (const entry of checked.files) {
    const bytes = readFileSync(`${base}files/${entry.path}.asset`);
    assert.equal(bytes.length, entry.size, entry.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.path);
  }
});

test("nativeStarterFiles reads only ASSETS and returns the six routes, components, styles, images, AGENTS.md and named settings, sorted", async () => {
  const fake = assets();
  const files = await starterProvider({ STARTER_SOURCE: "native-static", ASSETS: fake }, noNetwork)("My site");
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, [...paths].sort());
  for (const route of routes) assert.ok(paths.includes(route), route);
  assert.ok(fake.paths.every((path) => path.startsWith(`/native-static-starter/${NATIVE_STARTER_VERSION}/`)));
  assert.ok(!paths.some((path) => /legacy-components|CLAUDE|README|wrangler|\.github|\.assetsignore/.test(path)));
  assert.deepEqual(JSON.parse(text(files, ".editor/config.json")), { site: { name: "My site" } });
  assert.ok(paths.includes("AGENTS.md"));
  assert.ok(paths.includes("components/components.js"));
  assert.ok(paths.includes("styles/tones.css"));
  for (const route of routes) {
    for (const [, tag] of text(files, route).matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]+)\b/g)) {
      assert.ok(paths.includes(`components/${tag}/${tag}.html`), `${route} → ${tag} template`);
      assert.ok(paths.includes(`components/${tag}/${tag}.css`), `${route} → ${tag} styles`);
    }
  }
  const home = text(files, "index.html");
  // Every stylesheet a page links, and every stylesheet site.css imports, is in the site.
  for (const route of routes)
    for (const [, href] of text(files, route).matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)) assert.ok(paths.includes(href), `${route} → ${href}`);
  for (const [, imported] of text(files, "styles/site.css").matchAll(/@import url\("?\.?\/?([^")]+)"?\)/g))
    assert.ok(paths.includes(`styles/${imported.replace(/^styles\//, "")}`) || paths.includes(imported), imported);
  for (const [, src] of home.matchAll(/(?:src|href|content)="\/(images\/[^"]+)"/g)) assert.ok(paths.includes(src), src);
  // The template's test host and noindex are gone, except 404.html keeps noindex.
  for (const file of files) if ("content" in file) assert.ok(!file.content.includes(testHost), file.path);
  for (const route of routes.filter((route) => route !== "404.html")) assert.doesNotMatch(text(files, route), /name="robots" content="noindex"/);
  assert.match(home, /application\/ld\+json/);
  const scripts = [...home.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(([script]) => script);
  assert.deepEqual(scripts.filter((script) => !script.startsWith('<script type="application/ld+json">')), [
    '<script type="module" src="/components/components.js"></script>',
  ]);
  // The social card stays binary, byte for byte.
  const card = files.find((file) => file.path === "images/social-card.png")!;
  assert.ok("base64" in card);
  assert.deepEqual(Buffer.from(card.base64, "base64"), readFileSync(`${base}files/images/social-card.png.asset`));
});

test("each caller gets its own files", async () => {
  const one = await nativeStarterFiles("One", assets());
  const two = await nativeStarterFiles("Two", assets());
  assert.notEqual(one, two);
  assert.match(text(two, ".editor/config.json"), /Two/);
});

const damaged = (pattern: RegExp) => (error: unknown) => error instanceof HttpError && pattern.test(error.message);

test("a malformed manifest, unsafe path, duplicate or missing file fails clearly", async () => {
  const withManifest = (value: unknown) => assets({ "manifest.json": typeof value === "string" ? value : JSON.stringify(value) });
  await assert.rejects(nativeStarterFiles("x", withManifest("{not json")), damaged(/not JSON/));
  await assert.rejects(nativeStarterFiles("x", withManifest({ ...manifest, version: "other" })), damaged(/version/));
  for (const path of ["../secret", "/etc/passwd", "a//b", "https://evil.example/x", "a/./b"])
    await assert.rejects(nativeStarterFiles("x", withManifest({ ...manifest, files: [...manifest.files, { path, size: 1, sha256: "0".repeat(64) }] })), damaged(/unsafe path/), path);
  await assert.rejects(nativeStarterFiles("x", withManifest({ ...manifest, files: [...manifest.files, manifest.files[0]] })), damaged(/listed twice/));
  await assert.rejects(nativeStarterFiles("x", withManifest({ ...manifest, files: [{ ...manifest.files[0], size: 1e9 }] })), damaged(/bad size/));
  await assert.rejects(nativeStarterFiles("x", withManifest({ ...manifest, files: manifest.files.filter((f: { path: string }) => f.path !== "index.html") })), damaged(/no home page/));
  await assert.rejects(nativeStarterFiles("x", assets({ "manifest.json": null })), damaged(/manifest.json is missing/));
  await assert.rejects(nativeStarterFiles("x", assets({ "files/images/social-card.png.asset": null })), damaged(/social-card.png.asset is missing/));
  await assert.rejects(nativeStarterFiles("x", assets({ "files/images/social-card.png.asset": new Uint8Array([1, 2, 3]) })), damaged(/does not match/));
  await assert.rejects(nativeStarterFiles("x", assets({ "files/styles/site.css.asset": "body{}" })), damaged(/does not match/));
});

test("an unknown STARTER_SOURCE fails clearly; unset keeps the template tarball", async () => {
  await assert.rejects(starterProvider({ STARTER_SOURCE: "nope", ASSETS: assets() }, noNetwork)("x"), (error: unknown) => error instanceof HttpError && /STARTER_SOURCE "nope" is not known/.test(error.message));
  const urls: string[] = [];
  const legacy = await starterProvider({ ASSETS: assets() }, async (input) => {
    urls.push(String(input));
    return new Response(tarball({ "index.html": "<h1>Legacy</h1>" }) as BodyInit);
  })("x");
  assert.deepEqual(urls, ["https://codeload.github.com/techiesreviews/native-site-editor-starter/tar.gz/refs/heads/main"]);
  assert.equal(text(legacy, "index.html"), "<h1>Legacy</h1>");
});

// Both worker entry points use the same source.
const origin = "https://editor.example";
const sessionId = "d".repeat(64);
function environment(source?: string) {
  const records = new Map<string, StoredSession>([[sessionId, { kind: "user", token: "tok", login: "lex", avatar_url: "", expiresAt: Date.now() + 60_000 }]]);
  const fake = assets();
  const env: Env = {
    GITHUB_CLIENT_ID: "c",
    GITHUB_CLIENT_SECRET: "s",
    GITHUB_APP_SLUG: "test-editor",
    ...(source === undefined ? {} : { STARTER_SOURCE: source }),
    ASSETS: fake,
    SESSIONS: {
      idFromName: (name) => name,
      get: (id) => ({
        fetch: async (request) => {
          const cacheResponse = await repositoryCacheRequest(request, records, id);
          if (cacheResponse) return cacheResponse;
          if (request.method === "PUT") { records.set(id, (await request.json()) as StoredSession); return new Response(null, { status: 204 }); }
          const value = records.get(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  return { env, fake };
}
function fakeGitHub() {
  const hosts: string[] = [];
  const tree: { path: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    hosts.push(url.hostname);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.hostname === "codeload.github.com") return new Response(tarball({ "index.html": "<h1>Legacy</h1>" }) as BodyInit);
    const path = url.pathname;
    if (path === "/user/installations") return Response.json({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    if (path === "/user/repos") return Response.json({ id: 9, name: body.name, full_name: `lex/${body.name}`, private: false, default_branch: "main", owner: { login: "lex", type: "User" } }, { status: 201 });
    if (method === "PUT") return Response.json({ commit: { sha: "1".repeat(40) } }, { status: 201 });
    if (path.endsWith("/git/commits/" + "1".repeat(40))) return Response.json({ tree: { sha: "t0" } });
    if (path.endsWith("/git/blobs")) return Response.json({ sha: "b".repeat(40) }, { status: 201 });
    if (path.endsWith("/git/trees")) { tree.push(...body.tree); return Response.json({ sha: "t1" }, { status: 201 }); }
    if (path.endsWith("/git/commits")) return Response.json({ sha: "2".repeat(40) }, { status: 201 });
    if (path.endsWith("/git/refs/heads/main")) return Response.json({});
    throw new Error(`Unexpected ${method} ${path}`);
  };
  return { fetcher, hosts, tree };
}
const cookie = { Cookie: `__Host-ase_session=${sessionId}` };
const create = () =>
  new Request(`${origin}/api/repositories`, {
    method: "POST",
    headers: { Origin: origin, ...cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "my-site", startingPoint: "starter", siteName: "My site" }),
  });
const starter = () => new Request(`${origin}/api/starter?name=My%20site`, { headers: cookie });

test("Create site and Start your site both use the native starter when STARTER_SOURCE is native-static", async () => {
  const { env, fake } = environment("native-static");
  const github = fakeGitHub();
  const created = await (await handle(create(), env, github.fetcher)).json();
  assert.equal(created.startingPointError, undefined);
  assert.equal(created.commit.files, manifest.files.length + manifest.inline.length);
  assert.ok(!github.hosts.includes("codeload.github.com"));
  for (const route of routes.filter((route) => route !== "index.html")) assert.ok(github.tree.some((entry) => entry.path === route), route);
  const read = fake.paths.length;
  assert.ok(read > 0);
  const response = await handle(starter(), env, github.fetcher);
  assert.equal(response.status, 200);
  const { files } = await response.json();
  assert.ok(fake.paths.length > read);
  assert.deepEqual(files, await nativeStarterFiles("My site", assets()));
  assert.ok(!github.hosts.includes("codeload.github.com"));
});

test("without STARTER_SOURCE both entry points keep the template tarball and never read the native assets", async () => {
  const { env, fake } = environment();
  const github = fakeGitHub();
  const created = await (await handle(create(), env, github.fetcher)).json();
  assert.equal(created.commit.files, 1);
  const { files } = await (await handle(starter(), env, github.fetcher)).json();
  assert.deepEqual(files, [{ path: "index.html", content: "<h1>Legacy</h1>" }]);
  assert.equal(github.hosts.filter((host) => host === "codeload.github.com").length, 2);
  assert.deepEqual(fake.paths, []);
});

test("an unknown STARTER_SOURCE fails both entry points clearly, and a blank page still works", async () => {
  const { env, fake } = environment("mystery");
  const github = fakeGitHub();
  const created = await (await handle(create(), env, github.fetcher)).json();
  assert.match(created.startingPointError, /STARTER_SOURCE "mystery" is not known/);
  const response = await handle(starter(), env, github.fetcher);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /STARTER_SOURCE "mystery" is not known/);
  const blank = new Request(`${origin}/api/repositories`, {
    method: "POST",
    headers: { Origin: origin, ...cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "my-site", startingPoint: "blank" }),
  });
  assert.equal((await (await handle(blank, env, fakeGitHub().fetcher)).json()).commit.files, 3);
  assert.deepEqual(fake.paths, []);
  assert.ok(!github.hosts.includes("codeload.github.com"));
});
