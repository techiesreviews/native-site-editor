// "I'm working here" (ticket am-14): an agent names the page and section it works on before it changes anything.
// It shows there as a change of its own would (src/agent-presence.ts `show`, held), until it says where it works
// again, says it is done, or WORKING_HERE_MS pass. A change of its own that runs meanwhile shows instead, then this
// again. Ended, get_site tells what it told before (its last change, or nothing): the agent made no change there.
// Loaded with the first working_here (src/agent-site-host.ts), so it stays out of the boot bytes.

import { WORKING_HERE_MS, type AgentWho } from "../shared/agent";
import type { createAgentPresence } from "./agent-presence";

/** Why working_here shows nothing. */
const NOT_HELD = {
  elsewhere: "Nothing is shown: the editor shows another site or branch now. Nothing was changed.",
  stopped: "Nothing is shown: the user stopped you. Nothing was changed.",
};

/** `later` calls `run` after `ms` (working_here's end); the returned call cancels it. */
export function createWorkingHere(
  presence: Pick<ReturnType<typeof createAgentPresence>, "show" | "stopped">,
  later = (run: () => void, ms: number) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer); },
) {
  // Where each agent said it works, by agent: the call that ends it.
  const heres = new Map<string, () => void>();
  /** `who` shows on the page `path`'s element `node` (none: the page alone); no path: it shows nowhere. */
  function here(path: string | undefined, node: number[] | undefined, who: AgentWho) {
    const key = JSON.stringify([who.grant, who.name]);
    heres.get(key)?.();
    if (path === undefined) return;
    const end = presence.show(path, () => node, who, true);
    const stop = () => { cancel(); end(); if (heres.get(key) === stop) heres.delete(key); };
    const cancel = later(stop, WORKING_HERE_MS);
    heres.set(key, stop);
  }
  return {
    here,
    /**
     * working_here as its command arrived, in the load `at` shown then (presence `begin`): the returned call says
     * where `who` works, and answers why nothing shows, if nothing does: another load began (another site or branch
     * shown meanwhile), or the user stopped it. Done still clears.
     */
    hold(who: AgentWho, at: { holds(): boolean }) {
      return (path: string | undefined, node: number[] | undefined): string | undefined => {
        if (path !== undefined && !at.holds()) { here(undefined, undefined, who); return NOT_HELD.elsewhere; }
        here(path, node, who);
        return path !== undefined && presence.stopped(who) ? NOT_HELD.stopped : undefined;
      };
    },
  };
}
