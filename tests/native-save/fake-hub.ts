// Mirrors worker/index.ts: read JSON first, then serialize hub writes per object.
import { hubOperation, readDraft, storeDrafts, type HubStorage } from "../../worker/agent-store.ts";

const pending = new Map<string, Promise<void>>();

async function serialize(id: string, operation: () => Promise<Response>) {
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
  if (url.pathname === "/agent-operation") {
    const action = await request.json();
    return serialize(id, () => hubOperation(storage, action, async () => undefined));
  }
  if (url.pathname === "/agent-drafts" && request.method === "POST") {
    const texts = await request.json() as { hash: string; content: string }[];
    return serialize(id, () => storeDrafts(storage, texts));
  }
  if (url.pathname === "/agent-draft")
    return readDraft(storage, url.searchParams.get("hash") ?? "");
  return undefined;
}
