import { GitHub, HttpError } from "./github";
import { AGENT_TEXT_LIMIT, textBytes, textHash, type AgentCommand } from "../shared/agent";
import type { EditorContext } from "../shared/types";
import type { Env, StoredSession } from "./app";
import type { requestSummary } from "./agent-requests";


/**
 * One agent connection: a bearer token (copied from the editor, or issued by
 * the OAuth token endpoint) scoped to one signed-in editor session. It works
 * on the repository the session's editor tab shows; `repo` is the one it was
 * made in, used until a tab shares its context. Stored under the SHA-256 of
 * the token; the token itself is never stored.
 */
export interface AgentGrant {
  kind: "agent";
  sessionId: string;
  login: string;
  repoId: number;
  repo: string;
  expiresAt: number;
  via?: "token" | "oauth";
  /** The OAuth client's name, as it registered. */
  client?: string;
  createdAt?: number;
  /** When an agent first used the connection. */
  usedAt?: number;
}
/** A connection as the editor tab lists it. */
export interface HubGrant {
  id: string;
  repoId: number;
  repo: string;
  via: "token" | "oauth";
  client?: string;
  createdAt: number;
  usedAt?: number;
}
/**
 * Everything the agents of one editor session share: the connections, the
 * context the active editor tab last reported, and the queued commands. One
 * Durable Object per session (`agent-hub:<session id>`), so a connection
 * made by OAuth reaches the open tab without the tab knowing its token.
 * The context and draft texts are stored apart (worker/agent-store.ts).
 */
export interface AgentHub {
  kind: "agent-hub";
  login: string;
  expiresAt: number;
  grants: HubGrant[];
  context?: EditorContext;
  updatedAt?: number;
  /** The tab that reported the context; only it applies commands. */
  tabId?: string;
  commands?: AgentCommand[];
  /** The requests to agents, when read with them (worker/agent-store.ts `hubView`). */
  requests?: ReturnType<typeof requestSummary>[];
}

function durable(env: Env, name: string) {
  return env.SESSIONS.get(env.SESSIONS.idFromName(name));
}
export const agentRecord = (
  env: Env,
  id: string,
  method = "GET",
  value?: AgentGrant,
) =>
  durable(env, `agent:${id}`).fetch(
    new Request("https://session.internal/", {
      method,
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
export async function tokenId(token: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function randomHex() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function getGrant(env: Env, id: string): Promise<AgentGrant> {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new HttpError(401, "Connect this agent again in the editor.");
  const response = await agentRecord(env, id);
  if (!response.ok)
    throw new HttpError(401, "Agent connection expired or was revoked.");
  const grant = (await response.json()) as AgentGrant;
  if (grant.kind !== "agent" || grant.expiresAt <= Date.now())
    throw new HttpError(401, "Agent connection expired.");
  return grant;
}

/**
 * Issues a connection token for `repo` in the signed-in session `sessionId`,
 * lasting as long as that session, and lists it in the session's hub.
 */
export async function createGrant(
  env: Env,
  input: {
    sessionId: string;
    login: string;
    repoId: number;
    repo: string;
    expiresAt: number;
    via: "token" | "oauth";
    client?: string;
  },
) {
  const token = `ase_${randomHex()}`;
  const id = await tokenId(token);
  const createdAt = Date.now();
  await agentRecord(env, id, "PUT", { kind: "agent", ...input, createdAt });
  await operateHub(env, input.sessionId, {
    type: "add-grant",
    hub: { login: input.login, expiresAt: input.expiresAt },
    grant: {
      id,
      repoId: input.repoId,
      repo: input.repo,
      via: input.via,
      ...(input.client ? { client: input.client } : {}),
      createdAt,
    },
  });
  return { id, token };
}
/**
 * Records a connection's first use, and the MCP client's name when a token
 * connection brings one, so the editor can show the agent as connected.
 */
export async function markGrantUsed(
  env: Env,
  id: string,
  grant: AgentGrant,
  client?: string,
) {
  if (grant.usedAt) return;
  const name = typeof client === "string"
    ? client.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 100)
    : "";
  const usedAt = Date.now();
  const named = grant.client ?? (name || undefined);
  await agentRecord(env, id, "PUT", { ...grant, usedAt, ...(named ? { client: named } : {}) });
  await operateHub(env, grant.sessionId, { type: "use-grant", id, usedAt, client: named });
}
export async function revokeGrant(env: Env, id: string, sessionId: string) {
  await agentRecord(env, id, "DELETE");
  await operateHub(env, sessionId, { type: "remove-grant", id }).catch(
    () => undefined,
  );
}

/**
 * The session's hub: with the context the tab shared (unless `context` is
 * false), with `texts` each pending change's text, for the tab, and with
 * `requests` the requests to agents.
 */
export async function getHub(
  env: Env,
  sessionId: string,
  options: { context?: boolean; texts?: boolean; requests?: boolean } = {},
): Promise<AgentHub | undefined> {
  const query = `${options.context === false ? "context=0&" : ""}${options.texts ? "texts=1&" : ""}${options.requests ? "requests=1" : ""}`;
  const response = await durable(env, `agent-hub:${sessionId}`).fetch(
    new Request(`https://session.internal/?${query}`),
  );
  if (!response.ok) return undefined;
  const hub = (await response.json()) as AgentHub;
  return hub.kind === "agent-hub" && hub.expiresAt > Date.now() ? hub : undefined;
}
/** A draft's text the tab shared, by its hash; undefined when not (yet) there. */
export async function draftText(env: Env, sessionId: string, hash: string) {
  const response = await durable(env, `agent-hub:${sessionId}`).fetch(
    new Request(`https://session.internal/agent-draft?hash=${hash}`),
  );
  return response.ok ? response.text() : undefined;
}
/** Stores draft texts the tab sends, each checked against its hash. */
export async function storeDraftTexts(env: Env, sessionId: string, value: unknown) {
  const texts = (value as { texts?: unknown })?.texts;
  if (!Array.isArray(texts) || texts.length > 500)
    throw new HttpError(400, "Send at most 500 draft texts at once.");
  for (const item of texts) {
    if (typeof item?.hash !== "string" || typeof item.content !== "string")
      throw new HttpError(400, "Invalid draft text.");
    if (textBytes(item.content) > AGENT_TEXT_LIMIT)
      throw new HttpError(413, "A draft text is larger than agents can read.");
    if ((await textHash(item.content)) !== item.hash)
      throw new HttpError(400, "A draft text does not match its hash.");
  }
  const response = await durable(env, `agent-hub:${sessionId}`).fetch(
    new Request("https://session.internal/agent-drafts", {
      method: "POST",
      body: JSON.stringify(texts.map(({ hash, content }) => ({ hash, content }))),
    }),
  );
  const result: any = await response.json();
  if (!response.ok) throw new HttpError(response.status, result.error ?? "Draft texts could not be stored.");
  return result;
}
export async function operateHub(env: Env, sessionId: string, action: unknown) {
  const response = await durable(env, `agent-hub:${sessionId}`).fetch(
    new Request("https://session.internal/agent-operation", {
      method: "POST",
      body: JSON.stringify(action),
    }),
  );
  const result: any = await response.json();
  if (!response.ok)
    throw new HttpError(
      response.status,
      result.error ?? "Agent operation failed.",
    );
  return result;
}

/**
 * The hub's context when it still shows the repository the request was
 * authorized for, else nothing (sharing is paused, or the tab switched
 * repository since).
 */
export function connectionContext(
  hub: AgentHub | undefined,
  repo: { id: number; full_name: string },
) {
  const context = hub?.context;
  return context &&
    context.repository.id === repo.id &&
    context.repository.fullName === repo.full_name
    ? context
    : undefined;
}

const agentAuthorizationMaxAge = 60_000;

export async function authenticateAgent(
  request: Request,
  env: Env,
  fetcher: typeof fetch,
) {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (ase_[a-f0-9]{64})$/)?.[1];
  if (!token)
    throw new HttpError(
      401,
      "Connect with OAuth, or supply the MCP token from the editor's Connect with MCP prompt.",
    );
  const id = await tokenId(token);
  const grant = await getGrant(env, id);
  const response = await durable(env, grant.sessionId).fetch(
    new Request("https://session.internal/"),
  );
  const session = response.ok
    ? ((await response.json()) as StoredSession)
    : undefined;
  if (
    session?.kind !== "user" ||
    session.expiresAt <= Date.now() ||
    session.login !== grant.login
  )
    throw new HttpError(401, "The editor session ended. Reconnect the agent.");
  // The connection follows the repository the editor tab shows, checked
  // against the GitHub App installation with a listing at most
  // `agentAuthorizationMaxAge` old, so a burst of tool calls costs GitHub one
  // listing, not two requests each. Revoking the agent or signing out still
  // takes effect at once; removing the repository from the installation, within
  // that time.
  const github = new GitHub(session.token, fetcher);
  const shown = (await getHub(env, grant.sessionId))?.context?.repository;
  const target = shown ?? { id: grant.repoId, fullName: grant.repo };
  const repo = await github.authorizeRepository(
    session.login,
    target.fullName,
    agentAuthorizationMaxAge,
  );
  if (repo.id !== target.id)
    throw new HttpError(403, "Repository access changed. Reconnect the agent.");
  return { grant, github, repo, id };
}
