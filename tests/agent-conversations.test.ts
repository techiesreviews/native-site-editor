import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRecordsError, CONVERSATION_BUDGET_BYTES, CONVERSATION_RETENTION_MS, conversationRetention, indexedDbAgentRecords, type Conversation } from "../src/agent-records.ts";
import { draftDatabaseName } from "../src/drafts.ts";
import { createAgentController, type AgentMenuPort } from "../src/controllers/agent-controller.ts";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { OPEN_REQUESTS_LIMIT } from "../shared/agent.ts";
import type { AgentWorkspace } from "../shared/agent-command.ts";
import type { Repository, Snapshot } from "../shared/types.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";

// Ask agent history in this browser (src/agent-records.ts): seven days for
// completed conversations, 50 unfinished ones, 1 MiB per workspace.
const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const workspace: AgentWorkspace = { account: "Lex", repoId: 1, branch: "main" };
const capacity = (error: unknown) => error instanceof AgentRecordsError && error.code === "capacity";
const item = (id: string, unfinished: boolean, updatedAt = NOW, text = ""): Conversation =>
  ({ id, unfinished, updatedAt, content: { id, state: unfinished ? "open" : "done", text } });
// A conversation of about `bytes` serialized bytes.
const sized = (id: string, unfinished: boolean, bytes: number, updatedAt = NOW) => item(id, unfinished, updatedAt, "x".repeat(bytes - 100));

test("retention drops expired completed conversations, then the oldest completed ones until the budget fits", () => {
  const stored = [
    item("old-done", false, NOW - CONVERSATION_RETENTION_MS),
    item("young-done", false, NOW - CONVERSATION_RETENTION_MS + 1),
    item("old-open", true, NOW - 30 * DAY),
  ];
  // Seven days exactly is expired; unfinished ones never are.
  assert.deepEqual(conversationRetention(stored, undefined, NOW), ["old-done"]);
  const third = CONVERSATION_BUDGET_BYTES / 3;
  const full = [sized("a", false, third, NOW - 3), sized("b", false, third, NOW - 2), sized("c", true, third, NOW - 9)];
  // The oldest completed goes first, never the older unfinished one.
  assert.deepEqual(conversationRetention(full, sized("d", true, third), NOW), ["a"]);
  assert.deepEqual(conversationRetention(full, sized("d", true, 2 * third), NOW), ["a", "b"]);
});

test("a new unfinished request is refused at 50 or when it cannot fit; one already unfinished is still updated", () => {
  const waiting = Array.from({ length: OPEN_REQUESTS_LIMIT }, (_, index) => item(`req-${index}`, true));
  assert.throws(() => conversationRetention(waiting, item("req-new", true), NOW), (error: unknown) =>
    capacity(error) && /50 requests already wait/.test((error as Error).message));
  // A completed one still fits, and an answer to a waiting one changes nothing in the count.
  assert.deepEqual(conversationRetention(waiting, item("req-done", false), NOW), []);
  assert.deepEqual(conversationRetention(waiting, { ...waiting[0], updatedAt: NOW + 1 }, NOW), []);
  // Reopening a completed one counts as a new one.
  assert.throws(() => conversationRetention([...waiting, item("req-done", false)], item("req-done", true), NOW), capacity);

  const big = [sized("a", true, CONVERSATION_BUDGET_BYTES - 1000)];
  assert.throws(() => conversationRetention(big, sized("b", true, 2000), NOW), (error: unknown) =>
    capacity(error) && /1 MiB/.test((error as Error).message));
  // A waiting request grown past the budget by a reply is refused too.
  assert.throws(() => conversationRetention(big, sized("a", true, CONVERSATION_BUDGET_BYTES + 10), NOW), capacity);
  // A completed one that cannot fit is simply not kept.
  assert.deepEqual(conversationRetention(big, sized("b", false, 2000), NOW), ["b"]);
});

test("browser conversations: kept per account, repository and branch; expired ones neither read nor kept", async () => {
  let time = NOW;
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => time);
  await records.putConversation(workspace, item("req-1", true));
  await records.putConversation(workspace, item("req-2", false));
  for (const other of [{ ...workspace, account: "other" }, { ...workspace, repoId: 2 }, { ...workspace, branch: "feature" }])
    assert.deepEqual(await records.conversations(other), []);
  // The account is the same whatever its case, as drafts' keys are.
  assert.deepEqual((await records.conversations({ ...workspace, account: "lex" })).map((entry) => entry.id).sort(), ["req-1", "req-2"]);

  time = NOW + CONVERSATION_RETENTION_MS;
  assert.deepEqual((await records.conversations(workspace)).map((entry) => entry.id), ["req-1"]);
  // The next write drops it from storage too.
  await records.putConversation(workspace, item("req-3", false, time));
  assert.deepEqual([...fake.stores.get("conversations")!.values()].map((row) => (row as { conversation: Conversation }).conversation.id).sort(), ["req-1", "req-3"]);
});

test("browser conversations refuse a 51st unfinished request before and at writing, and keep the 50", async () => {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => NOW);
  for (let index = 0; index < OPEN_REQUESTS_LIMIT; index++) await records.putConversation(workspace, item(`req-${index}`, true));
  await assert.rejects(records.checkConversation(workspace, item("req-new", true)), capacity);
  await assert.rejects(records.putConversation(workspace, item("req-new", true)), capacity);
  // Another branch has its own 50.
  await records.checkConversation({ ...workspace, branch: "feature" }, item("req-new", true));
  assert.equal((await records.conversations(workspace)).length, OPEN_REQUESTS_LIMIT);
  // Dismissing one makes room.
  await records.putConversation(workspace, { ...item("req-0", false), content: { id: "req-0", state: "dismissed" } });
  await records.putConversation(workspace, item("req-new", true));
  assert.equal((await records.conversations(workspace)).filter((entry) => entry.unfinished).length, OPEN_REQUESTS_LIMIT);
});

test("an oversized update is refused and leaves the stored conversation and the budget as they were", async () => {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => NOW);
  const before = sized("open", true, CONVERSATION_BUDGET_BYTES / 2);
  await records.putConversation(workspace, before);
  await records.putConversation(workspace, sized("other", true, CONVERSATION_BUDGET_BYTES / 4));
  await assert.rejects(records.putConversation(workspace, sized("open", true, CONVERSATION_BUDGET_BYTES)), capacity);
  const kept = await records.conversations(workspace);
  assert.deepEqual(kept.find((entry) => entry.id === "open"), before);
  assert.ok(kept.reduce((sum, entry) => sum + new TextEncoder().encode(JSON.stringify(entry)).byteLength, 0) <= CONVERSATION_BUDGET_BYTES);
});

test("accept sees the stored conversation in the writing transaction: a dismissal another tab stored wins over stale progress", async () => {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => NOW);
  const open = item("req-1", true);
  await records.putConversation(workspace, open);
  // Two tabs: one dismisses, the other then brings an agent's reply it polled before.
  const dismissed = { ...item("req-1", false), content: { id: "req-1", state: "dismissed" } };
  const notDismissed = (stored: Conversation | undefined) => Boolean(stored && (stored.content as { state: string }).state !== "dismissed");
  await records.putConversation(workspace, dismissed);
  assert.equal(await records.putConversation(workspace, { ...open, content: { id: "req-1", state: "question" } }, notDismissed), false);
  assert.deepEqual(await records.conversations(workspace), [dismissed]);
  // Absent (never kept, or evicted): progress alone adopts nothing.
  assert.equal(await records.putConversation(workspace, item("req-2", true), notDismissed), false);
  assert.equal(await records.putConversation(workspace, { ...item("req-1", true), updatedAt: NOW + 1 }), true);
  assert.equal(await records.putConversation(workspace, { ...item("req-1", true), content: { id: "req-1", state: "seen" } }, notDismissed), true);
  assert.deepEqual((await records.conversations(workspace)).map((entry) => (entry.content as { state: string }).state), ["seen"]);
});

test("browser conversations evict the oldest completed ones to fit 1 MiB, and never unfinished ones", async () => {
  let time = NOW;
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords(draftDatabaseName, fake.factory, () => time);
  // Four fit the budget, a fifth does not.
  const quarter = CONVERSATION_BUDGET_BYTES / 4 - 500;
  await records.putConversation(workspace, sized("open", true, quarter, time));
  for (const id of ["done-1", "done-2", "done-3"]) { time++; await records.putConversation(workspace, sized(id, false, quarter, time)); }
  time++;
  await records.putConversation(workspace, sized("open-2", true, quarter, time));
  assert.deepEqual((await records.conversations(workspace)).map((entry) => entry.id).sort(), ["done-2", "done-3", "open", "open-2"]);
  await assert.rejects(records.putConversation(workspace, sized("open-3", true, 3 * quarter, time)), capacity);
  // A refused write changes nothing.
  assert.equal((await records.conversations(workspace)).length, 4);
});

// The controller mounts the menu for kept requests, with no network.
const repository = { id: 1, full_name: "lex/site", default_branch: "main" } as Repository;
test("kept requests of the open workspace mount the agent menu at startup; none, or another workspace's, do not", async () => {
  const appStore = createAppStore(createDraftStore());
  const asked: AgentWorkspace[] = [];
  let kept = false, loads = 0;
  const host = { append() {} };
  let mounted = 0;
  const controller = createAgentController<{ remove(): void }>({
    account: () => "Lex", host: () => host, appStore,
    createOptions: () => ({ context: async () => undefined, onCommand: async () => {} }),
    async load() {
      loads++;
      return { createAgentMenu: (options) => {
        mounted++;
        assert.deepEqual(options.repository(), { id: 1, fullName: "lex/site", branch: "feature" });
        return { root: { remove() {} }, connected: () => false, changed() {}, consentGranted() {}, destroy() {}, async ask() {}, async answer() {}, async dismiss() {} } satisfies AgentMenuPort<{ remove(): void }>;
      } };
    },
    onError: (error) => { throw error; },
    environment: { window: new EventTarget() },
    history: async (scope) => { asked.push(scope); return kept; },
  });
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  controller.start();
  appStore.repository.value = repository;
  await settle();
  assert.deepEqual(asked, [], "no workspace before its files are read");
  appStore.snapshot.value = { branch: "main" } as Snapshot;
  await settle();
  assert.deepEqual(asked, [{ account: "Lex", repoId: 1, branch: "main" }]);
  assert.equal(loads, 0);
  kept = true;
  appStore.snapshot.value = { branch: "feature" } as Snapshot;
  await settle(); await settle();
  assert.deepEqual(asked.at(-1), { account: "Lex", repoId: 1, branch: "feature" });
  assert.equal(loads, 1);
  assert.equal(mounted, 1);
  controller.destroy();
  appStore.dispose();
});
