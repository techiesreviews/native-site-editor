import { agentOperation } from "./agent-operations";
import { HttpError } from "./github";
import { DurableObject } from "cloudflare:workers";
import { handle, type Env, type StoredSession, type StoredValue } from "./app";
import type { GitHubAppConfig } from "./owner-setup";

export class SessionStore extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const storage = this.ctx.storage;
    if (new URL(request.url).pathname === "/agent-operation") {
      return this.ctx.blockConcurrencyWhile(async () => {
        const value = await storage.get<StoredSession>("session");
        if (value?.kind !== "agent" || value.expiresAt <= Date.now())
          return Response.json(
            { error: "Agent connection expired." },
            { status: 401 },
          );
        try {
          const result = await agentOperation(value, await request.json());
          await storage.put("session", value);
          return Response.json(result);
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof HttpError
                  ? error.message
                  : "Agent operation failed.",
            },
            { status: error instanceof HttpError ? error.status : 500 },
          );
        }
      });
    }
    if (request.method === "PUT") {
      if (new URL(request.url).pathname === "/config") {
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
      await storage.delete("session");
      await storage.deleteAlarm();
      return new Response(null, { status: 204 });
    }
    const read = async () => {
      if (new URL(request.url).pathname === "/config") {
        const value = await storage.get<GitHubAppConfig>("config");
        return value ? Response.json(value) : new Response(null, { status: 404 });
      }
      const value = await storage.get<StoredValue>("session");
      if (!value || value.expiresAt <= Date.now())
        return new Response(null, { status: 404 });
      if (new URL(request.url).pathname === "/consume")
        await storage.delete("session");
      return Response.json(value);
    };
    return this.ctx.blockConcurrencyWhile(read);
  }
  async alarm() {
    await this.ctx.storage.delete("session");
  }
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
