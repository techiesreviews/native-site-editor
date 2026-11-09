// Preview links (slice 35) over the real Worker in Miniflare (worker/app.ts `previewRoute`, worker/index.ts): links
// minted for a signed-in tab with their end in the tag, visitors refused while nobody serves the link, and a link turned
// off refused for good, with every socket in it closed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { origin, repo, signIn, startWorker } from "./mcp-harness";
import { LiveRooms, livePreviewObjectName, type LiveSocket } from "../worker/agent-relay";
import { PREVIEW_TURNED_OFF } from "../shared/preview-link";

const previews = "https://previews.example";
/** The Worker's tag over a link's nonce and end, made with the test App's secret: to make links it would not. */
async function tagOf(nonce: string, ends: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("native-site-editor live session v1\0test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`preview\0${nonce}\0${ends}`)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

test("Miniflare: without a preview Worker the editor offers no preview links", async () => {
  const { worker } = await startWorker();
  try {
    const anna = await signIn(worker);
    const session = await (await worker.dispatchFetch(`${origin}/api/session`, { headers: { Cookie: anna.cookie } })).json() as { previewLinks?: boolean };
    assert.equal(session.previewLinks, undefined);
    const minted = await worker.dispatchFetch(`${origin}/api/live/preview`, {
      method: "POST", headers: { Origin: origin, Cookie: anna.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ repo: repo.full_name, branch: "main" }),
    });
    assert.equal(minted.status, 503);
  } finally { await worker.dispose(); }
});

test("Miniflare: a preview link is minted with its end signed, visitors join only while it is served, and turning it off refuses it for good", async () => {
  const { worker, github } = await startWorker({ bindings: { PREVIEW_ORIGIN: `${previews}/ignored-path` } });
  const visit = (token: string, init?: RequestInit, extra = "") => worker.dispatchFetch(`${origin}/api/live/visit?token=${token}${extra}`, init);
  try {
    const anna = await signIn(worker);
    const session = await (await worker.dispatchFetch(`${origin}/api/session`, { headers: { Cookie: anna.cookie } })).json() as { previewLinks?: boolean };
    assert.equal(session.previewLinks, true);
    const mint = (headers: Record<string, string>) => worker.dispatchFetch(`${origin}/api/live/preview`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ repo: repo.full_name, branch: "main", site: "Bäckerei Site" }),
    });
    assert.equal((await mint({ Origin: origin })).status, 401, "signed out");
    assert.equal((await mint({ Origin: previews, Cookie: anna.cookie })).status, 403, "another site's page");
    const minted = await mint({ Origin: origin, Cookie: anna.cookie });
    assert.equal(minted.status, 200);
    const { token, host, link, ends } = await minted.json() as { token: string; host: string; link: string; ends: number };
    assert.match(token, /^[a-f\d]{72}$/);
    assert.match(host, /^[a-f\d]{64}$/);
    assert.equal(link, `${previews}/s/backerei-site-${token}/`);
    assert.ok(Math.abs(ends - (Date.now() + 30 * 86_400_000)) < 5_000, "it lasts 30 days");
    assert.equal(parseInt(token.slice(32, 40), 16) * 1000, ends);
    assert.equal(token.slice(40), await tagOf(token.slice(0, 32), token.slice(32, 40)));

    // Made-up, forged, stretched, doubled or past its end: refused before any relay instance wakes.
    const later = (parseInt(token.slice(32, 40), 16) + 86_400).toString(16).padStart(8, "0");
    const earlier = (Math.floor(Date.now() / 1000) - 60).toString(16).padStart(8, "0");
    assert.equal((await visit("a".repeat(72))).status, 400);
    assert.equal((await visit(token.slice(0, 40) + "0".repeat(32))).status, 400);
    assert.equal((await visit(token.slice(0, 32) + later + token.slice(40))).status, 400, "a later end is a made-up link");
    assert.equal((await visit(token, undefined, `&token=${token}`)).status, 400);
    assert.equal((await visit(token.slice(0, 32) + earlier + await tagOf(token.slice(0, 32), earlier))).status, 410, "ended");
    assert.equal((await visit(token)).status, 409, "not running: nobody serves it");

    // Only the tab it was minted for serves it: signed in, from the editor, with its proof and repository access.
    const serveUrl = (proof = host) => `${origin}/api/live/preview?${new URLSearchParams({ token, repo: repo.full_name, host: proof })}`;
    const serveAs = (headers: Record<string, string>, proof?: string) => worker.dispatchFetch(serveUrl(proof), { headers: { Upgrade: "websocket", ...headers } });
    assert.equal((await serveAs({ Origin: origin })).status, 401);
    assert.equal((await serveAs({ Origin: previews, Cookie: anna.cookie })).status, 403, "a page on the preview's address");
    assert.equal((await serveAs({ Origin: origin, Cookie: anna.cookie }, "f".repeat(64))).status, 403, "someone else's proof");
    const served = await serveAs({ Origin: origin, Cookie: anna.cookie });
    assert.equal(served.status, 101);
    served.webSocket!.accept();
    assert.equal((await visit(token)).status, 204, "running");
    assert.equal((await visit(token, { headers: { Upgrade: "websocket", Origin: "https://attacker.example" } })).status, 403, "another site's page");
    // The preview Worker's forwarded socket has no Origin; a browser on the preview's address may come too.
    const visitor = await visit(token, { headers: { Upgrade: "websocket" } });
    assert.equal(visitor.status, 101);
    visitor.webSocket!.accept();
    assert.equal((await visit(token, { headers: { Upgrade: "websocket", Origin: previews } })).status, 101);

    // Turning it off needs the same proof; then the link refuses, serving included (the sockets' close: below).
    const off = (headers: Record<string, string>, proof = host) => worker.dispatchFetch(`${origin}/api/live/preview/off?token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ repo: repo.full_name, host: proof }),
    });
    assert.equal((await off({ Origin: previews, Cookie: anna.cookie })).status, 403);
    assert.equal((await off({ Origin: origin, Cookie: anna.cookie }, "f".repeat(64))).status, 403);
    assert.equal((await off({ Origin: origin, Cookie: anna.cookie })).status, 204);
    assert.equal((await visit(token)).status, 410);
    assert.equal((await serveAs({ Origin: origin, Cookie: anna.cookie })).status, 410);
    assert.equal((await worker.dispatchFetch(serveUrl(), { headers: { Cookie: anna.cookie } })).status, 410, "the tab's plain look learns it too");

    // The mark is all the instance keeps, until the link would have ended.
    const namespace = await worker.getDurableObjectNamespace("SESSIONS");
    const stub = namespace.get(namespace.idFromName(await livePreviewObjectName(token.slice(0, 32))));
    const inventory = await (await stub.fetch("https://session.internal/maintenance/inventory", { method: "POST" })).json() as { alarm: number | null };
    assert.equal(inventory.alarm, ends);
    github.allowed = false;
    assert.equal((await off({ Origin: origin, Cookie: anna.cookie })).status, 403, "no repository access any more");
  } finally { await worker.dispose(); }
});

test("turning a preview off closes every socket in its instance with its own code, and nobody is left to admit a visitor", () => {
  const rooms = new LiveRooms([]);
  const socket = () => {
    let attachment: unknown;
    const closed: number[] = [];
    const made = {
      readyState: 1, closed,
      send() {}, close(code?: number) { closed.push(code ?? 1000); made.readyState = 3; },
      serializeAttachment(value: unknown) { attachment = structuredClone(value); }, deserializeAttachment: () => structuredClone(attachment),
    } satisfies LiveSocket & { closed: number[] };
    return made;
  };
  const room = "e".repeat(64), lex = socket(), visitor = socket();
  assert.equal(rooms.join(lex, room, "editor"), true);
  assert.equal(rooms.join(visitor, room, "guest"), true);
  rooms.endAll(PREVIEW_TURNED_OFF, "This preview link is turned off.");
  assert.deepEqual([lex.closed, visitor.closed], [[PREVIEW_TURNED_OFF], [PREVIEW_TURNED_OFF]]);
  assert.equal(rooms.admits(room, "guest"), false);
  // Their late close events find nothing to announce.
  rooms.leave(lex, PREVIEW_TURNED_OFF);
  rooms.leave(visitor, PREVIEW_TURNED_OFF);
  assert.deepEqual([lex.closed, visitor.closed], [[PREVIEW_TURNED_OFF], [PREVIEW_TURNED_OFF]]);
});
