import type { AgentHub } from "./agent-context";
import { clearHub, hubOperation, hubView, readDraft, storeDrafts } from "./agent-store";
import { DurableObject } from "cloudflare:workers";
import { handle, type Env, type StoredValue } from "./app";
import { admitRegistration, isBudgetKey, pruneRegistration, REGISTRATION_ROUTE } from "./oauth-registration";
import type { RepositoryCache } from "./github";
import type { GitHubAppConfig } from "./owner-setup";

interface RepositoryCacheChunks { chunks: number }
const repositoryChunkPrefix = "repositoryCache:";
async function clearRepositoryCache(storage: DurableObjectStorage | DurableObjectTransaction) {
  const keys = [...(await storage.list({ prefix: repositoryChunkPrefix })).keys(), "repositoryCache"];
  for (let start = 0; start < keys.length; start += 128) await storage.delete(keys.slice(start, start + 128));
}

export class SessionStore extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const storage = this.ctx.storage;
    const url = new URL(request.url);
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
      const { ipHash } = (await request.json()) as { ipHash: unknown };
      if (!isBudgetKey(ipHash)) return new Response(null, { status: 400 });
      return this.ctx.blockConcurrencyWhile(async () =>
        Response.json(await admitRegistration(storage, ipHash, Date.now(), (at) => storage.setAlarm(at))),
      );
    }
    if (url.pathname === "/repository-cache") {
      if (!["PUT", "DELETE"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "PUT, DELETE" } });
      return this.ctx.blockConcurrencyWhile(async () => {
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
          if (value) {
            const serialized = JSON.stringify(value);
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
        return new Response(null, { status: 204 });
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
      await clearRepositoryCache(storage);
      await storage.delete("repositoryCacheGeneration");
      await clearHub(storage);
      await storage.deleteAlarm();
      return new Response(null, { status: 204 });
    }
    const read = async () => storage.transaction(async (storage) => {
      if (url.pathname === "/config") {
        const value = await storage.get<GitHubAppConfig>("config");
        return value ? Response.json(value) : new Response(null, { status: 404 });
      }
      const snapshot = await storage.get<StoredValue | RepositoryCache | RepositoryCacheChunks | number>(["session", "repositoryCache", "repositoryCacheGeneration"]);
      const value = snapshot.get("session") as StoredValue | undefined;
      if (!value || value.expiresAt <= Date.now())
        return new Response(null, { status: 404 });
      if (url.pathname === "/consume") await storage.delete("session");
      if (value.kind === "agent-hub")
        return Response.json(await hubView(storage, value as AgentHub, url));
      let repositoryCache = snapshot.get("repositoryCache") as RepositoryCache | RepositoryCacheChunks | undefined;
      if (repositoryCache && "chunks" in repositoryCache) {
        const chunks: string[] = [];
        for (let start = 0; start < repositoryCache.chunks; start += 128) {
          const keys = Array.from({ length: Math.min(128, repositoryCache.chunks - start) }, (_, index) => `${repositoryChunkPrefix}${start + index}`);
          const stored = await storage.get<string>(keys);
          for (const key of keys) {
            const chunk = stored.get(key);
            if (chunk === undefined) return new Response(null, { status: 500 });
            chunks.push(chunk);
          }
        }
        repositoryCache = JSON.parse(chunks.join("")) as RepositoryCache;
      }
      return Response.json(value.kind === "user" ? { ...value, repositoryCache, repositoryCacheGeneration: snapshot.get("repositoryCacheGeneration") ?? 0 } : value);
    });
    return url.pathname === "/consume" ? this.ctx.blockConcurrencyWhile(read) : read();
  }
  async alarm() {
    await clearRepositoryCache(this.ctx.storage);
    await this.ctx.storage.delete("repositoryCacheGeneration");
    await clearHub(this.ctx.storage);
    await pruneRegistration(this.ctx.storage, Date.now(), (at) => this.ctx.storage.setAlarm(at));
  }
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handle(request, env, fetch, ctx),
};
