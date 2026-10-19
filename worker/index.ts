import { cleanupObject, inventoryObject } from "./agent-maintenance";
import { tokenId, deleteCleanedGrants, type AgentHub } from "./agent-context";
import { clearHub, hubOperation, hubView } from "./agent-store";
import { DurableObject } from "cloudflare:workers";
import { handle, type Env, type StoredValue } from "./app";
import { admitRegistration, finalizeRegistration, isBudgetKey, pruneRegistration, releaseRegistration, REGISTRATION_ROUTE } from "./oauth-registration";
import { accountPending, PENDING_KEY, PENDING_ROUTE, type PendingAction } from "./oauth-pending";
import type { RepositoryCache } from "./github";
import type { GitHubAppConfig } from "./owner-setup";
import { AgentRelay, readRelayBody } from "./agent-relay";
import { accountMetadata, METADATA_KEY, METADATA_ROUTE, type Ledger, type MetadataAction } from "./agent-metadata";
import { workspaceKey } from "../shared/agent-command";
import { AgentLifecycle, AlarmDeadlines, CLEANUP_GROWTH_BYTES, LIFECYCLE_KEY } from "./agent-lifecycle";

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
  private deadlines = new AlarmDeadlines(this.ctx.storage);
  private lifecycle = new AgentLifecycle(this.ctx.storage, this.deadlines);
  private relayCore?: AgentRelay;
  private eligible(workspace?: string) {
    const sockets = this.ctx.getWebSockets("editor");
    if (this.relayCore) return this.relayCore.eligibleEditors(sockets, workspace);
    return sockets.filter(socket => {
      const value = socket.deserializeAttachment() as { role?: string; everHandshaken?: boolean; handshaken?: boolean } | null;
      const scope = AgentRelay.readScope(value);
      return socket.readyState === 1 && value?.role === "editor" && (value.everHandshaken ?? value.handshaken) === true && scope &&
        (workspace === undefined || workspaceKey(scope.workspace) === workspace);
    }).length;
  }
  /** A workspace without live agent grants has nothing to clean: closing its last tab writes nothing. */
  private async lastEditorLost(detectedAt: number) {
    if (this.eligible()) return;
    const ledger = await this.ctx.storage.get<Ledger>(METADATA_KEY);
    if (!ledger?.entries.some(entry => entry.state !== "cleaned" && entry.expiresAt > detectedAt)) return;
    await this.lifecycle.presence(0, false, detectedAt);
  }
  private fenceLoaded?: Promise<void>;
  private loadFence() {
    return this.fenceLoaded ??= this.lifecycle.load().then(record => {
      this.relay().refuse(Object.keys(record.cleaned).filter(id => record.cleaned[id] > Date.now()));
    });
  }
  private registrationStorage() {
    const storage = this.ctx.storage;
    return {
      get: storage.get.bind(storage), put: storage.put.bind(storage), delete: storage.delete.bind(storage),
      list: storage.list.bind(storage), transaction: storage.transaction.bind(storage),
      getAlarm: async () => (await this.deadlines.read()).registration ?? null,
      deleteAlarm: () => this.deadlines.set("registration"),
    };
  }
  private relay() {
    if (!this.relayCore) {
      // Exact application heartbeat strings for ticket 14; no JS timer/wake.
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
      this.relayCore = new AgentRelay(this.ctx.getWebSockets("editor"));
    }
    return this.relayCore;
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const relay = this.relay();
    // Only a socket's first successful handshake can end a grace; results stay memory-only
    // (and are not parsed twice: a handshaken socket is already presence).
    const before = relay.isHandshaken(socket);
    if (!relay.message(socket, message) || before || !relay.isHandshaken(socket)) return;
    await this.ctx.blockConcurrencyWhile(() => this.lifecycle.presence(this.eligible(), true));
  }
  async webSocketClose(socket: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    const detectedAt = Date.now();
    this.relay().disconnect(socket);
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* Already closed. */ }
    await this.ctx.blockConcurrencyWhile(() => this.lastEditorLost(detectedAt));
  }
  async webSocketError(socket: WebSocket, _error: unknown) {
    const detectedAt = Date.now();
    this.relay().disconnect(socket);
    try { socket.close(1011, "Relay socket failed."); } catch { /* Already closed. */ }
    await this.ctx.blockConcurrencyWhile(() => this.lastEditorLost(detectedAt));
  }
  async fetch(request: Request): Promise<Response> {
    const storage = this.ctx.storage;
    const url = new URL(request.url);
    if (url.pathname === "/maintenance/cleanup") return this.ctx.blockConcurrencyWhile(() => cleanupObject(request, storage, { sockets: this.ctx.getWebSockets().length }));
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
        await this.loadFence();
        const relay = this.relay();
        const reservation = relay.reserve(length, cancelKey);
        if ("ok" in reservation) return Response.json(reservation, { status: !reservation.ok && reservation.code === "too-large" ? 413 : 200 });
        let body;
        try { body = await readRelayBody(request.body, length, started + 10_000, AbortSignal.any([request.signal, reservation.signal])); }
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
    if (url.pathname === METADATA_ROUTE) {
      // Internal only: app.ts constructs workspace identity after authorization.
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const action = await request.json() as MetadataAction;
      return this.ctx.blockConcurrencyWhile(async () => {
        const reservedAt = Date.now();
        if (action && action.action !== "release" && await this.lifecycle.denied(action.id))
          return Response.json({ allowed: false, reason: "cleaned", entries: [] });
        // Cleanup tombstones are workspace agent metadata too (decision 05: 64 KiB in total).
        const lifecycleBytes = action?.action === "reserve" ? await this.lifecycle.admissionBytes() : 0;
        // Each reservation also pays for the tombstone and record fence a cleanup would leave.
        if (action?.action === "reserve" && Number.isSafeInteger(action.bytes) && action.bytes > 0) action.bytes += CLEANUP_GROWTH_BYTES;
        const result = await storage.transaction(transaction => accountMetadata(transaction, action, reservedAt,
          { connections: 5, bytes: 64 * 1024 - lifecycleBytes }));
        if (result.allowed && action.action === "reserve") await this.lifecycle.presence(this.eligible(action.workspace), false, reservedAt);
        return Response.json(result, { status: result.reason === "invalid" ? 400 : 200 });
      });
    }
    if (url.pathname === PENDING_ROUTE) {
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const action = await request.json() as PendingAction;
      return this.ctx.blockConcurrencyWhile(() => storage.transaction(async (transaction) => {
        const result = await accountPending(transaction, action, Date.now());
        return Response.json(result, { status: result.reason === "invalid" ? 400 : 200 });
      }));
    }
    // Grant metadata operations only; obsolete content routes have no handler.
    if (url.pathname === "/agent-operation") {
      const action = await request.json();
      return this.ctx.blockConcurrencyWhile(() =>
        hubOperation(storage, action, (at) => this.deadlines.set("session", at)),
      );
    }
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
        return Response.json(await admitRegistration(this.registrationStorage(), ipHash, Date.now(), (at) => this.deadlines.set("registration", at), { clientId, expiresAt }));
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
    if (!["/", "/config", "/consume"].includes(url.pathname)) return new Response(null, { status: 404 });
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
        if (value.kind === "agent" && (await storage.get<number>("agent-cleaned-until") ?? 0) > Date.now())
          return new Response(null, { status: 409 });
        const deadline = request.headers.get("X-Agent-Deadline");
        if (deadline && Date.now() >= Number(deadline)) return new Response(null, { status: 409 });
        const previous = request.headers.get("X-Agent-Previous");
        const current = previous ? await storage.get<StoredValue>("session") : undefined;
        if (previous && (!current || await tokenId(JSON.stringify(current)) !== previous))
          return new Response(null, { status: 409 });
        await clearRepositoryCache(storage);
        await storage.put("repositoryCacheGeneration", (await storage.get<number>("repositoryCacheGeneration") ?? 0) + 1);
        // A creation/rebind delayed past reconciliation's grace cannot publish
        // a record after its reservation may have been reclaimed.
        if (deadline && Date.now() >= Number(deadline)) return new Response(null, { status: 409 });
        await storage.put("session", value);
        await this.deadlines.set("session", value.expiresAt);
        return new Response(null, { status: 204 });
      });
    }
    if (request.method === "DELETE") {
      return this.ctx.blockConcurrencyWhile(async () => {
        const expected = request.headers.get("X-Agent-Delete");
        if (expected) {
          const current = await storage.get<StoredValue>("session");
          if (current && await tokenId(JSON.stringify(current)) !== expected) return new Response(null, { status: 409 });
        }
        // Physical agent cleanup also fences a delayed first PUT on this id.
        const cleanedUntil = Number(request.headers.get("X-Agent-Cleaned-Until"));
        if (Number.isSafeInteger(cleanedUntil) && cleanedUntil > Date.now())
          await storage.put("agent-cleaned-until", Math.max(cleanedUntil, await storage.get<number>("agent-cleaned-until") ?? 0));
        await clearRepositoryCache(storage);
        await storage.delete("repositoryCacheGeneration");
        await clearHub(storage);
        await storage.delete(PENDING_KEY);
        const fenceExpiry = await storage.get<number>("agent-cleaned-until");
        await this.deadlines.set("session", fenceExpiry && fenceExpiry > Date.now() ? fenceExpiry : undefined);
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
        return Response.json(hubView(value as AgentHub));
      return Response.json(value.kind === "user" ? { ...value, repositoryCache: undefined, repositoryCacheGeneration: snapshot.get("repositoryCacheGeneration") ?? 0 } : value);
    });
    return url.pathname === "/consume" ? this.ctx.blockConcurrencyWhile(read) : read();
  }
  async alarm() {
    // Everything inside this gate is local storage/socket metadata only.
    const work = await this.ctx.blockConcurrencyWhile(async () => {
      const storage = this.ctx.storage;
      const table = await this.deadlines.read();
      const now = Date.now();
      if (table.session !== undefined && table.session <= now) {
        const session = await storage.get<StoredValue>("session");
        if (session && session.expiresAt > now) await this.deadlines.set("session", session.expiresAt);
        else {
          await clearRepositoryCache(storage);
          await storage.delete("repositoryCacheGeneration");
          await clearHub(storage);
          await storage.delete(PENDING_KEY);
          await storage.delete("agent-cleaned-until");
          await this.deadlines.set("session");
        }
      }
      if (table.registration !== undefined && table.registration <= now) {
        // Keep the due purpose until pruning succeeds; a failed local write retries it.
        let next: number | undefined;
        await pruneRegistration({ ...this.registrationStorage(), deleteAlarm: async () => { next = undefined; } },
          now, async at => { next = at; });
        await this.deadlines.set("registration", next);
      }
      if (table["agent-cleanup"] === undefined || table["agent-cleanup"] > now) {
        await this.deadlines.schedule(await this.deadlines.read());
        return undefined;
      }
      const record = await this.lifecycle.load();
      const ledger = await storage.get<Ledger>(METADATA_KEY);
      if (!ledger) { await this.lifecycle.complete(record.generation); return undefined; }
      if (await this.lifecycle.fence(record.generation, this.eligible(), ledger.entries, next => storage.transaction(async transaction => {
        for (const entry of ledger.entries) entry.state = "cleaned";
        await transaction.put(METADATA_KEY, ledger);
        await transaction.put(LIFECYCLE_KEY, next);
      }))) this.relay().refuse(ledger.entries.map(entry => entry.id));
      const entries = ledger.entries.filter(entry => entry.state === "cleaned");
      if (!entries.length) {
        await this.lifecycle.complete(record.generation);
        return undefined;
      }
      // Explicit retry survives exhaustion of the platform's automatic retries.
      await this.deadlines.set("agent-cleanup", Math.min(now + 30_000, (await this.lifecycle.load()).disconnectDeadline ?? Infinity));
      return { workspace: ledger.workspace, entries, generation: record.generation };
    });
    if (!work) return;
    // No browser or namespace fetch may run while the concurrency gate is held.
    const removed = await deleteCleanedGrants(this.env as Env, work.workspace, work.entries);
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const entry of removed)
        await accountMetadata(this.ctx.storage, { workspace: work.workspace, action: "release", id: entry.id,
          generation: entry.generation, expected: entry }, Date.now());
      const remaining = await this.ctx.storage.get<Ledger>(METADATA_KEY);
      if (!remaining?.entries.some(entry => entry.state === "cleaned")) await this.lifecycle.complete(work.generation, removed.map(entry => entry.id));
    });
    if (removed.length !== work.entries.length) throw new Error("Agent cleanup incomplete; retry scheduled");
  }
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handle(request, env, fetch, ctx),
};
