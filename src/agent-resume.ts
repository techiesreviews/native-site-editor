/**
 * Remote agents remembered on for the open site come back on (a reload, a new tab) with the
 * connections the agents already have: no new prompt or token. An async writer: after each await
 * it re-checks that this activation is still live (same site, not turned off or destroyed) before
 * it forgets the site or opens the live socket (src/components/agent-menu.ts wires the ports).
 */
export async function resumeAgents(ports: {
  /** Turns remote agents on for the open site and returns this activation. */
  start(): number;
  /** Whether activation `at` still holds: same site, still on, not paused or destroyed. */
  live(at: number): boolean;
  /** Reads the connections; true when the read was answered. */
  read(): Promise<boolean>;
  /** Whether the open site still has connections. */
  granted(): boolean;
  /** Turns remote agents off and forgets the site in this browser. */
  forget(): void;
  /** Opens the live socket. */
  open(): Promise<void>;
}) {
  const at = ports.start();
  const answered = await ports.read();
  if (!ports.live(at)) return;
  // Disconnected, signed out or past 8 hours: nothing to come back to. An unanswered read keeps them on.
  if (answered && !ports.granted()) { ports.forget(); return; }
  await ports.open();
}

/**
 * Connect to MCP with remote agents off: turns them on, reads the connections, opens the socket,
 * and, finding a reconnect left from before the press (or one that gave up), retries it at once
 * rather than waiting out its backoff. Then it branches on what the button would offer, as the
 * menu's own press does: Wait for MCP or Disconnect MCP (a token waits, or an agent already uses
 * the site's connection, in this tab or another tab that holds the socket) copies a prompt again,
 * this tab's own if it still waits, otherwise a new one; Connect to MCP makes a new prompt when
 * idle or when another tab receives, or marks the press stuck: still reconnecting with no recorded
 * retry time to wait for, or still paused by a reconnect that gave up (the retry did nothing or
 * failed again). Finding an earlier takeover failed (the site left paused in this browser, ticket
 * am-53), it asks the `takeover` port first (the port skips one this press already made), then
 * goes on from what that leaves, a reconnect that gave up included; one that fails again writes
 * nothing more, as `takeover-failed` is itself the problem dot. A turn-off, another turn-on or a
 * site move while it waits ends it with no write.
 */
export async function turnOnAgents(ports: {
  /** Turns remote agents on for the open site and returns this activation. */
  start(): number;
  /** Whether activation `at` still holds. */
  live(at: number): boolean;
  /** Whether the site owner paused remote agents (known before the press or found while the socket opens). */
  paused(): boolean;
  /** Reads the connections. */
  read(): Promise<unknown>;
  /** Opens the live socket. */
  open(): Promise<void>;
  /** The menu's state now. */
  state(): string;
  /** Retries the reconnect now; its failure is the recovery's to report. */
  retry(): Promise<void>;
  /** Tries to make this tab the one that receives agent changes, unless this press already tried;
   * its failure shows on the dot. */
  takeover(): Promise<void>;
  /** Whether a recorded retry time is still ahead (the button waits for it). */
  retryWaits(): boolean;
  /** What the button offers in `state`. */
  offer(state: string): "connect" | "wait" | "disconnect";
  /** Whether a press offering Connect to MCP in `state` makes a new prompt (idle, another tab receives). */
  fresh(state: string): boolean;
  /** Makes a new prompt. */
  prompt(): Promise<void>;
  /** Copies this tab's waiting prompt again, or makes a new one. */
  copyAgain(): Promise<void>;
  /** Shows that the press found the reconnect still under way, or still given up. */
  stuck(): void;
}) {
  const at = ports.start();
  await ports.read();
  if (ports.paused() || !ports.live(at)) return;
  await ports.open();
  if (!ports.live(at)) return;
  // A reconnect that gave up (paused while the user was away, ticket am-51) is retried as one
  // still under way; a pause by the site owner (also one the socket found while opening) is not.
  const gaveUp = (state: string) => state === "paused" && !ports.paused();
  // An earlier takeover that failed (ticket am-53) is tried again, and the reconnect it opens may
  // still have given up (this browser's record of the tries). The owner's pause is never
  // `takeover-failed` (`ownerPause`), so no owner check here.
  let found = ports.state();
  if (found === "takeover-failed") {
    await ports.takeover();
    if (!ports.live(at)) return;
    found = ports.state();
  }
  if (found === "reconnecting" || gaveUp(found)) await ports.retry();
  if (!ports.live(at)) return;
  const now = ports.state();
  if (ports.offer(now) !== "connect") await ports.copyAgain();
  else if (ports.fresh(now)) await ports.prompt();
  else if ((now === "reconnecting" && !ports.retryWaits()) || gaveUp(now)) ports.stuck();
}

/**
 * Whether a transport state is the site owner's pause: `paused` with the relay's message. A reconnect
 * that gave up (`paused` with none) and a failed takeover (`takeover-failed`, ticket am-53) are not:
 * Connect to MCP retries those.
 */
export function ownerPause(state: { mode: string; message?: string }) {
  return state.mode === "paused" && Boolean(state.message);
}

/**
 * A press of Connect to MCP during which the sign-in ended (ticket am-51): the menu turned agents
 * off and the press copied nothing, so `failed` marks the press's own site, read before its first
 * await, for the dot. A newer press begun meanwhile shows its own outcome instead: nothing written.
 */
export async function pressSignedOut<Site>(ports: {
  /** The site shown when the press began. */
  site: Site | undefined;
  /** Sign-ins found ended so far. */
  signOuts(): number;
  /** The last prompt confirmed on the clipboard. */
  copied(): unknown;
  /** Presses begun so far, this one included. */
  presses(): number;
  /** The press itself. */
  run(): Promise<void>;
  failed(site: Site): void;
}) {
  const site = ports.site, signOuts = ports.signOuts(), copied = ports.copied(), presses = ports.presses();
  await ports.run();
  if (site !== undefined && ports.signOuts() !== signOuts && ports.copied() === copied && ports.presses() === presses) ports.failed(site);
}

/**
 * One connections read at a time. A read asked while another is in flight is skipped (false),
 * unless `wait`: then it waits for every read ahead of it and makes its own, so its answer is
 * this caller's (each waiter reads in turn). A read ahead that rejects only ends the wait: the
 * rejection stays with its own caller. A read ahead that never settles holds its waiters, so
 * `read` must settle (the agent menu's reads give up after their API deadline).
 */
export function serialReads(read: () => Promise<boolean>) {
  let inFlight: Promise<boolean> | undefined;
  return {
    get busy() { return inFlight !== undefined; },
    async run(wait = false): Promise<boolean> {
      if (wait) while (inFlight) await inFlight.catch(() => false);
      if (inFlight) return false;
      const current: Promise<boolean> = read().finally(() => { if (inFlight === current) inFlight = undefined; });
      inFlight = current;
      return current;
    },
  };
}

/**
 * Revokes a site's unused tokens made before `before` (the agent menu's new prompt). An async
 * writer: `live` (same activation and site) is checked before and after each revoke, so a site
 * switch or turn-off meanwhile revokes nothing more; another site's fresh prompt stays.
 */
export async function revokeUnused(ports: {
  /** The site's grants, read before the first await (its own site only). */
  grants: readonly { id: string; via: string; usedAt?: number; createdAt: number }[];
  before: number;
  live(): boolean;
  revoke(id: string): Promise<unknown>;
}) {
  for (const grant of ports.grants) {
    if (grant.via !== "token" || grant.usedAt || grant.createdAt >= ports.before) continue;
    if (!ports.live()) return;
    await ports.revoke(grant.id).catch(() => undefined);
    if (!ports.live()) return;
  }
}

/** The Worker's refusal of a new connection because the site's connections are full (five, or
 * their metadata limit; `worker/agent-context.ts`): only this refusal reclaims unused tokens. */
export function siteFull(status: number | undefined, message: string) {
  return status === 409 && /^This site(?: already has \d+ agent connections|'s agent connections have reached .+) on this branch\./.test(message);
}
