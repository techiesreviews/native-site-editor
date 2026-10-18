import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { AgentRelay } from "../worker/agent-relay";
import { fakeRelayRoute } from "./native-save/fake-hub";
import { installRelayUpgrade } from "./native-save/fake-websocket";

test("fixture relay: handshake ownership, text ping/pong, correlated UTF-8 results at each frame length, disconnect", { timeout: 10_000 }, async () => {
  const id = `agent-relay:${crypto.randomUUID()}`;
  const scope = { workspace: { account: "fixture-user", repoId: 501, branch: "main" }, tabId: "fixture-tab", generation: 1 };
  const server = createServer();
  installRelayUpgrade(server, async (_request, connect) => (await fakeRelayRoute(id, new Request("https://fixture/relay/connect", {
    headers: { Upgrade: "websocket", [AgentRelay.identityHeader]: JSON.stringify(scope) },
  }), connect))!);
  const dispatch = async (command: string) => {
    const body = JSON.stringify(command);
    const response = await fakeRelayRoute(id, new Request("https://fixture/relay/dispatch", {
      method: "POST", headers: { "Content-Length": String(Buffer.byteLength(body)), [AgentRelay.identityHeader]: JSON.stringify({ workspace: scope.workspace }) }, body,
    }));
    return response!.json();
  };
  const unavailable = { ok: false, code: "editor-unavailable", outcome: "not-sent" };
  assert.deepEqual(await dispatch("no socket"), unavailable);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/agent/relay`);
  const message = async () => (await once(socket, "message") as [MessageEvent<string>])[0].data;
  try {
    await once(socket, "open");
    assert.deepEqual(await dispatch("not handshaken"), unavailable);
    socket.send(JSON.stringify({ type: "handshake", ...scope, generation: 2, owner: true }));
    assert.deepEqual(await dispatch("wrong scope"), unavailable);
    const ready = message();
    socket.send(JSON.stringify({ type: "handshake", ...scope, owner: true }));
    assert.deepEqual(JSON.parse(await ready), { type: "ready", ...scope });
    const pong = message();
    socket.send("ping");
    assert.equal(await pong, "pong");
    for (const text of ["short", "é".repeat(100), "🙂".repeat(20_000)]) {
      const received = message();
      const pending = dispatch(text);
      const call = JSON.parse(await received);
      assert.equal(call.type, "command");
      assert.equal(call.command, text);
      socket.send(JSON.stringify({ type: "result", ...scope, id: call.id, result: { text } }));
      assert.deepEqual(await pending, { ok: true, result: { text } });
    }
    const closed = once(socket, "close");
    socket.close();
    await closed;
    assert.deepEqual(await dispatch("owner closed"), unavailable);
  } finally {
    socket.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
