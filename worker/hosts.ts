// Publishing to a host: the JSON endpoints under `/api/publish/` that the
// editor's Publish panel uses (docs/publishing-hosts.md). Same-origin, session
// authorized; the POSTs have app.ts's Origin check; every endpoint authorizes
// the repository through `authorizeRepository`.
//
// The repository is the site, so there is nothing to build here: GitHub Pages
// serves the branch, or a workflow in the repository uploads its files to
// Cloudflare or Spacefast. A token the user pastes (Cloudflare, Spacefast) is
// used for the one request that carries it and is never stored, logged or
// returned: it goes to GitHub only as an encrypted repository secret.
import type { Repository } from "../shared/types";
import { changeStatus } from "./change-status";
import { requestJson } from "./http";
import { GitHub, HttpError } from "./github";
import { sealSecret } from "./sealed-box";
import {
  NOJEKYLL_FILE,
  PIPELINE_SECRETS,
  checkDomain,
  dnsInstruction,
  dnsRecords,
  pagesRoot,
  pipelineFiles,
  validCloudflareAccountId,
  validCloudflareToken,
  validSpacefastSpace,
  validSpacefastToken,
  workerNameFor,
  type CloudflareAccount,
  type DetectedHost,
  type DnsRecord,
  type PagesStatus,
  type PipelineProvider,
  type PipelineStatus,
  type PublishStatus,
  type SecretsState,
} from "../shared/hosting";
import type { TreeEntry } from "../shared/types";

export const PAGES_PERMISSION_MESSAGE = "The editor needs the Pages permission: ask the owner to accept it.";
export const SECRETS_PERMISSION_MESSAGE = "The editor needs the Secrets permission: ask the owner to accept it.";
export const PAGES_PLAN_MESSAGE =
  "GitHub Pages is free only for public repositories. Make this repository public, upgrade the GitHub plan, or publish with Cloudflare instead.";

const segment = encodeURIComponent;

// ---------------------------------------------------------------------------
// Reading the repository
// ---------------------------------------------------------------------------

interface HeadTree {
  commit: string;
  tree: Map<string, TreeEntry>;
}

/** The branch's head and its whole file listing; `null` for a repository with no commits or no such branch. */
async function headTree(github: GitHub, repo: Repository, branch: string): Promise<HeadTree | null> {
  try {
    const head = await github.head(repo, branch);
    const entries = await github.commitTree(repo, head.sha);
    return { commit: head.sha, tree: new Map(entries.map((entry) => [entry.path, entry])) };
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 409)) return null;
    throw error;
  }
}

async function textAt(github: GitHub, repo: Repository, head: HeadTree | null, path: string): Promise<string> {
  const entry = head?.tree.get(path);
  if (!entry || entry.type !== "blob") return "";
  return github.file(repo, entry.sha).catch(() => "");
}

function parseConfig(text: string) {
  const empty = { name: null as string | null, url: null as string | null, cloudflareUrl: null as string | null };
  try {
    const value = JSON.parse(text);
    const address = (candidate: unknown) => {
      if (typeof candidate !== "string") return null;
      try {
        const url = new URL(candidate);
        return url.protocol === "https:" || url.protocol === "http:" ? url.origin + (url.pathname === "/" ? "" : url.pathname) : null;
      } catch {
        return null;
      }
    };
    const cloudflare = address(value?.hosting?.cloudflare?.url);
    return {
      name: typeof value?.site?.name === "string" ? value.site.name : null,
      url: address(value?.site?.url),
      cloudflareUrl: cloudflare && new URL(cloudflare).hostname.endsWith(".workers.dev") ? cloudflare : null,
    };
  } catch {
    return empty;
  }
}

/** The `name` of wrangler.jsonc / wrangler.json / wrangler.toml. */
function wranglerName(text: string): string | null {
  return /"name"\s*:\s*"([a-z0-9-]{1,63})"/i.exec(text)?.[1] ?? /^\s*name\s*=\s*"([a-z0-9-]{1,63})"/im.exec(text)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// GitHub Pages
// ---------------------------------------------------------------------------

interface PagesResponse {
  html_url?: string;
  cname?: string | null;
  https_enforced?: boolean;
  https_certificate?: { state?: string } | null;
  status?: string | null;
  build_type?: string | null;
  source?: { branch?: string; path?: string };
}

function pagesStatus(repo: Repository, data: PagesResponse | null, problem?: string): PagesStatus {
  const cname = data?.cname || null;
  const root = pagesRoot(repo.owner.login, repo.name, cname);
  const base: PagesStatus = {
    enabled: data ? true : problem ? null : false,
    url: null,
    cname,
    httpsEnforced: null,
    httpsState: null,
    buildStatus: null,
    source: null,
    rootServed: root.rootServed,
    rootReason: root.reason,
    rootMessage: root.message,
    privateRepository: repo.private,
  };
  if (problem) base.problem = problem;
  if (!data) return base;
  const owner = repo.owner.login.toLowerCase();
  const fallback = repo.name.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo.name}/`;
  return {
    ...base,
    url: cname ? `https://${cname}/` : typeof data.html_url === "string" ? data.html_url : fallback,
    httpsEnforced: typeof data.https_enforced === "boolean" ? data.https_enforced : null,
    httpsState: data.https_certificate?.state ?? null,
    buildStatus: data.status ?? null,
    source: data.source?.branch ? { branch: data.source.branch, path: data.source.path ?? "/" } : null,
  };
}

async function readPages(github: GitHub, repo: Repository): Promise<{ status: PagesStatus; data: PagesResponse | null }> {
  const result = await github.exchange(`${github.base(repo)}/pages`, "GET");
  if (result.status === 200) return { status: pagesStatus(repo, result.data), data: result.data };
  if (result.status === 404) return { status: pagesStatus(repo, null), data: null };
  if (result.status === 403) return { status: pagesStatus(repo, null, PAGES_PERMISSION_MESSAGE), data: null };
  return { status: pagesStatus(repo, null, "GitHub could not say whether Pages is on. Try again."), data: null };
}

function pagesError(repo: Repository, status: number, data: any): HttpError {
  const message = typeof data?.message === "string" ? data.message : "";
  if (/plan|upgrade|public repositor/i.test(message) && status !== 401) return new HttpError(422, PAGES_PLAN_MESSAGE);
  if (status === 403) return new HttpError(403, PAGES_PERMISSION_MESSAGE);
  if (repo.private && (status === 422 || status === 404)) return new HttpError(422, PAGES_PLAN_MESSAGE);
  if (status === 404) return new HttpError(404, "GitHub could not find Pages for this repository. Check that the editor has access to it.");
  if (status === 409) return new HttpError(409, "GitHub is already updating Pages for this repository. Try again in a moment.");
  if (status === 422)
    return new HttpError(422, `GitHub did not accept those Pages settings${message ? `: ${message.slice(0, 200)}` : "."}`);
  return new HttpError(502, "GitHub could not change Pages. Try again.");
}

// ---------------------------------------------------------------------------
// The status
// ---------------------------------------------------------------------------

async function secretNames(github: GitHub, repo: Repository): Promise<SecretsState> {
  const result = await github.exchange(`${github.base(repo)}/actions/secrets?per_page=100`, "GET");
  if (!result.ok || !Array.isArray(result.data?.secrets)) return { state: "unavailable", names: [] };
  return {
    state: "ok",
    names: result.data.secrets.map((secret: { name?: unknown }) => secret.name).filter((name: unknown): name is string => typeof name === "string"),
  };
}

const PROVIDER_NAMES: Record<string, string> = {
  vercel: "Vercel",
  netlify: "Netlify",
  "cloudflare-workers-and-pages": "Cloudflare Pages",
  "cloudflare pages": "Cloudflare Pages",
  cloudflare: "Cloudflare",
  render: "Render",
  railway: "Railway",
  firebase: "Firebase",
  surge: "Surge",
  spacefast: "Spacefast",
};
function providerName(raw: string): string {
  const cleaned = raw.replace(/\[bot\]$/i, "").trim();
  return PROVIDER_NAMES[cleaned.toLowerCase()] ?? cleaned;
}
const DEPLOY_CONTEXT = /netlify|vercel|cloudflare|pages|deploy|render|railway|firebase|surge|amplify|spacefast|fly\.io/i;

function hostState(state: unknown): DetectedHost["state"] {
  return state === "success" || state === "failure" || state === "error" || state === "inactive" ? state : "pending";
}

/** Other hosts the head commit was deployed to, from its deployments and commit statuses. */
async function detectedHosts(github: GitHub, repo: Repository, commit: string): Promise<{ hosts: DetectedHost[]; available: boolean }> {
  const base = github.base(repo);
  const hosts: DetectedHost[] = [];
  const add = (host: DetectedHost) => {
    if (!hosts.some((existing) => existing.provider === host.provider)) hosts.push(host);
  };
  const deployments = await github.exchange(`${base}/deployments?${new URLSearchParams({ sha: commit, per_page: "10" })}`, "GET");
  if (deployments.ok && Array.isArray(deployments.data)) {
    for (const deployment of deployments.data.slice(0, 5) as {
      id?: number;
      environment?: string;
      creator?: { login?: string };
    }[]) {
      if (typeof deployment.id !== "number") continue;
      // GitHub Pages' own deployments are shown as Pages.
      if (/^github-pages$/i.test(deployment.environment ?? "") || /^github-pages/i.test(deployment.creator?.login ?? "")) continue;
      const statuses = await github.exchange(`${base}/deployments/${deployment.id}/statuses?per_page=1`, "GET");
      const latest = statuses.ok && Array.isArray(statuses.data) ? statuses.data[0] : undefined;
      if (!latest) continue;
      const creator = String(latest.creator?.login ?? deployment.creator?.login ?? "");
      // A workflow's own deployments say little: name the host by the environment.
      const raw = !creator || /^github-actions/i.test(creator) ? deployment.environment ?? "Deployment" : creator;
      add({
        provider: providerName(raw),
        state: hostState(latest.state),
        url: typeof latest.environment_url === "string" && /^https?:\/\//.test(latest.environment_url) ? latest.environment_url : null,
        logUrl: typeof latest.target_url === "string" && /^https?:\/\//.test(latest.target_url) ? latest.target_url : null,
        source: "deployment",
      });
    }
  }
  const statuses = await github.exchange(`${base}/commits/${commit}/status`, "GET");
  if (statuses.ok && Array.isArray(statuses.data?.statuses)) {
    for (const status of statuses.data.statuses as { context?: string; state?: string; target_url?: string | null }[]) {
      const context = String(status.context ?? "");
      if (!DEPLOY_CONTEXT.test(context)) continue;
      add({
        provider: providerName(context.split("/")[0]),
        state: hostState(status.state),
        url: null,
        logUrl: typeof status.target_url === "string" && /^https?:\/\//.test(status.target_url) ? status.target_url : null,
        source: "status",
      });
    }
  }
  return { hosts, available: deployments.ok || statuses.ok };
}

function pipeline(provider: PipelineProvider, workflowPath: string | null, secrets: SecretsState): PipelineStatus {
  const needed = provider === "cloudflare" ? PIPELINE_SECRETS.cloudflare : [PIPELINE_SECRETS.spacefast[0]];
  return {
    workflow: workflowPath,
    secrets,
    secretsPresent: secrets.state === "ok" && needed.every((name) => secrets.names.includes(name)),
  };
}

/** `GET /api/publish/status?repo=&branch=`: everything the Publish panel shows, in one call. */
export async function publishStatus(github: GitHub, repo: Repository, branch: string): Promise<PublishStatus> {
  if (!branch || branch.length > 255) throw new HttpError(400, "Choose a branch.");
  const head = await headTree(github, repo, branch);
  const workflows = head
    ? [...head.tree.values()].filter((entry) => entry.type === "blob" && /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(entry.path)).slice(0, 10)
    : [];
  const wranglerPath = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].find((path) => head?.tree.has(path));
  const [pages, secrets, config, wrangler, workflowTexts, deploy, others] = await Promise.all([
    readPages(github, repo),
    secretNames(github, repo),
    textAt(github, repo, head, ".editor/config.json").then(parseConfig),
    wranglerPath ? textAt(github, repo, head, wranglerPath).then(wranglerName) : Promise.resolve(null),
    Promise.all(workflows.map(async (entry) => ({ path: entry.path, text: await github.file(repo, entry.sha).catch(() => "") }))),
    head ? changeStatus(github, repo, head.commit).catch(() => ({ state: "unavailable" as const })) : Promise.resolve({ state: "none" as const }),
    head ? detectedHosts(github, repo, head.commit).catch(() => ({ hosts: [], available: false })) : Promise.resolve({ hosts: [], available: true }),
  ]);
  const workflowFor = (pattern: RegExp) => workflowTexts.find((file) => pattern.test(file.text))?.path ?? null;
  return {
    repo: repo.full_name,
    branch,
    commit: head?.commit ?? null,
    site: { name: config.name, url: config.url },
    nojekyll: head ? head.tree.has(NOJEKYLL_FILE.path) : null,
    pages: pages.status,
    cloudflare: {
      ...pipeline("cloudflare", workflowFor(/wrangler(@\S+)?\s+deploy/i), secrets),
      workerName: wrangler,
      url: config.cloudflareUrl,
    },
    spacefast: { ...pipeline("spacefast", workflowFor(/spacefast\s+publish/i), secrets), beta: true },
    deploy,
    others: others.hosts,
    othersAvailable: others.available,
  };
}

// ---------------------------------------------------------------------------
// GitHub Pages: turn on, custom domain, DNS health
// ---------------------------------------------------------------------------

/**
 * `POST /api/publish/pages {repo, branch}`: serves the branch's root with
 * GitHub Pages. Turns Pages on, or points an existing Pages site at this
 * branch and the root (and at branch publishing, not a workflow). It never
 * commits: when `.nojekyll` is missing the answer says `needsNojekyll` and
 * carries the file, and the editor adds it as a draft, so the user's own Save
 * to GitHub commits it with the rest of their changes and nothing lands on the
 * branch behind their drafts.
 */
export async function enablePages(github: GitHub, repo: Repository, branch: string) {
  if (!branch || branch.length > 255) throw new HttpError(400, "Choose a branch.");
  const head = await headTree(github, repo, branch);
  if (!head) throw new HttpError(409, "Save your site to GitHub first: this branch has no commits yet.");
  const base = github.base(repo);
  const source = { branch, path: "/" };
  const current = await readPages(github, repo);
  if (current.status.problem && current.status.enabled === null) throw new HttpError(403, current.status.problem);
  let created = false;
  let updated = false;
  if (!current.data) {
    const result = await github.exchange(`${base}/pages`, "POST", { build_type: "legacy", source });
    if (!result.ok) throw pagesError(repo, result.status, result.data);
    created = true;
  } else if (current.data.source?.branch !== branch || (current.data.source?.path ?? "/") !== "/" || current.data.build_type !== "legacy") {
    const result = await github.exchange(`${base}/pages`, "PUT", { build_type: "legacy", source });
    if (!result.ok) throw pagesError(repo, result.status, result.data);
    updated = true;
  }
  const pages = (await readPages(github, repo)).status;
  const needsNojekyll = !head.tree.has(NOJEKYLL_FILE.path);
  return {
    pages,
    created,
    updated,
    needsNojekyll,
    ...(needsNojekyll ? { nojekyllFile: NOJEKYLL_FILE } : {}),
  };
}

interface DomainAnswer {
  domain: string | null;
  kind: "apex" | "subdomain" | null;
  /** `kind` was guessed from the label count; the request's `apex` boolean settles it. */
  kindAssumed?: boolean;
  /** Records to add at the DNS provider. */
  dns: DnsRecord[];
  /** Records that are good to have (a `www` name beside an apex domain). */
  optionalDns: DnsRecord[];
  /** In words, where the records go (the full host, and a zone-relative name only when it is safe). */
  dnsNote: string | null;
  httpsNote: string | null;
}

/**
 * `POST /api/publish/pages/domain {repo, domain, enforceHttps?}`: sets the
 * custom domain, or clears it when `domain` is empty or null, and answers with
 * the DNS records to add.
 */
export async function setPagesDomain(
  github: GitHub,
  repo: Repository,
  input: { domain?: unknown; enforceHttps?: unknown; apex?: unknown },
): Promise<{ pages: PagesStatus } & DomainAnswer> {
  const clearing = input.domain === null || (typeof input.domain === "string" && !input.domain.trim());
  const checked = clearing ? undefined : checkDomain(input.domain);
  if (checked && !checked.ok) throw new HttpError(400, checked.error);
  const base = github.base(repo);
  const result = await github.exchange(`${base}/pages`, "PUT", { cname: checked?.ok ? checked.domain : null });
  if (!result.ok) {
    if (result.status === 404) throw new HttpError(409, "Turn on GitHub Pages first, then add a domain.");
    if (result.status === 422)
      throw new HttpError(
        422,
        "GitHub did not accept that domain. Another Pages site may already use it, or it must be pointed at GitHub with the DNS records first.",
      );
    throw pagesError(repo, result.status, result.data);
  }
  let httpsNote: string | null = checked?.ok
    ? "GitHub issues the HTTPS certificate once the DNS records resolve; this can take up to 24 hours."
    : null;
  if (checked?.ok && input.enforceHttps === true) {
    const https = await github.exchange(`${base}/pages`, "PUT", { https_enforced: true });
    if (!https.ok)
      httpsNote = "HTTPS can be enforced once GitHub has issued the certificate, which can take up to 24 hours after the DNS records resolve. Try again then.";
    else httpsNote = "HTTPS is enforced.";
  }
  const pages = (await readPages(github, repo)).status;
  if (!checked?.ok) return { pages, domain: null, kind: null, dns: [], optionalDns: [], dnsNote: null, httpsNote };
  const owner = repo.owner.login;
  // `apex: true` says the domain is the registrable domain itself, `false` that it is a subdomain; without it
  // the editor's guess by label count decides the record types (`kindAssumed`) and no name is claimed.
  const chosen = typeof input.apex === "boolean";
  const kind = chosen ? (input.apex ? "apex" : "subdomain") : checked.kind;
  const dns = dnsRecords(checked.domain, kind, owner, input.apex === true);
  const optionalDns: DnsRecord[] =
    kind === "apex" ? [{ type: "CNAME", host: `www.${checked.domain}`, name: null, value: `${owner.toLowerCase()}.github.io` }] : [];
  return {
    pages,
    domain: checked.domain,
    kind,
    kindAssumed: !chosen,
    dns,
    optionalDns,
    dnsNote: dnsInstruction(dns[0]),
    httpsNote,
  };
}

export interface DomainHealth {
  /** `pending`: GitHub is still checking (ask again in a few seconds). `ready`: DNS points at Pages. `problem`: see `reason`. `none`: no custom domain is set. */
  state: "pending" | "ready" | "problem" | "none";
  host: string | null;
  dnsResolves: boolean | null;
  httpsEligible: boolean | null;
  enforcesHttps: boolean | null;
  reason: string | null;
}

/** `GET /api/publish/pages/domain/health?repo=`: GitHub's DNS check of the custom domain. The first call starts it and answers `pending`. */
export async function pagesDomainHealth(github: GitHub, repo: Repository): Promise<DomainHealth> {
  const result = await github.exchange(`${github.base(repo)}/pages/health`, "GET");
  const empty = { host: null, dnsResolves: null, httpsEligible: null, enforcesHttps: null, reason: null };
  if (result.status === 202) return { state: "pending", ...empty };
  if (result.status === 400 || result.status === 404) return { state: "none", ...empty, reason: "No custom domain is set." };
  if (result.status === 403) throw new HttpError(403, PAGES_PERMISSION_MESSAGE);
  if (result.status === 422) return { state: "pending", ...empty, reason: "GitHub has not built the Pages site yet." };
  if (!result.ok) throw new HttpError(502, "GitHub could not check the domain. Try again.");
  const domain = result.data?.domain ?? {};
  return {
    state: domain.is_valid === true ? "ready" : "problem",
    host: typeof domain.host === "string" ? domain.host : null,
    dnsResolves: typeof domain.dns_resolves === "boolean" ? domain.dns_resolves : null,
    httpsEligible: typeof domain.is_https_eligible === "boolean" ? domain.is_https_eligible : null,
    enforcesHttps: typeof domain.enforces_https === "boolean" ? domain.enforces_https : null,
    reason: typeof domain.reason === "string" ? domain.reason : typeof domain.https_error === "string" ? domain.https_error : null,
  };
}

// ---------------------------------------------------------------------------
// Cloudflare and Spacefast pipelines
// ---------------------------------------------------------------------------

const cloudflareRoot = "https://api.cloudflare.com/client/v4";

async function cloudflare(fetcher: typeof fetch, token: string, path: string) {
  // A local reference: native Workers fetch rejects another object as its receiver.
  const send = fetcher;
  const response = await send(`${cloudflareRoot}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }).catch(() => {
    // Nothing about the request is logged: it carries the user's token.
    throw new HttpError(502, "Cloudflare could not be reached. Try again.");
  });
  let body: any;
  try {
    body = JSON.parse((await response.text()).slice(0, 1024 * 1024));
  } catch {
    body = undefined;
  }
  return { status: response.status, ok: response.ok && body?.success !== false, result: body?.result };
}

/**
 * `POST /api/publish/cloudflare/verify {token, workerName?}`: what a pasted
 * Cloudflare API token reaches: its accounts, each with its workers.dev
 * subdomain (`null`, and `needsSubdomain`, when the account has none yet: it
 * must make one in the Cloudflare dashboard first) and whether the token can
 * reach Workers. The token is used for this request only.
 */
export async function verifyCloudflare(fetcher: typeof fetch, input: { token?: unknown; workerName?: unknown }) {
  if (!validCloudflareToken(input.token)) throw new HttpError(400, "That does not look like a Cloudflare API token. Paste the whole token.");
  const token = input.token;
  const workerName = typeof input.workerName === "string" && /^[a-z0-9-]{1,63}$/.test(input.workerName) ? input.workerName : null;
  const rejected = new HttpError(400, "Cloudflare did not accept this token. Check that you copied all of it and that it is still active.");
  const verified = await cloudflare(fetcher, token, "/user/tokens/verify");
  let active = verified.ok && verified.result?.status === "active";
  if (!active && verified.status !== 401 && verified.status !== 403 && verified.status !== 400) throw rejected;
  const listed = await cloudflare(fetcher, token, "/accounts?per_page=50");
  if (!listed.ok || !Array.isArray(listed.result)) {
    if (listed.status === 401 || listed.status === 403)
      throw active
        ? new HttpError(400, "This token cannot list your Cloudflare accounts. Create it with the link in the editor: it adds Account Settings: Read.")
        : rejected;
    throw new HttpError(502, "Cloudflare could not list your accounts. Try again.");
  }
  const accounts = (listed.result as { id?: unknown; name?: unknown }[])
    .filter((account): account is { id: string; name: string } => validCloudflareAccountId(account.id) && typeof account.name === "string")
    .slice(0, 10);
  if (!accounts.length) throw rejected;
  // An account-owned token has no user to verify: ask its own account.
  if (!active) active = (await cloudflare(fetcher, token, `/accounts/${accounts[0].id}/tokens/verify`)).result?.status === "active";
  if (!active) throw rejected;
  const found: CloudflareAccount[] = await Promise.all(
    accounts.map(async (account) => {
      const [subdomain, scripts] = await Promise.all([
        cloudflare(fetcher, token, `/accounts/${account.id}/workers/subdomain`),
        cloudflare(fetcher, token, `/accounts/${account.id}/workers/scripts`),
      ]);
      const name = subdomain.ok && typeof subdomain.result?.subdomain === "string" && subdomain.result.subdomain ? (subdomain.result.subdomain as string) : null;
      return {
        id: account.id,
        name: account.name,
        subdomain: name,
        needsSubdomain: name === null,
        workersDevUrl: name && workerName ? `https://${workerName}.${name}.workers.dev` : null,
        scriptsAccess: scripts.ok,
      };
    }),
  );
  return { accounts: found, canDeploy: found.some((account) => account.scriptsAccess) };
}

/**
 * Encrypts `secrets` (name, value) to the repository's Actions public key as
 * libsodium sealed boxes and stores them. Values are never logged or returned.
 */
async function storeSecrets(github: GitHub, repo: Repository, secrets: { name: string; value: string }[]) {
  const base = github.base(repo);
  const key = await github.exchange(`${base}/actions/secrets/public-key`, "GET");
  if (key.status === 403 || key.status === 404) throw new HttpError(403, SECRETS_PERMISSION_MESSAGE);
  if (!key.ok || typeof key.data?.key !== "string" || typeof key.data?.key_id !== "string")
    throw new HttpError(502, "GitHub could not give the key for repository secrets. Try again.");
  for (const secret of secrets) {
    let encrypted: string;
    try {
      encrypted = sealSecret(secret.value, key.data.key);
    } catch {
      throw new HttpError(502, "GitHub gave an unusable key for repository secrets. Try again.");
    }
    const result = await github.exchange(`${base}/actions/secrets/${segment(secret.name)}`, "PUT", {
      encrypted_value: encrypted,
      key_id: key.data.key_id,
    });
    if (result.status === 403 || result.status === 404) throw new HttpError(403, SECRETS_PERMISSION_MESSAGE);
    if (result.status === 422) throw new HttpError(409, "GitHub's key for repository secrets changed. Try again.");
    if (!result.ok) throw new HttpError(502, "GitHub could not store the secret. Try again.");
  }
  return secrets.map((secret) => secret.name);
}

/**
 * `POST /api/publish/secrets {repo, provider, token, accountId?, space?}`:
 * stores a pipeline's repository secrets. Cloudflare: CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID. Spacefast: SPACEFAST_TOKEN, and SPACEFAST_SPACE when
 * `space` is given.
 */
export async function storePipelineSecrets(github: GitHub, repo: Repository, input: Record<string, unknown>) {
  const provider = input.provider;
  if (provider === "cloudflare") {
    if (!validCloudflareToken(input.token)) throw new HttpError(400, "That does not look like a Cloudflare API token. Paste the whole token.");
    if (!validCloudflareAccountId(input.accountId)) throw new HttpError(400, "Choose a Cloudflare account.");
    const stored = await storeSecrets(github, repo, [
      { name: "CLOUDFLARE_API_TOKEN", value: input.token },
      { name: "CLOUDFLARE_ACCOUNT_ID", value: input.accountId },
    ]);
    return { provider, stored };
  }
  if (provider === "spacefast") {
    if (!validSpacefastToken(input.token)) throw new HttpError(400, "That does not look like a Spacefast key. Paste the whole key.");
    if (input.space !== undefined && input.space !== "" && !validSpacefastSpace(input.space)) throw new HttpError(400, "That is not a Spacefast space name.");
    const stored = await storeSecrets(github, repo, [
      { name: "SPACEFAST_TOKEN", value: input.token },
      ...(typeof input.space === "string" && input.space ? [{ name: "SPACEFAST_SPACE", value: input.space }] : []),
    ]);
    return { provider, stored };
  }
  throw new HttpError(400, "Choose a provider: cloudflare or spacefast.");
}

/** `GET /api/publish/pipeline?repo=&provider=`: the files to add as drafts for a provider's pipeline, and the secrets it reads. */
export function pipelineAnswer(repo: Repository, provider: unknown) {
  if (provider !== "cloudflare" && provider !== "spacefast") throw new HttpError(400, "Choose a provider: cloudflare or spacefast.");
  return {
    provider,
    ...(provider === "spacefast" ? { beta: true } : {}),
    branch: repo.default_branch,
    workerName: provider === "cloudflare" ? workerNameFor(repo.name) : null,
    files: pipelineFiles(provider, { repositoryName: repo.name, defaultBranch: repo.default_branch }),
    secrets: PIPELINE_SECRETS[provider],
    // Saving a workflow file needs the GitHub App's Workflows permission.
    needsPermission: "workflows",
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Handles `/api/publish/*` for a signed-in user (app.ts checked the session
 * and, for POST, the Origin). Returns the JSON answer.
 */
export async function publishHosts(
  request: Request,
  url: URL,
  github: GitHub,
  login: string,
  fetcher: typeof fetch,
  readMaxAge: number,
): Promise<unknown> {
  const path = url.pathname.slice("/api/publish/".length).replace(/\/$/, "");
  const post = request.method === "POST";
  const routes: Record<string, "GET" | "POST"> = {
    status: "GET",
    pipeline: "GET",
    pages: "POST",
    "pages/domain": "POST",
    "pages/domain/health": "GET",
    secrets: "POST",
    "cloudflare/verify": "POST",
    "cloudflare/secrets": "POST",
    "spacefast/secrets": "POST",
  };
  const method = routes[path];
  if (!method) throw new HttpError(404, "Endpoint not found.");
  if (request.method !== method) throw new HttpError(405, method === "POST" ? "Use POST." : "Use GET.");
  const data: Record<string, any> = post ? (await requestJson(request, 8192)) ?? {} : {};
  if (post && (typeof data !== "object" || Array.isArray(data))) throw new HttpError(400, "Invalid JSON request.");
  // No repository is needed to check a Cloudflare token.
  if (path === "cloudflare/verify") return verifyCloudflare(fetcher, data);
  const fullName = typeof data.repo === "string" ? data.repo : url.searchParams.get("repo") ?? "";
  const repo = await github.authorizeRepository(login, fullName, post ? 0 : readMaxAge);
  const branch = typeof data.branch === "string" ? data.branch : url.searchParams.get("branch") ?? repo.default_branch;
  switch (path) {
    case "status":
      return publishStatus(github, repo, branch);
    case "pipeline":
      return pipelineAnswer(repo, url.searchParams.get("provider"));
    case "pages":
      return enablePages(github, repo, branch);
    case "pages/domain":
      return setPagesDomain(github, repo, data);
    case "pages/domain/health":
      return pagesDomainHealth(github, repo);
    case "cloudflare/secrets":
      return storePipelineSecrets(github, repo, { ...data, provider: "cloudflare" });
    case "spacefast/secrets":
      return storePipelineSecrets(github, repo, { ...data, provider: "spacefast" });
    default:
      return storePipelineSecrets(github, repo, data);
  }
}

