# Publishing to a host

The repository is the site and there is no build ([ADR 0001](adr/0001-the-repository-is-the-site.md)), so publishing means getting a host to serve the repository's files as they are. The editor's Worker offers same-origin JSON endpoints under `/api/publish/` for three ways of doing that, and shows what other hosts have already done. The Worker code is `worker/hosts.ts`; the shapes are in `shared/hosting.ts`.

- **GitHub Pages**: served from a branch's root. The editor turns it on and sets a custom domain.
- **Cloudflare** (Workers static assets): a workflow in the repository runs `wrangler deploy` on every push to the default branch. The editor drafts the workflow and stores the user's Cloudflare token as an encrypted repository secret.
- **Spacefast** (beta): the same pattern with `npx spacefast publish` and the secret `SPACEFAST_TOKEN`.
- **Other hosts** (Vercel, Netlify, Cloudflare Pages connected on their side): detected from the head commit's deployments and commit statuses.

## Conventions

- Every endpoint needs the signed-in session (401 without) and authorizes the repository through `authorizeRepository` (403 for one that is not selected for the user). POSTs also need the same `Origin` as the editor (403) and a JSON body; the repository is `repo` (`owner/name`) in the body of a POST, or in the query of a GET (a POST also accepts it in the query). Wrong method: 405.
- Errors are `{ "error": "<sentence for the user>" }` with a status. The editor treats **401** as an expired GitHub session, so a Cloudflare token problem is a **400**, never a 401.
- `branch` defaults to the repository's default branch.
- A pasted token (Cloudflare, Spacefast) is used for the request that carries it. It is never stored, logged or returned: it reaches GitHub only as a libsodium sealed box (below), and error messages are fixed sentences.
- The Worker never commits files here. The editor adds files as **drafts** (it owns drafts) and the user saves them with Save to GitHub, `POST /api/publish`.

## `GET /api/publish/status?repo=&branch=`

One call for the Publish panel to poll. Everything is read from GitHub at the branch head; a part GitHub refuses (the App lacks a permission) is reported as unavailable, never as a failure of the call.

```jsonc
{
  "repo": "lex/site", "branch": "main",
  "commit": "<head sha>",                       // null for a repository with no commits
  "site": { "name": "Larkspur", "url": "https://larkspur.example" },   // .editor/config.json
  "nojekyll": false,                            // .nojekyll at the head; null with no commits
  "pages": {
    "enabled": true,                            // false: off; null: unknown, see "problem"
    "problem": "The editor needs the Pages permission: ask the owner to accept it.",   // only when enabled is null
    "url": "https://lex.github.io/site/",       // the cname's address when there is one
    "cname": null, "httpsEnforced": false, "httpsState": null,   // certificate state, e.g. "approved"
    "buildStatus": "built",                     // GitHub's: built, building, errored
    "source": { "branch": "main", "path": "/" },
    "rootServed": false,                        // root links such as /about/ work
    "rootReason": "project-path",               // or "user-site", "custom-domain"
    "rootMessage": "GitHub Pages serves this repository at https://lex.github.io/site/, a sub-path, so root links such as /about/ break. ...",
    "privateRepository": false                  // free accounts get Pages only for public repositories
  },
  "cloudflare": {
    "workflow": ".github/workflows/deploy.yml", // a workflow that runs `wrangler deploy`, else null
    "secrets": { "state": "ok", "names": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] },  // or { "state": "unavailable", "names": [] }
    "secretsPresent": true,                     // both needed secrets exist
    "workerName": "site",                       // name in wrangler.jsonc/json/toml
    "url": "https://site.lex.workers.dev"       // hosting.cloudflare.url in .editor/config.json, else null
  },
  "spacefast": { "workflow": null, "secrets": { ... }, "secretsPresent": false, "beta": true },  // SPACEFAST_TOKEN is the needed secret
  "deploy": { "state": "live", "url": "<run>", "name": "<workflow>" },  // the head commit's workflow runs: shared/change-status.ts
  "others": [
    { "provider": "Vercel", "state": "success", "url": "https://site.vercel.app", "logUrl": "https://vercel.com/...", "source": "deployment" },
    { "provider": "Netlify", "state": "pending", "url": null, "logUrl": null, "source": "status" }
  ],
  "othersAvailable": true                       // false: the App lacks Deployments or Commit statuses read
}
```

`others`: a deployment status's `environment_url` is the live address (`url`); its `target_url` is a log link (`logUrl`). GitHub Pages' own deployments are left out. Any successful status with an `environment_url` is a candidate live address; Netlify and Cloudflare Pages do not document theirs, and a commit status never carries one (`url: null`, a log link only). `state` is `success`, `pending`, `failure`, `error` or `inactive`.

`.editor/config.json` may carry the workers.dev address the editor learned from verifying a token: `{ "hosting": { "cloudflare": { "url": "https://site.lex.workers.dev" } } }` (only `https://….workers.dev` is read). The client writes it as a draft.

## GitHub Pages

### `POST /api/publish/pages` `{ repo, branch }`

Serves the branch root with GitHub Pages: creates the site (`build_type: "legacy"`, source the branch and `/`), or, when Pages is already on from another branch, folder or a workflow build, updates its source. Already on from this branch: nothing is written.

```jsonc
{ "pages": { /* as in status */ }, "created": true, "updated": false,
  "needsNojekyll": true, "nojekyllFile": { "path": ".nojekyll", "content": "" } }
```

**`.nojekyll` is a draft, not a commit.** Branch publishing runs Jekyll unless an (empty) root `.nojekyll` exists, which drops every file and folder starting with `_`. When it is missing (`needsNojekyll`), the answer carries the file and the client adds it as a draft; the user's Save to GitHub commits it with their other changes. The endpoint does not commit, because a direct commit would move the branch under the user's unsaved drafts (their next save would then have to reconcile) and would skip their review. The first Pages build may run before the file is saved; the commit that adds it rebuilds the site. (`shared/hosting.ts` exports it as `NOJEKYLL_FILE`.) Pages ignores `_redirects`.

Errors: **409** the branch has no commits; **403** `The editor needs the Pages permission: ask the owner to accept it.`; **422** `GitHub Pages is free only for public repositories. Make this repository public, upgrade the GitHub plan, or publish with Cloudflare instead.` (GitHub's plan error, or a bare 422 for a private repository); **409** GitHub is already updating Pages.

A **project** Pages site lives at `https://<owner>.github.io/<repo>/`, a sub-path, which breaks root links; `pages.rootServed` and `rootReason` say whether it applies (a repository named `<owner>.github.io`, or a custom domain, serves the root).

### `POST /api/publish/pages/domain` `{ repo, domain, apex?, enforceHttps? }`

Sets the custom domain, or clears it when `domain` is `""` or `null`. The domain is validated as a bare hostname (letters, digits, hyphens, at least two labels; no scheme, path, port, wildcard, IP address or `*.github.io`); an invalid one is a **400** and never reaches GitHub. `enforceHttps: true` also asks GitHub to enforce HTTPS, which works only once the certificate exists; otherwise `httpsNote` says to try again later (up to 24 hours).

```jsonc
{ "pages": { /* as in status, with the cname */ },
  "domain": "example.com", "kind": "apex",     // or "subdomain"; null and "kind": null when cleared
  "dns": [ { "type": "A", "host": "example.com", "name": "@", "value": "185.199.108.153" }, ... ],   // name "@" only with apex: true, else null   // apex: A ×4 (185.199.108-111.153), AAAA ×4 (2606:50c0:8000-8003::153)
  "optionalDns": [ { "type": "CNAME", "host": "www.example.com", "name": null, "value": "lex.github.io" } ],  // apex only
  "dnsNote": "In the DNS for example.com, add A records with the name @ (the domain itself).",
  "httpsNote": "GitHub issues the HTTPS certificate once the DNS records resolve; this can take up to 24 hours." }
```

A subdomain gets one `CNAME` to `<owner>.github.io`. Every record carries the full `host` (`docs.eu.example.com`) and a zone-relative `name`. The registrable domain (the DNS zone) is not knowable without the Public Suffix List, and the editor does not guess it: `name` is `@` only when the request says `"apex": true` (the user chose that the domain they typed is the registrable domain itself), and `null` for everything else, however many labels (`www.example.com` too: its zone could be `example.com` or `www.example.com`'s own). Without `apex`, `kind` is a guess from the label count (`kindAssumed: true`) that only picks the record types; the UI should ask "Is example.com your registered domain, not a subdomain?" and send `apex: true` or `false` (`false` forces a subdomain's single CNAME). The UI shows `host`, and `name` only when it is not null, with `dnsNote` ("In the DNS for your domain, add a CNAME record for <host> pointing to <value> ..."). Pages must be on first (**409**); a domain GitHub refuses (taken by another Pages site) is a **422**. Apex versus subdomain is told by label count with a small list of two-part endings (`co.uk` ...).

### `GET /api/publish/pages/domain/health?repo=`

GitHub's DNS check of the custom domain (`/pages/health`). The first call starts it asynchronously.

```jsonc
{ "state": "pending",   // GitHub answered 202: ask again in a few seconds
  "host": null, "dnsResolves": null, "httpsEligible": null, "enforcesHttps": null, "reason": null }
```

`state` is `pending`, `ready` (DNS points at Pages), `problem` (`reason` carries GitHub's, e.g. `InvalidDNSError`) or `none` (no custom domain set).

## Cloudflare

### `POST /api/publish/cloudflare/verify` `{ token, workerName? }`

Uses the pasted API token for this request only: it confirms the token (`GET /user/tokens/verify`, else the account's own for an account-owned token), lists the accounts and each one's workers.dev subdomain, and tries the Workers scripts list.

```jsonc
{ "accounts": [ { "id": "b9b9...", "name": "Lex's account", "subdomain": "lex", "needsSubdomain": false,
                  "workersDevUrl": "https://site.lex.workers.dev",   // needs workerName; else null
                  "scriptsAccess": true } ],
  "canDeploy": true }
```

An account with no workers.dev subdomain has `subdomain: null` and `needsSubdomain: true`: the user must create one in the Cloudflare dashboard (Workers & Pages) first. Errors (**400**): a token that is not the right shape, one Cloudflare does not accept, one that cannot list accounts.

**The prefilled token link.** `cloudflareTokenLink()` in `shared/hosting.ts` builds Cloudflare's documented template URL (<https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/>): `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=<JSON>&accountId=*&zoneId=all&name=…` with `[{"key":"workers_scripts","type":"edit"},{"key":"account_settings","type":"read"}]`. Both keys are in the keys listed on that page; `workers_scripts` is the page's own example for a Workers token. They could not be cross-checked against `GET /user/tokens/permission_groups`, because the wrangler OAuth token is refused there (403 on the user and account endpoints), so the link has not been opened in a dashboard. If it does not preselect the permissions, the fallback is Cloudflare's **Edit Cloudflare Workers** template on the same page.

### `POST /api/publish/secrets` `{ repo, provider, token, accountId?, space? }`

Stores the pipeline's repository secrets. `provider` is `cloudflare` (`CLOUDFLARE_API_TOKEN` from `token`, `CLOUDFLARE_ACCOUNT_ID` from `accountId`, a 32-character hex id from verify) or `spacefast` (`SPACEFAST_TOKEN` from `token`; `SPACEFAST_SPACE` from `space` when given, for an account with several spaces). Shortcuts with the provider fixed: `POST /api/publish/cloudflare/secrets` and `POST /api/publish/spacefast/secrets`.

```json
{ "provider": "cloudflare", "stored": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] }
```

Needs the App's Secrets permission (**403** `The editor needs the Secrets permission: ask the owner to accept it.`). The token goes `GET /actions/secrets/public-key`, then `PUT /actions/secrets/{name}` with `{ encrypted_value, key_id }`. It is encrypted on the Worker (`worker/sealed-box.ts`) as a libsodium **sealed box** (`crypto_box_seal`: an ephemeral X25519 key, a BLAKE2b-derived nonce, XSalsa20-Poly1305), built from `tweetnacl` and `blakejs`, pure JavaScript that runs in Workers. `tests/sealed-box.test.ts` opens what it makes with `libsodium-wrappers`' `crypto_box_seal_open`, and `tests/hosts.test.ts` does the same through the real Worker runtime in Miniflare.

### `GET /api/publish/pipeline?repo=&provider=cloudflare|spacefast`

The files to add as drafts, so the user saves them with Save to GitHub.

```jsonc
{ "provider": "cloudflare", "branch": "main", "workerName": "site",
  "files": [ { "path": ".github/workflows/deploy.yml", "content": "..." },
             { "path": "wrangler.jsonc", "content": "..." }, { "path": ".assetsignore", "content": "..." } ],
  "secrets": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
  "needsPermission": "workflows" }
```

The same files come from `cloudflarePipelineFiles` and `spacefastPipelineFiles` in `shared/hosting.ts` for a client that builds them itself. Cloudflare: the starter's workflow without its starter-only `if:` guard, running on every push to the repository's default branch; `wrangler.jsonc` named after the repository (lower case, hyphens), `assets.directory` `"."`, `not_found_handling` `"404-page"`, `html_handling` `"auto-trailing-slash"`; `.assetsignore` for repository-only files (not `_redirects`, which Cloudflare reads). Spacefast **(beta)**: `.github/workflows/spacefast.yml` runs `npx spacefast publish` with `SPACEFAST_TOKEN` (and `SPACEFAST_SPACE`); make the CI key with `sf api-keys create --name "CI publish" --preset ci_deploy`.

**Saving the workflow needs the user's confirmation and the Workflows permission.** A workflow, or an action it uses, runs with the repository's secrets, so `POST /api/publish` refuses any change under `.github/` (a file written, moved from or deleted there: workflows, `.github/actions/**`, CODEOWNERS, templates), with a 403 naming the files, unless the request says `"allowGithubConfig": true` (`allowWorkflows` is accepted as the older name). **The Publish panel must send it only after the user confirms a save that lists the `.github` files by name** (for example "This save changes .github/workflows/deploy.yml. GitHub Actions run with your repository's secrets. Save it?"); never send it by default.

The check covers the whole change, not just `files`. A `head` the request names that the branch itself does not name (a commit ahead of it, as in the read-lag case the field exists for, but also any descendant such as one from a fork; or a branch GitHub does not list yet right after a first save) is built on as it is, so what it holds under `.github` counts too. The Worker compares the root trees (non-recursive: 2 to 4 calls, no file list and no file limit, so a save of hundreds of ordinary files is not affected) of the branch's actual head and of the supplied head: **every** root entry whose name counts as `.github` in any case (`.GitHub`, `.github.`), by exact name, type, mode and SHA. Any entry added, removed or changed is refused without the flag, before anything is written.

Unknown never means absent. If GitHub does not list the branch, the Worker re-reads the ref (`GET /git/ref/heads/{branch}`); if the head still cannot be established, the save is refused with a retryable **503** ("Try again in a moment; your drafts are kept"), flag or not. The one exception is a repository GitHub says has no branches at all (`GET /branches` is `[]`): its base has no `.github`, so a supplied head with any `.github` needs the flag. Failing to read the commits or trees is the same 503.

Immediately before the branch is moved the Worker re-reads the ref. If it is no longer the commit the save was validated against, and its `.github` entries differ from the validated base's, or the new commit would not be a fast-forward of it (GitHub's compare must say `ahead`), the save is refused with a **409** ("The branch changed on GitHub while saving… Refresh and review"). If the ref cannot be read then, 503 (except for a branch GitHub did not list at the start, whose ref may still lag; the update is a fast-forward only). After saving a `.github` change with confirmation, a second save in the seconds before GitHub's reads catch up repeats the confirmation.

**Known limits.** GitHub's REST ref update has no compare-and-swap: a non-forced update succeeds when the new commit descends from the branch's current head, whatever that is. So a write by someone else between the Worker's last ref read and its update (a window of milliseconds) is not detected by the check above; if the supplied commit already contains that write's ancestors the update fast-forwards over it, and a change to `.github` made in that window could be reverted or overridden. This is not closed by a GraphQL mutation either (`updateRef` has no expected-old-value). The re-read narrows it to a sub-second race; branch protection and required reviews on `.github` (CODEOWNERS) are the complete defence.

Agents can never reach `.github`: every MCP tool, the hub's queue and the tab's apply refuse `.github` (the folder itself), `.github/workflows` and everything else under `.github`, in any spelling (case, `./`, `//`, `..`, trailing dots and spaces), as a path or as a move's destination, and the link rewrites a page move makes in other files skip files under `.github` (the result says so). With the flag, GitHub still refuses an App without Workflows write: it answers **403** `Saving the deploy workflow needs the Workflows permission. Ask the editor's owner to add Workflows: Read and write to the GitHub App and accept it for this repository, or add the workflow on GitHub yourself. Your drafts are kept.` The restore endpoint refuses `.github` too.

## Permissions

The GitHub App needs Pages (write), Workflows (write), Secrets (write; its read lists secret names), Commit statuses (read) and Deployments (read), besides the existing Contents, Metadata, Actions and Administration. See [Enable publishing to hosts on the existing app](setup.md#enable-publishing-to-hosts-on-the-existing-app). Each missing one degrades only its part.

## Local testing

`tests/native-save/server.ts` fakes all of this (Pages, secrets, deployments, statuses, workflow refusal, Cloudflare) with `POST /__demo/hosting` controls, listed in its header comment; `tests/native-save/fake-github-publishing.spec.ts` drives the endpoints over it.
