import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeAgents } from "../src/agent-resume.ts";
import { forEachAwait } from "./support/await-race.ts";

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
