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
// Onboarding controls (per browser session, like the other /__demo/ controls;
// send them after the first page load has minted the session cookie, with
// `page.request`). They let the browser suites drive "Get started":
//
//   POST /__demo/onboarding   JSON body, every key optional:
//     { reset: true }                 back to the defaults below, forgetting repos made or added
//     { repositories: "none" }        the account has no repositories (the demo and fixture
//                                     repositories leave the listing); "all" restores them
//     { installed: false }            GET /user/installations answers none, so creating a
//                                     repository fails with 404 (the editor is not installed)
//     { create: "ok" | "forbidden" | "taken" }
//                                     POST /user/repos: creates an empty repository (default);
//                                     403 "Resource not accessible by integration" (the
//                                     fallback path); or 422 "name already exists"
//     { starter: "ok" | "unavailable" }
//                                     the starter tarball (codeload.github.com, built from
//                                     fixtures/starter-template; it has a test address, a
//                                     noindex, wrangler.jsonc, .assetsignore and .github/ that
//                                     the editor must drop) or a 404 from codeload
//     { org: true }                   the account belongs to the organisation demo-org, where the
//                                     App is installed (installation 2): GET /user/installations
//                                     lists it and its repositories "org-site" (the native
//                                     starter fixture) and "org-empty" (no commits) join the
//                                     listing; false takes them away again
//                                     ({ repositories: "none" } hides them too, so Get started
//                                     shows with the installation present)
//     { orgCreate: "ok" | "forbidden" | "taken" }
//                                     POST /orgs/demo-org/repos: creates an empty repository in
//                                     the organisation (default); 403 as when members may not
//                                     create repositories; or 422 "name already exists"
//     { add: [{ name, kind: "empty" | "no-site", private? }] }
//                                     adds a repository to the listing: "empty" has no commits
//                                     and no branches (branches -> [], branch -> 404, commits and
//                                     trees -> 409 "Git Repository is empty."); "no-site" has
//                                     commits but no root index.html (fixtures/no-site, a README)
//     { installOauth: true | false }  the App setting "Request user authorization (OAuth) during
//                                     installation": true (default) sends the install page on to
//                                     /auth/callback with a code; false sends it to the setup URL
//                                     (/?installation_id=1&setup_action=install), after which the
//                                     editor goes to /auth/login
//     { failTree: true | false }      POST git/trees answers 422 (while true), so a first commit
//                                     stops after its first file
//     { cancelInstall: true | false } GitHub's install page, left without installing (the browser
//                                     goes back to "/" with no code): the account stays without the App
//     { installState: "echo" | "drop" }
//                                     whether that callback carries the `state` of the install URL
//                                     back ("echo", default) or not ("drop": the install pending
//                                     cookie decides)
//   GET  /__demo/onboarding   -> { repositories: names listed, created: [{ name, private,
//                                  description? }] as POST /user/repos received them,
//                                  orgCreated: the same for POST /orgs/demo-org/repos,
//                                  starterFetches: n, heads: { [repo]: commit sha | null },
//                                  installs: n, authorizations: n }
//   GET  /__demo/head?repo=NAME and /__demo/file?repo=NAME&path=P  read any repository's head
//                                  and committed bytes (repo defaults to the demo repository).
//
// Signing in (the real worker's /auth/login, /auth/install and /auth/callback run):
// the fake GitHub answers the OAuth code exchange and GET /user with the demo user,
// and a redirect of the worker to github.com (the App's installations/new page, the OAuth
// authorize page) is pointed at its pages:
//   GET /__demo/github/install?state=S     "installs" the App for the user (/user/installations
//                                          lists it from then on) and goes on as the controls say
//   GET /__demo/github/authorize?state=S   authorizes at once: /auth/callback?code=...&state=S
// A browser that starts signed out carries two cookies a test adds before its first load:
//   ase_demo_signed_out=1   no demo session is minted for it
//   ase_demo_browser=KEY    names its onboarding state, so the controls above apply before
//                           and after it signs in (a session id would not exist yet)
//
// A repository created through POST /user/repos is empty, joins the listing
// (installation 1) and takes the first commit through
// PUT /repos/:owner/:repo/contents/:path (what the worker's first save uses),
// which creates the branch asked for in the body (else main); after that the
// normal git-data and commit flow (trees, commits, PATCH refs/heads/main)
// works on it. Until that first commit every git data call (blobs, trees,
// commits) answers 409 "Git Repository is empty.", so an upload (/api/blob)
// fails before it and works after it, and /__demo/file answers 404.
//
// Publishing controls (per browser session; the API under /api/publish/ is
// documented in docs/publishing-hosts.md):
//
//   POST /__demo/hosting   JSON body, every key optional:
//     { reset: true }                 back to the defaults below
//     { pagesMode: "ok" | "private-free" | "forbidden" }
//                                     POST /repos/:o/:r/pages: creates the site (default); 422 "Your
//                                     current plan does not support GitHub Pages" (a private
//                                     repository on a free plan); or 403 on every Pages call (the
//                                     App lacks Pages)
//     { pages: { [repo]: site | null } }   set (or remove) a repository's Pages site directly:
//                                     { source: { branch, path }, build_type, cname, https_enforced }
//     { healthPending: n, healthDomain: {...} }
//                                     GET /pages/health answers 202 n times (default 1), then 200
//                                     with { domain: { host: <cname>, ...healthDomain } }; without a
//                                     cname it answers 400
//     { secretsMode: "ok" | "forbidden" }
//                                     repository Actions secrets: public key, list, PUT (default); or
//                                     403 (the App lacks Secrets). PUT opens the sealed box with the
//                                     repository's libsodium key; only the name, whether it opened and
//                                     the plaintext length are kept, never the value
//     { workflowsMode: "ok" | "refuse" }
//                                     "refuse": PATCH refs/heads/main is refused with 422 "refusing
//                                     to allow a GitHub App to create or update workflow ... without
//                                     `workflows` permission" when the commit changes a file under
//                                     .github/workflows/ (the App lacks Workflows)
//     { deployments: [{ id, environment, creator, state, environment_url?, target_url? }],
//       statuses: [{ context, state, target_url? }], deploymentsMode: "ok" | "forbidden" }
//                                     what GET /deployments (+ /deployments/:id/statuses) and
//                                     /commits/:sha/status answer for any commit
//     { cloudflare: { token?, accounts?: [{ id, name, subdomain }], scriptsAccess? } }
//                                     the fake api.cloudflare.com: accepts the token
//                                     FAKE_CLOUDFLARE_TOKEN (exported below; override with `token`),
//                                     lists the accounts (default one account "demo"), and answers
//                                     the workers/scripts list with 403 when scriptsAccess is false
//   GET  /__demo/hosting  -> { pages: { [repo]: site }, secrets: { [repo]: { NAME: { decrypted,
//                              length } } }, workflowRefusals: n, cloudflareCalls: n }
//
// Ports: 5206 for focused tests, 5208 for the (later) exposed demo. Demo mode
// (`ASE_NATIVE_SAVE_DEMO=1`) adds a visible banner marking the account, repo and
// that all saves are simulated.

import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createServer, type Connect, type Plugin } from "vite";
import { handle, type Env } from "../../worker/app.ts";
import { admitRegistration, isBudgetKey, REGISTRATION_ROUTE } from "../../worker/oauth-registration.ts";
import { clearHub, hubOperation, hubView, readDraft, storeDrafts, type HubStorage } from "../../worker/agent-store.ts";
import type { AgentHub } from "../../worker/agent-context.ts";
import { tarball } from "../tar-helper.ts";

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
  const head = git.commits.get(git.head);
  if (!head) return undefined;
  let entries = git.trees.get(head.tree) ?? [];
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
  /** A host's check runs for any commit (Cloudflare Workers Builds); without them GitHub answers 404. */
  checks?: { name?: string; status: string; conclusion?: string | null; details_url?: string }[];
  /** Every commit the editor asked about. */
  asked?: string[];
}
const NO_ACTIONS: FakeActions = { mode: "none" };

// Publishing to a host, as a test sets it through `/__demo/hosting`, per
// session: GitHub Pages, Actions secrets, deployments and commit statuses of
// every repository, a refusal of workflow files, and a fake Cloudflare API.
export const FAKE_CLOUDFLARE_TOKEN = "cf-test-token-0123456789abcdefghijklmnopqrstuvwxyz";
export const FAKE_CLOUDFLARE_ACCOUNT = "b9b9a2b4c908c9d03abe92a52c2d0f43";
interface PagesSite {
  source: { branch: string; path: string };
  build_type: string;
  cname: string | null;
  https_enforced: boolean;
}
interface Hosting {
  /** Per repository name. */
  pages: Map<string, PagesSite>;
  /** POST /pages: "ok", "private-free" (422, a plan without Pages for private repositories), or "forbidden" (403, the App lacks Pages). */
  pagesMode: "ok" | "private-free" | "forbidden";
  /** GET /pages/health answers 202 this many times, then 200 with `healthDomain`. */
  healthPending: number;
  healthDomain: Record<string, unknown>;
  /** "forbidden": the secrets calls answer 403 (the App lacks Secrets). */
  secretsMode: "ok" | "forbidden";
  /** Secret names per repository, with whether GitHub's key opened them and how long the plaintext was; never the value. */
  secrets: Map<string, Map<string, { decrypted: boolean; length: number }>>;
  /** "refuse": a ref update that changes .github/workflows/* is refused, as for an App without Workflows. */
  workflowsMode: "ok" | "refuse";
  workflowRefusals: number;
  deployments: { id: number; environment: string; creator: string; state: string; environment_url?: string; target_url?: string }[];
  statuses: { context: string; state: string; target_url?: string }[];
  /** "forbidden": deployments and commit statuses answer 403. */
  deploymentsMode: "ok" | "forbidden";
  cloudflare: { token: string; accounts: { id: string; name: string; subdomain: string | null }[]; scriptsAccess: boolean; calls: number };
  keys?: { publicKey: Uint8Array; privateKey: Uint8Array };
}
function newHosting(): Hosting {
  return {
    pages: new Map(),
    pagesMode: "ok",
    healthPending: 1,
    healthDomain: { is_valid: true, dns_resolves: true, is_https_eligible: true, enforces_https: false },
    secretsMode: "ok",
    secrets: new Map(),
    workflowsMode: "ok",
    workflowRefusals: 0,
    deployments: [],
    statuses: [],
    deploymentsMode: "ok",
    cloudflare: { token: FAKE_CLOUDFLARE_TOKEN, accounts: [{ id: FAKE_CLOUDFLARE_ACCOUNT, name: "Demo account", subdomain: "demo" }], scriptsAccess: true, calls: 0 },
  };
}
// Every file path to its blob sha, under a tree.
function flattenTree(git: Git, treeSha: string | undefined, prefix = "", out = new Map<string, string>()) {
  for (const entry of git.trees.get(treeSha ?? "") ?? []) {
    if (entry.type === "tree") flattenTree(git, entry.sha, `${prefix}${entry.path}/`, out);
    else out.set(prefix + entry.path, entry.sha);
  }
  return out;
}

// Onboarding, as a test sets it through `/__demo/onboarding`, per session.
interface Onboarding {
  hideDefault: boolean;
  installed: boolean;
  create: "ok" | "forbidden" | "taken";
  /** The organisation demo-org, its installation and repositories are there. */
  org: boolean;
  orgCreate: "ok" | "forbidden" | "taken";
  orgCreated: { name: string; private: boolean; description?: string }[];
  starter: "ok" | "unavailable";
  // Repositories made by POST /user/repos or added by the test, with their own git.
  repos: Map<string, { repo: typeof DEMO_REPO; git: Git }>;
  created: { name: string; private: boolean; description?: string }[];
  starterFetches: number;
  nextId: number;
  /** "Request user authorization during installation": the install page goes on to the callback with a code. */
  installOauth: boolean;
  installState: "echo" | "drop";
  /** The user leaves GitHub's install page without installing: it goes back to the editor with no code. */
  cancelInstall: boolean;
  installs: number;
  authorizations: number;
  failTree: boolean;
}
function newOnboarding(): Onboarding {
  return { hideDefault: false, installed: true, create: "ok", org: false, orgCreate: "ok", orgCreated: [], starter: "ok", repos: new Map(), created: [], starterFetches: 0, nextId: 600, installOauth: true, installState: "echo", cancelInstall: false, installs: 0, authorizations: 0, failTree: false };
}

const ORG_LOGIN = "demo-org";
const ORG_SEEDED = ["org-site", "org-empty"];
const orgRepo = (id: number, name: string, isPrivate = true) => ({
  ...DEMO_REPO,
  id,
  name,
  full_name: `${ORG_LOGIN}/${name}`,
  private: isPrivate,
  owner: { login: ORG_LOGIN, type: "Organization" },
});

// A repository with no commits and no branches.
function emptyGit(): Git {
  return { blobs: new Map(), trees: new Map(), commits: new Map(), head: "" };
}

let starterTarball: Uint8Array | undefined;
// The starter template's files as GitHub's codeload serves them (one top folder).
function starterArchive(): Uint8Array {
  if (!starterTarball) {
    const files: Record<string, Buffer> = {};
    const root = resolve(projectRoot, "fixtures/starter-template");
    const walk = (relative: string) => {
      for (const dirent of readdirSync(join(root, relative), { withFileTypes: true })) {
        const rel = relative ? `${relative}/${dirent.name}` : dirent.name;
        if (dirent.isDirectory()) walk(rel);
        else files[rel] = readFileSync(join(root, rel));
      }
    };
    walk("");
    starterTarball = tarball(files, "techiesreviews-native-site-editor-starter-0123456");
  }
  return starterTarball;
}

// A fake `fetch` bound to one session's git models: the demo repository's,
// and the fixture repositories' (cloned on first use).
function githubFetch(
  demoGit: Git,
  fixtureGits: Map<string, Git>,
  actions: FakeActions = NO_ACTIONS,
  onboarding: Onboarding = newOnboarding(),
  hosting: Hosting = newHosting(),
): typeof fetch {
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

    // The Cloudflare API, for a pasted token.
    if (url.hostname === "api.cloudflare.com") {
      hosting.cloudflare.calls++;
      const cf = (result: unknown) => jsonResponse({ success: true, errors: [], result });
      const denied = () => jsonResponse({ success: false, errors: [{ code: 1000, message: "Invalid API Token" }], result: null }, 401);
      if (new Headers(init?.headers).get("Authorization") !== `Bearer ${hosting.cloudflare.token}`) return denied();
      const api = path.replace("/client/v4", "");
      if (api === "/user/tokens/verify") return cf({ id: "token", status: "active" });
      if (api === "/accounts") return cf(hosting.cloudflare.accounts.map(({ id, name }) => ({ id, name })));
      const account = /^\/accounts\/([a-f0-9]{32})\/(.+)$/.exec(api);
      const found = account && hosting.cloudflare.accounts.find((entry) => entry.id === account[1]);
      if (found && account[2] === "workers/subdomain")
        return found.subdomain ? cf({ subdomain: found.subdomain }) : jsonResponse({ success: false, errors: [{ code: 10007 }], result: null }, 404);
      if (found && account[2] === "workers/scripts")
        return hosting.cloudflare.scriptsAccess ? cf([]) : jsonResponse({ success: false, errors: [{ code: 10000 }], result: null }, 403);
      return jsonResponse({ success: false, errors: [], result: null }, 404);
    }
    // The Starter site's tarball.
    if (url.hostname === "codeload.github.com") {
      onboarding.starterFetches++;
      if (onboarding.starter === "unavailable") return new Response("Not Found", { status: 404 });
      return new Response(starterArchive() as BodyInit, { headers: { "Content-Type": "application/x-gzip" } });
    }
    // The OAuth code exchange and the signed-in user (the demo user).
    if (url.hostname === "github.com" && path === "/login/oauth/access_token")
      return jsonResponse({ access_token: "demo-token", expires_in: 28800 });
    if (path === "/user" && method === "GET") return jsonResponse({ login: DEMO_LOGIN, avatar_url: "" });
    if (path === "/user/installations")
      return jsonResponse({
        installations: [
          ...(onboarding.installed ? [{ id: 1, account: { type: "User", login: DEMO_LOGIN } }] : []),
          ...(onboarding.org ? [{ id: 2, account: { type: "Organization", login: ORG_LOGIN } }] : []),
        ],
      });
    const listed = (owner = DEMO_LOGIN) => [
      ...(onboarding.hideDefault || owner !== DEMO_LOGIN ? [] : [DEMO_REPO, ...FIXTURE_REPOS.map((fixture) => fixture.repo)]),
      ...[...onboarding.repos.values()]
        .map((entry) => entry.repo)
        .filter((repo) => repo.owner.login === owner && !(onboarding.hideDefault && ORG_SEEDED.includes(repo.name))),
    ];
    if (path === "/user/installations/1/repositories") return jsonResponse({ repositories: listed() });
    if (path === "/user/installations/2/repositories" && onboarding.org) return jsonResponse({ repositories: listed(ORG_LOGIN) });
    // Creating a repository in the organisation.
    if (path === `/orgs/${ORG_LOGIN}/repos` && method === "POST" && onboarding.org) {
      const name = String(body?.name ?? "");
      onboarding.orgCreated.push({ name, private: body?.private === true, ...(body?.description ? { description: String(body.description) } : {}) });
      if (onboarding.orgCreate === "forbidden") return jsonResponse({ message: "You are not allowed to create repositories in this organization." }, 403);
      if (onboarding.orgCreate === "taken" || listed(ORG_LOGIN).some((repo) => repo.name.toLowerCase() === name.toLowerCase()))
        return jsonResponse({ message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] }, 422);
      const repo = orgRepo(onboarding.nextId++, name, body?.private === true);
      onboarding.repos.set(name, { repo, git: emptyGit() });
      return jsonResponse({ ...repo, html_url: `https://github.com/${repo.full_name}` }, 201);
    }
    // Creating a repository: empty, and added to the installation.
    if (path === "/user/repos" && method === "POST") {
      const name = String(body?.name ?? "");
      onboarding.created.push({ name, private: body?.private === true, ...(body?.description ? { description: String(body.description) } : {}) });
      if (onboarding.create === "forbidden") return jsonResponse({ message: "Resource not accessible by integration" }, 403);
      if (onboarding.create === "taken" || listed().some((repo) => repo.name.toLowerCase() === name.toLowerCase()))
        return jsonResponse({ message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] }, 422);
      const repo = { ...DEMO_REPO, id: onboarding.nextId++, name, full_name: `${DEMO_LOGIN}/${name}`, private: body?.private === true };
      onboarding.repos.set(name, { repo, git: emptyGit() });
      return jsonResponse({ ...repo, owner: { ...repo.owner, id: 1 }, html_url: `https://github.com/${repo.full_name}` }, 201);
    }

    const repoName = /^\/repos\/[^/]+\/([^/]+)/.exec(path)?.[1] ?? DEMO_REPO.name;
    const fixture = FIXTURE_REPOS.find((item) => item.repo.name === repoName);
    if (fixture && !fixtureGits.has(repoName)) {
      if (!initialFixtureGits.has(repoName)) initialFixtureGits.set(repoName, buildInitialGit(fixture.root));
      fixtureGits.set(repoName, cloneGit(initialFixtureGits.get(repoName)!));
    }
    const extra = onboarding.repos.get(repoName);
    const git = extra ? extra.git : fixture ? fixtureGits.get(repoName)! : demoGit;
    const repoBase = `/repos/${extra?.repo.owner.login ?? DEMO_REPO.owner.login}/${extra || fixture ? repoName : DEMO_REPO.name}`;
    // The contents API makes a file in one commit, and the first commit (and
    // the branch main) of an empty repository.
    const contents = new RegExp(`^${repoBase}/contents/(.+)$`).exec(path);
    if (contents && method === "PUT") {
      const filePath = contents[1].split("/").map(decodeURIComponent);
      if (typeof body?.content !== "string" || !body?.message) return jsonResponse({ message: "Invalid request." }, 422);
      // The branch asked for, else the default one. An empty repository's first
      // commit makes it; in any other repository it must exist.
      const branch = typeof body.branch === "string" && body.branch ? body.branch : DEMO_REPO.default_branch;
      const isEmpty = !git.head && !git.branches?.size;
      const onMain = branch === DEMO_REPO.default_branch;
      const parent = onMain ? git.head : git.branches?.get(branch) ?? "";
      if (!parent && !isEmpty) return jsonResponse({ message: `Branch ${branch} not found` }, 422);
      if (parent && fileAt({ ...git, head: parent }, filePath.join("/"))) return jsonResponse({ message: "Invalid request. \"sha\" wasn't supplied." }, 422);
      const bytes = Buffer.from(body.content, "base64");
      const baseTree = parent ? git.commits.get(parent)!.tree : "";
      const tree = writeTree(git, baseTree, [{ segments: filePath, mode: "100644", content: bytes.toString("utf8") }]);
      const parents = parent ? [parent] : [];
      const sha = commitSha(tree + ":" + parents.join(",") + ":" + Date.now());
      git.commits.set(sha, { tree, parents, message: String(body.message), date: new Date().toISOString() });
      if (onMain) git.head = sha;
      else (git.branches ??= new Map()).set(branch, sha);
      return jsonResponse({ content: { path: filePath.join("/"), sha: blobSha(bytes) }, commit: { sha } }, 201);
    }
    // GitHub's answers for a repository with no commits.
    // Any git data call (blobs, trees, commits) is a 409 until the first commit.
    if (!git.head && !git.branches?.size && path.startsWith(repoBase)) {
      if (path === `${repoBase}/branches`) return jsonResponse([]);
      if (path.startsWith(`${repoBase}/branches/`)) return jsonResponse({ message: "Branch not found" }, 404);
      if (/\/(commits|git\/commits|git\/trees|git\/blobs)(\/|$)/.test(path.slice(repoBase.length)))
        return jsonResponse({ message: "Git Repository is empty." }, 409);
    }
    // Publishing to a host: GitHub Pages, repository secrets, deployments, statuses.
    if (path.startsWith(`${repoBase}/`)) {
      const rest = path.slice(repoBase.length);
      const forbidden = () => jsonResponse({ message: "Resource not accessible by integration" }, 403);
      if (rest === "/pages" || rest === "/pages/health") {
        const site = hosting.pages.get(repoName);
        if (hosting.pagesMode === "forbidden") return forbidden();
        if (rest === "/pages/health") {
          if (!site?.cname) return jsonResponse({ message: "Custom domain is not set up" }, 400);
          if (hosting.healthPending > 0) {
            hosting.healthPending--;
            return new Response(null, { status: 202 });
          }
          return jsonResponse({ domain: { host: site.cname, ...hosting.healthDomain } });
        }
        if (method === "GET")
          return site
            ? jsonResponse({
                html_url: `https://${DEMO_LOGIN}.github.io/${repoName}/`,
                status: "built",
                build_type: site.build_type,
                source: site.source,
                cname: site.cname,
                https_enforced: site.https_enforced,
                https_certificate: site.cname ? { state: "new" } : null,
              })
            : jsonResponse({ message: "Not Found" }, 404);
        if (method === "POST") {
          if (hosting.pagesMode === "private-free")
            return jsonResponse({ message: "Your current plan does not support GitHub Pages for this repository." }, 422);
          if (site) return jsonResponse({ message: "A GitHub Pages site already exists for this repository." }, 409);
          hosting.pages.set(repoName, { source: body.source, build_type: body.build_type ?? "legacy", cname: null, https_enforced: false });
          return jsonResponse({ source: body.source }, 201);
        }
        if (method === "PUT") {
          if (!site) return jsonResponse({ message: "Not Found" }, 404);
          if (body.https_enforced && !site.cname) return jsonResponse({ message: "The certificate does not exist yet." }, 422);
          if (body.source) site.source = body.source;
          if (body.build_type) site.build_type = body.build_type;
          if ("cname" in body) site.cname = body.cname;
          if (body.https_enforced !== undefined) site.https_enforced = body.https_enforced;
          return new Response(null, { status: 204 });
        }
      }
      if (rest.startsWith("/actions/secrets")) {
        if (hosting.secretsMode === "forbidden") return forbidden();
        hosting.keys ??= sodium.crypto_box_keypair();
        const names = hosting.secrets.get(repoName) ?? hosting.secrets.set(repoName, new Map()).get(repoName)!;
        if (rest === "/actions/secrets/public-key")
          return jsonResponse({ key_id: "568250167242549743", key: Buffer.from(hosting.keys.publicKey).toString("base64") });
        if (rest === "/actions/secrets" && method === "GET") return jsonResponse({ total_count: names.size, secrets: [...names.keys()].map((name) => ({ name })) });
        const name = /^\/actions\/secrets\/([A-Z0-9_]+)$/.exec(rest)?.[1];
        if (name && method === "PUT") {
          let decrypted = false, length = 0;
          try {
            const opened = sodium.crypto_box_seal_open(Buffer.from(String(body.encrypted_value), "base64"), hosting.keys.publicKey, hosting.keys.privateKey);
            decrypted = opened.length > 0;
            length = opened.length;
          } catch { /* a value the key does not open is recorded as such */ }
          const created = !names.has(name);
          names.set(name, { decrypted, length });
          return new Response(null, { status: created ? 201 : 204 });
        }
      }
      if (rest.startsWith("/deployments") || /^\/commits\/[^/]+\/status$/.test(rest)) {
        if (hosting.deploymentsMode === "forbidden") return forbidden();
        if (rest === "/deployments")
          return jsonResponse(hosting.deployments.map((entry) => ({ id: entry.id, environment: entry.environment, creator: { login: entry.creator } })));
        const statuses = /^\/deployments\/(\d+)\/statuses$/.exec(rest);
        if (statuses) {
          const entry = hosting.deployments.find((candidate) => candidate.id === Number(statuses[1]));
          return jsonResponse(entry ? [{ state: entry.state, environment_url: entry.environment_url, target_url: entry.target_url }] : []);
        }
        return jsonResponse({ state: "success", statuses: hosting.statuses });
      }
    }
    if (new RegExp(`^${repoBase}/commits/[0-9a-f]{40}/check-runs$`).test(path)) {
      if (!actions.checks) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ total_count: actions.checks.length, check_runs: actions.checks.map((run, index) => ({ id: index + 1, app: { slug: "cloudflare-workers-and-pages" }, html_url: `https://github.com/${DEMO_REPO.full_name}/runs/${index + 1}`, ...run })) });
    }
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
      return jsonResponse([...(git.head ? [{ name: "main" }] : []), ...[...(git.branches?.keys() ?? [])].map((name) => ({ name }))]);
    const other = new RegExp(`^${repoBase}/branches/(.+)$`).exec(path);
    const otherHead = other ? git.branches?.get(decodeURIComponent(other[1])) : undefined;
    if (otherHead) return jsonResponse({ commit: { sha: otherHead } });
    if (path === `${repoBase}/branches/main`) {
      if (!git.head) return jsonResponse({ message: "Branch not found" }, 404);
      if (git.stale && git.stale.reads-- > 0) return jsonResponse({ commit: { sha: git.stale.sha } });
      return jsonResponse({ commit: { sha: git.head } });
    }
    // A branch's ref (worker/publish.ts reads it when GitHub does not list the branch yet).
    const refRead = new RegExp(`^${repoBase}/git/ref/heads/(.+)$`).exec(path);
    if (refRead && method === "GET") {
      const name = decodeURIComponent(refRead[1]);
      const sha = name === DEMO_REPO.default_branch ? git.head : git.branches?.get(name);
      return sha ? jsonResponse({ ref: `refs/heads/${name}`, object: { sha, type: "commit" } }) : jsonResponse({ message: "Not Found" }, 404);
    }
    // Whether `head` is ahead of, behind, or the same as `base`.
    const compare = new RegExp(`^${repoBase}/compare/([a-f0-9]{40})\\.\\.\\.([a-f0-9]{40})$`).exec(path);
    if (compare) {
      const [, base, head] = compare;
      if (!git.commits.has(base) || !git.commits.has(head)) return jsonResponse({ message: "Not Found" }, 404);
      const reaches = (from: string, to: string): boolean => from === to || (git.commits.get(from)?.parents ?? []).some((parent) => reaches(parent, to));
      const status = base === head ? "identical" : reaches(head, base) ? "ahead" : reaches(base, head) ? "behind" : "diverged";
      // The files that differ between the two commits' trees, as GitHub lists them.
      const after = flattenTree(git, git.commits.get(head)!.tree);
      const before = flattenTree(git, git.commits.get(base)!.tree);
      const files = [
        ...[...after].filter(([file, sha]) => before.get(file) !== sha).map(([file]) => ({ filename: file, status: before.has(file) ? "modified" : "added" })),
        ...[...before.keys()].filter((file) => !after.has(file)).map((file) => ({ filename: file, status: "removed" })),
      ];
      return jsonResponse({ status, files });
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
      // Without a path, every commit (the site's history).
      const all = !url.searchParams.get("path");
      const touched: string[] = [];
      for (let sha = url.searchParams.get("sha") ?? git.head; git.commits.has(sha); sha = git.commits.get(sha)!.parents[0] ?? "") {
        const parent = git.commits.get(sha)!.parents[0];
        const here = all ? undefined : blobAt(sha);
        if (all || here !== (parent ? blobAt(parent) : undefined)) touched.push(sha);
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
    // A commit's changed files, against its first parent.
    const single = new RegExp(`^${repoBase}/commits/([a-f0-9]{40})$`).exec(path);
    if (single && method === "GET") {
      const commit = git.commits.get(single[1]);
      if (!commit) return jsonResponse({ message: "Not Found" }, 404);
      const flatten = (tree: string | undefined, prefix = "", out = new Map<string, string>()) => {
        for (const entry of git.trees.get(tree ?? "") ?? []) {
          if (entry.type === "tree") flatten(entry.sha, `${prefix}${entry.path}/`, out);
          else out.set(prefix + entry.path, entry.sha);
        }
        return out;
      };
      const after = flatten(commit.tree);
      const before = flatten(commit.parents[0] ? git.commits.get(commit.parents[0])?.tree : undefined);
      const files = [
        ...[...after].filter(([file, sha]) => before.get(file) !== sha)
          .map(([file]) => ({ filename: file, status: before.has(file) ? "modified" : "added" })),
        ...[...before.keys()].filter((file) => !after.has(file)).map((file) => ({ filename: file, status: "removed" })),
      ];
      return jsonResponse({ sha: single[1], files });
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
      if (onboarding.failTree) return jsonResponse({ message: "Validation Failed" }, 422);
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
      // A GitHub App without the Workflows permission may not change a workflow file.
      if (hosting.workflowsMode === "refuse") {
        const before = flattenTree(git, git.commits.get(git.head)?.tree);
        const touched = [...flattenTree(git, next.tree)].filter(([file, sha]) => file.startsWith(".github/workflows/") && before.get(file) !== sha);
        if (touched.length) {
          hosting.workflowRefusals++;
          return jsonResponse({ message: `refusing to allow a GitHub App to create or update workflow \`${touched[0][0]}\` without \`workflows\` permission` }, 422);
        }
      }
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

function cookieNamed(req: Connect.IncomingMessage, name: string): string | null {
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
const sessionOnboarding = new Map<string, Onboarding>();
const sessionHosting = new Map<string, Hosting>();
const hostingOf = (id: string) => sessionHosting.get(id) ?? sessionHosting.set(id, newHosting()).get(id)!;
const onboardingOf = (id: string) => sessionOnboarding.get(id) ?? sessionOnboarding.set(id, newOnboarding()).get(id)!;
// A repository's git for the head and file controls: the demo's, or one made or added by a test.
const gitOf = (key: string, id: string | null, repoName: string | null) =>
  (repoName && onboardingOf(key).repos.get(repoName)?.git) || sessions.get(id ?? key)!.git!;

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
      const browser = cookieNamed(req, "ase_demo_browser");
      // The pages of the fake GitHub: a browser that is not signed in has no session, only its key.
      if (path === "/__demo/github/install" || path === "/__demo/github/authorize") {
        const state = onboardingOf(browser ?? id ?? "anonymous");
        const returned = url.searchParams.get("state");
        let target: string;
        if (path === "/__demo/github/install" && state.cancelInstall) {
          // Cancelled on GitHub: nothing is installed and the browser goes back to the editor.
          target = "/";
        } else if (path === "/__demo/github/install") {
          state.installs++;
          state.installed = true;
          if (state.installOauth) {
            const query = new URLSearchParams({ code: "fake-code", installation_id: "1", setup_action: "install" });
            if (returned && state.installState === "echo") query.set("state", returned);
            target = `/auth/callback?${query}`;
          } else target = "/?installation_id=1&setup_action=install";
        } else {
          state.authorizations++;
          target = `/auth/callback?${new URLSearchParams({ code: "fake-code", ...(returned ? { state: returned } : {}) })}`;
        }
        res.statusCode = 302;
        res.setHeader("Location", target);
        return res.end();
      }
      const keyed = Boolean(browser) && ["/__demo/onboarding", "/__demo/head", "/__demo/file"].includes(path);
      if ((!id || !sessions.has(id)) && !keyed) {
        res.statusCode = 401;
        return res.end();
      }
      const key = browser ?? id!;
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
        return res.end(JSON.stringify({ commit: gitOf(key, id, url.searchParams.get("repo")).head || null }));
      }
      if (path === "/__demo/onboarding") {
        const state = onboardingOf(key);
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({
            repositories: [
              ...(state.hideDefault ? [] : [DEMO_REPO, ...FIXTURE_REPOS.map((fixture) => fixture.repo)]),
              ...[...state.repos.values()].map((entry) => entry.repo),
            ].map((repo) => repo.name),
            created: state.created,
            orgCreated: state.orgCreated,
            starterFetches: state.starterFetches,
            installs: state.installs,
            authorizations: state.authorizations,
            heads: Object.fromEntries([...state.repos].map(([name, entry]) => [name, entry.git.head || null])),
          }));
        }
        const options = JSON.parse(bodyBuffer.toString() || "{}");
        if (options.reset) sessionOnboarding.delete(key);
        const next = onboardingOf(key);
        if (typeof options.installOauth === "boolean") next.installOauth = options.installOauth;
        if (typeof options.failTree === "boolean") next.failTree = options.failTree;
        if (["echo", "drop"].includes(options.installState)) next.installState = options.installState;
        if (typeof options.cancelInstall === "boolean") next.cancelInstall = options.cancelInstall;
        if (options.repositories === "none" || options.repositories === "all") next.hideDefault = options.repositories === "none";
        if (typeof options.installed === "boolean") next.installed = options.installed;
        if (["ok", "forbidden", "taken"].includes(options.create)) next.create = options.create;
        if (["ok", "forbidden", "taken"].includes(options.orgCreate)) next.orgCreate = options.orgCreate;
        if (typeof options.org === "boolean" && options.org !== next.org) {
          next.org = options.org;
          for (const [name, entry] of next.repos) if (entry.repo.owner.login === ORG_LOGIN) next.repos.delete(name);
          if (options.org) {
            next.repos.set("org-site", { repo: orgRepo(700, "org-site"), git: buildInitialGit() });
            next.repos.set("org-empty", { repo: orgRepo(701, "org-empty"), git: emptyGit() });
          }
        }
        if (["ok", "unavailable"].includes(options.starter)) next.starter = options.starter;
        for (const added of options.add ?? []) {
          const name = String(added.name);
          const repo = { ...DEMO_REPO, id: next.nextId++, name, full_name: `${DEMO_LOGIN}/${name}`, private: added.private !== false };
          const git = added.kind === "no-site" ? buildInitialGit(resolve(projectRoot, "fixtures/no-site")) : emptyGit();
          next.repos.set(name, { repo, git });
        }
        res.statusCode = 204;
        return res.end();
      }
      if (path === "/__demo/hosting") {
        const state = hostingOf(id);
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({
            pages: Object.fromEntries(state.pages),
            secrets: Object.fromEntries([...state.secrets].map(([repo, names]) => [repo, Object.fromEntries(names)])),
            workflowRefusals: state.workflowRefusals,
            cloudflareCalls: state.cloudflare.calls,
          }));
        }
        const options = JSON.parse(bodyBuffer.toString() || "{}");
        if (options.reset) sessionHosting.delete(id);
        const next = hostingOf(id);
        if (["ok", "private-free", "forbidden"].includes(options.pagesMode)) next.pagesMode = options.pagesMode;
        if (typeof options.healthPending === "number") next.healthPending = options.healthPending;
        if (options.healthDomain) next.healthDomain = options.healthDomain;
        if (["ok", "forbidden"].includes(options.secretsMode)) next.secretsMode = options.secretsMode;
        if (["ok", "refuse"].includes(options.workflowsMode)) next.workflowsMode = options.workflowsMode;
        if (["ok", "forbidden"].includes(options.deploymentsMode)) next.deploymentsMode = options.deploymentsMode;
        if (Array.isArray(options.deployments)) next.deployments = options.deployments;
        if (Array.isArray(options.statuses)) next.statuses = options.statuses;
        if (options.cloudflare) Object.assign(next.cloudflare, options.cloudflare);
        if (options.pages) for (const [repo, site] of Object.entries(options.pages)) site ? next.pages.set(repo, site as PagesSite) : next.pages.delete(repo);
        res.statusCode = 204;
        return res.end();
      }
      if (path === "/__demo/file") {
        // The bytes of a file on the demo branch, as committed.
        const bytes = fileAt(gitOf(key, id, url.searchParams.get("repo")), url.searchParams.get("path") ?? "");
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
      if (isDocument && !cookieNamed(req, "ase_demo_signed_out") && (!existingSession || !slot || slot.value.expiresAt <= Date.now())) {
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
    const onboardingKey = cookieNamed(req, "ase_demo_browser") ?? id;
    const git = slot?.git || initialGit;
    if (slot && !slot.fixtureGits) slot.fixtureGits = new Map();
    const fixtureGits = slot?.fixtureGits ?? new Map<string, Git>();
    const delay = id ? (publishDelays.get(id) ?? 0) : 0;
    if (path === "/api/publish" && delay > 0)
      await new Promise((r) => setTimeout(r, delay));
    const response = await handle(request, env(), githubFetch(git, fixtureGits, (id && sessionActions.get(id)) || NO_ACTIONS, onboardingKey ? onboardingOf(onboardingKey) : newOnboarding(), id ? hostingOf(id) : newHosting()));

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") res.setHeader(key, value);
    });
    // The worker's redirects to GitHub go to the fake GitHub's pages instead.
    const location = response.headers.get("location");
    if (response.status === 302 && location?.startsWith("https://github.com/")) {
      const target = new URL(location);
      res.setHeader(
        "Location",
        `/__demo/github/${target.pathname === "/login/oauth/authorize" ? "authorize" : "install"}${target.search}`,
      );
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
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
