import { GitHub, HttpError } from "./github";
import type { AgentCommand } from "../shared/agent";
import type { EditorContext } from "../shared/types";
import type { Env, StoredSession } from "./app";
import type { requestSummary } from "../shared/agent-requests";


/**
 * One agent connection: a bearer token (copied from the editor, or issued by
 * the OAuth token endpoint) scoped to one signed-in editor session. It works
 * on one repository and branch, until explicitly rebound. Stored under the SHA-256 of
 * the token; the token itself is never stored.
 */
export interface AgentGrant {
  kind: "agent";
  sessionId: string;
  login: string;
  repoId: number;
  repo: string;
  branch: string;
  generation: number;
  expiresAt: number;
  via?: "token" | "oauth";
  /** The OAuth client's name, as it registered. */
  client?: string;
  approval?: string;
  createdAt?: number;
  /** Older records only; the hub records the first use (`markGrantUsed`). */
  usedAt?: number;
}
/** A connection as the editor tab lists it. */
export interface HubGrant {
  id: string;
  repoId: number;
  repo: string;
  branch: string;
  generation: number;
  via: "token" | "oauth";
  client?: string;
  approval?: string;
  createdAt: number;
  usedAt?: number;
}
/**
 * Grant metadata for the agents of one editor session. One
 * Durable Object per session (`agent-hub:<session id>`), so a connection
 * made by OAuth reaches the open tab without the tab knowing its token.
 * Optional content fields describe legacy records only; no writer creates them.
 */
export interface AgentHub {
  kind: "agent-hub";
  login: string;
  expiresAt: number;
  grants: HubGrant[];
  context?: EditorContext;
  updatedAt?: number;
  /** Legacy sharing tab; live ownership is fenced in the browser. */
  tabId?: string;
  commands?: AgentCommand[];
  /** Legacy request summaries; grant reads never load them. */
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
    branch: string;
    approval?: string;
    expiresAt: number;
    via: "token" | "oauth";
    client?: string;
  },
) {
  const token = `ase_${randomHex()}`;
  const id = await tokenId(token);
  const createdAt = Date.now();
  await agentRecord(env, id, "PUT", { kind: "agent", ...input, generation: 1, createdAt });
  await operateHub(env, input.sessionId, {
    type: "add-grant",
    hub: { login: input.login, expiresAt: input.expiresAt },
    grant: {
      id,
      repoId: input.repoId,
      repo: input.repo,
      branch: input.branch,
      generation: 1,
      ...(input.approval ? { approval: input.approval } : {}),
      via: input.via,
      ...(input.client ? { client: input.client } : {}),
      createdAt,
    },
  });
  return { id, token };
}
/**
 * Records a connection's first use in the session's hub, and the MCP client's
 * name when a token connection brings one, so the editor can show the agent
 * as connected. `hub` is the hub as this request read it: nothing to do when
 * it lists the connection as used already (or not at all). The hub is the
 * only record of the first use, so a failed step leaves it unused and the
 * next request tries again; `use-grant` keeps the first time and client, and
 * the grant record is never written here, so a revoked one stays gone.
 */
export async function markGrantUsed(
  env: Env,
  id: string,
  grant: AgentGrant,
  hub: AgentHub | undefined,
  client?: string,
) {
  const listed = hub?.grants.find((item) => item.id === id);
  if (!listed || listed.usedAt) return;
  const name = typeof client === "string"
    ? client.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 100)
    : "";
  const named = grant.client ?? (name || undefined);
  await operateHub(env, grant.sessionId, { type: "use-grant", id, usedAt: Date.now(), client: named });
}
export async function revokeGrant(env: Env, id: string, sessionId: string) {
  await agentRecord(env, id, "DELETE");
  await operateHub(env, sessionId, { type: "remove-grant", id }).catch(
    () => undefined,
  );
}

/** The session's grant metadata, with all legacy content reads disabled. */
export async function getHub(env: Env, sessionId: string): Promise<AgentHub | undefined> {
  const response = await durable(env, `agent-hub:${sessionId}`).fetch(
    new Request("https://session.internal/?context=0"),
  );
  if (!response.ok) return undefined;
  const hub = (await response.json()) as AgentHub;
  return hub.kind === "agent-hub" && hub.expiresAt > Date.now() ? hub : undefined;
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

/** Git branch names accepted by connection and consent forms. */
export function validAgentBranch(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value !== "@" && !/[\\\s\x00-\x1f\x7f~^:?*\[]/.test(value) &&
    !value.includes("..") && !value.includes("@{") && !value.endsWith(".") &&
    !value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")) &&
    !value.startsWith("-");
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
  if (!grant.branch)
    throw new HttpError(401, "This connection was made before connections were tied to one branch; connect the agent again.");
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
  // Authorize the pinned repository with a listing at most one minute old.
  // Reading the grant, sign-in session and hub still costs exactly three DO calls.
  const github = new GitHub(session.token, fetcher);
  const hub = await getHub(env, grant.sessionId);
  const listed = hub?.grants.find((item) => item.id === id);
  if (!listed || listed.repoId !== grant.repoId || listed.repo !== grant.repo ||
      listed.branch !== grant.branch || listed.generation !== grant.generation)
    throw new HttpError(401, "This connection changed or was revoked. Connect the agent again.");
  const repo = await github.authorizeRepository(
    session.login,
    grant.repo,
    agentAuthorizationMaxAge,
  );
  if (repo.id !== grant.repoId)
    throw new HttpError(403, "Repository access changed. Reconnect the agent.");
  const workspace = { account: grant.login, repoId: grant.repoId, repo: grant.repo, branch: grant.branch };
  return { grant, github, repo, id, hub, workspace };
}
