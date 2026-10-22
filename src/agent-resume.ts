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
 * One connections read at a time. A read asked while another is in flight is skipped (false),
 * unless `wait`: then it waits for every read ahead of it and makes its own, so its answer is
 * this caller's (each waiter reads in turn).
 */
export function serialReads(read: () => Promise<boolean>) {
  let inFlight: Promise<boolean> | undefined;
  return {
    get busy() { return inFlight !== undefined; },
    async run(wait = false): Promise<boolean> {
      if (wait) while (inFlight) await inFlight;
      if (inFlight) return false;
      const current: Promise<boolean> = read().finally(() => { if (inFlight === current) inFlight = undefined; });
      inFlight = current;
      return current;
    },
  };
}
