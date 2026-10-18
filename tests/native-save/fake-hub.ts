// Mirrors worker/index.ts: read JSON first, then serialize hub writes per object.
import { hubOperation, type HubStorage } from "../../worker/agent-store.ts";
import { AgentRelay, readRelayBody, type RelayScope } from "../../worker/agent-relay.ts";
import { accountMetadata, METADATA_ROUTE, type MetadataAction } from "../../worker/agent-metadata.ts";

export type RelayConnect = (relay: AgentRelay, scope: RelayScope) => Response;
const relays = new Map<string, AgentRelay>();

/** Same relay core and intake as SessionStore, with Node supplying the socket upgrade. */
export async function fakeRelayRoute(id: string, request: Request, connect?: RelayConnect): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/relay/")) return undefined;
  let identity: unknown;
  try { identity = JSON.parse(request.headers.get(AgentRelay.identityHeader) ?? "null"); } catch { /* Refuse malformed trusted metadata. */ }
  const relay = relays.get(id) ?? new AgentRelay([]);
  relays.set(id, relay);
  const scope = AgentRelay.readScope(identity);
  if (url.pathname === "/relay/connect" && scope && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket" && connect)
    return connect(relay, scope);
  const target = AgentRelay.readTarget(identity);
  if (url.pathname !== "/relay/dispatch" || request.method !== "POST" || !target) return new Response(null, { status: 400 });
  const started = Date.now();
  const length = Number(request.headers.get("Content-Length"));
  if (!request.headers.has("Content-Length") || !Number.isSafeInteger(length) || length < 0) return new Response(null, { status: 411 });
  const reservation = relay.reserve(length);
  if ("ok" in reservation) return Response.json(reservation, { status: !reservation.ok && reservation.code === "too-large" ? 413 : 200 });
  let body;
  try { body = await readRelayBody(request.body, length, started + 10_000, request.signal); }
  finally { reservation.release(); }
  if (!body.ok && body.code === "invalid") return new Response(null, { status: 400 });
  if (!body.ok) return Response.json({ ok: false, code: body.code, outcome: "not-sent" }, { status: body.code === "too-large" ? 413 : 200 });
  return Response.json(await relay.dispatch(target, body.value, request.signal, { started, reservation }));
}

const pending = new Map<string, Promise<void>>();

/** Runs one Durable Object operation at a time per object id. */
export async function serializeObject(id: string, operation: () => Promise<Response>) {
  const result = (pending.get(id) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  pending.set(id, settled);
  try {
    return await result;
  } finally {
    if (pending.get(id) === settled) pending.delete(id);
  }
}

export async function fakeHubRoute(id: string, storage: HubStorage, request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname === METADATA_ROUTE) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const action = await request.json() as MetadataAction;
    return serializeObject(id, async () => {
      const result = await accountMetadata({
        get: key => storage.get(key), put: async (key, value) => storage.put({ [key]: value }),
      }, action, Date.now());
      return Response.json(result, { status: result.reason === "invalid" ? 400 : 200 });
    });
  }
  if (url.pathname === "/agent-operation") {
    const action = await request.json();
    return serializeObject(id, () => hubOperation(storage, action, async () => undefined));
  }
  if (url.pathname === "/agent-drafts" || url.pathname === "/agent-draft") return new Response(null, { status: 404 });
  return undefined;
}
