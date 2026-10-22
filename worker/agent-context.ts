import { GitHub, HttpError } from "./github";
import type { AgentCommand } from "../shared/agent";
import type { EditorContext } from "../shared/types";
import type { Env, StoredSession } from "./app";
import type { requestSummary } from "../shared/agent-requests";
import { workspaceKey, type AgentWorkspace } from "../shared/agent-command";
import { relayObjectName } from "./agent-relay";
import { AGENT_PERMISSION_LIFETIME } from "./agent-lifecycle";
import { METADATA_ROUTE, type MetadataOperation, type MetadataResult } from "./agent-metadata";


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
  deadline?: number,
) =>
  durable(env, `agent:${id}`).fetch(
    new Request("https://session.internal/", {
      method,
      headers: deadline === undefined ? undefined : { "X-Agent-Deadline": String(deadline) },
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
 * lasting 8 hours or until that session ends if sooner, and lists it in the session's hub.
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
  const expiresAt = Math.min(input.expiresAt, createdAt + AGENT_PERMISSION_LIFETIME);
  const record: AgentGrant = { kind: "agent", ...input, expiresAt, generation: 1, createdAt };
  const listed: HubGrant = {
    id,
    repoId: input.repoId,
    repo: input.repo,
    branch: input.branch,
    generation: 1,
    ...(input.approval ? { approval: input.approval } : {}),
    via: input.via,
    ...(input.client ? { client: input.client } : {}),
    createdAt,
  };
  const deadline = await reserveGrant(env, id, record, listed);
  try {
    const saved = await agentRecord(env, id, "PUT", record, deadline);
    if (!saved.ok) throw new HttpError(503, "The agent connection could not be saved. Try again.");
    await operateHub(env, input.sessionId, {
      type: "add-grant", hub: { login: input.login, expiresAt: input.expiresAt }, grant: listed, deadline,
    });
  } catch (error) {
    // A rejected response may have followed a committed write. Release only
    // after deletion succeeds or a read proves absence; unknown stays counted.
    await discardGrant(env, id, record);
    throw error;
  }
  const finalized = await finishGrant(env, id, record);
  if (finalized === false || finalized === undefined && Date.now() >= deadline) {
    await discardGrant(env, id, record);
    throw new HttpError(503, "The agent connection could not be saved. Try again.");
  }
  return { id, token, expiresAt };
}

const grantWorkspace = (grant: Pick<AgentGrant, "login" | "repoId" | "branch">): AgentWorkspace =>
  ({ account: grant.login, repoId: grant.repoId, branch: grant.branch });

async function metadata(env: Env, grant: Pick<AgentGrant, "login" | "repoId" | "branch">,
  action: MetadataOperation): Promise<MetadataResult> {
  try {
    const workspace = grantWorkspace(grant);
    const response = await durable(env, await relayObjectName(workspace)).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
      method: "POST", body: JSON.stringify({ ...action, workspace: workspaceKey(workspace) }),
    }));
    if (!response.ok) throw new Error("Ledger unavailable");
    return await response.json() as MetadataResult;
  } catch {
    throw new HttpError(503, "Agent connection capacity could not be checked. Try again.");
  }
}

/** Reserve every byte before allocating a grant. Reserve maximum first-use
 * client/usedAt growth and numeric generation growth for subsequent rebinds.
 */
async function reserveGrant(env: Env, id: string, grant: AgentGrant, listed: HubGrant) {
  const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  // A repository can be renamed without changing workspace identity. Leave
  // room for GitHub's full owner/repository name as well as numeric growth.
  const repo = "\ud800".repeat(Math.max(140, grant.repo.length));
  const grown = { ...listed, repo, generation: Number.MAX_SAFE_INTEGER, usedAt: Number.MAX_SAFE_INTEGER,
    client: "\ud800".repeat(100) };
  const bytes = size({ ...grant, repo, generation: Number.MAX_SAFE_INTEGER }) + Math.max(size(listed), size(grown));
  const action = { action: "reserve" as const, id, sessionId: grant.sessionId, generation: grant.generation, bytes, expiresAt: grant.expiresAt };
  let result = await metadata(env, grant, action);
  if (result.reason === "connections" || result.reason === "bytes") {
    await reconcileGrants(env, grant, result.entries);
    result = await metadata(env, grant, action);
  }
  if (!result.allowed) {
    if (result.reason === "cleaned") throw new HttpError(401, "This connection was cleaned up. Connect the agent again.");
    if (result.reason === "connections") throw new HttpError(409,
      "This site already has 5 agent connections on this branch. Disconnect one in the editor's agent menu first.");
    if (result.reason === "bytes") throw new HttpError(409,
      "This site's agent connections have reached the 64 KiB metadata limit on this branch. Disconnect one in the editor's agent menu first.");
    throw new HttpError(503, "Agent connection capacity could not be checked. Try again.");
  }
  const entry = result.entries.find(entry => entry.id === id);
  if (!entry || entry.generation !== grant.generation) throw new HttpError(503, "Agent connection capacity could not be checked. Try again.");
  return entry.state === "pending" ? entry.at + 60_000 : Date.now() + 60_000;
}

async function finishGrant(env: Env, id: string, grant: AgentGrant) {
  // Pending and final both count. An unavailable finalize cannot free capacity.
  const result = await metadata(env, grant, { action: "finalize", id, generation: grant.generation }).catch(() => undefined);
  return result ? result.allowed && result.entries.some(entry => entry.id === id && entry.generation === grant.generation) : undefined;
}
async function releaseGrant(env: Env, id: string, grant: Pick<AgentGrant, "login" | "repoId" | "branch" | "generation">) {
  await metadata(env, grant, { action: "release", id, generation: grant.generation });
}
async function removeHubGrant(env: Env, sessionId: string, id: string, generation?: number) {
  try { await operateHub(env, sessionId, { type: "remove-grant", id, generation }); return true; }
  catch {
    // getHub intentionally hides failed reads; accounting needs a definite 404.
    try {
      const response = await durable(env, `agent-hub:${sessionId}`).fetch(new Request("https://session.internal/?context=0"));
      return response.status === 404;
    } catch { return false; }
  }
}
async function discardGrant(env: Env, id: string, grant: AgentGrant) {
  try {
    const deleted = await agentRecord(env, id, "DELETE");
    if (!deleted.ok && deleted.status !== 404 && (await agentRecord(env, id)).status !== 404) return;
    if (await removeHubGrant(env, grant.sessionId, id)) await releaseGrant(env, id, grant);
  } catch { /* Reconciliation retains unknown outcomes. */ }
}

/** Creation-only crash recovery. Failed reads retain their reservations. An
 * unlisted record is deleted before release, so it cannot become usable later.
 */
async function reconcileGrants(env: Env, workspace: AgentGrant, entries: MetadataResult["entries"]) {
  for (const entry of entries) {
    if (entry.state === "pending" && entry.at + 60_000 > Date.now()) continue;
    try {
      const response = await agentRecord(env, entry.id);
      if (response.status === 404) {
        // Record absence alone does not account for retained hub metadata.
        if (await removeHubGrant(env, entry.sessionId, entry.id, entry.generation))
          await metadata(env, workspace, { action: "release", id: entry.id, generation: entry.generation, expected: entry });
        continue;
      }
      if (!response.ok) continue;
      const grant = await response.json() as AgentGrant;
      if (grant.kind !== "agent") continue;
      const hubResponse = await durable(env, `agent-hub:${grant.sessionId}`).fetch(new Request("https://session.internal/?context=0"));
      if (!hubResponse.ok && hubResponse.status !== 404) continue;
      const hub = hubResponse.ok ? await hubResponse.json() as AgentHub : undefined;
      const listed = hub?.grants?.find(item => item.id === entry.id);
      const scope = workspaceKey(grantWorkspace(workspace));
      if (hub && listed && listed.generation > grant.generation) {
        // The hub fence precedes the record PUT. The destination's reservation
        // covers both records, so the source can release without deleting either.
        if (workspaceKey({ account: hub.login, repoId: listed.repoId, branch: listed.branch }) !== scope) {
          await metadata(env, workspace, { action: "release", id: entry.id, generation: entry.generation, expected: entry });
          continue;
        }
        // Here we are the destination. Its deadlined PUT can still complete
        // during grace; after grace cleanup below prevents an orphaned fence.
        if (entry.at + 60_000 > Date.now()) continue;
      } else if (workspaceKey(grantWorkspace(grant)) !== scope) {
        await metadata(env, workspace, { action: "release", id: entry.id, generation: entry.generation, expected: entry });
        continue;
      }
      const sessionResponse = await durable(env, grant.sessionId).fetch(new Request("https://session.internal/"));
      if (!sessionResponse.ok && sessionResponse.status !== 404) continue;
      const session = sessionResponse.ok ? await sessionResponse.json() as StoredSession : undefined;
      if (session?.kind === "user" && session.login === grant.login && session.expiresAt > Date.now() &&
          hub?.kind === "agent-hub" && hub.expiresAt > Date.now() && listed && listed.repoId === grant.repoId &&
          listed.repo === grant.repo && listed.branch === grant.branch && listed.generation === grant.generation) {
        await finishGrant(env, entry.id, grant);
        continue;
      }
      // Conditional deletion protects a concurrently rebound record. A changed
      // record stays counted until the next capacity reconciliation.
      const deleted = await durable(env, `agent:${entry.id}`).fetch(new Request("https://session.internal/", {
        method: "DELETE", headers: { "X-Agent-Delete": await tokenId(JSON.stringify(grant)) },
      }));
      if (!deleted.ok && deleted.status !== 404) continue;
      if (await removeHubGrant(env, grant.sessionId, entry.id, listed?.generation ?? entry.generation))
        await metadata(env, workspace, { action: "release", id: entry.id, generation: entry.generation, expected: entry });
    } catch { /* Unknown is never zero. */ }
  }
}

/** Fence the hub only after the destination accepts the connection. Failure
 * leaves the old reservation counted; reconciliation repairs either side.
 */
export async function rebindGrant(env: Env, id: string, previous: AgentGrant, target: Pick<AgentGrant, "repoId" | "repo" | "branch">) {
  const sourceIsLive = async () => (await metadata(env, previous, { action: "finalize", id, generation: previous.generation })).allowed;
  if (!await sourceIsLive()) throw new HttpError(401, "This connection was cleaned up. Connect the agent again.");
  const hub = await getHub(env, previous.sessionId);
  const listed = hub?.grants.find(item => item.id === id);
  if (!listed) throw new HttpError(409, "This connection was removed. Connect the agent again.");
  const grant = { ...previous, ...target, generation: previous.generation + 1 };
  delete grant.approval;
  const next = { ...listed, ...target, generation: grant.generation };
  delete next.approval;
  const deadline = await reserveGrant(env, id, grant, next);
  // Hash, serialize and construct the request before advancing the hub. Raw
  // Unicode JSON is not a valid header value; local preparation must not throw
  // after fencing and leave the record on the old generation.
  const record = durable(env, `agent:${id}`);
  const write = new Request("https://session.internal/", {
    method: "PUT", headers: { "X-Agent-Previous": await tokenId(JSON.stringify(previous)), "X-Agent-Deadline": String(deadline) }, body: JSON.stringify(grant),
  });
  if (!await sourceIsLive()) throw new HttpError(401, "This connection was cleaned up. Connect the agent again.");
  await operateHub(env, previous.sessionId, { type: "rebind-grant", id, ...target,
    generation: grant.generation, previous: previous.generation, deadline });
  const saved = await record.fetch(write);
  if (!saved.ok) throw new HttpError(503, "The connection could not be rebound. Connect the agent again.");
  const finalized = await finishGrant(env, id, grant);
  // An unanswered final check counts as cleaned: compensation runs rather than leave
  // the destination generation authorized on an unknown source state.
  if (finalized === false || finalized === undefined && Date.now() >= deadline || !await sourceIsLive().catch(() => false)) {
    // Cleanup may have fenced the source or destination while this write was in
    // flight. Never report a successful rebind or leave this generation usable:
    // removing the hub entry denies authentication first (as revoke does), so a
    // failed record deletion cannot leave the token working. Either step alone
    // denies; the reservation is released only when both are definite.
    const removed = await removeHubGrant(env, grant.sessionId, id, grant.generation);
    const deleted = await record.fetch(new Request("https://session.internal/", {
      method: "DELETE", headers: { "X-Agent-Delete": await tokenId(JSON.stringify(grant)) },
    })).catch(() => undefined);
    if (removed && (deleted?.ok || deleted?.status === 404)) await releaseGrant(env, id, grant).catch(() => undefined);
    throw new HttpError(401, "This connection was cleaned up. Connect the agent again.");
  }
  if (workspaceKey(grantWorkspace(previous)) !== workspaceKey(grantWorkspace(grant)))
    await releaseGrant(env, id, previous).catch(() => undefined);
  return grant;
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
  const response = await agentRecord(env, id);
  if (!response.ok && response.status !== 404) throw new HttpError(503, "The connection could not be disconnected. Try again.");
  const grant = response.ok ? await response.json() as AgentGrant : undefined;
  if (grant && grant.sessionId !== sessionId) throw new HttpError(403, "This connection belongs to another editor session.");
  const hub = await getHub(env, sessionId);
  const listed = hub?.grants.find(item => item.id === id);
  const workspace = grant ?? (listed && hub ? { login: hub.login, repoId: listed.repoId, branch: listed.branch, generation: listed.generation } : undefined);
  // Authentication consults the hub: deny before awaiting physical deletion.
  const removed = await removeHubGrant(env, sessionId, id);
  const deleted = await agentRecord(env, id, "DELETE").catch(() => undefined);
  const absent = deleted?.ok || deleted?.status === 404;
  if (!removed && !absent) throw new HttpError(503, "The connection could not be disconnected. Try again.");
  if (absent && removed && workspace?.branch) await releaseGrant(env, id, workspace).catch(() => undefined);
}

/**
 * Sign-out: end the session, delete every listed grant record and its separate
 * hub, then release each definitely deleted grant's workspace reservation. 3 + 2n
 * calls, without a full revoke per grant; unknown outcomes stay counted.
 */
export async function endSessionGrants(env: Env, sessionId: string, endSession: () => Promise<unknown>) {
  // The session is the authentication fence, even if later reads or deletion fail.
  await endSession();
  const hub = await getHub(env, sessionId).catch(() => undefined);
  const deleted: HubGrant[] = [];
  for (const grant of hub?.grants ?? []) {
    try {
      const response = await agentRecord(env, grant.id, "DELETE");
      if (response.ok || response.status === 404) deleted.push(grant);
    } catch { /* Unknown stays counted. */ }
  }
  try {
    const response = await durable(env, `agent-hub:${sessionId}`).fetch(new Request("https://session.internal/", { method: "DELETE" }));
    if (!response.ok && response.status !== 404) return;
  } catch { return; /* Logout still succeeds; uncertain hub deletion stays counted. */ }
  for (const grant of deleted)
    await releaseGrant(env, grant.id, { login: hub!.login, repoId: grant.repoId, branch: grant.branch, generation: grant.generation }).catch(() => undefined);
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

/** Internal hub route that removes its temporary agent data (worker/index.ts). */
export const TEMPORARY_ROUTE = "/agent-temporary";
/** After the disconnect grace: each listed session's hub drops its temporary agent data.
 * Grants stay. Returns whether every hub answered; unanswered ones are retried. */
export async function clearTemporaryData(env: Env, sessionIds: string[]) {
  let cleared = true;
  for (const sessionId of new Set(sessionIds)) {
    try {
      const response = await durable(env, `agent-hub:${sessionId}`).fetch(new Request(`https://session.internal${TEMPORARY_ROUTE}`, { method: "POST" }));
      if (!response.ok) cleared = false;
    } catch { cleared = false; }
  }
  return cleared;
}
