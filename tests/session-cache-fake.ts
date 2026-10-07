import type { StoredSession } from "../worker/app";

/** The repository-cache route shared by lightweight session-store fixtures. */
export async function repositoryCacheRequest(request: Request, records: Map<string, StoredSession>, id: string): Promise<Response | undefined> {
  if (new URL(request.url).pathname !== "/repository-cache") return;
  const session = records.get(id);
  if (request.method === "DELETE") {
    if (session?.kind === "user") {
      delete session.repositoryCache;
      session.repositoryCacheGeneration = (session.repositoryCacheGeneration ?? 0) + 1;
    }
  } else {
    const { token, generation, value } = await request.json() as any;
    if (!session || session.kind !== "user" || session.token !== token || session.expiresAt <= Date.now()) return new Response(null, { status: 401 });
    if (generation === (session.repositoryCacheGeneration ?? 0)) session.repositoryCache = value ?? undefined;
  }
  return new Response(null, { status: 204 });
}
