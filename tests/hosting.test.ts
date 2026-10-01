import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAGES_AAAA_RECORDS,
  PAGES_A_RECORDS,
  checkDomain,
  cloudflarePipelineFiles,
  cloudflareTokenLink,
  dnsInstruction,
  dnsRecords,
  pagesRoot,
  pipelineFiles,
  spacefastPipelineFiles,
  validCloudflareAccountId,
  validCloudflareToken,
  validSpacefastToken,
  workerNameFor,
} from "../shared/hosting.ts";

test("a worker name is made from the repository name", () => {
  assert.equal(workerNameFor("My_Site.v2"), "my-site-v2");
  assert.equal(workerNameFor("--a--b--"), "a-b");
  assert.equal(workerNameFor("___"), "site");
  assert.equal(workerNameFor("x".repeat(100)).length, 63);
});

test("the Cloudflare pipeline deploys the repository root on a push to the default branch, with no starter-only guard", () => {
  const files = cloudflarePipelineFiles({ repositoryName: "Larkspur_Studio", defaultBranch: "trunk" });
  assert.deepEqual(files.map((file) => file.path), [".github/workflows/deploy.yml", "wrangler.jsonc", ".assetsignore"]);
  const [workflow, wrangler, ignore] = files.map((file) => file.content);
  assert.match(workflow, /branches: \["trunk"\]/);
  assert.match(workflow, /npx --yes wrangler@4 deploy/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.ok(!/^\s*if:/m.test(workflow), "no `if:` guard");
  // Valid JSONC: comments out, then JSON.
  const config = JSON.parse(wrangler.replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(config, {
    name: "larkspur-studio",
    compatibility_date: config.compatibility_date,
    assets: { directory: ".", not_found_handling: "404-page", html_handling: "auto-trailing-slash" },
  });
  const ignored = ignore.split("\n").filter((line) => line && !line.startsWith("#"));
  for (const path of [".git", ".github", ".editor", "node_modules", "README.md", "wrangler.jsonc", ".assetsignore"])
    assert.ok(ignored.includes(path), path);
  assert.ok(!ignored.includes("_redirects"), "Cloudflare reads _redirects, so it is deployed");
});

test("the Spacefast pipeline runs `spacefast publish` with its key", () => {
  const [file, ...rest] = spacefastPipelineFiles({ defaultBranch: "main" });
  assert.equal(rest.length, 0);
  assert.equal(file.path, ".github/workflows/spacefast.yml");
  assert.match(file.content, /run: npx --yes spacefast publish/);
  assert.match(file.content, /SPACEFAST_TOKEN: \$\{\{ secrets\.SPACEFAST_TOKEN \}\}/);
  assert.match(file.content, /SPACEFAST_SPACE: \$\{\{ secrets\.SPACEFAST_SPACE \}\}/);
  assert.deepEqual(pipelineFiles("spacefast", { repositoryName: "x", defaultBranch: "main" }), [file]);
});

test("a domain is checked as a bare hostname, and an apex told from a subdomain", () => {
  assert.deepEqual(checkDomain(" Example.COM "), { ok: true, domain: "example.com", kind: "apex" });
  assert.deepEqual(checkDomain("www.example.com."), { ok: true, domain: "www.example.com", kind: "subdomain" });
  assert.deepEqual(checkDomain("example.co.uk"), { ok: true, domain: "example.co.uk", kind: "apex" });
  assert.deepEqual(checkDomain("shop.example.co.uk"), { ok: true, domain: "shop.example.co.uk", kind: "subdomain" });
  for (const bad of [
    "", "   ", "example", "https://example.com", "example.com/about", "example.com:8080", "user@example.com",
    "exa mple.com", "-a.example.com", "a-.example.com", "*.example.com", "example..com", "1.2.3.4",
    "example.c", "foo.github.io", "a".repeat(64) + ".com", 5, null, undefined,
  ])
    assert.equal(checkDomain(bad).ok, false, String(bad));
});

test("DNS records: four A and four AAAA for an apex, one CNAME for a subdomain; the full host always, a name only when proven", () => {
  const apex = dnsRecords("example.com", "apex", "Lex", true);
  assert.deepEqual(apex.filter((record) => record.type === "A").map((record) => record.value), PAGES_A_RECORDS);
  assert.deepEqual(apex.filter((record) => record.type === "AAAA").map((record) => record.value), PAGES_AAAA_RECORDS);
  assert.ok(apex.every((record) => record.name === "@" && record.host === "example.com"), "a confirmed apex is @");
  // Not confirmed by the user: no name is claimed.
  assert.ok(dnsRecords("example.com", "apex", "Lex").every((record) => record.name === null && record.host === "example.com"));
  // A subdomain's zone is never guessed, however many labels: the full host and no relative name.
  for (const host of ["www.example.com", "docs.eu.example.com", "example.com.ac", "www.example.co.uk"])
    assert.deepEqual(dnsRecords(host, "subdomain", "Lex"), [{ type: "CNAME", host, name: null, value: "lex.github.io" }], host);
  const [deep] = dnsRecords("docs.eu.example.com", "subdomain", "Lex");
  assert.match(dnsInstruction(deep), /add a CNAME record for docs\.eu\.example\.com pointing to lex\.github\.io/);
  assert.match(dnsInstruction(deep), /docs\.eu/);
  assert.match(dnsInstruction(apex[0]), /the name is @/);
  assert.doesNotMatch(dnsInstruction(dnsRecords("example.com", "apex", "Lex")[0]), /the name is @/);
});

test("Pages serves the root only for a user site or a custom domain", () => {
  assert.deepEqual(pagesRoot("Lex", "lex.github.io", null).reason, "user-site");
  assert.equal(pagesRoot("lex", "LEX.github.io", null).rootServed, true);
  assert.equal(pagesRoot("lex", "site", "example.com").reason, "custom-domain");
  const project = pagesRoot("Lex", "site", null);
  assert.equal(project.rootServed, false);
  assert.equal(project.reason, "project-path");
  assert.match(project.message, /https:\/\/lex\.github\.io\/site\//);
});

test("token formats", () => {
  assert.ok(validCloudflareToken("A".repeat(40)));
  assert.ok(validCloudflareToken("cfut_" + "a1".repeat(24)));
  for (const bad of ["short", "has space " + "a".repeat(30), "a".repeat(201), "é".repeat(40), null, 7]) assert.ok(!validCloudflareToken(bad));
  assert.ok(validCloudflareAccountId("b9b9a2b4c908c9d03abe92a52c2d0f43"));
  assert.ok(!validCloudflareAccountId("B9B9A2B4C908C9D03ABE92A52C2D0F43"));
  assert.ok(validSpacefastToken("sf_live_abcdef123456"));
  assert.ok(!validSpacefastToken("has space in it"));
});

test("the prefilled Cloudflare token link uses the documented keys", () => {
  const url = new URL(cloudflareTokenLink("Site"));
  assert.equal(url.origin + url.pathname, "https://dash.cloudflare.com/profile/api-tokens");
  assert.deepEqual(JSON.parse(url.searchParams.get("permissionGroupKeys")!), [
    { key: "workers_scripts", type: "edit" },
    { key: "account_settings", type: "read" },
  ]);
  assert.equal(url.searchParams.get("accountId"), "*");
  assert.equal(url.searchParams.get("zoneId"), "all");
  assert.equal(url.searchParams.get("name"), "Site");
});
