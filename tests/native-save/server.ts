// Native Site Editor save test / demo server.
//
// Unlike the warm-preview server, this needs NO Astro build. It serves the real
// editor UI through Vite and routes every `/api/*`, `/auth/*` and `/mcp` request
// through the REAL Worker request handler (`worker/app.ts`, `handle`). The only
// boundaries that are faked are:
//
//   1. Sessions — an in-memory SessionStore that speaks the same DO protocol as
//      `worker/index.ts`, pre-seeded with one demo user per browser session.
//   2. GitHub — a fake `fetch` implementing the subset of the GitHub REST API
//      that `worker/github.ts` and `worker/publish.ts` use, backed by a small
//      in-memory git model built from `fixtures/native-starter`. The optimistic
//      commit path (git/trees, git/commits, PATCH refs, conflict on stale
//      baseSha) runs for real; only the network is simulated. There is no real
//      token and no real write ever leaves the machine.
//
// Each browser session gets its own isolated git clone, so concurrently exposed
// demo browsers never see each other's saves.
//
// Outside demo mode, every folder under `fixtures/cascade/` is one more small
// native repository (`cascade-<folder>`, ids from 510 in folder order), each a
// site with its own CSS structure for the style panel's cascade tests, and
// `fixtures/native-routing` is `native-routing` (id 530), a site with pages
// in folders, a single-file page and a partial that is not a page, and
// `fixtures/native-conventions` is `native-conventions` (id 531), a site
// with components, layered shared styles and a folder with no page.
//
// Ports: 5206 for focused tests, 5208 for the (later) exposed demo. Demo mode
// (`ASE_NATIVE_SAVE_DEMO=1`) adds a visible banner marking the account, repo and
// that all saves are simulated.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createServer, type Connect, type Plugin } from "vite";
import { handle, type Env } from "../../worker/app.ts";
import { admitRegistration, isBudgetKey, REGISTRATION_ROUTE } from "../../worker/oauth-registration.ts";
import { clearHub, hubOperation, hubView, readDraft, storeDrafts, type HubStorage } from "../../worker/agent-store.ts";
import type { AgentHub } from "../../worker/agent-context.ts";

const appPort = Number(process.env.ASE_NATIVE_SAVE_PORT ?? 5206);
const demoMode = process.env.ASE_NATIVE_SAVE_DEMO === "1";
const projectRoot = process.cwd();
// `ASE_NATIVE_SAVE_FIXTURE` serves another site as the demo repository (a
// checkout of a real project, to try the editor against it by hand).
const fixtureRoot = resolve(projectRoot, process.env.ASE_NATIVE_SAVE_FIXTURE ?? "fixtures/native-starter");

const DEMO_LOGIN = "native-demo-user";
const DEMO_REPO = {
  id: 501,
  name: "native-demo",
  full_name: `${DEMO_LOGIN}/native-demo`,
  private: true,
  default_branch: "main",
  owner: { login: DEMO_LOGIN, type: "User" },
};

// ---------------------------------------------------------------------------
// In-memory git model (per session).
// ---------------------------------------------------------------------------

interface TreeEntry {
  path: string;
  sha: string;
  type: "blob" | "tree";
  mode: string;
  size?: number;
}
// One path in git/trees: new content, an existing blob (`sha`), or, with
// `sha: null`, the path removed.
interface Change {
  segments: string[];
  mode: string;
  content?: string;
  sha?: string | null;
}
interface Git {
  // Bytes: text files and uploaded binary files alike.
  blobs: Map<string, Buffer>;
  trees: Map<string, TreeEntry[]>;
  // A commit's message and date show in the file history (`/commits`).
  commits: Map<string, { tree: string; parents: string[]; message?: string; date?: string }>;
  head: string;
  // GitHub's read lag after a write, as a test sets it (`/__demo/lag`): the
  // next `reads` reads of the branch after each ref update name the commit
  // before it (`stale`).
  lag?: number;
  stale?: { sha: string; reads: number };
  // Branches besides main, as a test makes them (`/__demo/branch`): name → head.
  branches?: Map<string, string>;
}

const encoder = new TextEncoder();

function blobSha(content: string | Buffer): string {
  const body = typeof content === "string" ? encoder.encode(content) : content;
  const hash = createHash("sha1");
  hash.update(encoder.encode(`blob ${body.length}\0`));
  hash.update(body);
  return hash.digest("hex");
}
function treeSha(entries: TreeEntry[]): string {
  const serialized = entries
    .map((e) => `${e.mode} ${e.type} ${e.sha} ${e.path}`)
    .sort()
    .join("\n");
  return createHash("sha1").update(`tree\0${serialized}`).digest("hex");
}
function commitSha(tree: string): string {
  return createHash("sha1").update(`commit\0${tree}`).digest("hex");
}

function publicOrigin(): string {
  const configured = process.env.ASE_NATIVE_SAVE_PUBLIC_ORIGIN;
  if (configured) {
    const origin = new URL(configured);
    if (origin.protocol !== "https:" || origin.origin !== configured)
      throw new Error("ASE_NATIVE_SAVE_PUBLIC_ORIGIN must be an HTTPS origin without a path.");
    return origin.origin;
  }
  return `http://127.0.0.1:${appPort}`;
}

// Recursively read the fixture into a git model, computing real git blob shas so
// a file's baseSha (loaded via /api/file) matches publish's own blobSha — an
// unchanged file never falsely conflicts.
function buildTree(
  git: Git,
  root: string,
  relative: string,
): { sha: string; entries: TreeEntry[] } {
  const entries: TreeEntry[] = [];
  for (const dirent of readdirSync(join(root, relative), { withFileTypes: true })) {
    if (dirent.name === "node_modules" || dirent.name === ".git") continue;
    const rel = relative ? `${relative}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      const child = buildTree(git, root, rel);
      entries.push({ path: dirent.name, sha: child.sha, type: "tree", mode: "040000" });
    } else {
      const content = readFileSync(join(root, rel));
      const sha = blobSha(content);
      git.blobs.set(sha, content);
      entries.push({
        path: dirent.name,
        sha,
        type: "blob",
        mode: "100644",
        size: content.length,
      });
    }
  }
  const sha = treeSha(entries);
  git.trees.set(sha, entries);
  return { sha, entries };
}

function buildInitialGit(fixture = fixtureRoot): Git {
  const git: Git = { blobs: new Map(), trees: new Map(), commits: new Map(), head: "" };
  const root = buildTree(git, fixture, "");
  const commit = commitSha(root.sha);
  git.commits.set(commit, { tree: root.sha, parents: [], message: "Start the site", date: "2026-09-01T09:00:00Z" });
  git.head = commit;
  return git;
}

// The fixture repositories (none in demo mode).
const cascadeRoot = resolve(projectRoot, "fixtures/cascade");
const FIXTURE_REPOS = demoMode || !existsSync(cascadeRoot) ? [] : readdirSync(cascadeRoot, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .sort()
  .map((name, index) => ({
    root: join(cascadeRoot, name),
    repo: { ...DEMO_REPO, id: 510 + index, name: `cascade-${name}`, full_name: `${DEMO_LOGIN}/cascade-${name}` },
  }));
if (!demoMode)
  FIXTURE_REPOS.push({
    root: resolve(projectRoot, "fixtures/native-routing"),
    repo: { ...DEMO_REPO, id: 530, name: "native-routing", full_name: `${DEMO_LOGIN}/native-routing` },
  }, {
    root: resolve(projectRoot, "fixtures/native-conventions"),
    repo: { ...DEMO_REPO, id: 531, name: "native-conventions", full_name: `${DEMO_LOGIN}/native-conventions` },
  });
const initialFixtureGits = new Map<string, Git>();

// Deep clone so each session mutates its own git only.
function cloneGit(source: Git): Git {
  return {
    blobs: new Map(source.blobs),
    trees: new Map([...source.trees].map(([k, v]) => [k, v.map((e) => ({ ...e }))])),
    commits: new Map([...source.commits].map(([key, value]) => [key, { ...value, parents: [...value.parents] }])),
    head: source.head,
  };
}

// Apply full-path changes over a base tree, rebuilding nested trees (GitHub's
// git/trees semantics: `sha: null` removes a path, and a folder left empty
// goes with it), and return the new root tree sha.
function writeTree(git: Git, baseTreeSha: string, changes: Change[]): string {
  function recurse(currentSha: string | undefined, group: Change[]): string | undefined {
    const entries = (currentSha ? git.trees.get(currentSha) ?? [] : []).map((e) => ({ ...e }));
    const byFirst = new Map<string, Change[]>();
    for (const change of group) {
      const first = change.segments[0];
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push(change);
    }
    for (const [name, sub] of byFirst) {
      const leaves = sub.filter((c) => c.segments.length === 1);
      const deeper = sub.filter((c) => c.segments.length > 1);
      let entry: TreeEntry | undefined;
      if (leaves.length) {
        const change = leaves[leaves.length - 1];
        if (change.sha === null) entry = undefined;
        else if (change.sha) {
          const content = git.blobs.get(change.sha);
          if (content === undefined) throw new Error(`Unknown blob ${change.sha}`);
          entry = { path: name, sha: change.sha, type: "blob", mode: change.mode, size: content.length };
        } else {
          const content = Buffer.from(change.content ?? "", "utf8");
          const sha = blobSha(content);
          git.blobs.set(sha, content);
          entry = { path: name, sha, type: "blob", mode: change.mode, size: content.length };
        }
      } else {
        const existing = entries.find((e) => e.path === name && e.type === "tree");
        const childSha = recurse(
          existing?.sha,
          deeper.map((c) => ({ ...c, segments: c.segments.slice(1) })),
        );
        entry = childSha ? { path: name, sha: childSha, type: "tree", mode: "040000" } : undefined;
      }
      const index = entries.findIndex((e) => e.path === name);
      if (!entry) { if (index >= 0) entries.splice(index, 1); }
      else if (index >= 0) entries[index] = entry;
      else entries.push(entry);
    }
    if (!entries.length) return undefined;
    const sha = treeSha(entries);
    git.trees.set(sha, entries);
    return sha;
  }
  const root = recurse(baseTreeSha, changes);
  if (root) return root;
  const empty = treeSha([]);
  git.trees.set(empty, []);
  return empty;
}

// The bytes at `path` in the head commit's tree, if it is a file there.
function fileAt(git: Git, path: string): Buffer | undefined {
  let entries = git.trees.get(git.commits.get(git.head)!.tree) ?? [];
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    const entry = entries.find((item) => item.path === parts[index]);
    if (!entry) return undefined;
    if (index === parts.length - 1) return entry.type === "blob" ? git.blobs.get(entry.sha) : undefined;
    entries = git.trees.get(entry.sha) ?? [];
  }
}

// GitHub Actions as a test sets it through `/__demo/actions`, per session:
// no workflows (the default), a 403 as for an app without Actions: read, or
// workflows whose runs for any commit are the ones given (none yet: waiting).
interface FakeActions {
  mode: "none" | "forbidden" | "runs";
  runs?: { name?: string; status: string; conclusion?: string | null; html_url?: string }[];
  /** Every commit the editor asked about. */
  asked?: string[];
}
const NO_ACTIONS: FakeActions = { mode: "none" };

// A fake `fetch` bound to one session's git models: the demo repository's,
// and the fixture repositories' (cloned on first use).
function githubFetch(demoGit: Git, fixtureGits: Map<string, Git>, actions: FakeActions = NO_ACTIONS): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const jsonResponse = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (path === "/user/installations")
      return jsonResponse({
        installations: [{ id: 1, account: { type: "User", login: DEMO_LOGIN } }],
      });
    if (path === "/user/installations/1/repositories")
      return jsonResponse({ repositories: [DEMO_REPO, ...FIXTURE_REPOS.map((fixture) => fixture.repo)] });

    const repoName = /^\/repos\/[^/]+\/([^/]+)/.exec(path)?.[1] ?? DEMO_REPO.name;
    const fixture = FIXTURE_REPOS.find((item) => item.repo.name === repoName);
    if (fixture && !fixtureGits.has(repoName)) {
      if (!initialFixtureGits.has(repoName)) initialFixtureGits.set(repoName, buildInitialGit(fixture.root));
      fixtureGits.set(repoName, cloneGit(initialFixtureGits.get(repoName)!));
    }
    const git = fixture ? fixtureGits.get(repoName)! : demoGit;
    const repoBase = `/repos/${DEMO_REPO.owner.login}/${fixture ? repoName : DEMO_REPO.name}`;
    if (path === `${repoBase}/actions/runs` || path === `${repoBase}/actions/workflows`) {
      if (actions.mode === "forbidden")
        return jsonResponse({ message: "Resource not accessible by integration" }, 403);
      if (path.endsWith("/workflows"))
        return jsonResponse({ total_count: actions.mode === "runs" ? 1 : 0, workflows: actions.mode === "runs" ? [{ name: "Deploy", state: "active" }] : [] });
      actions.asked?.push(url.searchParams.get("head_sha") ?? "");
      const runs = actions.mode === "runs" ? actions.runs ?? [] : [];
      return jsonResponse({ total_count: runs.length, workflow_runs: runs.map((run, index) => ({ id: index + 1, head_sha: url.searchParams.get("head_sha"), html_url: `https://github.com/${DEMO_REPO.full_name}/actions/runs/${index + 1}`, ...run })) });
    }
    if (path === `${repoBase}/branches`)
      return jsonResponse([{ name: "main" }, ...[...(git.branches?.keys() ?? [])].map((name) => ({ name }))]);
    const other = new RegExp(`^${repoBase}/branches/(.+)$`).exec(path);
    const otherHead = other ? git.branches?.get(decodeURIComponent(other[1])) : undefined;
    if (otherHead) return jsonResponse({ commit: { sha: otherHead } });
    if (path === `${repoBase}/branches/main`) {
      if (git.stale && git.stale.reads-- > 0) return jsonResponse({ commit: { sha: git.stale.sha } });
      return jsonResponse({ commit: { sha: git.head } });
    }
    // Whether `head` is ahead of, behind, or the same as `base`.
    const compare = new RegExp(`^${repoBase}/compare/([a-f0-9]{40})\\.\\.\\.([a-f0-9]{40})$`).exec(path);
    if (compare) {
      const [, base, head] = compare;
      if (!git.commits.has(base) || !git.commits.has(head)) return jsonResponse({ message: "Not Found" }, 404);
      const reaches = (from: string, to: string): boolean => from === to || (git.commits.get(from)?.parents ?? []).some((parent) => reaches(parent, to));
      const status = base === head ? "identical" : reaches(head, base) ? "ahead" : reaches(base, head) ? "behind" : "diverged";
      return jsonResponse({ status });
    }
    // A file's history: the commits from `sha` back that changed `path`.
    if (path === `${repoBase}/commits` && method === "GET") {
      const filePath = (url.searchParams.get("path") ?? "").split("/");
      const perPage = Number(url.searchParams.get("per_page") ?? 30);
      const page = Number(url.searchParams.get("page") ?? 1);
      const blobAt = (sha: string) => {
        let entries = git.trees.get(git.commits.get(sha)?.tree ?? "");
        for (const [index, segment] of filePath.entries()) {
          const entry = entries?.find((candidate) => candidate.path === segment);
          if (!entry) return undefined;
          if (index === filePath.length - 1) return entry.sha;
          entries = git.trees.get(entry.sha);
        }
      };
      const touched: string[] = [];
      for (let sha = url.searchParams.get("sha") ?? git.head; git.commits.has(sha); sha = git.commits.get(sha)!.parents[0] ?? "") {
        const parent = git.commits.get(sha)!.parents[0];
        const here = blobAt(sha);
        if (here !== (parent ? blobAt(parent) : undefined)) touched.push(sha);
      }
      return jsonResponse(touched.slice((page - 1) * perPage, page * perPage).map((sha) => {
        const commit = git.commits.get(sha)!;
        const date = commit.date ?? "2026-09-01T09:00:00Z";
        return {
          sha,
          html_url: `https://github.com${repoBase.slice("/repos".length)}/commit/${sha}`,
          author: { login: DEMO_LOGIN },
          commit: { message: commit.message || "Update files", author: { name: DEMO_LOGIN, date } },
        };
      }));
    }
    if (path.startsWith(`${repoBase}/git/commits/`) && method === "GET") {
      const sha = path.slice(`${repoBase}/git/commits/`.length);
      const commit = git.commits.get(sha);
      if (!commit) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })) });
    }
    if (path.startsWith(`${repoBase}/git/trees/`) && method === "GET") {
      const sha = path.slice(`${repoBase}/git/trees/`.length);
      const entries = git.trees.get(sha);
      if (!entries) return jsonResponse({ message: "Not Found" }, 404);
      if (url.searchParams.get("recursive") !== "1")
        return jsonResponse({ sha, tree: entries, truncated: false });
      // GitHub's recursive listing: every entry with its full path.
      const flat: TreeEntry[] = [];
      const descend = (list: TreeEntry[], prefix: string) => {
        for (const entry of list) {
          flat.push({ ...entry, path: prefix + entry.path });
          if (entry.type === "tree") descend(git.trees.get(entry.sha) ?? [], `${prefix}${entry.path}/`);
        }
      };
      descend(entries, "");
      return jsonResponse({ sha, tree: flat, truncated: false });
    }
    if (path.startsWith(`${repoBase}/git/blobs/`) && method === "GET") {
      const sha = path.slice(`${repoBase}/git/blobs/`.length);
      const content = git.blobs.get(sha);
      if (content === undefined) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({
        sha,
        size: content.length,
        encoding: "base64",
        content: content.toString("base64"),
      });
    }
    // An uploaded file's bytes, sent as base64 (worker/blobs.ts).
    if (path === `${repoBase}/git/blobs` && method === "POST") {
      if (body.encoding !== "base64" || typeof body.content !== "string")
        return jsonResponse({ message: "Invalid blob" }, 422);
      const content = Buffer.from(body.content, "base64");
      const sha = blobSha(content);
      git.blobs.set(sha, content);
      return jsonResponse({ sha, url: `https://api.github.test${repoBase}/git/blobs/${sha}` }, 201);
    }
    if (path === `${repoBase}/git/trees` && method === "POST") {
      const changes: Change[] = (body.tree as { path: string; mode: string; content?: string; sha?: string | null }[]).map(
        (t) => ({ segments: t.path.split("/"), mode: t.mode, content: t.content, sha: t.sha }),
      );
      try {
        return jsonResponse({ sha: writeTree(git, body.base_tree, changes) });
      } catch (error) {
        return jsonResponse({ message: (error as Error).message }, 422);
      }
    }
    if (path === `${repoBase}/git/commits` && method === "POST") {
      const parents = Array.isArray(body.parents) ? body.parents.map(String) : [];
      const sha = commitSha(body.tree + ":" + parents.join(",") + ":" + Date.now());
      git.commits.set(sha, { tree: body.tree, parents, message: String(body.message ?? ""), date: new Date().toISOString() });
      return jsonResponse({ sha });
    }
    if (path === `${repoBase}/git/refs/heads/main` && method === "PATCH") {
      const next = git.commits.get(String(body.sha));
      if (!next || body.force || !next.parents.includes(git.head))
        return jsonResponse({ message: "Reference update failed" }, 409);
      if (git.lag) git.stale = { sha: git.head, reads: git.lag };
      git.head = body.sha;
      return jsonResponse({ ref: "refs/heads/main", object: { sha: body.sha } });
    }
    return jsonResponse({ message: `Unhandled ${method} ${path}` }, 404);
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// In-memory session store speaking the worker/index.ts DO protocol.
// ---------------------------------------------------------------------------

interface StoredSession {
  kind: string;
  token?: string;
  login?: string;
  avatar_url?: string;
  expiresAt: number;
}
interface SessionSlot {
  value: StoredSession;
  git?: Git;
  fixtureGits?: Map<string, Git>;
}
const sessions = new Map<string, SessionSlot>();
// A Durable Object's other keys (the agent hub's context and draft texts).
const storedKeys = new Map<string, Map<string, unknown>>();
// A Durable Object's storage: "session" is the slot's value.
function storageOf(id: string): HubStorage {
  const keys = storedKeys.get(id) ?? storedKeys.set(id, new Map()).get(id)!;
  const copy = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
  return {
    get: async <T>(key: string) => copy((key === "session" ? sessions.get(id)?.value : keys.get(key)) as T | undefined),
    put: async (entries) => {
      for (const [key, value] of Object.entries(entries))
        if (key === "session") sessions.set(id, { ...sessions.get(id), value: copy(value) as StoredSession });
        else keys.set(key, copy(value));
    },
    delete: async (list) => {
      for (const key of list) key === "session" ? sessions.delete(id) : keys.delete(key);
    },
  };
}
let initialGit: Git;

function newSessionId(): string {
  return createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex");
}

function env(): Env {
  return {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    GITHUB_CLIENT_ID: "demo-client-id",
    GITHUB_CLIENT_SECRET: "demo-client-secret",
    GITHUB_APP_SLUG: "native-site-editor-demo",
    SESSIONS: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        fetch: async (request: Request): Promise<Response> => {
          const slot = sessions.get(id);
          const url = new URL(request.url);
          // The agent hub, as worker/index.ts runs it.
          const storage = storageOf(id);
          if (url.pathname === "/agent-operation") return hubOperation(storage, await request.json(), async () => undefined);
          if (url.pathname === "/agent-drafts") return storeDrafts(storage, await request.json());
          if (url.pathname === "/agent-draft") return readDraft(storage, url.searchParams.get("hash") ?? "");
          if (url.pathname === REGISTRATION_ROUTE) {
            if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
            const { ipHash } = (await request.json()) as { ipHash: unknown };
            if (!isBudgetKey(ipHash)) return new Response(null, { status: 400 });
            return Response.json(await admitRegistration({
              get: storage.get,
              put: async (key, value) => storage.put({ [key]: value }),
              delete: async (key) => { await storage.delete([key]); return true; },
            }, ipHash, Date.now()));
          }
          if (request.method === "PUT") {
            const value = (await request.json()) as StoredSession;
            sessions.set(id, { value, git: slot?.git ?? (value.kind === "user" ? cloneGit(initialGit) : undefined) });
            return new Response(null, { status: 204 });
          }
          if (request.method === "DELETE") {
            await clearHub(storage);
            sessions.delete(id);
            return new Response(null, { status: 204 });
          }
          if (!slot || slot.value.expiresAt <= Date.now())
            return new Response(null, { status: 404 });
          if (url.pathname === "/consume") sessions.delete(id);
          if (slot.value.kind === "agent-hub") return Response.json(await hubView(storage, slot.value as unknown as AgentHub, url));
          return Response.json(slot.value);
        },
      }),
    },
  } as unknown as Env;
}

// ---------------------------------------------------------------------------
// Vite middleware bridging Node http <-> the Worker handler.
// ---------------------------------------------------------------------------

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
  });
}

function toRequest(req: Connect.IncomingMessage, bodyBuffer: Buffer): Request {
  const url = `${publicOrigin()}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD" && bodyBuffer.length > 0;
  return new Request(url, { method, headers, body: hasBody ? bodyBuffer : undefined });
}

function sessionCookieName() {
  return publicOrigin().startsWith("https://") ? "__Host-ase_session" : "ase_session";
}

function sessionCookie(req: Connect.IncomingMessage): string | null {
  const name = sessionCookieName();
  const match = (req.headers.cookie ?? "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function mintSession(): string {
  const id = newSessionId();
  sessions.set(id, {
    value: {
      kind: "user",
      token: "demo-token",
      login: DEMO_LOGIN,
      avatar_url: "",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    },
    git: cloneGit(initialGit),
  });
  return id;
}

// Test-only latency injected before the worker handles a publish, scoped to the
// browser session. Public demo mode does not expose this control channel.
const publishDelays = new Map<string, number>();
const sessionActions = new Map<string, FakeActions>();

function workerMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${appPort}`);
    const path = url.pathname;
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );

    // Test control channel (never part of the real product, never public demo).
    if (path.startsWith("/__demo/")) {
      if (demoMode) {
        res.statusCode = 404;
        return res.end();
      }
      const bodyBuffer = await readBody(req);
      const id = sessionCookie(req);
      if (!id || !sessions.has(id)) {
        res.statusCode = 401;
        return res.end();
      }
      if (path === "/__demo/slow") {
        publishDelays.set(id, Math.max(0, Number(url.searchParams.get("ms") ?? "0") || 0));
        res.statusCode = 204;
        return res.end();
      }
      if (path === "/__demo/lag") {
        // GitHub's reads lag this many reads behind each save from now on.
        sessions.get(id)!.git!.lag = Math.max(0, Number(url.searchParams.get("reads") ?? "0") || 0);
        res.statusCode = 204;
        return res.end();
      }
      if (path === "/__demo/head") {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ commit: sessions.get(id)!.git!.head }));
      }
      if (path === "/__demo/file") {
        // The bytes of a file on the demo branch, as committed.
        const bytes = fileAt(sessions.get(id)!.git, url.searchParams.get("path") ?? "");
        res.statusCode = bytes ? 200 : 404;
        res.setHeader("Content-Type", "application/octet-stream");
        return res.end(bytes ?? Buffer.alloc(0));
      }
      if (path === "/__demo/actions") {
        // GET reads the commits asked about; POST sets what Actions answers.
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify(sessionActions.get(id) ?? NO_ACTIONS));
        }
        const next = JSON.parse(bodyBuffer.toString() || "{}") as FakeActions;
        sessionActions.set(id, { ...next, asked: sessionActions.get(id)?.asked ?? [] });
        res.statusCode = 204;
        return res.end();
      }
      if (path === "/__demo/branch") {
        // A branch of the demo repository from main's head, with one file
        // changed on it when `path` and `content` are given.
        const { name, path: filePath, content } = JSON.parse(bodyBuffer.toString() || "{}");
        const git = sessions.get(id)!.git!;
        let head = git.head;
        if (filePath) {
          const tree = writeTree(git, git.commits.get(head)!.tree, [
            { segments: String(filePath).split("/"), mode: "100644", content: String(content) },
          ]);
          head = commitSha(tree + ":branch:" + name);
          git.commits.set(head, { tree, parents: [git.head] });
        }
        (git.branches ??= new Map()).set(String(name), head);
        res.statusCode = 204;
        return res.end();
      }
      if (path === "/__demo/external-edit") {
        // Simulate an external commit that advances the branch, so the next save
        // of that file with a now-stale baseSha conflicts.
        // `delete: true` removes the file instead.
        const { path: filePath, content, delete: remove } = JSON.parse(bodyBuffer.toString() || "{}");
        const git = sessions.get(id)!.git!;
        const tree = writeTree(git, git.commits.get(git.head)!.tree, [
          remove
            ? { segments: String(filePath).split("/"), mode: "100644", sha: null }
            : { segments: String(filePath).split("/"), mode: "100644", content: String(content) },
        ]);
        const commit = commitSha(tree + ":external:" + Date.now());
        git.commits.set(commit, { tree, parents: [git.head], message: `Edit ${filePath} on GitHub`, date: new Date().toISOString() });
        git.head = commit;
        res.statusCode = 204;
        return res.end();
      }
      res.statusCode = 404;
      return res.end();
    }

    const isWorkerPath =
      path.startsWith("/api/") || path.startsWith("/auth/") || path === "/mcp" || path.startsWith("/.well-known/");

    // A top-level document with no session cookie mints an isolated demo session.
    const accept = req.headers.accept ?? "";
    const isDocument = req.method === "GET" && accept.includes("text/html");
    let mintedCookie: string | undefined;
    if (!isWorkerPath) {
      const existingSession = sessionCookie(req);
      const slot = existingSession ? sessions.get(existingSession) : undefined;
      if (isDocument && (!existingSession || !slot || slot.value.expiresAt <= Date.now())) {
        const id = mintSession();
        const cookieName = sessionCookieName();
        mintedCookie = `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax${publicOrigin().startsWith("https://") ? "; Secure" : ""}`;
        // Make the freshly minted cookie visible to same-request worker calls.
        req.headers.cookie = `${req.headers.cookie ? req.headers.cookie + "; " : ""}${cookieName}=${id}`;
        res.setHeader("Set-Cookie", mintedCookie);
      }
      return next();
    }

    const bodyBuffer = await readBody(req);
    const request = toRequest(req, bodyBuffer);
    // An MCP request carries an agent token, not a cookie: it reads the
    // repositories of the editor session the token belongs to.
    const bearer = /^Bearer (ase_[a-f0-9]{64})$/.exec(req.headers.authorization ?? "")?.[1];
    const agentSession = bearer
      ? (sessions.get(`agent:${createHash("sha256").update(bearer).digest("hex")}`)?.value as { sessionId?: string } | undefined)?.sessionId
      : undefined;
    const id = sessionCookie(req) ?? agentSession ?? null;
    const slot = id ? sessions.get(id) : undefined;
    const git = slot?.git || initialGit;
    if (slot && !slot.fixtureGits) slot.fixtureGits = new Map();
    const fixtureGits = slot?.fixtureGits ?? new Map<string, Git>();
    const delay = id ? (publishDelays.get(id) ?? 0) : 0;
    if (path === "/api/publish" && delay > 0)
      await new Promise((r) => setTimeout(r, delay));
    const response = await handle(request, env(), githubFetch(git, fixtureGits, (id && sessionActions.get(id)) || NO_ACTIONS));

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  };
}

// Demo banner: injected into index.html only in demo mode. It marks the demo
// account/repo and that saves are simulated, so the exposed demo is never
// mistaken for a real GitHub write.
function demoBannerPlugin(): Plugin {
  return {
    name: "ase-native-save-demo-banner",
    apply: "serve",
    transformIndexHtml(html) {
      if (!demoMode) return html;
      const banner = `<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#2d2a24;color:#f6f6f3;font:600 13px/1.4 system-ui,sans-serif;padding:6px 12px;text-align:center">Demo — signed in as <strong>${DEMO_LOGIN}</strong> on <strong>${DEMO_REPO.full_name}</strong>. Saves commit to a simulated in-memory GitHub only. No real token, no real writes.</div>`;
      return html.replace("<body>", `<body>\n${banner}`);
    },
  };
}

async function main() {
  initialGit = buildInitialGit();
  const app = await createServer({
    configFile: false,
    root: projectRoot,
    cacheDir: resolve(projectRoot, `.scratch/native-save/vite-cache-${appPort}`),
    plugins: [
      { name: "ase-native-save-worker", apply: "serve", configureServer(server) {
        server.middlewares.use(workerMiddleware());
      } },
      demoBannerPlugin(),
    ],
    server: {
      host: "127.0.0.1",
      port: appPort,
      strictPort: true,
      watch: {
        ignored: ["**/.scratch/**", "**/test-results/**", "**/playwright-report/**"],
      },
      allowedHosts: process.env.ASE_NATIVE_SAVE_PUBLIC_ORIGIN
        ? [new URL(process.env.ASE_NATIVE_SAVE_PUBLIC_ORIGIN).hostname]
        : undefined,
      fs: { allow: [projectRoot, realpathSync(join(projectRoot, "node_modules"))] },
    },
  });
  await app.listen();
  const cleanup = async () => {
    await app.close().catch(() => undefined);
  };
  process.once("SIGTERM", () => void cleanup().finally(() => process.exit(0)));
  process.once("SIGINT", () => void cleanup().finally(() => process.exit(0)));
  // eslint-disable-next-line no-console
  console.log(`native-save server listening on http://127.0.0.1:${appPort} (demo=${demoMode})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
