// The requests to agents as the agent menu last told them (src/agent-menu-host.ts), for a part of the editor that
// waits for an agent's reply to its own request: the Inbox's Fix with AI (src/inbox/inbox-agent.ts, TOOLS-253).
// Loaded with either of them, never at boot.
import type { PinRequest } from "./components/agent-pins";

type Listener = (requests: readonly PinRequest[]) => void;
const listeners = new Set<Listener>();
let told: readonly PinRequest[] = [];

/** The agent menu's requests, each time they may have changed. */
export function tellReplies(requests: readonly PinRequest[]) {
  told = requests;
  for (const listener of [...listeners]) listener(requests);
}

/** `listener` hears the requests now and each time they change; the returned call stops it. */
export function watchReplies(listener: Listener) {
  listeners.add(listener);
  listener(told);
  return () => { listeners.delete(listener); };
}
