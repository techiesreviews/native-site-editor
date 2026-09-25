import { requestJson } from "./http";
import { HttpError, boundedJson } from "./github";
import type { Env, StoredValue } from "./app";

export const canonicalOrigin = "https://editor.techies.tools";
const callbackOrigins = [
  canonicalOrigin,
  "https://native-site-editor.pages.dev",
];
const configId = "native-site-editor/config";

export interface GitHubAppConfig {
  clientId: string;
  clientSecret: string;
  slug: string;
}

export interface OwnerSetupState {
  kind: "owner-setup";
  expiresAt: number;
}

export function validOwnerToken(token: string | undefined) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

export function hasOwnerSetup(env: Env) {
  return validOwnerToken(env.OWNER_SETUP_TOKEN);
}

export function githubAppManifest(origin = canonicalOrigin) {
  return {
    name: "native-site-editor-techies",
    url: origin,
    public: false,
    hook_attributes: { active: false, url: `${origin}/auth/setup/webhook` },
    redirect_url: `${origin}/auth/setup/callback`,
    callback_urls: callbackOrigins.map((value) => `${value}/auth/callback`),
    setup_url: origin,
    request_oauth_on_install: false,
    default_permissions: {
      contents: "write",
      metadata: "read",
      // The Change status after a save reads the commit's workflow runs.
      actions: "read",
    },
  };
}

export async function configuredApp(
  env: Env,
): Promise<GitHubAppConfig | null> {
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_APP_SLUG)
    return {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      slug: env.GITHUB_APP_SLUG,
    };
  const response = await env.SESSIONS.get(env.SESSIONS.idFromName(configId)).fetch(
    new Request("https://session.internal/config"),
  );
  if (!response.ok) return null;
  const value = (await response.json()) as GitHubAppConfig;
  return value.clientId && value.clientSecret && value.slug ? value : null;
}

export async function writeConfiguredApp(env: Env, value: GitHubAppConfig) {
  const response = await env.SESSIONS.get(env.SESSIONS.idFromName(configId)).fetch(
    new Request("https://session.internal/config", {
      method: "PUT",
      body: JSON.stringify(value),
    }),
  );
  if (response.status === 409)
    throw new HttpError(409, "This editor already has a GitHub App.");
  if (!response.ok)
    throw new HttpError(
      502,
      "GitHub App registration may have completed, but credentials were not saved. Do not register another App until the owner checks setup status.",
    );
}

export function ownerSetupHtml(
  origin: string,
  options: { state?: string; installUrl?: string } = {},
) {
  const manifest = githubAppManifest(origin);
  const ready = Boolean(options.state) && !options.installUrl;
  const done = Boolean(options.installUrl);
  const dashboard =
    "https://dash.cloudflare.com/b9b9a2b4c908c9d03abe92a52c2d0f43/pages/view/native-site-editor/domains";
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Native Site Editor setup</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f7f4ee;color:#1d1b18}
main{max-width:680px;margin:10vh auto;padding:32px}
button,a.button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:8px;background:#1f6feb;color:white;padding:12px 16px;text-decoration:none;font-weight:700;cursor:pointer}
.panel{background:white;border:1px solid #ded8ce;border-radius:8px;padding:20px;margin-top:18px}
.muted{color:#625d55}
[hidden]{display:none}
</style>
<main>
  <h1>Owner setup</h1>
  <p class="muted">Register the editor's private GitHub App, install it on the starter repository, then sign in.</p>
  <section id="locked" class="panel" ${ready || done ? "hidden" : ""}>
    <p id="locked-message">Open your private setup link to continue. This page alone does not grant owner access.</p>
  </section>
  <section id="ready" class="panel" ${ready ? "" : "hidden"}>
    <form method="post" action="https://github.com/settings/apps/new${options.state ? `?state=${options.state}` : ""}">
      <input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
      <button>Create GitHub App</button>
    </form>
  </section>
  <section id="done" class="panel" ${done ? "" : "hidden"}>
    <p>GitHub App saved. Install it on the starter repository, then return to the editor and sign in.</p>
    <p><a id="install" class="button" href="${options.installUrl ? escapeHtml(options.installUrl) : "#"}">Choose repositories</a></p>
    <p><a class="button" href="/auth/login">Sign in</a></p>
    <p class="muted">If editor.techies.tools is still pending, open Cloudflare Pages, choose native-site-editor, Custom domains, then confirm the CNAME.</p>
    <p><a href="${dashboard}" rel="noreferrer">Open Cloudflare custom domains</a></p>
  </section>
</main>
<script src="/auth/setup.js"></script>`;
}

export function ownerSetupJs() {
  return `(() => {
const ready = document.getElementById("ready");
const locked = document.getElementById("locked");
const lockedMessage = document.getElementById("locked-message");
const done = document.getElementById("done");
const install = document.getElementById("install");
function setupToken() {
  return location.hash.startsWith("#") ? location.hash.slice(1) : "";
}
function clearHash() {
  history.replaceState(null, "", location.pathname + location.search);
}
function showLocked(message) {
  if (message) lockedMessage.textContent = message;
  ready.hidden = true;
  locked.hidden = false;
}
async function unlock(token) {
  if (!token) return;
  clearHash();
  const response = await fetch("/auth/setup/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  }).catch(() => null);
  if (!response) {
    showLocked("Could not verify the setup link. Check your connection, then open the private setup link again.");
    return;
  }
  if (!response.ok) {
    showLocked("This setup link is invalid, expired, or already used. Open your current private setup link or ask the owner for a fresh one.");
    return;
  }
  const data = await response.json();
  if (data.state) {
    const form = ready.querySelector("form");
    form.action = "https://github.com/settings/apps/new?state=" + encodeURIComponent(data.state);
    ready.hidden = false;
    locked.hidden = true;
  }
}
function unlockFromLocation() {
  unlock(setupToken()).then(status);
}
async function status() {
  const response = await fetch("/auth/setup/status").catch(() => null);
  if (!response) return;
  if (!response.ok) return;
  const data = await response.json();
  if (data.configured && data.installUrl) {
    ready.hidden = true;
    locked.hidden = true;
    done.hidden = false;
    install.href = data.installUrl;
  }
}
addEventListener("hashchange", unlockFromLocation);
unlock(setupToken()).then(status);
})();`;
}

export async function convertManifest(
  code: string,
  fetcher: typeof fetch,
): Promise<GitHubAppConfig> {
  if (!code || code.length > 512)
    throw new HttpError(400, "GitHub App registration was not completed.");
  const response = await fetcher(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "native-site-editor",
      },
    },
  );
  if (!response.ok)
    throw new HttpError(502, "GitHub App registration failed. Try again.");
  const data = (await boundedJson(response, 1024 * 1024)) as {
    client_id?: string;
    client_secret?: string;
    slug?: string;
  };
  if (!data.client_id || !data.client_secret || !data.slug)
    throw new HttpError(502, "GitHub did not return complete App credentials.");
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    slug: data.slug,
  };
}

export async function setupPayload(request: Request) {
  const data = await requestJson(request, 1024);
  return typeof data?.token === "string" ? data.token : "";
}

export function setupCookie(cookies: string, name: string) {
  return cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      char
    ]!,
  );
}

export function isOwnerSetupState(value: StoredValue): value is OwnerSetupState {
  return value.kind === "owner-setup";
}
