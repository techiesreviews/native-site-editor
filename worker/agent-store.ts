// The hub persists grant metadata only. Legacy content stays untouched until migration,
// except for the existing expiry/sign-out cleanup in clearHub.
import type { AgentHub } from "./agent-context";
import { agentOperation, newHub } from "./agent-operations";
import { HttpError } from "./github";

/** The Durable Object storage calls the hub makes. */
export interface HubStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(keys: string[]): Promise<unknown>;
}
type Index = Record<string, number>;
const BATCH = 100;
const draftKey = (hash: string) => `draft:${hash}`;
const grantOperations = new Set(["add-grant", "use-grant", "rebind-grant", "remove-grant"]);

async function deleteKeys(storage: HubStorage, keys: string[]) {
  for (let at = 0; at < keys.length; at += BATCH) await storage.delete(keys.slice(at, at + BATCH));
}
/** Temporary agent data: the drafts mirror, context and requests stored beside a hub. */
async function temporaryKeys(storage: HubStorage) {
  const index = (await storage.get<Index>("drafts")) ?? {};
  return ["context", "drafts", "requests", ...Object.keys(index).map(draftKey)];
}

/** Removes the hub and all it stored (the session ended, or the hub expired). */
export async function clearHub(storage: HubStorage) {
  await deleteKeys(storage, ["session", ...await temporaryKeys(storage)]);
}

/** Removes a hub's temporary agent data (drafts mirror, context, requests and receipts kept
 * inline) after the disconnect grace, keeping its grant metadata: permissions stay. */
export async function clearTemporary(storage: HubStorage) {
  await deleteKeys(storage, await temporaryKeys(storage));
  const hub = await storage.get<AgentHub>("session");
  if (hub?.kind === "agent-hub" && Object.keys(hub).some(key => !(key in hubView(hub))))
    await storage.put({ session: hubView(hub) });
}

/** Grant operations only; refuse obsolete actions before any storage read or write. */
export async function hubOperation(storage: HubStorage, action: any, setAlarm: (at: number) => Promise<void>) {
  if (!grantOperations.has(action?.type))
    return Response.json({ error: "Unknown agent operation." }, { status: 400 });
  const stored = await storage.get<AgentHub>("session");
  let hub = stored?.kind === "agent-hub" && stored.expiresAt > Date.now() ? stored : undefined;
  if (!hub) {
    hub = newHub(action);
    if (!hub) return Response.json({ error: "Agent connection expired." }, { status: 401 });
    await clearHub(storage);
    await setAlarm(hub.expiresAt);
  }
  try {
    const result = agentOperation(hub, action);
    await storage.put({ session: hub });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof HttpError ? error.message : "Agent operation failed." },
      { status: error instanceof HttpError ? error.status : 500 });
  }
}

/** Public grant metadata only, including when older content is stored inline. */
export function hubView(hub: AgentHub): AgentHub {
  return { kind: hub.kind, login: hub.login, expiresAt: hub.expiresAt, grants: hub.grants };
}
