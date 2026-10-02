// Publishing to a host, the parts both the Worker (worker/hosts.ts) and the
// browser use: the files of a deploy pipeline, domain checks and the DNS
// records a custom domain needs, token checks, and the shapes of the
// `/api/publish/*` answers (docs/publishing-hosts.md).
//
// The repository is the site (docs/adr/0001-the-repository-is-the-site.md), so
// a pipeline never builds: it uploads the repository's files as they are.

import type { ChangeStatus } from "./change-status";

/** A file the editor adds as a draft; the user saves it with Save to GitHub. */
export interface PipelineFile {
  path: string;
  content: string;
}

export type PipelineProvider = "cloudflare" | "spacefast";

/** The repository secrets each pipeline reads. */
export const PIPELINE_SECRETS: Record<PipelineProvider, string[]> = {
  cloudflare: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  spacefast: ["SPACEFAST_TOKEN", "SPACEFAST_SPACE"],
};

export const DEPLOY_WORKFLOW_PATH = ".github/workflows/deploy.yml";
export const SPACEFAST_WORKFLOW_PATH = ".github/workflows/spacefast.yml";
/** Without this (empty) file, GitHub Pages runs Jekyll, which drops every file and folder starting with `_`. */
export const NOJEKYLL_FILE: PipelineFile = { path: ".nojekyll", content: "" };
const COMPATIBILITY_DATE = "2026-09-17";

/** A Workers script name from a repository name: lower case, letters, digits and hyphens, at most 63. */
export function workerNameFor(repositoryName: string): string {
  const name = repositoryName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return name || "site";
}

function workflow(options: { name: string; branch: string; job: string; step: string; run: string; env: string[] }) {
  return `# ${options.name}: runs on every push to ${options.branch}, which is what the editor's
# Save to GitHub does. There is no build: the repository is the site.
name: ${options.name}

on:
  push:
    branches: [${JSON.stringify(options.branch)}]
  workflow_dispatch:

concurrency:
  group: ${options.job}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  ${options.job}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: ${options.step}
        run: ${options.run}
        env:
${options.env.map((name) => `          ${name}: \${{ secrets.${name} }}`).join("\n")}
`;
}

const ASSETS_IGNORE = `# Files in the repository that are not part of the site. wrangler deploy
# uploads everything else in the repository root.
.git
.github
.editor
.wrangler
.gitignore
.assetsignore
.nojekyll
node_modules
README.md
AGENTS.md
CLAUDE.md
wrangler.jsonc
`;

/**
 * The files that deploy the repository to Cloudflare Workers static assets on
 * every push to the default branch: the workflow (needs the secrets
 * CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID), wrangler.jsonc and
 * .assetsignore. Saving the workflow needs the GitHub App's Workflows
 * permission.
 */
export function cloudflarePipelineFiles(options: { repositoryName: string; defaultBranch: string }): PipelineFile[] {
  const name = workerNameFor(options.repositoryName);
  return [
    {
      path: DEPLOY_WORKFLOW_PATH,
      content: workflow({
        name: "Deploy to Cloudflare",
        branch: options.defaultBranch,
        job: "deploy",
        step: "Deploy to Cloudflare Workers",
        run: "npx --yes wrangler@4 deploy",
        env: PIPELINE_SECRETS.cloudflare,
      }),
    },
    {
      path: "wrangler.jsonc",
      content: `{
  // On every push to ${options.defaultBranch} the workflow in .github/workflows/deploy.yml
  // runs \`wrangler deploy\`, which uploads the repository as it is: the
  // repository root is the site root, and there is no build. .assetsignore
  // keeps repository-only files off the site. Assets only; no Worker script.
  "name": ${JSON.stringify(name)},
  "compatibility_date": ${JSON.stringify(COMPATIBILITY_DATE)},
  "assets": {
    "directory": ".",
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  }
}
`,
    },
    { path: ".assetsignore", content: ASSETS_IGNORE },
  ];
}

/**
 * Spacefast (beta): the workflow runs `npx spacefast publish` on every push to
 * the default branch. It reads the secret SPACEFAST_TOKEN (a CI key made with
 * `sf api-keys create --name "CI publish" --preset ci_deploy`) and, when the
 * account has several spaces, SPACEFAST_SPACE.
 */
export function spacefastPipelineFiles(options: { defaultBranch: string }): PipelineFile[] {
  return [
    {
      path: SPACEFAST_WORKFLOW_PATH,
      content: workflow({
        name: "Publish to Spacefast",
        branch: options.defaultBranch,
        job: "publish",
        step: "Publish to Spacefast",
        run: "npx --yes spacefast publish",
        env: PIPELINE_SECRETS.spacefast,
      }),
    },
  ];
}

export function pipelineFiles(provider: PipelineProvider, options: { repositoryName: string; defaultBranch: string }) {
  return provider === "spacefast" ? spacefastPipelineFiles(options) : cloudflarePipelineFiles(options);
}

// ---------------------------------------------------------------------------
// Custom domains for GitHub Pages
// ---------------------------------------------------------------------------

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME";
  /** The full hostname the record is for (`docs.eu.example.com`), always right. */
  host: string;
  /**
   * The name relative to the DNS zone, for providers that ask for one: `@` only when the user confirmed the
   * domain is the registrable domain itself (an apex); otherwise `null`, because the zone is not knowable
   * without the Public Suffix List and the user must enter the host for their own zone.
   */
  name: string | null;
  value: string;
}

export const PAGES_A_RECORDS = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
export const PAGES_AAAA_RECORDS = ["2606:50c0:8000::153", "2606:50c0:8001::153", "2606:50c0:8002::153", "2606:50c0:8003::153"];

// Second-level suffixes where the registrable domain has three labels.
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "co.za", "co.jp", "or.jp",
  "com.br", "com.mx", "com.ar", "com.tr", "com.cn", "co.in", "co.il", "co.kr", "com.sg", "com.hk", "com.tw",
]);

export type DomainCheck =
  | { ok: true; domain: string; kind: "apex" | "subdomain" }
  | { ok: false; error: string };

/** A domain a person typed, checked as a bare hostname: no scheme, path, port or wildcard. */
export function checkDomain(input: unknown): DomainCheck {
  if (typeof input !== "string") return { ok: false, error: "Enter a domain such as example.com." };
  let domain = input.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(domain) || /[/?#@\s:]/.test(domain))
    return { ok: false, error: "Enter only the domain, such as example.com, without https:// or a path." };
  if (domain.endsWith(".")) domain = domain.slice(0, -1);
  if (!domain) return { ok: false, error: "Enter a domain such as example.com." };
  if (domain.length > 253) return { ok: false, error: "That domain is too long." };
  if (domain.includes("*")) return { ok: false, error: "Wildcard domains are not supported." };
  const labels = domain.split(".");
  if (labels.length < 2) return { ok: false, error: "Enter a full domain such as example.com." };
  for (const label of labels)
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      return { ok: false, error: "A domain uses letters, digits and hyphens between dots, such as example.com." };
  if (/^\d+$/.test(labels.at(-1)!)) return { ok: false, error: "Enter a domain name, not an IP address." };
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels.at(-1)!)) return { ok: false, error: "That domain's ending is not valid." };
  if (domain.endsWith(".github.io")) return { ok: false, error: "That address is GitHub's own; enter a domain you own." };
  const registrable = SECOND_LEVEL.has(labels.slice(-2).join(".")) ? 3 : 2;
  return { ok: true, domain, kind: labels.length <= registrable ? "apex" : "subdomain" };
}

/**
 * The DNS records a domain needs to point at the owner's GitHub Pages. `apexConfirmed`: the user said the domain
 * they typed is the registrable domain itself (the DNS zone), the only case where a zone-relative name (`@`)
 * is certain. Otherwise `name` is `null`: without the Public Suffix List the zone of `example.com.ac` or
 * `docs.eu.example.com` is not knowable, so the full `host` is what to enter.
 */
export function dnsRecords(domain: string, kind: "apex" | "subdomain", owner: string, apexConfirmed = false): DnsRecord[] {
  if (kind === "subdomain") return [{ type: "CNAME", host: domain, name: null, value: `${owner.toLowerCase()}.github.io` }];
  const name = apexConfirmed ? "@" : null;
  return [
    ...PAGES_A_RECORDS.map((value): DnsRecord => ({ type: "A", host: domain, name, value })),
    ...PAGES_AAAA_RECORDS.map((value): DnsRecord => ({ type: "AAAA", host: domain, name, value })),
  ];
}

/** What to tell the user about where a record goes. */
export function dnsInstruction(record: DnsRecord): string {
  const what = record.type === "CNAME" ? `a CNAME record for ${record.host} pointing to ${record.value}` : `A and AAAA records for ${record.host} (the addresses below)`;
  if (record.name === "@") return `In the DNS for ${record.host}, add ${what}; the name is @ (the domain itself).`;
  return `In the DNS for your domain, add ${what}. Use the full host ${record.host}; if your DNS provider wants a name relative to your zone, enter the part before the zone's name (in the zone example.com, docs.eu.example.com is docs.eu).`;
}

export type RootServed = "user-site" | "custom-domain" | "project-path";

/**
 * Whether GitHub Pages serves the site at the root of its address, where the
 * site's root links (/about/) work. A project site lives at
 * https://owner.github.io/repo/, a sub-path, which breaks them.
 */
export function pagesRoot(owner: string, repo: string, cname: string | null | undefined): { rootServed: boolean; reason: RootServed; message: string } {
  if (cname) return { rootServed: true, reason: "custom-domain", message: `Served at the root of ${cname}.` };
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`)
    return { rootServed: true, reason: "user-site", message: `Served at the root of https://${owner.toLowerCase()}.github.io/.` };
  return {
    rootServed: false,
    reason: "project-path",
    message: `GitHub Pages serves this repository at https://${owner.toLowerCase()}.github.io/${repo}/, a sub-path, so root links such as /about/ break. Add a custom domain, or name the repository ${owner.toLowerCase()}.github.io.`,
  };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Cloudflare API tokens are 40 characters (`cfut_…` ones longer) of letters, digits, `_` and `-`. */
export function validCloudflareToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(token);
}
export function validCloudflareAccountId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{32}$/.test(id);
}
/** A Spacefast key: printable, no whitespace. Its exact format is not documented. */
export function validSpacefastToken(token: unknown): token is string {
  return typeof token === "string" && /^[\x21-\x7e]{8,512}$/.test(token);
}
export function validSpacefastSpace(space: unknown): space is string {
  return typeof space === "string" && /^[\w.:-]{1,100}$/.test(space);
}

/**
 * The Cloudflare dashboard's prefilled API token page (documented at
 * developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/):
 * Workers Scripts: Edit to deploy, and Account Settings: Read so the editor
 * can list the account and its workers.dev address.
 */
export function cloudflareTokenLink(name = "Native Site Editor deploy") {
  const keys = [
    { key: "workers_scripts", type: "edit" },
    { key: "account_settings", type: "read" },
  ];
  return `https://dash.cloudflare.com/profile/api-tokens?${new URLSearchParams({
    permissionGroupKeys: JSON.stringify(keys),
    accountId: "*",
    zoneId: "all",
    name,
  })}`;
}

// ---------------------------------------------------------------------------
// The answers of /api/publish/*
// ---------------------------------------------------------------------------

export interface PagesStatus {
  /** `null` when GitHub would not say (the App lacks the Pages permission). */
  enabled: boolean | null;
  /** Why `enabled` is null. */
  problem?: string;
  url: string | null;
  cname: string | null;
  httpsEnforced: boolean | null;
  /** The certificate's state (`approved`, `new`, `authorization_pending`, …), when there is one. */
  httpsState: string | null;
  /** GitHub's build state (`built`, `building`, `errored`), when known. */
  buildStatus: string | null;
  source: { branch: string; path: string } | null;
  rootServed: boolean;
  rootReason: RootServed;
  rootMessage: string;
  /** Free accounts get Pages only for public repositories. */
  privateRepository: boolean;
}

export type SecretsState = { state: "ok"; names: string[] } | { state: "unavailable"; names: [] };

export interface PipelineStatus {
  /** The path of a workflow in the repository that runs the provider's deploy command. */
  workflow: string | null;
  /** The provider's repository secrets, by name; their values are never readable. */
  secrets: SecretsState;
  /** Every secret the pipeline needs is there (SPACEFAST_SPACE is optional). */
  secretsPresent: boolean;
}

export interface DetectedHost {
  provider: string;
  state: "success" | "pending" | "failure" | "error" | "inactive";
  /** The live address (a deployment's `environment_url`), when the host gives one. */
  url: string | null;
  logUrl: string | null;
  source: "deployment" | "status";
}

export interface PublishStatus {
  repo: string;
  branch: string;
  /** The branch's head commit the answer describes. */
  commit: string | null;
  site: { name: string | null; url: string | null };
  /** `.nojekyll` exists at the head (`null`: the repository has no commits). */
  nojekyll: boolean | null;
  pages: PagesStatus;
  cloudflare: PipelineStatus & { workerName: string | null; url: string | null };
  spacefast: PipelineStatus & { beta: true };
  /** The state of the head commit's workflow runs. */
  deploy: ChangeStatus;
  others: DetectedHost[];
  /** `false` when GitHub refused to list deployments or statuses (the App lacks Deployments or Commit statuses: read). */
  othersAvailable: boolean;
}

export interface CloudflareAccount {
  id: string;
  name: string;
  /** The workers.dev subdomain, or `null` when the account has not made one. */
  subdomain: string | null;
  needsSubdomain: boolean;
  /** `https://<worker>.<subdomain>.workers.dev` for the requested worker name. */
  workersDevUrl: string | null;
  /** The token could list the account's Workers scripts, so it can reach Workers. */
  scriptsAccess: boolean;
}
