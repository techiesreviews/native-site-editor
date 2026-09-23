import { agentOperation } from "./agent-operations";
import { HttpError } from "./github";
import { DurableObject } from "cloudflare:workers";
import { handle, type Env, type StoredSession } from "./app";

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
      const value = (await request.json()) as StoredSession;
      await storage.put("session", value);
      await storage.setAlarm(value.expiresAt);
      return new Response(null, { status: 204 });
    }
    if (request.method === "DELETE") {
      await storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    const read = async () => {
      const value = await storage.get<StoredSession>("session");
      if (!value || value.expiresAt <= Date.now())
        return new Response(null, { status: 404 });
      if (new URL(request.url).pathname === "/consume")
        await storage.delete("session");
      return Response.json(value);
    };
    return this.ctx.blockConcurrencyWhile(read);
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
