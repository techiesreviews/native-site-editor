// GitHub pushes reach open tabs (ticket am-32, ADR 0003 decision 5): signed fake deliveries to the real Worker reach a
// signed-in tab's live room as "the branch is now at commit X"; unsigned or wrongly signed ones are refused.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { LiveRooms, type LiveSocket } from "../worker/agent-relay";
import { githubWebhook, readPush, signedBy, webhookSecret } from "../worker/github-webhook";
import type { Env } from "../worker/app";
import { HttpError } from "../worker/github";
import { openLiveRoom, type LiveClock, type LiveRoomSocket } from "../src/live-room";
import { readLiveServerMessage, type LiveAccess } from "../shared/live-room";
import { origin, repo, signIn, startWorker } from "./mcp-harness";

const secret = "test-webhook-secret-that-is-long-enough-1234";
const pushedCommit = "d".repeat(40);
const sign = (body: string, key = secret) => `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
const pushBody = (over: Record<string, unknown> = {}) => JSON.stringify({ ref: "refs/heads/main", after: pushedCommit, deleted: false, repository: { id: repo.id }, ...over });
async function until(check: () => boolean, what: string) {
  for (const started = Date.now(); !check(); await new Promise(resolve => setTimeout(resolve, 2)))
    if (Date.now() - started > 3_000) assert.fail(`timed out waiting: ${what}`);
}
/** No timer ever fires: nothing keeps the test process alive if an assertion fails. */
const stillClock: LiveClock = { now: () => Date.now(), setTimeout: () => 0, clearTimeout: () => undefined };

test("a signature is the HMAC-SHA256 of the exact body under the secret", async () => {
  const body = pushBody(), bytes = new TextEncoder().encode(body);
  assert.equal(await signedBy(secret, bytes, sign(body)), true);
  assert.equal(await signedBy(secret, bytes, sign(body).toUpperCase().replace("SHA256=", "sha256=")), true, "hex in either case");
  assert.equal(await signedBy(secret, bytes, sign(body, "another secret")), false);
  assert.equal(await signedBy(secret, new TextEncoder().encode(`${body} `), sign(body)), false, "a changed body");
  for (const header of [null, "", sign(body).slice(7), `sha1=${"a".repeat(40)}`, `sha256=${"g".repeat(64)}`, `${sign(body)}00`])
    assert.equal(await signedBy(secret, bytes, header), false, String(header));
});

test("only a branch push with a new commit is told: tags, deleted branches and malformed payloads are not", () => {
  assert.deepEqual(readPush(JSON.parse(pushBody({ ref: "refs/heads/feature/one" }))), { repoId: repo.id, branch: "feature/one", commit: pushedCommit });
  for (const [name, payload] of Object.entries({
    tag: { ref: "refs/tags/v1" },
    deleted: { deleted: true },
    "no commit": { after: "0".repeat(40) },
    "short commit": { after: "abc" },
    "bad branch": { ref: "refs/heads/../main" },
    "no repository": { repository: undefined },
    "string id": { repository: { id: "1" } },
  })) assert.equal(readPush(JSON.parse(pushBody(payload))), undefined, name);
  assert.equal(readPush(null), undefined);
});

test("the relay tells each open tab of a push once, never agents or guests", () => {
  const sockets: (LiveSocket & { texts: string[] })[] = [];
  const socket = (access: LiveAccess, open = true) => {
    let attachment: unknown = { role: "live", room: "a".repeat(64), peer: "b".repeat(32), access, keyed: true, since: sockets.length };
    const made = {
      readyState: open ? 1 : 3, texts: [] as string[],
      send(message: string | ArrayBuffer) { if (typeof message === "string") made.texts.push(message); },
      close() { made.readyState = 3; },
      serializeAttachment(value: unknown) { attachment = value; },
      deserializeAttachment: () => attachment,
    };
    sockets.push(made);
    return made;
  };
  const [tab, otherFileTab, agent, guest, closed] = [socket("editor"), socket("editor"), socket("agent"), socket("guest"), socket("editor", false)];
  const relay = new LiveRooms(sockets);
  assert.equal(relay.pushed(pushedCommit), 2);
  for (const told of [tab, otherFileTab]) assert.deepEqual(told.texts.map(text => readLiveServerMessage(text)), [{ type: "pushed", commit: pushedCommit }]);
  for (const quiet of [agent, guest, closed]) assert.deepEqual(quiet.texts, []);
  assert.equal(readLiveServerMessage(JSON.stringify({ type: "pushed", commit: "nope" })), null, "a malformed notice is ignored");
});

test("the webhook secret: GITHUB_WEBHOOK_SECRET wins over the one setup kept; with neither every delivery is refused", async () => {
  const stored = (value: unknown): Env => ({
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SESSIONS: { idFromName: name => name, idFromString: id => id, get: () => ({ fetch: async () => value ? Response.json(value) : new Response(null, { status: 404 }) }) },
  });
  const kept = { clientId: "Iv1.kept", clientSecret: "client", slug: "editor", webhookSecret: "kept-secret" };
  assert.equal(await webhookSecret(stored(kept)), "kept-secret");
  assert.equal(await webhookSecret({ ...stored(kept), GITHUB_WEBHOOK_SECRET: "env-secret" }), "env-secret");
  assert.equal(await webhookSecret(stored({ ...kept, webhookSecret: undefined })), undefined);
  assert.equal(await webhookSecret({ ...stored(null), GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret", GITHUB_APP_SLUG: "slug" }), undefined);
  const body = pushBody();
  await assert.rejects(githubWebhook(new Request(`${origin}/api/github/webhook`, {
    method: "POST", body, headers: { "Content-Type": "application/json", "X-GitHub-Event": "push", "X-Hub-Signature-256": sign(body) },
  }), stored(null)), (error: unknown) => error instanceof HttpError && error.status === 401);
});

test("Miniflare: a signed push reaches an open tab's live room; unsigned and wrongly signed deliveries are refused", async () => {
  const { worker } = await startWorker({ bindings: { GITHUB_WEBHOOK_SECRET: secret } });
  const deliver = (body: string, headers: Record<string, string>) => worker.dispatchFetch(`${origin}/api/github/webhook`, {
    method: "POST", body, headers: { "Content-Type": "application/json", "X-GitHub-Event": "push", ...headers },
  });
  try {
    const lex = await signIn(worker);
    const joinAs = async (cookie: string): Promise<LiveRoomSocket> => {
      const response = await worker.dispatchFetch(`${origin}/api/live/room?${new URLSearchParams({ repo: repo.full_name, branch: "main", file: "index.html" })}`,
        { headers: { Upgrade: "websocket", Origin: origin, Cookie: cookie } });
      assert.equal(response.status, 101);
      // Miniflare delivers frames once accepted: accept as the first listener attaches, as a browser socket's open does.
      const socket = response.webSocket!;
      let accepted = false;
      return {
        send: data => socket.send(data),
        close: (code, reason) => socket.close(code, reason),
        addEventListener(type: "message" | "close", listener: (event: never) => void) {
          socket.addEventListener(type, listener as never);
          if (!accepted) { accepted = true; socket.accept(); }
        },
      };
    };
    const notices: string[] = [];
    const tab = openLiveRoom({
      repo: repo.full_name, branch: "main", file: "index.html", clock: stillClock, connect: () => joinAs(lex.cookie),
      onMessage: () => undefined, onPushed: commit => notices.push(commit),
    });
    await tab.ready();

    const body = pushBody();
    const unsigned = await deliver(body, {});
    assert.equal(unsigned.status, 401, "no signature");
    assert.equal((await deliver(body, { "X-Hub-Signature-256": sign(body, "a guessed secret") })).status, 401, "another secret");
    assert.equal((await deliver(pushBody({ after: "e".repeat(40) }), { "X-Hub-Signature-256": sign(body) })).status, 401, "another body");

    const signed = await deliver(body, { "X-Hub-Signature-256": sign(body) });
    assert.equal(signed.status, 200);
    assert.deepEqual(await signed.json(), { told: 1 });
    await until(() => notices.length === 1, "the tab's push notice");
    assert.deepEqual(notices, [pushedCommit], "only the signed push reached the tab");

    // GitHub's form content type signs the form body; the JSON is its `payload` field.
    const form = `payload=${encodeURIComponent(pushBody({ after: "f".repeat(40) }))}`;
    const formed = await deliver(form, { "Content-Type": "application/x-www-form-urlencoded", "X-Hub-Signature-256": sign(form) });
    assert.deepEqual([formed.status, await formed.json()], [200, { told: 1 }]);
    await until(() => notices.length === 2, "the form delivery's notice");

    // Signed, but nothing for this tab: another branch, a tag, the App's ping.
    const dev = pushBody({ ref: "refs/heads/dev" });
    assert.deepEqual(await (await deliver(dev, { "X-Hub-Signature-256": sign(dev) })).json(), { told: 0 });
    const tag = pushBody({ ref: "refs/tags/v1" });
    assert.equal((await deliver(tag, { "X-Hub-Signature-256": sign(tag) })).status, 204);
    const ping = JSON.stringify({ zen: "Keep it logically awesome." });
    assert.equal((await deliver(ping, { "X-GitHub-Event": "ping", "X-Hub-Signature-256": sign(ping) })).status, 204);
    assert.equal((await worker.dispatchFetch(`${origin}/api/github/webhook`)).status, 405, "GET is refused");
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(notices.length, 2, "nothing else reached the tab");
    tab.close();
  } finally { await worker.dispose(); }
});
