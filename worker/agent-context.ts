import { z } from "zod";
import { GitHub, HttpError } from "./github";
import type { AgentCommand } from "../shared/agent";
import type { EditorContext } from "../shared/types";
import type { Env, StoredSession } from "./app";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
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
      }),
    )
    .max(200),
  pages: z
    .array(
      z.object({
        route: z.string().max(1024).regex(/^\/(?:[\w.-]+\/)*$/),
        file: path,
        title: z.string().max(1000).optional(),
      }),
    )
    .max(500)
    .optional(),
});
/**
 * How a native project routes its pages, for agents that add or move them.
 * Mirrors shared/native-routes.ts and docs/static-export.md.
 */
export const nativeRoutingNote =
  "Native projects (.astro-editor/native.json) route pages by file: every .html file under src/pages/ is a page at its path there (src/pages/index.html is /, src/pages/about.html and src/pages/about/index.html are /about/, src/pages/work/fern-and-kettle.html is /work/fern-and-kettle/); a file or folder named with a leading _ is not a page. native.json \"routes\" is optional: an entry keyed by route may hold only title, description and jsonLd, or map the route to a page explicitly with \"file\". Link between pages with #/route/ hrefs.";
export function validateContext(value: unknown): EditorContext {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, "Editor context is invalid or too large.");
  return result.data;
}
export interface AgentGrant {
  kind: "agent";
  sessionId: string;
  login: string;
  repoId: number;
  repo: string;
  expiresAt: number;
  context?: EditorContext;
  updatedAt?: number;
  commands?: AgentCommand[];
}
export const agentRecord = (
  env: Env,
  id: string,
  method = "GET",
  value?: AgentGrant,
) =>
  env.SESSIONS.get(env.SESSIONS.idFromName(`agent:${id}`)).fetch(
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
      "Supply the MCP token created in the editor's Agent context menu.",
    );
  const grant = await getGrant(env, await tokenId(token));
  const response = await env.SESSIONS.get(
    env.SESSIONS.idFromName(grant.sessionId),
  ).fetch(new Request("https://session.internal/"));
  const session = response.ok
    ? ((await response.json()) as StoredSession)
    : undefined;
  if (
    session?.kind !== "user" ||
    session.expiresAt <= Date.now() ||
    session.login !== grant.login
  )
    throw new HttpError(401, "The editor session ended. Reconnect the agent.");
  const github = new GitHub(session.token, fetcher);
  const repo = await github.authorizeRepository(session.login, grant.repo);
  if (repo.id !== grant.repoId)
    throw new HttpError(403, "Repository access changed. Reconnect the agent.");
  return { grant, github, repo, id: await tokenId(token) };
}

export async function operateGrant(env: Env, id: string, action: unknown) {
  const response = await env.SESSIONS.get(
    env.SESSIONS.idFromName(`agent:${id}`),
  ).fetch(
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
