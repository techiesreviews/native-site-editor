// A fake GitHub (repositories, Pages, Actions secrets, deployments and
// statuses) and a fake Cloudflare API for tests/hosts.test.ts, plus the worker
// handler wired to them. The editor's own session is a record in memory.
import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers";
import { handle, type Env, type StoredSession } from "../worker/app.ts";

export const origin = "https://editor.example";
export const CF_TOKEN = "cf_token_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GITHUB_TOKEN = "gh-token-never-leaves-the-worker";
export const ACCOUNT_ID = "b9b9a2b4c908c9d03abe92a52c2d0f43";
const commit = "c".repeat(40);
const treeSha = "d".repeat(40);

export const repos = [
  { id: 1, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } },
  { id: 2, name: "secret-site", full_name: "lex/secret-site", private: true, default_branch: "main", owner: { login: "lex", type: "User" } },
  { id: 3, name: "lex.github.io", full_name: "lex/lex.github.io", private: false, default_branch: "main", owner: { login: "lex", type: "User" } },
];

const blobSha = (content: string) =>
  createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");

export interface Call {
  method: string;
  host: string;
  path: string;
  body?: any;
}

export interface World {
  /** The repository's files at the head of main. */
  files: Record<string, string>;
  pages: null | { source: { branch: string; path: string }; build_type: string; cname: string | null; https_enforced: boolean };
  /** Answer POST /pages with this status (and message). */
  pagesCreate?: { status: number; message: string };
  /** Answer every Pages call with 403. */
  pagesForbidden: boolean;
  /** GET /pages/health: how many calls answer 202 before the 200, and the 200's domain. */
  healthPending: number;
  healthDomain: Record<string, unknown>;
  secretsForbidden: boolean;
  /** Secret name -> the value as decrypted with the repository's key. */
  secrets: Map<string, string>;
  deployments: { id: number; environment: string; creator: string; status: { state: string; environment_url?: string; target_url?: string; creator?: string } }[];
  deploymentsForbidden: boolean;
  statuses: { context: string; state: string; target_url?: string }[];
  runs: { name: string; status: string; conclusion: string | null }[];
  cloudflare: { accounts: { id: string; name: string; subdomain: string | null }[]; userVerify: boolean; scriptsAccess: boolean };
  calls: Call[];
  logs: string[];
  keys: { publicKey: Uint8Array; privateKey: Uint8Array };
  /** A ref update touching a workflow file is refused. */
  refuseWorkflows: boolean;
  /** The repository has no commits. */
  empty: boolean;
}

export const starterFiles = {
  "index.html": "<!doctype html><title>Home</title><h1>Hi</h1>\n",
  "404.html": "<!doctype html><title>Gone</title>\n",
  ".editor/config.json": JSON.stringify({ site: { name: "Larkspur", url: "https://larkspur.example" } }),
};

export async function newWorld(files: Record<string, string> = starterFiles): Promise<World> {
  await sodium.ready;
  return {
    files: { ...files },
    pages: null,
    pagesForbidden: false,
    healthPending: 1,
    healthDomain: { host: "example.com", is_valid: true, dns_resolves: true, is_https_eligible: true, enforces_https: false },
    secretsForbidden: false,
    secrets: new Map(),
    deployments: [],
    deploymentsForbidden: false,
    statuses: [],
    runs: [],
    cloudflare: { accounts: [{ id: ACCOUNT_ID, name: "Lex's account", subdomain: "lex" }], userVerify: true, scriptsAccess: true },
    calls: [],
    logs: [],
    keys: sodium.crypto_box_keypair(),
    refuseWorkflows: false,
    empty: false,
  };
}

function tree(files: Record<string, string>) {
  const entries: { path: string; mode: string; type: string; sha: string; size?: number }[] = [];
  const folders = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index++) folders.add(parts.slice(0, index).join("/"));
    entries.push({ path, mode: "100644", type: "blob", sha: blobSha(content), size: Buffer.byteLength(content) });
  }
  for (const folder of folders) entries.push({ path: folder, mode: "040000", type: "tree", sha: createHash("sha1").update(folder).digest("hex") });
  return entries;
}

export function githubAndCloudflare(world: World): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname;
    world.calls.push({ method, host: url.hostname, path: path + url.search, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    const empty = (status: number) => new Response(null, { status });

    if (url.hostname === "api.cloudflare.com") {
      const auth = new Headers(init?.headers).get("Authorization");
      const cf = (result: unknown) => reply({ success: true, errors: [], result });
      const denied = () => reply({ success: false, errors: [{ code: 1000, message: "Invalid API Token" }], result: null }, 401);
      if (auth !== `Bearer ${CF_TOKEN}`) return denied();
      const api = path.replace("/client/v4", "");
      if (api === "/user/tokens/verify") return world.cloudflare.userVerify ? cf({ id: "t", status: "active" }) : denied();
      if (api === "/accounts") return cf(world.cloudflare.accounts.map(({ id, name }) => ({ id, name })));
      const account = /^\/accounts\/([a-f0-9]{32})\/(.+)$/.exec(api);
      if (account) {
        const found = world.cloudflare.accounts.find((entry) => entry.id === account[1]);
        if (!found) return denied();
        if (account[2] === "tokens/verify") return cf({ id: "t", status: "active" });
        if (account[2] === "workers/subdomain")
          return found.subdomain
            ? cf({ subdomain: found.subdomain })
            : reply({ success: false, errors: [{ code: 10007, message: "no subdomain" }], result: null }, 404);
        if (account[2] === "workers/scripts")
          return world.cloudflare.scriptsAccess ? cf([]) : reply({ success: false, errors: [{ code: 10000 }], result: null }, 403);
      }
      return reply({ success: false, errors: [], result: null }, 404);
    }

    if (path === "/login/oauth/access_token") return reply({ access_token: GITHUB_TOKEN, expires_in: 28800 });
    if (new Headers(init?.headers).get("Authorization") !== `Bearer ${GITHUB_TOKEN}`) return reply({ message: "Bad credentials" }, 401);
    if (path === "/user/installations") return reply({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
    if (path === "/user/installations/1/repositories") return reply({ repositories: repos });
    const match = /^\/repos\/lex\/([^/]+)(\/.*)?$/.exec(path);
    if (!match) return reply({ message: "Not Found" }, 404);
    const rest = match[2] ?? "";

    if (world.empty && rest.startsWith("/branches/")) return reply({ message: "Branch not found" }, 404);
    if (world.empty && /^\/(commits|git\/commits|git\/trees|git\/blobs)(\/|$)/.test(rest))
      return reply({ message: "Git Repository is empty." }, 409);
    if (rest === "/branches/main")
      return reply({ commit: { sha: commit, commit: { tree: { sha: treeSha } } } });
    if (rest === `/git/commits/${commit}`) return reply({ tree: { sha: treeSha } });
    if (rest === `/git/trees/${treeSha}`) return reply({ sha: treeSha, tree: tree(world.files), truncated: false });
    const blob = /^\/git\/blobs\/([a-f0-9]{40})$/.exec(rest);
    if (blob) {
      const entry = Object.values(world.files).find((content) => blobSha(content) === blob[1]);
      return entry === undefined
        ? reply({ message: "Not Found" }, 404)
        : reply({ sha: blob[1], size: Buffer.byteLength(entry), encoding: "base64", content: Buffer.from(entry).toString("base64") });
    }
    if (rest === "/actions/runs")
      return reply({ total_count: world.runs.length, workflow_runs: world.runs.map((run, index) => ({ ...run, html_url: `https://github.com/lex/site/actions/runs/${index + 1}` })) });
    if (rest === "/actions/workflows")
      return reply({ total_count: 1, workflows: [{ state: "active" }] });

    // Pages
    if (rest === "/pages" || rest === "/pages/health") {
      if (world.pagesForbidden) return reply({ message: "Resource not accessible by integration" }, 403);
      if (rest === "/pages/health") {
        if (!world.pages?.cname) return reply({ message: "Custom domain is not set up" }, 400);
        if (world.healthPending > 0) {
          world.healthPending--;
          return empty(202);
        }
        return reply({ domain: world.healthDomain });
      }
      if (method === "GET") {
        if (!world.pages) return reply({ message: "Not Found" }, 404);
        return reply({
          html_url: `https://lex.github.io/${match[1]}/`,
          status: "built",
          build_type: world.pages.build_type,
          source: world.pages.source,
          cname: world.pages.cname,
          https_enforced: world.pages.https_enforced,
          https_certificate: world.pages.cname ? { state: "new" } : null,
        });
      }
      if (method === "POST") {
        if (world.pagesCreate) return reply({ message: world.pagesCreate.message }, world.pagesCreate.status);
        if (world.pages) return reply({ message: "A GitHub Pages site already exists." }, 409);
        world.pages = { source: body.source, build_type: body.build_type, cname: null, https_enforced: false };
        return reply({ source: body.source }, 201);
      }
      if (method === "PUT") {
        if (!world.pages) return reply({ message: "Not Found" }, 404);
        if (body.cname && body.cname === "taken.example.com") return reply({ message: "CNAME already taken" }, 422);
        if (body.https_enforced && !world.pages.cname) return reply({ message: "https cannot be enforced" }, 422);
        if (body.source) world.pages.source = body.source;
        if (body.build_type) world.pages.build_type = body.build_type;
        if ("cname" in body) world.pages.cname = body.cname;
        if (body.https_enforced !== undefined) world.pages.https_enforced = body.https_enforced;
        return empty(204);
      }
    }

    // Actions secrets
    if (rest.startsWith("/actions/secrets")) {
      if (world.secretsForbidden) return reply({ message: "Resource not accessible by integration" }, 403);
      if (rest === "/actions/secrets/public-key")
        return reply({ key_id: "568250167242549743", key: Buffer.from(world.keys.publicKey).toString("base64") });
      if (rest === "/actions/secrets" && method === "GET")
        return reply({ total_count: world.secrets.size, secrets: [...world.secrets.keys()].map((name) => ({ name })) });
      const name = /^\/actions\/secrets\/([A-Z_]+)$/.exec(rest)?.[1];
      if (name && method === "PUT") {
        if (body.key_id !== "568250167242549743") return reply({ message: "Bad key_id" }, 422);
        const opened = sodium.crypto_box_seal_open(Buffer.from(body.encrypted_value, "base64"), world.keys.publicKey, world.keys.privateKey);
        const created = !world.secrets.has(name);
        world.secrets.set(name, Buffer.from(opened).toString("utf8"));
        return empty(created ? 201 : 204);
      }
    }

    // Deployments and statuses
    if (rest === "/deployments") {
      if (world.deploymentsForbidden) return reply({ message: "Resource not accessible by integration" }, 403);
      return reply(world.deployments.map((entry) => ({ id: entry.id, environment: entry.environment, creator: { login: entry.creator } })));
    }
    const statuses = /^\/deployments\/(\d+)\/statuses$/.exec(rest);
    if (statuses) {
      const entry = world.deployments.find((candidate) => candidate.id === Number(statuses[1]));
      return reply(entry ? [{ ...entry.status, creator: entry.status.creator ? { login: entry.status.creator } : undefined }] : []);
    }
    if (rest === `/commits/${commit}/status`) {
      if (world.deploymentsForbidden) return reply({ message: "Resource not accessible by integration" }, 403);
      return reply({ state: "success", statuses: world.statuses });
    }

    // Refs: a GitHub App needs the Workflows permission to change a workflow file.
    if (rest === "/git/refs/heads/main" && method === "PATCH") {
      if (world.refuseWorkflows)
        return reply({ message: "refusing to allow a GitHub App to create or update workflow `.github/workflows/deploy.yml` without `workflows` permission" }, 422);
      return reply({ ref: "refs/heads/main" });
    }
    return reply({ message: `Unhandled ${method} ${path}` }, 404);
  }) as typeof fetch;
}

/** The worker handler, signed in as lex, over the fake. */
export function editor(world: World) {
  const records = new Map<string, StoredSession>();
  const id = "a".repeat(64);
  records.set(id, { kind: "user", token: GITHUB_TOKEN, login: "lex", avatar_url: "", expiresAt: Date.now() + 3_600_000 } as StoredSession);
  const env: Env = {
    GITHUB_CLIENT_ID: "app-client",
    GITHUB_CLIENT_SECRET: "app-secret",
    GITHUB_APP_SLUG: "test-editor",
    ASSETS: { fetch: async () => new Response("UI") },
    SESSIONS: {
      idFromName: (name: string) => name,
      get: (key: string) => ({
        fetch: async (request: Request) => {
          if (request.method === "PUT") {
            records.set(key, (await request.json()) as StoredSession);
            return new Response(null, { status: 204 });
          }
          if (request.method === "DELETE") {
            records.delete(key);
            return new Response(null, { status: 204 });
          }
          const value = records.get(key);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        },
      }),
    },
  };
  const fetcher = githubAndCloudflare(world);
  return async function call(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string>; signedIn?: boolean } = {},
  ) {
    const method = options.method ?? (options.body === undefined ? "GET" : "POST");
    const headers: Record<string, string> = { ...(options.signedIn === false ? {} : { Cookie: `__Host-ase_session=${id}` }), ...options.headers };
    if (method === "POST") {
      headers.Origin ??= origin;
      headers["Content-Type"] ??= "application/json";
    }
    const response = await handle(
      new Request(origin + path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }),
      env,
      fetcher,
    );
    const text = await response.text();
    return { status: response.status, text, json: text ? JSON.parse(text) : undefined };
  };
}

/** Everything written to the console while `run` runs. */
export async function captureLogs<T>(world: World, run: () => Promise<T>): Promise<T> {
  const originals = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const name of Object.keys(originals) as (keyof typeof originals)[])
    console[name] = (...args: unknown[]) => void world.logs.push(args.map(String).join(" "));
  try {
    return await run();
  } finally {
    Object.assign(console, originals);
  }
}
