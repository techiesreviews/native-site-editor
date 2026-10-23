import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeAgents, revokeUnused, serialReads, siteFull } from "../src/agent-resume.ts";
import { forEachAwait } from "./support/await-race.ts";
import { startCountedWorker } from "./fakes/counted-agent.ts";
import { editorTab, repo, signIn } from "./mcp-harness.ts";

// The agent menu's state around resumeAgents (src/components/agent-menu.ts): the open site, this
// browser's agents-on marks, activations, and the live socket opened after a dynamic import.
type Disturbance = "switch" | "destroy" | "disconnect";
function menu(race: Parameters<Parameters<typeof forEachAwait>[0]>[0], read: "granted" | "gone" | "unanswered") {
  const marks = new Map([["main", "1"], ["feature", "1"]]);
  let site = "main", pinned = "", activation = 0, remote = false, destroyed = false, sockets = 0;
  const live = (at: number) => !destroyed && remote && activation === at && site === pinned;
  const turnOff = (forget: boolean) => {
    if (!remote) return;
    if (forget) marks.delete(pinned);
    remote = false; activation++;
  };
  const done = resumeAgents({
    start: () => { remote = true; activation++; pinned = site; marks.set(pinned, "1"); return activation; },
    live,
    read: race.port("read", async () => read !== "unanswered"),
    granted: () => read === "granted",
    forget: () => turnOff(true),
    open: race.port("open", async () => {
      const at = activation;
      await Promise.resolve(); // activateSocket's dynamic import, then its own live check
      if (live(at)) sockets++;
    }),
  });
  return {
    done,
    disturb(how: Disturbance) {
      if (how === "switch") site = "feature";
      else if (how === "destroy") destroyed = true;
      else turnOff(true);
    },
    state: () => ({ sockets, marks: Object.fromEntries(marks) }),
  };
}

test("resuming remembered agents: undisturbed, a site with connections opens one socket, one without is forgotten, an unanswered read keeps them on", async () => {
  const run = async (read: "granted" | "gone" | "unanswered") => {
    const m = menu({ port: (_name, work) => work }, read);
    await m.done;
    return m.state();
  };
  assert.deepEqual(await run("granted"), { sockets: 1, marks: { main: "1", feature: "1" } });
  assert.deepEqual(await run("gone"), { sockets: 0, marks: { feature: "1" } });
  assert.deepEqual(await run("unanswered"), { sockets: 1, marks: { main: "1", feature: "1" } });
});

for (const how of ["switch", "destroy", "disconnect"] as const) {
  test(`resuming remembered agents: a ${how} at any await opens no socket and touches no other site's mark`, async () => {
    for (const read of ["granted", "gone", "unanswered"] as const) {
      const points = await forEachAwait(race => menu(race, read), run => run.disturb(how), run => {
        const { sockets, marks } = run.state();
        assert.equal(sockets, 0, `${read}: no socket after the ${how}`);
        assert.equal(marks.feature, "1", `${read}: the other site's mark is neither written nor removed`);
        // Disconnect forgets the site itself; nothing else does once the activation is stale.
        assert.equal(marks.main, how === "disconnect" ? undefined : "1", `${read}: the resumed site's mark`);
      });
      assert.equal(points, read === "gone" ? 1 : 2, `${read}: await points`);
    }
  });
}

test("connections reads: a skipped read answers false; two waiters behind a read in flight each make their own read, one after another", async () => {
  const log: string[] = [];
  const releases: (() => void)[] = [];
  let reads = 0;
  const queue = serialReads(() => {
    const n = ++reads;
    log.push(`start ${n}`);
    return new Promise<boolean>(resolve => releases.push(() => { log.push(`end ${n}`); resolve(true); }));
  });
  const first = queue.run();
  assert.equal(queue.busy, true);
  assert.equal(await queue.run(), false, "a read asked meanwhile without waiting is skipped");
  const second = queue.run(true), third = queue.run(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(log, ["start 1"], "waiters do not read while one is in flight");
  releases[0]();
  assert.equal(await first, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(log, ["start 1", "end 1", "start 2"], "one waiter reads; the other still waits");
  releases[1]();
  await new Promise(resolve => setImmediate(resolve));
  releases[2]();
  assert.deepEqual([await second, await third], [true, true], "each waiter gets its own read's answer");
  assert.deepEqual(log, ["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  assert.equal(queue.busy, false, "nothing left in flight");
  assert.equal(reads, 3);
});

test("connections reads: a read ahead that rejects keeps its rejection and only ends the wait; one that never settles holds its waiter", async () => {
  let reads = 0, settle: ((ok: boolean) => void) | undefined;
  const failing = serialReads(() => ++reads === 1 ? Promise.reject(new Error("read failed")) : Promise.resolve(true));
  const ahead = failing.run(), waiter = failing.run(true);
  await assert.rejects(ahead, /read failed/, "the rejection stays with the read's own caller");
  assert.equal(await waiter, true, "the waiter makes its own read");
  assert.equal(reads, 2);
  assert.equal(failing.busy, false);
  const stuck = serialReads(() => reads++ === 2 ? new Promise<boolean>(() => {}) : new Promise<boolean>(resolve => { settle = resolve; }));
  void stuck.run();
  let waited = false;
  void stuck.run(true).then(() => { waited = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(waited, false, "a read that never settles holds its waiter: read must settle (the menu's API deadline)");
  assert.equal(settle, undefined, "the waiter has not read yet");
});

// The agent menu's new prompt (src/components/agent-menu.ts start()): its site's unused tokens go,
// fenced by the activation and site it began on.
test("revokeUnused: a site switch or turn-off at any await revokes nothing more; fresh and used tokens stay", async () => {
  const grants = [
    { id: "old-1", via: "token", createdAt: 1 }, { id: "old-2", via: "token", createdAt: 2 },
    { id: "used", via: "token", createdAt: 1, usedAt: 5 }, { id: "oauth", via: "oauth", createdAt: 1 }, { id: "fresh", via: "token", createdAt: 100 },
  ];
  const all: string[] = [];
  await revokeUnused({ grants, before: 50, live: () => true, revoke: async id => { all.push(id); } });
  assert.deepEqual(all, ["old-1", "old-2"]);
  const points = await forEachAwait(race => {
    const state = { live: true, revoked: [] as string[], after: [] as string[] };
    const done = revokeUnused({ grants, before: 50, live: () => state.live,
      revoke: race.port("revoke", async (id: string) => { (state.live ? state.revoked : state.after).push(id); }) });
    return { state, done };
  }, run => { run.state.live = false; }, run => {
    // Revokes sent before the change (the one in flight included) may land; none is sent after it.
    assert.deepEqual(run.state.after, []);
    assert.ok(run.state.revoked.every(id => id.startsWith("old-")), run.state.revoked.join());
  });
  assert.equal(points, 2);
  // Not live from the start: nothing is sent.
  const none: string[] = [];
  await revokeUnused({ grants, before: Infinity, live: () => false, revoke: async id => { none.push(id); } });
  assert.deepEqual(none, []);
});

test("siteFull: only the Worker's full-site 409 reclaims unused tokens; other refusals and failures do not", () => {
  assert.equal(siteFull(409, "This site already has 5 agent connections on this branch. Disconnect one in the editor's agent menu first."), true);
  assert.equal(siteFull(409, "This site's agent connections have reached the 64 KiB metadata limit on this branch. Disconnect one in the editor's agent menu first."), true);
  assert.equal(siteFull(409, "This editor session already has 20 agent connections. Disconnect one in the editor's agent menu first."), false);
  assert.equal(siteFull(500, "This site already has 5 agent connections on this branch."), false);
  assert.equal(siteFull(503, "Agent connection capacity could not be checked. Try again."), false);
  assert.equal(siteFull(undefined, "Agent connection failed."), false);
});

test("siteFull matches the Worker's own refusal: the sixth connection of a site is refused as full", async () => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie);
    const connect = () => tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" });
    for (let made = 0; made < 5; made++) assert.equal((await connect()).status, 200);
    const refused = await connect();
    const { error } = await refused.json() as { error: string };
    assert.equal(refused.status, 409);
    assert.equal(siteFull(refused.status, error), true, error);
  } finally { await h.worker.dispose(); }
});
