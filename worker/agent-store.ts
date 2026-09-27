// The agent hub's storage in its Durable Object (worker/index.ts; the
// browser tests' fake server runs the same code): the hub under "session",
// the context the tab last shared under "context", and draft texts by
// content hash under "draft:<hash>" (UTF-8 bytes), listed with their sizes
// under "drafts". A hub operation rewrites only the small hub, and each
// draft is limited on its own (AGENT_TEXT_LIMIT), not by how many there are.
import { AGENT_TEXT_LIMIT, textHash } from "../shared/agent";
import type { EditorContext } from "../shared/types";
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

// All of a hub's draft texts together; past it the tab's uploads are refused.
const DRAFTS_TOTAL = 256 * 1024 * 1024;
// Keys per storage call (Durable Objects take at most 128).
const BATCH = 100;
const draftKey = (hash: string) => `draft:${hash}`;
const failed = (error: unknown) =>
  Response.json(
    { error: error instanceof HttpError ? error.message : "Agent operation failed." },
    { status: error instanceof HttpError ? error.status : 500 },
  );

async function liveHub(storage: HubStorage) {
  const stored = await storage.get<AgentHub>("session");
  return stored?.kind === "agent-hub" && stored.expiresAt > Date.now() ? stored : undefined;
}
// A hub stored before the context went apart holds it inline.
const storedContext = async (storage: HubStorage, hub: AgentHub) =>
  hub.context ?? (await storage.get<EditorContext>("context"));
/** The draft texts the context names without holding them inline. */
const wantedTexts = (context: EditorContext | undefined) =>
  new Set((context?.drafts ?? []).flatMap((draft) => (draft.hash && draft.content === undefined && !draft.deleted ? [draft.hash] : [])));

/**
 * Drops the texts nothing needs now (not in the context, nor a pending
 * change's), and returns the ones the context needs that are not stored.
 */
async function collect(storage: HubStorage, hub: AgentHub, context: EditorContext | undefined) {
  const index = (await storage.get<Index>("drafts")) ?? {};
  const wanted = wantedTexts(context);
  const keep = new Set(wanted);
  for (const command of hub.commands ?? []) if (command.state === "pending" && command.contentHash) keep.add(command.contentHash);
  const drop = Object.keys(index).filter((hash) => !keep.has(hash));
  for (const hash of drop) delete index[hash];
  for (let at = 0; at < drop.length; at += BATCH) await storage.delete(drop.slice(at, at + BATCH).map(draftKey));
  if (drop.length) await storage.put({ drafts: index });
  return [...wanted].filter((hash) => !(hash in index));
}

/** Removes the hub and all it stored (the session ended, or the hub expired). */
export async function clearHub(storage: HubStorage) {
  const index = (await storage.get<Index>("drafts")) ?? {};
  const keys = ["session", "context", "drafts", ...Object.keys(index).map(draftKey)];
  for (let at = 0; at < keys.length; at += BATCH) await storage.delete(keys.slice(at, at + BATCH));
}

/**
 * One hub operation (worker/agent-operations.ts), run inside the Durable
 * Object's concurrency block. A queued change's text is stored by its hash;
 * `context` answers which draft texts the tab still has to send.
 */
export async function hubOperation(storage: HubStorage, action: any, setAlarm: (at: number) => Promise<void>) {
  let hub = await liveHub(storage);
  if (!hub) {
    hub = newHub(action);
    if (!hub) return Response.json({ error: "Agent connection expired." }, { status: 401 });
    await clearHub(storage);
    await setAlarm(hub.expiresAt);
  }
  const type = action?.type;
  const inline = hub.context !== undefined;
  try {
    // Only these read the context; the rest leave it stored as it is.
    if (type === "queue" || type === "pause") hub.context = await storedContext(storage, hub);
    let text: { hash: string; bytes: Uint8Array } | undefined;
    const command = type === "queue" ? action.command : undefined;
    if (typeof command?.content === "string" && command.content) {
      const bytes = new TextEncoder().encode(command.content);
      if (bytes.length > AGENT_TEXT_LIMIT) throw new HttpError(413, `Drafts hold text files up to ${AGENT_TEXT_LIMIT / 1024 / 1024} MB.`);
      text = { hash: await textHash(command.content), bytes };
      command.contentHash = text.hash;
      command.content = "";
    }
    let result: object = agentOperation(hub, action);
    const context = hub.context;
    delete hub.context;
    const puts: Record<string, unknown> = { session: hub };
    if (text) {
      const index = (await storage.get<Index>("drafts")) ?? {};
      if (!(text.hash in index)) {
        index[text.hash] = text.bytes.length;
        puts[draftKey(text.hash)] = text.bytes;
        puts.drafts = index;
      }
    }
    const shared = type === "context" || type === "pause";
    if (shared || inline) {
      if (context) puts.context = context;
      else await storage.delete(["context"]);
    }
    await storage.put(puts);
    if (shared) result = { ...result, missing: await collect(storage, hub, context) };
    return Response.json(result);
  } catch (error) {
    return failed(error);
  }
}

/** Stores the draft texts (checked against their hashes) the current context needs. */
export async function storeDrafts(storage: HubStorage, texts: { hash: string; content: string }[]) {
  const hub = await liveHub(storage);
  if (!hub) return Response.json({ error: "Agent connection expired." }, { status: 401 });
  const wanted = wantedTexts(await storedContext(storage, hub));
  const index = (await storage.get<Index>("drafts")) ?? {};
  let total = Object.values(index).reduce((sum, size) => sum + size, 0);
  let stored = 0,
    full = false,
    puts: Record<string, unknown> = {};
  for (const { hash, content } of texts) {
    if (!wanted.has(hash) || hash in index) continue;
    const bytes = new TextEncoder().encode(content);
    if (bytes.length > AGENT_TEXT_LIMIT || total + bytes.length > DRAFTS_TOTAL) {
      full = true;
      continue;
    }
    index[hash] = bytes.length;
    total += bytes.length;
    puts[draftKey(hash)] = bytes;
    stored++;
    // Each batch lists what it stores, so the index never names a missing text.
    if (Object.keys(puts).length >= BATCH) {
      await storage.put({ ...puts, drafts: index });
      puts = {};
    }
  }
  if (Object.keys(puts).length) await storage.put({ ...puts, drafts: index });
  return Response.json({ stored, ...(full ? { full: true } : {}) });
}

/** A stored draft text, by hash. */
export async function readDraft(storage: HubStorage, hash: string) {
  const bytes = /^[a-f0-9]{64}$/.test(hash) ? await storage.get<Uint8Array>(draftKey(hash)) : undefined;
  return bytes ? new Response(bytes, { headers: { "Content-Type": "text/plain; charset=utf-8" } }) : new Response(null, { status: 404 });
}

/**
 * The hub as read: with its context (unless `context=0`), and with
 * `texts=1` each pending change's text filled in, for the tab to apply.
 */
export async function hubView(storage: HubStorage, hub: AgentHub, url: URL): Promise<AgentHub> {
  const view: AgentHub = { ...hub };
  if (url.searchParams.get("context") === "0") delete view.context;
  else view.context = await storedContext(storage, hub);
  if (url.searchParams.get("texts") === "1" && hub.commands) {
    const commands = [];
    for (const command of hub.commands) {
      if (command.state !== "pending" || !command.contentHash) {
        commands.push(command);
        continue;
      }
      const bytes = await storage.get<Uint8Array>(draftKey(command.contentHash));
      // A change whose text is gone is not offered (never applied as empty).
      if (bytes) commands.push({ ...command, content: new TextDecoder().decode(bytes) });
    }
    view.commands = commands;
  }
  return view;
}
