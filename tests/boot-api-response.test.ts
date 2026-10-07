import { test } from "node:test";
import assert from "node:assert/strict";
import { readApiReceipt, repositoryReceipt } from "../src/boot-api-response.ts";
import { startBootReads } from "../src/boot-reads.ts";
const error = (status: number, message: string) => Object.assign(new Error(message), { status });
test("API receipt retains correlation and repository hint until guarded adoption", async () => {
  const session = await readApiReceipt<{ user: { login: string } }>(Response.json({ user: { login: "lex" } }, { headers: { "X-Editor-Session": "opaque" } }), error);
  const repositories = repositoryReceipt(await readApiReceipt<unknown[]>(Response.json([], { headers: { "X-Editor-Session": "opaque", "X-Repository-Onboarding": "create" } }), error));
  const reads = startBootReads({ readSession: async () => session, readRepositories: async () => repositories, scope: { source: "editor", epoch: 1 }, isCurrent: () => true });
  assert.equal(await reads.session, session);
  assert.deepEqual((await reads.takeRepositories(session))?.value, { repositories: [], onboarding: "create" });
});
test("missing or different session headers fall back while invalid onboarding is omitted", async () => {
  for (const tag of [undefined, "other-session"]) {
    const session = await readApiReceipt<{ user: { login: string } }>(Response.json({ user: { login: "lex" } }, { headers: { "X-Editor-Session": "session" } }), error);
    const receipt = await readApiReceipt<unknown[]>(Response.json([], { headers: { ...(tag ? { "X-Editor-Session": tag } : {}), "X-Repository-Onboarding": "untrusted" } }), error);
    assert.equal(receipt.onboarding, undefined);
    const reads = startBootReads({ readSession: async () => session, readRepositories: async () => repositoryReceipt(receipt), scope: { source: "editor", epoch: 1 }, isCurrent: () => true });
    assert.equal(await reads.takeRepositories(await reads.session), undefined);
  }
});
test("API errors retain original status/message and speculative failure does not reject session", async () => {
  const reads = startBootReads({ readSession: async () => ({ value: { user: null } }), readRepositories: async () => repositoryReceipt(await readApiReceipt(Response.json({ error: "Expired" }, { status: 401 }), error)), scope: { source: "editor", epoch: 1 }, isCurrent: () => true });
  assert.equal(await reads.takeRepositories(await reads.session), undefined);
  await assert.rejects(readApiReceipt(Response.json({ error: "Expired" }, { status: 401 }), error), { status: 401, message: "Expired" });
  await assert.rejects(readApiReceipt(Response.json({}, { status: 502 }), error), { status: 502, message: "Could not load GitHub data." });
});
