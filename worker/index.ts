import type { AgentHub } from "./agent-context";
import { clearHub, hubOperation, hubView, readDraft, storeDrafts } from "./agent-store";
import { DurableObject } from "cloudflare:workers";
import { handle, type Env, type StoredValue } from "./app";
import { admitRegistration, isBudgetKey, pruneRegistration, REGISTRATION_ROUTE } from "./oauth-registration";
import type { GitHubAppConfig } from "./owner-setup";

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
      await storage.put("session", value);
      await storage.setAlarm(value.expiresAt);
      return new Response(null, { status: 204 });
    }
    if (request.method === "DELETE") {
      await clearHub(storage);
      await storage.deleteAlarm();
      return new Response(null, { status: 204 });
    }
    const read = async () => {
      if (url.pathname === "/config") {
        const value = await storage.get<GitHubAppConfig>("config");
        return value ? Response.json(value) : new Response(null, { status: 404 });
      }
      const value = await storage.get<StoredValue>("session");
      if (!value || value.expiresAt <= Date.now())
        return new Response(null, { status: 404 });
      if (url.pathname === "/consume") await storage.delete("session");
      if (value.kind === "agent-hub")
        return Response.json(await hubView(storage, value as AgentHub, url));
      return Response.json(value);
    };
    return this.ctx.blockConcurrencyWhile(read);
  }
  async alarm() {
    await clearHub(this.ctx.storage);
    await pruneRegistration(this.ctx.storage, Date.now(), (at) => this.ctx.storage.setAlarm(at));
  }
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handle(request, env, fetch, ctx),
};
