// What became of the last save, shared by the code that follows it
// (components/site-actions.ts) and the Publish button that shows it
// (components/publish-menu.ts), which is made again for each open file.
// Saved and Published settle back to nothing after a moment, so the button
// returns to Publish; a failed deploy stays until the next save.

export interface DeployStatus {
  repo: string;
  commit: string;
  state: "saved" | "building" | "live" | "failed";
  /** Whether the state is the last one: nothing more is followed. */
  final: boolean;
  /** Why the state is what it is, when that needs saying (a missing permission). */
  note?: string;
  /** Where to look: the commit, the deploy's run, the live site. */
  link: { text: string; href: string; name: string };
}

/** How long a final Saved or Published shows before the button goes back to Publish. */
export const SETTLE_MS = 4_000;

let current: DeployStatus | undefined;
let settle: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(status: DeployStatus | undefined) => void>();

export const deployStatus = () => current;

export function setDeployStatus(status: DeployStatus | undefined) {
  clearTimeout(settle);
  current = status;
  if (status?.final && status.state !== "failed")
    settle = setTimeout(() => { if (current === status) setDeployStatus(undefined); }, SETTLE_MS);
  for (const listener of listeners) listener(current);
}

/** Calls `listener` with the status now and on every change; returns the unsubscribe. */
export function onDeployStatus(listener: (status: DeployStatus | undefined) => void) {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}
