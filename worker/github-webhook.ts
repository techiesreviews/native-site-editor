// GitHub pushes reach open tabs (ticket am-32; ADR 0003, decision 5). The
// GitHub App's push webhook comes here; a delivery whose signature this
// Worker's webhook secret does not prove is refused. A signed push tells the
// live rooms of its repository and branch "the branch is now at commit X",
// and each open tab reads the files again with its own sign-in. Nothing from
// the delivery is stored, and no file content passes through the relay.

import { LiveRooms, liveRoomObjectName } from "./agent-relay";
import { validAgentBranch } from "./agent-context";
import { HttpError } from "./github";
import { readBoundedBytes } from "./http";
import { configuredApp } from "./owner-setup";
import type { Env } from "./app";

/** Where the App's webhook points: the editor's own origin (README, "Push notices for an existing App"). */
export const GITHUB_WEBHOOK_PATH = "/api/github/webhook";
/** GitHub caps a delivery's payload at 25 MB. */
const DELIVERY_LIMIT = 25 * 1024 * 1024;
const COMMIT = /^[a-f\d]{40}$/;
const NO_COMMIT = "0".repeat(40);

/** The secret deliveries are signed with: the Worker secret GITHUB_WEBHOOK_SECRET when set, else the one GitHub
 * returned when owner setup created the App (worker/owner-setup.ts). None: every delivery is refused. */
export async function webhookSecret(env: Env): Promise<string | undefined> {
  if (env.GITHUB_WEBHOOK_SECRET) return env.GITHUB_WEBHOOK_SECRET;
  return (await configuredApp(env))?.webhookSecret || undefined;
}

/** Whether `signature` (the X-Hub-Signature-256 header, `sha256=` and 64 hex digits) is the HMAC-SHA256 of `body`
 * under `secret`. crypto.subtle.verify compares in constant time. */
export async function signedBy(secret: string, body: Uint8Array<ArrayBuffer>, signature: string | null): Promise<boolean> {
  const hex = /^sha256=([a-f\d]{64})$/i.exec(signature ?? "")?.[1];
  if (!hex) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const expected = Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
  return crypto.subtle.verify("HMAC", key, expected, body);
}

/** A push's branch and new commit, or undefined for what tabs need not hear: a tag, a deleted branch, a malformed payload. */
export function readPush(payload: unknown): { repoId: number; branch: string; commit: string } | undefined {
  const value = payload as { ref?: unknown; after?: unknown; deleted?: unknown; repository?: { id?: unknown } } | null;
  if (!value || typeof value !== "object" || value.deleted === true) return undefined;
  const ref = typeof value.ref === "string" && value.ref.startsWith("refs/heads/") ? value.ref.slice("refs/heads/".length) : undefined;
  const repoId = value.repository?.id;
  if (!validAgentBranch(ref) || typeof value.after !== "string" || !COMMIT.test(value.after) || value.after === NO_COMMIT ||
    typeof repoId !== "number" || !Number.isSafeInteger(repoId) || repoId <= 0) return undefined;
  return { repoId, branch: ref, commit: value.after };
}

/**
 * POST /api/github/webhook. Answers 401 to a delivery the secret does not prove (or when there is no secret), 204 to a
 * signed event tabs need not hear (`ping`, a tag), and 200 with `{ told }`, the number of open tab sockets on that branch
 * told of the push. A replayed signed delivery only has those tabs check the branch head again.
 */
export async function githubWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") throw new HttpError(405, "Use POST.");
  const secret = await webhookSecret(env);
  if (!secret) throw new HttpError(401, "This editor has no webhook secret, so it refuses every delivery.");
  const body = await readBoundedBytes(request, DELIVERY_LIMIT) as Uint8Array<ArrayBuffer>;
  if (!await signedBy(secret, body, request.headers.get("X-Hub-Signature-256")))
    throw new HttpError(401, "This delivery is not signed with the editor's webhook secret.");
  if (request.headers.get("X-GitHub-Event") !== "push") return new Response(null, { status: 204 });
  // GitHub signs the body as sent: JSON, or (the App's other content type) a form whose `payload` field holds the JSON.
  const text = new TextDecoder().decode(body);
  let payload: unknown;
  try {
    payload = JSON.parse(request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")
      ? new URLSearchParams(text).get("payload") ?? "" : text);
  } catch { throw new HttpError(400, "The push payload is not JSON."); }
  const push = readPush(payload);
  if (!push) return new Response(null, { status: 204 });
  const room = env.SESSIONS.get(env.SESSIONS.idFromName(await liveRoomObjectName(push.repoId, push.branch)));
  const told = await room.fetch(new Request("https://session.internal/live/pushed", {
    method: "POST", headers: { [LiveRooms.identityHeader]: JSON.stringify({ commit: push.commit }) },
  }));
  if (!told.ok) throw new HttpError(502, "Open tabs could not be told of the push.");
  return Response.json(await told.json());
}
