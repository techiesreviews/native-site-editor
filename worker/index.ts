import { inventoryObject } from "./agent-maintenance";
import type { AgentHub } from "./agent-context";
import { clearHub, hubOperation, hubView, readDraft, storeDrafts } from "./agent-store";
import { DurableObject } from "cloudflare:workers";
import { handle, type Env, type StoredValue } from "./app";
import { admitRegistration, finalizeRegistration, isBudgetKey, pruneRegistration, releaseRegistration, REGISTRATION_ROUTE } from "./oauth-registration";
import { accountPending, PENDING_KEY, PENDING_ROUTE, type PendingAction } from "./oauth-pending";
import type { RepositoryCache } from "./github";
import type { GitHubAppConfig } from "./owner-setup";
import { AgentRelay, readRelayBody } from "./agent-relay";

interface RepositoryCacheChunks { chunks: number }
const repositoryChunkPrefix = "repositoryCache:";
const repositoryCacheMaxBytes = 262144;
async function clearRepositoryCache(storage: DurableObjectStorage | DurableObjectTransaction) {
  const keys = [...(await storage.list({ prefix: repositoryChunkPrefix })).keys(), "repositoryCache"];
  for (let start = 0; start < keys.length; start += 128) await storage.delete(keys.slice(start, start + 128));
}

async function readRepositoryCache(storage: DurableObjectStorage | DurableObjectTransaction): Promise<RepositoryCache | null> {
  const value = await storage.get<RepositoryCache | RepositoryCacheChunks>("repositoryCache");
  if (!value) return null;
  if (!("chunks" in value)) return value;
  const chunks: string[] = [];
  for (let start = 0; start < value.chunks; start += 128) {
    const keys = Array.from({ length: Math.min(128, value.chunks - start) }, (_, index) => `${repositoryChunkPrefix}${start + index}`);
    const stored = await storage.get<string>(keys);
    for (const key of keys) {
      const chunk = stored.get(key);
      if (chunk === undefined) throw new Error("Repository cache chunk is missing");
      chunks.push(chunk);
    }
  }
  return JSON.parse(chunks.join("")) as RepositoryCache;
}

export class SessionStore extends DurableObject {
  private relayCore?: AgentRelay;
  private relay() {
    if (!this.relayCore) {
      // Exact application heartbeat strings for ticket 14; no JS timer/wake.
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
      this.relayCore = new AgentRelay(this.ctx.getWebSockets("editor"));
    }
    return this.relayCore;
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    this.relay().message(socket, message);
  }
  webSocketClose(socket: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    this.relay().disconnect(socket);
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* Already closed. */ }
  }
  webSocketError(socket: WebSocket, _error: unknown) {
    this.relay().disconnect(socket);
    try { socket.close(1011, "Relay socket failed."); } catch { /* Already closed. */ }
  }
  async fetch(request: Request): Promise<Response> {
    const storage = this.ctx.storage;
    const url = new URL(request.url);
    if (url.pathname === "/maintenance/inventory") return inventoryObject(request, storage);
    if (url.pathname.startsWith("/relay/")) {
      let identity: unknown;
      try { identity = JSON.parse(request.headers.get(AgentRelay.identityHeader) ?? "null"); } catch { /* Refuse malformed trusted metadata. */ }
      const scope = AgentRelay.readScope(identity);
      if (url.pathname === "/relay/connect" && scope && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        const relay = this.relay();
        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server, ["editor"]);
        if (!relay.connect(server, scope)) {
          server.close(1008, "Wrong relay workspace.");
          return new Response(null, { status: 409 });
        }
        return new Response(null, { status: 101, webSocket: client });
      }
      // Worker-internal only: the public router never forwards this path. Browser
      // work is awaited outside blockConcurrencyWhile and never touches storage.
      const target = AgentRelay.readTarget(identity);
      const key = identity as { requestId?: unknown; grantId?: unknown } | null;
      const cancelKey = key && (typeof key.requestId === "string" || typeof key.requestId === "number" && Number.isFinite(key.requestId)) &&
        typeof key.grantId === "string" && key.grantId ? { requestId: key.requestId, grantId: key.grantId } : undefined;
      if (url.pathname === "/relay/cancel" && request.method === "POST" && target && cancelKey) {
        this.relay().cancel(cancelKey);
        return new Response(null, { status: 202 });
      }
      if (url.pathname === "/relay/dispatch" && request.method === "POST" && target) {
        // One total deadline from ingress; capacity is reserved before the body is read.
        const started = Date.now();
        const length = Number(request.headers.get("Content-Length"));
        if (!request.headers.has("Content-Length") || !Number.isSafeInteger(length) || length < 0)
          return new Response(null, { status: 411 });
        const relay = this.relay();
        const reservation = relay.reserve(length, cancelKey);
        if ("ok" in reservation) return Response.json(reservation, { status: !reservation.ok && reservation.code === "too-large" ? 413 : 200 });
        let body;
        try { body = await readRelayBody(request.body, length, started + 10_000, request.signal); }
        // Idempotent; on success dispatch() re-admits in this same synchronous turn.
        finally { reservation.release(); }
        if (reservation.cancelled) return Response.json({ ok: false, code: "cancelled", outcome: "not-sent" });
        if (!body.ok && body.code === "invalid") return new Response(null, { status: 400 });
        if (!body.ok) return Response.json({ ok: false, code: body.code, outcome: "not-sent" }, { status: body.code === "too-large" ? 413 : 200 });
        const command = body.value;
        return Response.json(await relay.dispatch(target, command, request.signal, { started, reservation }, cancelKey));
      }
      return new Response(null, { status: 400 });
    }
    if (url.pathname === PENDING_ROUTE) {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const action = await request.json() as PendingAction;
      return this.ctx.blockConcurrencyWhile(() => storage.transaction(async (transaction) => {
        const result = await accountPending(transaction, action, Date.now());
        return Response.json(result, { status: result.reason === "invalid" ? 400 : 200 });
      }));
    }
    // The agent hub, its context and draft texts (worker/agent-store.ts).
    if (url.pathname === "/agent-operation") {
      const action = await request.json();
      return this.ctx.blockConcurrencyWhile(() =>
        hubOperation(storage, action, (at) => storage.setAlarm(at)),
      );
    }
    if (url.pathname === "/agent-drafts" && request.method === "POST") {
      const texts = (await request.json()) as { hash: string; content: string }[];
      return this.ctx.blockConcurrencyWhile(() => storeDrafts(storage, texts));
    }
    if (url.pathname === "/agent-draft")
      return readDraft(storage, url.searchParams.get("hash") ?? "");
    // Anonymous OAuth client registration budgets, on a fixed-name instance
    // (worker/oauth-registration.ts). One transaction keeps counts exact.
    if (url.pathname === REGISTRATION_ROUTE) {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const { action, ipHash, clientId, expiresAt } = (await request.json()) as {
        action?: unknown; ipHash?: unknown; clientId?: unknown; expiresAt?: unknown;
      };
      if (typeof clientId !== "string" || !/^mcp_[a-f0-9]{32}$/.test(clientId)) return new Response(null, { status: 400 });
      return this.ctx.blockConcurrencyWhile(async () => {
        if (action === "finalize" || action === "release") {
          await (action === "finalize" ? finalizeRegistration : releaseRegistration)(storage, clientId);
          return new Response(null, { status: 204 });
        }
        if (action !== undefined || !isBudgetKey(ipHash) || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())
          return new Response(null, { status: 400 });
        return Response.json(await admitRegistration(storage, ipHash, Date.now(), (at) => storage.setAlarm(at), { clientId, expiresAt }));
      });
    }
    if (url.pathname === "/repository-cache") {
      if (!["GET", "PUT", "DELETE"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, PUT, DELETE" } });
      return this.ctx.blockConcurrencyWhile(async () => {
        if (request.method === "GET") {
          return storage.transaction(async (transaction) => {
            const session = await transaction.get<StoredValue>("session");
            if (!session || session.kind !== "user" || session.expiresAt <= Date.now()) return new Response(null, { status: 404 });
            const generation = await transaction.get<number>("repositoryCacheGeneration") ?? 0;
            const value = await readRepositoryCache(transaction);
            return session.expiresAt <= Date.now() ? new Response(null, { status: 404 }) : Response.json({ generation, value });
          });
        }
        if (request.method === "DELETE") {
          const session = await storage.get<StoredValue>("session");
          if (!session || session.kind !== "user" || session.expiresAt <= Date.now()) return new Response(null, { status: 204 });
          await clearRepositoryCache(storage);
          await storage.put("repositoryCacheGeneration", (await storage.get<number>("repositoryCacheGeneration") ?? 0) + 1);
          return new Response(null, { status: 204 });
        }
        const { token, generation, value } = await request.json() as { token: string; generation: number; value: RepositoryCache | null };
        const session = await storage.get<StoredValue>("session");
        if (!session || session.kind !== "user" || session.token !== token || session.expiresAt <= Date.now())
          return new Response(null, { status: 401 });
        if (generation !== (await storage.get<number>("repositoryCacheGeneration") ?? 0))
          return new Response(null, { status: 204 });
        await storage.transaction(async (transaction) => {
          await clearRepositoryCache(transaction);
          const serialized = value && JSON.stringify(value);
          if (serialized && new TextEncoder().encode(serialized).byteLength <= repositoryCacheMaxBytes) {
            const chunks = Math.ceil(serialized.length / 16000);
            for (let start = 0; start < chunks; start += 128) {
              const entries: Record<string, string> = {};
              for (let index = start; index < Math.min(chunks, start + 128); index++)
                entries[`${repositoryChunkPrefix}${index}`] = serialized.slice(index * 16000, (index + 1) * 16000);
              await transaction.put(entries);
            }
            await transaction.put("repositoryCache", { chunks });
          }
        });
        // A refused generation still succeeds, but cannot populate isolate memory.
        return new Response(null, { status: 204, headers: { "X-Repository-Cache-Generation": String(generation) } });
      });
    }
    if (request.method === "PUT") {
      if (url.pathname === "/config") {
        return this.ctx.blockConcurrencyWhile(async () => {
          const existing = await storage.get<GitHubAppConfig>("config");
          if (existing) return new Response(null, { status: 409 });
          await storage.put("config", await request.json());
          return new Response(null, { status: 204 });
        });
      }
      const value = (await request.json()) as StoredValue;
      return this.ctx.blockConcurrencyWhile(async () => {
        await clearRepositoryCache(storage);
        await storage.put("repositoryCacheGeneration", (await storage.get<number>("repositoryCacheGeneration") ?? 0) + 1);
        await storage.put("session", value);
        await storage.setAlarm(value.expiresAt);
        return new Response(null, { status: 204 });
      });
    }
    if (request.method === "DELETE") {
      return this.ctx.blockConcurrencyWhile(async () => {
        await clearRepositoryCache(storage);
        await storage.delete("repositoryCacheGeneration");
        await clearHub(storage);
        await storage.delete(PENDING_KEY);
        await storage.deleteAlarm();
        return new Response(null, { status: 204 });
      });
    }
    const read = async () => storage.transaction(async (storage) => {
      if (url.pathname === "/config") {
        const value = await storage.get<GitHubAppConfig>("config");
        return value ? Response.json(value) : new Response(null, { status: 404 });
      }
      const snapshot = await storage.get<StoredValue | number>(["session", "repositoryCacheGeneration"]);
      const value = snapshot.get("session") as StoredValue | undefined;
      if (!value || value.expiresAt <= Date.now())
        return new Response(null, { status: 404 });
      if (url.pathname === "/consume") await storage.delete("session");
      if (value.kind === "agent-hub")
        return Response.json(await hubView(storage, value as AgentHub, url));
      return Response.json(value.kind === "user" ? { ...value, repositoryCache: undefined, repositoryCacheGeneration: snapshot.get("repositoryCacheGeneration") ?? 0 } : value);
    });
    return url.pathname === "/consume" ? this.ctx.blockConcurrencyWhile(read) : read();
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const client = await this.ctx.storage.get<StoredValue>("session");
      if (client?.kind === "oauth-client") {
        if (client.expiresAt <= Date.now()) await this.ctx.storage.delete(["session", "repositoryCacheGeneration"]);
        else await this.ctx.storage.setAlarm(client.expiresAt);
        return;
      }
      await clearRepositoryCache(this.ctx.storage);
      await this.ctx.storage.delete("repositoryCacheGeneration");
      await clearHub(this.ctx.storage);
      await this.ctx.storage.delete(PENDING_KEY);
      await pruneRegistration(this.ctx.storage, Date.now(), (at) => this.ctx.storage.setAlarm(at));
    });
  }
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handle(request, env, fetch, ctx),
};
