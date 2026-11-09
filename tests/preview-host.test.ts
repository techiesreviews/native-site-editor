// Preview links (slice 35): the shared rules (shared/preview-link.ts), the preview Worker's answers
// (worker/preview-host.ts) and its service worker, run here on a fake scope.
import assert from "node:assert/strict";
import { test } from "node:test";
import { previewContentType, previewSlug, previewTokenEnds, readPreviewPath, resolvePreviewPath } from "../shared/preview-link";
import { PREVIEW_HEADERS, previewHost } from "../worker/preview-host";

const token = "a".repeat(32) + "6a000000" + "b".repeat(32);
const base = `/s/bakery-${token}`;
const origin = "https://previews.example.workers.dev";

test("a link's path, slug, end and media types", () => {
  assert.deepEqual(readPreviewPath(`${base}/`), { token, base, rest: "/" });
  assert.deepEqual(readPreviewPath(`${base}/site/about/`), { token, base, rest: "/site/about/" });
  assert.deepEqual(readPreviewPath(`/s/${token}/live`), { token, base: `/s/${token}`, rest: "/live" });
  for (const path of ["/", "/s/", `/s/bakery-${token}x/`, `/s/Bakery-${token}/`, `/x/bakery-${token}/`, `/s/bakery-${token.slice(1)}/`]) assert.equal(readPreviewPath(path), undefined, path);
  assert.equal(previewSlug("Bäckerei Müller & Söhne!"), "backerei-muller-sohne");
  assert.equal(previewSlug("***"), "site");
  assert.equal(previewSlug("x".repeat(60)).length, 40);
  assert.equal(previewTokenEnds(token), 0x6a000000 * 1000);
  assert.ok(Number.isNaN(previewTokenEnds("nope")));
  assert.equal(previewContentType("styles/site.css"), "text/css; charset=utf-8");
  assert.equal(previewContentType("images/a.SVG"), "image/svg+xml");
  assert.equal(previewContentType("about/index.html"), "text/html; charset=utf-8");
  assert.equal(previewContentType("LICENSE"), "application/octet-stream");
});

test("paths are answered as a static host would: folders, moves to the slash, .html, the site's 404 page, and refusals", () => {
  const files = new Set(["index.html", "about/index.html", "styles/site.css", "contact.html", "my file.txt"]);
  const has = (file: string) => files.has(file);
  assert.deepEqual(resolvePreviewPath("/", has), { status: 200, file: "index.html" });
  assert.deepEqual(resolvePreviewPath("/about/", has), { status: 200, file: "about/index.html" });
  assert.deepEqual(resolvePreviewPath("/about", has), { status: 301, location: "/about/" });
  assert.deepEqual(resolvePreviewPath("/styles/site.css", has), { status: 200, file: "styles/site.css" });
  assert.deepEqual(resolvePreviewPath("/contact", has), { status: 200, file: "contact.html" });
  assert.deepEqual(resolvePreviewPath("/my%20file.txt", has), { status: 200, file: "my file.txt" });
  assert.deepEqual(resolvePreviewPath("/missing", has), { status: 404 });
  // The repository's hidden files are not the site's.
  files.add(".editor/config.json").add(".env").add(".well-known/security.txt");
  for (const path of ["/.editor/config.json", "/.env", "/.editor/"]) assert.deepEqual(resolvePreviewPath(path, has), { status: 404 }, path);
  assert.deepEqual(resolvePreviewPath("/.well-known/security.txt", has), { status: 200, file: ".well-known/security.txt" });
  files.add("404.html");
  assert.deepEqual(resolvePreviewPath("/missing/", has), { status: 404, file: "404.html" });
  for (const path of ["about", "/../secret", "/a//b", "/a/./b", "/%2e%2e/x", "/a%5Cb", "/%zz"]) assert.deepEqual(resolvePreviewPath(path, has), { status: 400 }, path);
  // An encoded slash never makes one part of two folders, which would slip a hidden file past the check.
  files.add("docs/.env").add("a/.github/x");
  for (const path of ["/docs%2F.env", "/a%2F.github%2Fx", "/docs%2f.env"]) assert.deepEqual(resolvePreviewPath(path, has), { status: 400 }, path);
  assert.deepEqual(resolvePreviewPath("/docs/.env", has), { status: 404, file: "404.html" });
});

/** The preview Worker with fake bindings: the editor's build and Worker, each request they get on record. */
function host(status: number | (() => number) = 204) {
  const editor: Request[] = [], assets: string[] = [];
  const env = {
    ASSETS: { fetch: async (request: Request) => {
      assets.push(new URL(request.url).pathname);
      return new Response("<!doctype html><title>Preview</title>", { headers: { "Content-Type": "text/html", "Set-Cookie": "a=b" } });
    } },
    EDITOR: { fetch: async (request: Request) => { editor.push(request); return new Response(null, { status: typeof status === "number" ? status : status(), headers: { "Set-Cookie": "session=x" } }); } },
  };
  const get = (path: string, init?: RequestInit) => previewHost(new Request(`${origin}${path}`, init), env);
  return { get, editor, assets };
}

test("the preview Worker: every answer says noindex and sets no cookie; the room's request carries none of the visitor's headers", async () => {
  const { get, editor, assets } = host();
  const visitor = { headers: { Cookie: "ase_session=secret", Origin: "https://elsewhere.example", Authorization: "Bearer x", "CF-Connecting-IP": "1.2.3.4" } };
  const answers = {
    page: await get(`${base}/`, visitor),
    slash: await get(base),
    robots: await get("/robots.txt"),
    worker: await get("/preview-sw.js"),
    room: await get(`${base}/live?rejoin=${"c".repeat(32)}`, visitor),
    site: await get(`${base}/site/about/`),
    root: await get("/"),
    stray: await get("/index.html"),
    post: await get(`${base}/`, { method: "POST" }),
  };
  for (const [name, response] of Object.entries(answers)) {
    for (const [header, value] of Object.entries(PREVIEW_HEADERS)) assert.equal(response.headers.get(header), value, `${name}: ${header}`);
    assert.equal(response.headers.get("Set-Cookie"), null, `${name} sets no cookie`);
  }
  assert.equal(answers.page.status, 200);
  assert.equal(answers.page.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.deepEqual(assets, ["/preview-visit.html"]);
  assert.deepEqual([answers.slash.status, answers.slash.headers.get("Location")], [301, `${base}/`]);
  assert.equal(await answers.robots.text(), "User-agent: *\nDisallow: /\n");
  assert.match(answers.worker.headers.get("Content-Type") ?? "", /^text\/javascript/);
  assert.equal(answers.room.status, 204);
  assert.deepEqual([answers.site.status, answers.root.status, answers.stray.status, answers.post.status], [404, 404, 404, 405]);

  // The room: only the token, the visitor's rejoin secret and (for a socket) the upgrade go on.
  assert.equal(editor.length, 1);
  assert.equal(editor[0].url, `https://editor.internal/api/live/visit?token=${token}&rejoin=${"c".repeat(32)}`);
  assert.deepEqual([...editor[0].headers.keys()], []);
  await get(`${base}/live`, { headers: { Upgrade: "websocket", Cookie: "ase_session=secret" } });
  assert.deepEqual([...editor[1].headers], [["upgrade", "websocket"]]);
});

/** The served service worker on a fake scope: the windows it can reach, and what each fetch was answered with. */
async function serviceWorker(windows: { url: string; answer?: (path: string) => unknown }[], clients: Record<string, string> = {}) {
  const { get } = host();
  const source = await (await get("/preview-sw.js")).text();
  const listeners: Record<string, (event: never) => void> = {};
  const asked: { url: string; path: string }[] = [];
  const scope = {
    location: { origin },
    clients: {
      get: async (id: string) => clients[id] ? { url: clients[id] } : undefined,
      matchAll: async () => windows.map((window) => ({
        url: window.url,
        postMessage(message: { path: string }, [port]: MessagePort[]) {
          asked.push({ url: window.url, path: message.path });
          port.postMessage(window.answer?.(message.path) ?? { status: 200, type: "text/plain", body: new TextEncoder().encode(`file ${message.path}`).buffer });
        },
      })),
      claim: async () => undefined,
    },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, listener: (event: never) => void) => { listeners[type] = listener; },
  };
  new Function("self", source)(scope);
  const fetchAs = async (url: string, options: { clientId?: string; mode?: string; referrer?: string; method?: string; range?: string } = {}) => {
    let answered: Promise<Response> | undefined;
    // The fields of a fetch event's request the worker reads.
    const request = { url, method: options.method ?? "GET", mode: options.mode ?? "cors", referrer: options.referrer ?? "", headers: new Headers(options.range ? { Range: options.range } : {}) };
    listeners.fetch({ request, clientId: options.clientId ?? "", respondWith: (answer: Promise<Response>) => { answered = answer; } } as never);
    return answered;
  };
  return { fetchAs, asked };
}

test("the service worker answers a link's site paths, root-relative files of its pages and links out of them; nothing else", async () => {
  const page = `${origin}${base}/`;
  const { fetchAs, asked } = await serviceWorker([{ url: `${origin}/s/other-${"d".repeat(72)}/` }, { url: page }], {
    sitePage: `${origin}${base}/site/about/`, shellPage: page,
  });
  // A file under the link's site: the link's own page is asked for it.
  const own = await fetchAs(`${origin}${base}/site/about/?q=1`);
  assert.equal(await own?.text(), "file /about/");
  assert.equal(own?.headers.get("Content-Type"), "text/plain");
  // A root-relative stylesheet of a page there: that site's file.
  assert.equal(await (await fetchAs(`${origin}/styles/site.css`, { clientId: "sitePage" }))?.text(), "file /styles/site.css");
  assert.deepEqual(asked, [{ url: page, path: "/about/" }, { url: page, path: "/styles/site.css" }]);
  // A link out of a site page to a root-relative address moves into that site.
  const moved = await fetchAs(`${origin}/contact/?x=1`, { mode: "navigate", referrer: `${origin}${base}/site/` });
  assert.deepEqual([moved?.status, moved?.headers.get("Location")], [302, `${base}/site/contact/?x=1`]);
  // The link's own page and its build files, other origins, other methods and plain navigations go to the network.
  for (const options of [{ clientId: "shellPage" }, {}, { mode: "navigate" }, { mode: "navigate", referrer: page }]) {
    const answer = fetchAs(`${origin}/assets/preview-1.js`, options);
    if (options.clientId) await assert.rejects(async () => { await answer; }, "passed to the network (no fetch in this test)");
    else assert.equal(await answer, undefined);
  }
  assert.equal(await fetchAs("https://cdn.example/x.js", { clientId: "sitePage" }), undefined);
  assert.equal(await fetchAs(`${origin}${base}/site/form`, { method: "POST" }), undefined);
  assert.equal(asked.length, 2);
});

test("the service worker turns the page's answers into responses: moves stay in the site, refusals say so, no page is a 503", async () => {
  const page = `${origin}${base}/`;
  const { fetchAs } = await serviceWorker([{ url: page, answer: (path) => path === "/about" ? { status: 301, location: "/about/" } : path === "/gone" ? { status: 404 } : { status: 200, type: "text/html; charset=utf-8", body: new TextEncoder().encode("<p>hi</p>").buffer } }]);
  const moved = await fetchAs(`${origin}${base}/site/about`);
  assert.deepEqual([moved?.status, moved?.headers.get("Location")], [301, `${base}/site/about/`]);
  const gone = await fetchAs(`${origin}${base}/site/gone`);
  assert.deepEqual([gone?.status, await gone?.text()], [404, "Not found."]);
  const head = await fetchAs(`${origin}${base}/site/`, { method: "HEAD" });
  assert.deepEqual([head?.status, head?.headers.get("X-Robots-Tag"), await head?.text()], [200, "noindex, nofollow", ""]);
  const { fetchAs: alone } = await serviceWorker([]);
  assert.equal((await alone(`${origin}${base}/site/`))?.status, 503);
});

test("the service worker answers a range of a file with 206, as Safari needs for video and audio", async () => {
  const page = `${origin}${base}/`;
  const bytes = Uint8Array.from({ length: 100 }, (_, index) => index);
  const { fetchAs } = await serviceWorker([{ url: page, answer: () => ({ status: 200, type: "video/mp4", body: bytes.buffer.slice(0) }) }]);
  const part = await fetchAs(`${origin}${base}/site/clip.mp4`, { range: "bytes=10-19" });
  assert.deepEqual([part?.status, part?.headers.get("Content-Range"), part?.headers.get("Accept-Ranges")], [206, "bytes 10-19/100", "bytes"]);
  assert.deepEqual([...new Uint8Array(await part!.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const tail = await fetchAs(`${origin}${base}/site/clip.mp4`, { range: "bytes=-5" });
  assert.deepEqual([tail?.status, tail?.headers.get("Content-Range")], [206, "bytes 95-99/100"]);
  const open = await fetchAs(`${origin}${base}/site/clip.mp4`, { range: "bytes=98-" });
  assert.equal((await open!.arrayBuffer()).byteLength, 2);
  assert.equal((await fetchAs(`${origin}${base}/site/clip.mp4`, { range: "bytes=200-" }))?.status, 416);
  assert.equal((await fetchAs(`${origin}${base}/site/clip.mp4`))?.status, 200);
});

test("a link not running or over is answered from memory for a while, costing the editor nothing", async () => {
  for (const status of [409, 410]) {
    const link = `/s/bakery-${String(status).repeat(24)}`;
    const { get, editor } = host(status);
    assert.equal((await get(`${link}/live`)).status, status);
    assert.equal((await get(`${link}/live`)).status, status);
    assert.equal((await get(`${link}/live`)).headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(editor.length, 1, "one request to the editor in the moment");
    // A socket still goes through, and a running link is never remembered.
    await get(`${link}/live`, { headers: { Upgrade: "websocket" } });
    assert.equal(editor.length, 2);
  }
  const running = `/s/bakery-${"e".repeat(72)}`;
  const { get, editor } = host(204);
  await get(`${running}/live`);
  await get(`${running}/live`);
  assert.equal(editor.length, 2);
});

test("a page whose socket closed asks afresh: turned off replaces a remembered not running, and running clears it", async () => {
  let now = 409;
  const link = `/s/bakery-${"f".repeat(72)}`;
  const { get, editor } = host(() => now);
  assert.equal((await get(`${link}/live`)).status, 409);
  // Turned off while "not running" is remembered: a plain look still has the memory, a fresh one asks the editor.
  now = 410;
  assert.equal((await get(`${link}/live`)).status, 409);
  assert.equal((await get(`${link}/live?fresh=1`)).status, 410);
  assert.equal((await get(`${link}/live`)).status, 410, "the 410 replaced the 409");
  assert.deepEqual(editor.map((request) => new URL(request.url).search), [`?token=${"f".repeat(72)}`, `?token=${"f".repeat(72)}`]);
  // Running again (a fresh look gets in): the memory goes at once.
  const other = `/s/bakery-${"1".repeat(72)}`;
  now = 409;
  assert.equal((await get(`${other}/live`)).status, 409);
  now = 204;
  assert.equal((await get(`${other}/live?fresh=1`)).status, 204);
  assert.equal((await get(`${other}/live`)).status, 204);
});

