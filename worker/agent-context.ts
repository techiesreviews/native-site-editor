import { z } from "zod";
import { GitHub, HttpError } from "./github";
import type { AgentCommand } from "../shared/agent";
import type { EditorContext } from "../shared/types";
import type { Env, StoredSession } from "./app";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const position = z.number().int().min(1).max(10_000_000);
const path = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      value.split("/").every((part) => part && part !== "." && part !== "..") &&
      !/[\\\u0000-\u001f]/.test(value),
  );
// `/`, `/about/`, and a single-file page's `/notes.html` or `/404.html`.
const route = z.string().max(1024).regex(/^\/(?:[\w.-]+\/)*(?:[\w.-]+\.html)?$/);
const outlineId = z.string().max(320).regex(/^\d{1,4}(?:\.\d{1,4}){0,63}$/);
const short = (max: number) => z.string().max(max);
const schema = z.object({
  repository: z.object({
    id: z.number().int().positive(),
    fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  }),
  branch: z.string().min(1).max(255),
  commit: sha,
  file: z
    .object({
      path,
      baseSha: sha.nullable(),
      language: z.string().max(64),
      readOnly: z.boolean(),
      original: z.string().max(131072),
      content: z.string().max(131072),
      selection: z
        .object({
          startLine: position,
          startColumn: position,
          endLine: position,
          endColumn: position,
        })
        .nullable(),
      diagnostics: z
        .array(
          z.object({
            severity: z.string().max(20),
            message: z.string().max(2000),
            line: position,
            column: position,
          }),
        )
        .max(50),
    })
    .nullable(),
  drafts: z
    .array(
      z.object({
        path,
        baseSha: sha.nullable(),
        updatedAt: z.number().finite(),
        hash: hash.optional(),
        content: z.string().max(131072).optional(),
        deleted: z.boolean().optional(),
        movedFrom: path.optional(),
      }),
    )
    .max(200),
  pages: z
    .array(
      z.object({
        route,
        file: path.optional(),
        title: short(1000).optional(),
        description: short(1000).optional(),
        parent: route.optional(),
        isNew: z.boolean().optional(),
      }),
    )
    .max(500)
    .optional(),
  site: z
    .object({
      openFile: path.nullable(),
      openRoute: route.nullable(),
      selection: z
        .object({ file: path, id: outlineId, tag: short(100), text: short(200) })
        .nullable(),
      components: z
        .array(
          z.object({
            tag: short(100),
            file: path,
            css: path.optional(),
            section: z.boolean(),
            slots: z.array(short(100)).max(50),
          }),
        )
        .max(300),
      stylesheets: z.array(z.object({ file: path, imports: z.array(path).max(100) })).max(50),
      settings: z.object({ file: path, name: short(200).optional(), url: short(1000).optional() }).nullable(),
      outlines: z
        .array(
          z.object({
            file: path,
            hash,
            containers: z
              .array(z.object({ id: z.string().max(320).regex(/^(?:\d{1,4}(?:\.\d{1,4}){0,63})?$/), tag: short(100), children: z.number().int().min(0).max(100_000) }))
              .max(50),
            sections: z
              .array(
                z.object({
                  id: outlineId,
                  tag: short(100),
                  component: z.boolean().optional(),
                  key: short(200).optional(),
                  heading: short(200).optional(),
                  text: short(200).optional(),
                  slots: z.record(short(100), short(200)).optional(),
                }),
              )
              .max(200),
          }),
        )
        .max(500),
      changes: z
        .array(
          z.object({
            kind: z.enum(["A", "M", "R", "D"]),
            path,
            from: path.optional(),
          }),
        )
        .max(500),
    })
    .optional(),
});
export function validateContext(value: unknown): EditorContext {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, "Editor context is invalid or too large.");
  return result.data;
}

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

export async function getHub(env: Env, sessionId: string): Promise<AgentHub | undefined> {
  const response = await durable(env, `agent-hub:${sessionId}`).fetch(
    new Request("https://session.internal/"),
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
  // The connection follows the repository the editor tab shows, rechecked
  // against the GitHub App installation on every request.
  const github = new GitHub(session.token, fetcher);
  const shown = (await getHub(env, grant.sessionId))?.context?.repository;
  const target = shown ?? { id: grant.repoId, fullName: grant.repo };
  const repo = await github.authorizeRepository(session.login, target.fullName);
  if (repo.id !== target.id)
    throw new HttpError(403, "Repository access changed. Reconnect the agent.");
  return { grant, github, repo, id };
}
