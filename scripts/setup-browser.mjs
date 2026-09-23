import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
// Self-hosters: the deployed editor origin comes from the custom domain in
// wrangler.jsonc, or from EDITOR_ORIGIN when using a workers.dev address.
export function readEditorOrigin(env = process.env, configText) {
  if (env.EDITOR_ORIGIN) return new URL(env.EDITOR_ORIGIN).origin;
  const text =
    configText ?? readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
  const match = text.match(/"pattern"\s*:\s*"([^"]+)"\s*,\s*"custom_domain"\s*:\s*true/);
  if (match) return `https://${match[1]}`;
  throw new Error(
    "Set EDITOR_ORIGIN to the deployed editor URL, or add a custom domain route to wrangler.jsonc.",
  );
}
const editorOrigin = readEditorOrigin();
const appName =
  process.env.GITHUB_APP_NAME ??
  `Astro Site Editor (${new URL(editorOrigin).hostname})`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export function manifest(callbackOrigin) {
  return {
    name: appName,
    url: editorOrigin,
    redirect_url: `${callbackOrigin}/callback`,
    callback_urls: [
      `${editorOrigin}/auth/callback`,
      "http://127.0.0.1:8787/auth/callback",
    ],
    setup_url: editorOrigin,
    setup_on_update: true,
    request_oauth_on_install: false,
    public: true,
    hook_attributes: { url: `${editorOrigin}/github/events`, active: false },
    default_permissions: { contents: "write", metadata: "read" },
    default_events: [],
  };
}

function page(title, body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:15px/1.7 system-ui;background:#f4f5f1;color:#263d30;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:470px;background:white;border:1px solid #dde3d6;border-radius:12px;padding:36px;margin:20px}h1{font-size:25px;line-height:1.3}p{color:#64725f}button,a.button{display:inline-block;border:0;border-radius:6px;padding:13px 20px;background:#294f38;color:white;font:inherit;text-decoration:none;cursor:pointer}small{color:#73806c}</style><main><small>ASTRO SITE EDITOR · OWNER SETUP</small><h1>${escape(title)}</h1>${body}</main></html>`;
}

export function createSetupServer({
  convert,
  save,
  deploy,
  port = 8790,
  initialCredentials,
  publicOrigin,
} = {}) {
  if (
    publicOrigin &&
    (new URL(publicOrigin).protocol !== "https:" ||
      new URL(publicOrigin).origin !== publicOrigin)
  )
    throw new Error(
      "Setup public origin must be an HTTPS origin without a path.",
    );
  const launchKey = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  const state = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000;
  let credentials = initialCredentials;
  let busy = false;
  let finished = false;
  let origin;
  const server = createServer(async (req, res) => {
    const respond = (status, title, body) => {
      res.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'",
      });
      res.end(page(title, body));
    };
    if (req.headers.host !== new URL(origin).host)
      return respond(
        403,
        "Invalid setup address",
        "<p>Open the original setup link.</p>",
      );
    const url = new URL(req.url, origin);
    if (Date.now() > expiresAt)
      return respond(
        410,
        "Setup link expired",
        "<p>Restart browser setup to get a new link.</p>",
      );
    if (
      req.method === "GET" &&
      url.pathname === "/start" &&
      url.searchParams.get("key") === launchKey
    ) {
      res.writeHead(303, {
        Location: "/",
        "Set-Cookie": `ase_setup=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${publicOrigin ? "; Secure" : ""}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      return res.end();
    }
    if (
      !(req.headers.cookie ?? "")
        .split(";")
        .some((part) => part.trim() === `ase_setup=${session}`)
    )
      return respond(
        403,
        "Open your setup link",
        "<p>Use the one-time setup link provided by the editor owner.</p>",
      );
    if (finished)
      return respond(
        200,
        "GitHub is ready",
        `<p>Install the App on your personal account and select the repositories to edit. Then return to the editor and sign in.</p><a class="button" href="https://github.com/apps/${escape(credentials.GITHUB_APP_SLUG)}/installations/new">Choose repositories on GitHub</a><p><a href="${editorOrigin}">Open the editor</a></p>`,
      );
    if (busy)
      return respond(
        409,
        "Setup is running",
        "<p>Configuration is being saved. Wait for the original tab to finish.</p>",
      );
    if (req.method === "GET" && url.pathname === "/") {
      if (credentials)
        return respond(
          200,
          "Finish configuration",
          '<p>Your App was created and its credentials saved locally. Retry configuring Cloudflare below.</p><form method="post" action="/deploy"><button>Configure Cloudflare</button></form>',
        );
      return respond(
        200,
        "Connect this editor to GitHub",
        `<p>This is a one-time setup for the editor owner. GitHub will ask you to confirm an App name; permissions and return addresses are already filled in.</p><p>After confirmation, this helper saves the credentials privately and configures your Cloudflare deployment automatically.</p><form action="https://github.com/settings/apps/new?state=${state}" method="post"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest(origin)))}"><button>Create GitHub App</button></form><p><small>Future users only sign in and choose repositories. They do not create an App.</small></p>`,
      );
    }
    const callback =
      req.method === "GET" &&
      url.pathname === "/callback" &&
      url.searchParams.get("state") === state &&
      /^[a-zA-Z0-9_-]{1,512}$/.test(url.searchParams.get("code") ?? "");
    const retry =
      req.method === "POST" &&
      url.pathname === "/deploy" &&
      req.headers.origin === origin &&
      credentials;
    if (!callback && !retry)
      return respond(
        400,
        "Setup could not be verified",
        "<p>Return to the original setup tab and try again.</p>",
      );
    if (callback && credentials)
      return respond(
        409,
        "App already registered",
        '<p><a href="/">Continue configuration</a></p>',
      );
    busy = true;
    try {
      if (callback) {
        const data = await convert(url.searchParams.get("code"));
        if (
          !/^[\w.-]+$/.test(data.client_id ?? "") ||
          !/^[\w-]+$/.test(data.client_secret ?? "") ||
          !/^[a-zA-Z0-9-]+$/.test(data.slug ?? "")
        )
          throw new Error("Invalid GitHub configuration");
        const values = {
          GITHUB_CLIENT_ID: data.client_id,
          GITHUB_CLIENT_SECRET: data.client_secret,
          GITHUB_APP_SLUG: data.slug,
        };
        await save(values);
        credentials = values;
      }
      await deploy(credentials);
      finished = true;
      console.log(
        "GitHub App configured on Cloudflare. Complete repository selection in your browser.",
      );
      res.writeHead(303, {
        Location: "/",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      res.end();
    } catch {
      // Neither upstream response bodies nor credentials belong in logs or HTML.
      respond(
        502,
        "One more step is needed",
        credentials
          ? '<p>Your credentials are saved locally. Cloudflare configuration did not complete; return below to retry.</p><a href="/">Retry configuration</a>'
          : "<p>GitHub registration could not be completed or the local credentials file already exists. No credentials were displayed. Check the local setup before creating another App.</p>",
      );
    } finally {
      busy = false;
    }
  });
  return {
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      origin = publicOrigin || `http://127.0.0.1:${server.address().port}`;
      return `${origin}/start?key=${launchKey}`;
    },
  };
}

async function deploySecrets(values) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve(root, "node_modules/wrangler/bin/wrangler.js"),
        "secret",
        "bulk",
      ],
      { cwd: root, stdio: ["pipe", "ignore", "ignore"] },
    );
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error("Cloudflare secret upload failed")),
    );
    child.stdin.end(JSON.stringify(values));
  });
  const response = await fetch(`${editorOrigin}/api/session`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !(await response.json()).configured)
    throw new Error("Hosted configuration not yet ready");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let initialCredentials;
  try {
    const existing = await readFile(resolve(root, ".dev.vars"), "utf8");
    const values = Object.fromEntries(
      existing.split(/\r?\n/).flatMap((line) => {
        const match = line.match(
          /^(GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET|GITHUB_APP_SLUG)=(.*)$/,
        );
        if (!match) return [];
        const raw = match[2].trim();
        return [[match[1], raw.startsWith('"') ? JSON.parse(raw) : raw]];
      }),
    );
    if (
      !["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_APP_SLUG"].every(
        (key) =>
          typeof values[key] === "string" && /^[\w.-]+$/.test(values[key]),
      )
    )
      throw new Error(
        "Existing .dev.vars is incomplete. Complete or move it before registering another App.",
      );
    initialCredentials = values;
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "An existing credentials file could not be used. Check .dev.vars locally; it has not been changed.",
      );
  }
  const setup = createSetupServer({
    initialCredentials,
    publicOrigin: process.env.SETUP_PUBLIC_ORIGIN,
    convert: async (code) => {
      const response = await fetch(
        `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "astro-site-editor-setup",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) throw new Error("GitHub conversion failed");
      return response.json();
    },
    save: (values) =>
      writeFile(
        resolve(root, ".dev.vars"),
        Object.entries(values)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join("\n") + "\n",
        { mode: 0o600, flag: "wx" },
      ),
    deploy: deploySecrets,
  });
  const url = await setup.listen();
  console.log(
    `Open this link in your browser${process.env.SETUP_PUBLIC_ORIGIN ? "" : " on this computer"}:\n${url}\nLeave this process running until setup finishes. The link expires in one hour.`,
  );
}
