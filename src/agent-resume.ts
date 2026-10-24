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
 * and, finding a reconnect left from before the press, retries it at once rather than waiting out
 * its backoff. Then it makes a prompt (idle), copies the waiting one again, or, still reconnecting
 * with no recorded retry time to wait for, marks the press stuck. A turn-off, another turn-on or a
 * site move while it waits ends it with no write.
 */
export async function turnOnAgents(ports: {
  /** Turns remote agents on for the open site and returns this activation. */
  start(): number;
  /** Whether activation `at` still holds. */
  live(at: number): boolean;
  /** Whether another tab of this browser paused remote agents. */
  paused(): boolean;
  /** Reads the connections. */
  read(): Promise<unknown>;
  /** Opens the live socket. */
  open(): Promise<void>;
  /** The menu's state now. */
  state(): string;
  /** Retries the reconnect now; its failure is the recovery's to report. */
  retry(): Promise<void>;
  /** Whether a recorded retry time is still ahead (the button waits for it). */
  retryWaits(): boolean;
  /** Whether the button offers Wait for MCP in `state`. */
  waits(state: string): boolean;
  /** Makes a new prompt. */
  prompt(): Promise<void>;
  /** Copies the waiting prompt again. */
  copyAgain(): Promise<void>;
  /** Shows that the press found the reconnect still under way. */
  stuck(): void;
}) {
  const at = ports.start();
  await ports.read();
  if (ports.paused() || !ports.live(at)) return;
  await ports.open();
  if (!ports.live(at)) return;
  if (ports.state() === "reconnecting") await ports.retry();
  if (!ports.live(at)) return;
  const now = ports.state();
  if (now === "idle") await ports.prompt();
  else if (ports.waits(now)) await ports.copyAgain();
  else if (now === "reconnecting" && !ports.retryWaits()) ports.stuck();
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
