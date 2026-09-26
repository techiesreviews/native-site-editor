// The real Worker (worker/index.ts, with its SessionStore Durable Object) in
// Miniflare over a fake GitHub holding a small native site, for the MCP
// tests: sign-in, the editor tab's side of the agent hub, and an official
// MCP client transport pointed at `/mcp`.
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { textHash } from "../shared/agent.ts";
import type { EditorContext } from "../shared/types.ts";

export const origin = "https://editor.example";
export const commit = "c".repeat(40);
const treeSha = "d".repeat(40);
export const repo = {
  id: 1,
  name: "starter",
  full_name: "lex/starter",
  private: true,
  default_branch: "main",
  owner: { login: "lex", type: "User" },
};

// The repository is the site (docs/adr/0001-the-repository-is-the-site.md).
const page = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <title>${title}</title>\n  <link rel="stylesheet" href="/styles/site.css">\n  <script type="module" src="/components/components.js"></script>\n</head>\n<body>\n${body}</body>\n</html>\n`;
export const files: Record<string, string> = {
  "index.html": page("Home", `<site-header></site-header>\n<main>\n  <section class="hero" data-key="hero">\n    <h1>Welcome</h1>\n  </section>\n  <feature-block data-key="feature"><h2 slot="title">Fast</h2></feature-block>\n</main>\n`),
  "about/index.html": page("About", `<main>\n  <section><h1>About us</h1></section>\n</main>\n`),
  "404.html": page("Page not found", `<main>\n  <section><h1>Page not found</h1></section>\n</main>\n`),
  "components/components.js": `const TAGS = ["feature-block", "site-header"];\n`,
  "components/feature-block/feature-block.html": `<section class="feature-block">\n  <slot name="title"><h2>A feature</h2></slot>\n</section>\n`,
  "components/site-header/site-header.html": `<header><a href="/">Home</a></header>\n`,
  "styles/site.css": `@import url("tokens.css");\nbody { margin: 0; }\n`,
  "styles/tokens.css": `:root { --accent: green; }\n`,
  ".editor/config.json": `{ "site": { "name": "Starter", "url": "https://starter.example" } }\n`,
};
const shas = Object.fromEntries(
  Object.keys(files).map((path, index) => [path, index.toString(16).padStart(40, "0")]),
);

export async function startWorker() {
  const { outputFiles } = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["workerd"],
    external: ["cloudflare:workers"],
    target: "es2022",
  });
  const github = { allowed: true, writes: 0, others: [] as (typeof repo)[] };
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-09-17",
      durableObjects: { SESSIONS: { className: "SessionStore", useSQLite: true } },
      bindings: { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" },
      outboundService: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/login/oauth/access_token")
          return Response.json({ access_token: "github-private-token", expires_in: 28800 });
        if (request.method !== "GET") github.writes++;
        if (path === "/user") return Response.json({ login: "lex", avatar_url: "" });
        if (path === "/user/installations")
          return Response.json({ installations: [{ id: 1, account: { type: "User", login: "lex" } }] });
        if (path === "/user/installations/1/repositories")
          return Response.json({ repositories: github.allowed ? [repo, ...github.others] : [] });
        if (path === `/repos/lex/starter/git/commits/${commit}`) return Response.json({ tree: { sha: treeSha } });
        if (path === `/repos/lex/starter/git/trees/${treeSha}`) {
          const folders = new Set<string>();
          for (const file of Object.keys(files)) {
            const parts = file.split("/");
            for (let index = 1; index < parts.length; index++) folders.add(parts.slice(0, index).join("/"));
          }
          return Response.json({
            truncated: false,
            tree: [
              ...[...folders].map((folder) => ({ path: folder, sha: "e".repeat(40), type: "tree", mode: "040000" })),
              ...Object.keys(files).map((file) => ({ path: file, sha: shas[file], type: "blob", mode: "100644", size: files[file].length })),
            ],
          });
        }
        const blob = /^\/repos\/lex\/starter\/git\/blobs\/([a-f0-9]{40})$/.exec(path)?.[1];
        const file = blob && Object.keys(shas).find((key) => shas[key] === blob);
        if (file)
          return Response.json({ size: files[file].length, encoding: "base64", content: btoa(files[file]) });
        throw new Error(`Unexpected GitHub path: ${path}`);
      },
    }),
  );
  return { worker, github };
}

export async function signIn(worker: Miniflare, returnTo?: string) {
  const start = await worker.dispatchFetch(
    `${origin}/auth/login${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ""}`,
    { redirect: "manual" },
  );
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const callback = await worker.dispatchFetch(`${origin}/auth/callback?state=${state}&code=x`, {
    headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] },
    redirect: "manual",
  });
  const cookie = callback.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Host-ase_session="))!
    .split(";")[0];
  return { cookie, location: callback.headers.get("location") };
}

/** The editor tab's API calls. */
export function editorTab(worker: Miniflare, cookie: string, tabId = "tab-test-0001") {
  const post = (path: string, body: unknown) =>
    worker.dispatchFetch(origin + path, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    tabId,
    post,
    hub: async () => (await worker.dispatchFetch(`${origin}/api/agent/hub`, { headers: { Cookie: cookie } })).json() as Promise<any>,
    share: (context: EditorContext) => post("/api/agent/context", { tabId, context }),
    claim: (id: string, grantId: string) => post("/api/agent/claim", { tabId, id, grantId }),
    ack: (id: string, grantId: string, state: string, extra: Record<string, unknown> = {}) =>
      post("/api/agent/ack", { tabId, id, grantId, state, ...extra }),
  };
}

/** What the editor tab reports for the fake site, with one draft of the about page and a new page. */
export async function siteContext(): Promise<EditorContext> {
  const about = files["about/index.html"].replace("About us", "About the studio");
  const home = files["index.html"];
  const fresh = page("New", "<main></main>\n");
  return {
    repository: { id: repo.id, fullName: repo.full_name },
    branch: "main",
    commit,
    file: null,
    drafts: [
      { path: "about/index.html", baseSha: shas["about/index.html"], updatedAt: Date.now(), hash: await textHash(about), content: about },
      { path: "new/index.html", baseSha: null, updatedAt: Date.now(), hash: await textHash(fresh), content: fresh },
    ],
    pages: [
      { route: "/", file: "index.html", title: "Home" },
      { route: "/about/", file: "about/index.html", title: "About", description: "Who we are." },
      { route: "/about/team/", file: "about/team/index.html", title: "Team", parent: "/about/" },
      { route: "/new/", file: "new/index.html", title: "New", isNew: true },
      { route: "/404.html", file: "404.html", title: "Page not found" },
    ],
    site: {
      openFile: "index.html",
      openRoute: "/",
      selection: { file: "index.html", id: "1.0", tag: "section", text: "Welcome" },
      components: [
        { tag: "feature-block", file: "components/feature-block/feature-block.html", section: true, slots: ["title"] },
        { tag: "site-header", file: "components/site-header/site-header.html", section: false, slots: [] },
      ],
      stylesheets: [{ file: "styles/site.css", imports: ["styles/tokens.css"] }],
      settings: { file: ".editor/config.json", name: "Starter", url: "https://starter.example/" },
      outlines: [
        {
          file: "index.html",
          hash: await textHash(home),
          containers: [{ id: "1", tag: "main", children: 2 }],
          sections: [
            { id: "1.0", tag: "section", key: "hero", heading: "Welcome" },
            { id: "1.1", tag: "feature-block", component: true, key: "feature", heading: "Fast", slots: { title: "Fast" } },
          ],
        },
        {
          file: "about/index.html",
          hash: await textHash(about),
          containers: [{ id: "0", tag: "main", children: 1 }],
          sections: [{ id: "0.0", tag: "section", heading: "About the studio" }],
        },
      ],
      changes: [
        { kind: "M", path: "about/index.html" },
        { kind: "A", path: "new/index.html" },
      ],
    },
  };
}

/** A fetch for MCP client transports that goes to the Miniflare worker. */
export function workerFetch(worker: Miniflare) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const response = await worker.dispatchFetch(String(input instanceof Request ? input.url : input), init as any);
    return new Response(await response.text(), { status: response.status, headers: response.headers as any });
  };
}

/** The JSON a tool result carries. */
export function payload(result: unknown): any {
  const text = (result as { content: { text: string }[] }).content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
