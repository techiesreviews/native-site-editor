import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerPause, pressSignedOut, resumeAgents, revokeUnused, serialReads, siteFull, turnOnAgents } from "../src/agent-resume.ts";
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

// The agent menu's Connect to MCP press with agents off (turnOn): the connection is found
// reconnecting, its retry leaves the menu `after`, and the press then prompts, copies or is stuck
// ("paused" after: the retry did nothing, its recorded retry time still ahead, or failed again).
// "other-owner": another tab of this browser holds the socket and an agent uses the site's connection;
// "taken-over": another tab holds it with no connection of the site at all. `found` "paused": the
// reconnect gave up while the user was away (ticket am-51), so the press finds it paused, not reconnecting.
// `owner`: the site owner paused remote agents, known before the press or found while the socket opens.
// `waits`: a recorded retry time is still ahead after the retry (the button waits for it).
// `found` "takeover-failed": an earlier takeover failed and left the site paused in this browser
// (ticket am-53), so the press retries the takeover instead ("takeover-failed" after: it failed again,
// and that state is itself the problem dot).
function press(race: Parameters<Parameters<typeof forEachAwait>[0]>[0], after: "idle" | "waiting" | "connected" | "other-owner" | "taken-over" | "reconnecting" | "paused" | "takeover-failed", found: "reconnecting" | "paused" | "takeover-failed" = "reconnecting", owner: "none" | "before" | "open" = "none", waits = false) {
  let site = "main", pinned = "", activation = 0, remote = false, acted = false, retries = 0, takeovers = 0, ownerPaused = owner === "before";
  const writes: string[] = [];
  const live = (at: number) => remote && activation === at && site === pinned;
  const done = turnOnAgents({
    start: () => { remote = true; activation++; pinned = site; return activation; },
    live,
    paused: () => ownerPaused,
    read: race.port("read", async () => true),
    open: race.port("open", async () => { if (owner === "open") ownerPaused = true; }),
    state: () => acted ? after : found,
    retry: race.port("retry", async () => { retries++; acted = true; }),
    takeover: race.port("takeover", async () => { takeovers++; acted = true; }),
    retryWaits: () => waits,
    offer: now => now === "waiting" ? "wait" : now === "connected" || now === "other-owner" ? "disconnect" : "connect",
    fresh: now => now === "idle" || now === "other-owner" || now === "taken-over",
    prompt: async () => { writes.push("POST /api/agent/connect"); },
    copyAgain: async () => { writes.push("copy"); },
    stuck: () => { writes.push("stuck"); },
  });
  return {
    done,
    disturb(how: "off" | "switch" | "again") {
      if (how === "switch") site = "feature";
      else { remote = false; activation++; }
      // Turned on again by another press: a new activation this one must not drive.
      if (how === "again") { remote = true; activation++; pinned = site; }
    },
    writes,
    retries: () => retries,
    takeovers: () => takeovers,
  };
}

test("Connect to MCP finding a reconnect: undisturbed, it retries and then prompts, copies again or shows the press stuck", async () => {
  // An agent already uses the site's connection (here or in the tab holding the socket): the press
  // still copies a prompt; another tab holding it with nothing connected: a new prompt.
  for (const [after, write] of [["idle", "POST /api/agent/connect"], ["waiting", "copy"], ["connected", "copy"], ["other-owner", "copy"], ["taken-over", "POST /api/agent/connect"], ["reconnecting", "stuck"], ["paused", "stuck"]] as const) {
    const run = press({ port: (_name, work) => work }, after);
    await run.done;
    assert.deepEqual(run.writes, [write], after);
  }
});

test("Connect to MCP after a reconnect gave up while away: it retries as for a reconnect, then prompts, copies again or shows the press stuck", async () => {
  for (const [after, write] of [["idle", "POST /api/agent/connect"], ["waiting", "copy"], ["connected", "copy"], ["other-owner", "copy"], ["taken-over", "POST /api/agent/connect"], ["reconnecting", "stuck"], ["paused", "stuck"]] as const) {
    const run = press({ port: (_name, work) => work }, after, "paused");
    await run.done;
    assert.deepEqual(run.writes, [write], after);
  }
  // Paused by the site owner, not by a reconnect that gave up, whether known before the press or
  // found while the socket opens (a retry would lift the owner's pause): no retry, no prompt.
  for (const when of ["before", "open"] as const) {
    const owner = press({ port: (_name, work) => work }, "idle", "paused", when);
    await owner.done;
    assert.equal(owner.retries(), 0, when);
    assert.deepEqual(owner.writes, [], when);
  }
});

test("Connect to MCP after a failed takeover: it retries the takeover, then prompts, copies again or shows the press stuck; failed again, it writes nothing", async () => {
  for (const [after, write] of [["idle", ["POST /api/agent/connect"]], ["waiting", ["copy"]], ["connected", ["copy"]], ["other-owner", ["copy"]], ["taken-over", ["POST /api/agent/connect"]], ["reconnecting", ["stuck"]], ["paused", ["stuck"]], ["takeover-failed", []]] as const) {
    const run = press({ port: (_name, work) => work }, after, "takeover-failed");
    await run.done;
    assert.equal(run.takeovers(), 1, after);
    assert.equal(run.retries(), 0, `${after}: no reconnect retry`);
    assert.deepEqual(run.writes, write, after);
  }
  // Paused by the site owner: no takeover, no prompt.
  for (const when of ["before", "open"] as const) {
    const owner = press({ port: (_name, work) => work }, "idle", "takeover-failed", when);
    await owner.done;
    assert.equal(owner.takeovers(), 0, when);
    assert.deepEqual(owner.writes, [], when);
  }
});

test("the menu's owner pause is only the relay's paused-with-a-message: a failed takeover after it, or a reconnect that gave up, is not", () => {
  // The menu reads each transport update in turn (agent-menu.ts `listen`); `paused()` is the latest one's.
  const seen = [{ mode: "paused", message: "Remote agents are paused by the site owner." }, { mode: "takeover-failed" }, { mode: "paused" }].map(ownerPause);
  assert.deepEqual(seen, [true, false, false]);
});

test("Connect to MCP with a recorded retry time still ahead: still reconnecting waits for it with no stuck dot; still paused by a reconnect that gave up is stuck", async () => {
  for (const [found, after, write] of [["reconnecting", "reconnecting", []], ["paused", "paused", ["stuck"]], ["reconnecting", "paused", ["stuck"]]] as const) {
    const run = press({ port: (_name, work) => work }, after, found, "none", true);
    await run.done;
    assert.deepEqual(run.writes, write, `${found} → ${after}`);
  }
});

for (const how of ["off", "switch", "again"] as const) {
  test(`Connect to MCP finding a reconnect: a ${how} at any await makes no prompt, no copy and no stuck dot`, async () => {
    for (const found of ["reconnecting", "paused", "takeover-failed"] as const) {
      for (const after of ["idle", "waiting", "connected", "other-owner", "taken-over", "reconnecting", "paused", "takeover-failed"] as const) {
        const points = await forEachAwait(race => press(race, after, found), run => run.disturb(how), run => {
          assert.deepEqual(run.writes, [], `${found} → ${after}: nothing written after the ${how}`);
        });
        assert.equal(points, 3, `${found} → ${after}: read, open and ${found === "takeover-failed" ? "takeover" : "retry"}`);
      }
    }
  });
}

// The agent menu's press (src/components/agent-menu.ts `press`): the sign-in may end during it
// (`signOut`), it may copy, and a newer press or a site switch may come at its await.
function signedOutPress(race: Parameters<Parameters<typeof forEachAwait>[0]>[0], outcome: "signed-out" | "copied" | "signed-out-copied") {
  let site = "main", signOuts = 0, copied = 0, presses = 1;
  const failed: string[] = [];
  const done = pressSignedOut({
    site,
    signOuts: () => signOuts,
    copied: () => copied,
    presses: () => presses,
    run: race.port("run", async () => {
      if (outcome !== "copied") signOuts++;
      if (outcome !== "signed-out") copied++;
    }),
    failed: repo => { failed.push(repo); },
  });
  return {
    done,
    disturb(how: "again" | "switch") { if (how === "again") presses++; else site = "feature"; },
    failed,
  };
}

test("a press during which the sign-in ended marks its own site failed; one that copied, or with the sign-in still on, marks nothing", async () => {
  for (const [outcome, failed] of [["signed-out", ["main"]], ["copied", []], ["signed-out-copied", []]] as const) {
    const run = signedOutPress({ port: (_name, work) => work }, outcome);
    await run.done;
    assert.deepEqual(run.failed, failed, outcome);
  }
});

test("a press during which the sign-in ended: a newer press at its await writes nothing; a site switch leaves the mark on the press's own site", async () => {
  const again = await forEachAwait(race => signedOutPress(race, "signed-out"), run => run.disturb("again"), run => {
    assert.deepEqual(run.failed, [], "the newer press shows its own outcome");
  });
  const moved = await forEachAwait(race => signedOutPress(race, "signed-out"), run => run.disturb("switch"), run => {
    assert.deepEqual(run.failed, ["main"], "the site read before the await, never the one shown after");
  });
  assert.deepEqual([again, moved], [1, 1]);
});

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
