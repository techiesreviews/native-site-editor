# Set up your own editor

Anyone can run this editor on their own Cloudflare account and GitHub App, on the free plans of both. This is the same procedure used for the reference deployment at https://editor.techies.tools. Two things tie the repository to that deployment, and you replace both with your own address: the custom domain in `wrangler.sessions.jsonc` and `canonicalOrigin` in `worker/owner-setup.ts`.

The editor is a small TypeScript browser app served by one Cloudflare Worker (`wrangler.sessions.jsonc`). A SQLite Durable Object holds short-lived server-side sessions and the GitHub App's credentials; GitHub tokens are never returned to browser JavaScript. The browser receives only an opaque session cookie.

`wrangler.jsonc` is the legacy Cloudflare Pages project behind the reference deployment's `native-site-editor.pages.dev` fallback. A new installation does not need it.

## Self-hosting in six steps

Requirements: Node 22.12+, a free Cloudflare account, a GitHub account, and a domain on Cloudflare **or** willingness to use a `workers.dev` address.

1. **Clone and install.** `git clone https://github.com/techiesreviews/native-site-editor && cd native-site-editor && npm ci`. (The repository is private for now.)
2. **Choose the editor's address.** In `wrangler.sessions.jsonc`, either replace the `routes` pattern with your own hostname on a Cloudflare-managed zone (keep `custom_domain: true`), or delete `routes` and set `"workers_dev": true` to get `https://native-site-editor-sessions.<your-subdomain>.workers.dev`. Change `name` if you want a different Worker name. Then set `canonicalOrigin` in `worker/owner-setup.ts` to that address, for example `https://editor.example.com`: owner setup only runs there, and it is the address the GitHub App sends people back to.
3. **Create an owner setup token.** `npx wrangler login`, then `openssl rand -hex 32` and store the result as a secret: `npx wrangler secret put OWNER_SETUP_TOKEN --config wrangler.sessions.jsonc`. Keep the token; it unlocks setup in step 5.
4. **Deploy.** `npm run deploy` builds the UI and deploys the Worker. Until a GitHub App is configured, the editor shows that it is not set up yet.
5. **Register the GitHub App in the browser.** Open `https://<your editor>/auth/setup#<token>`, click **Create GitHub App**, and confirm the name on GitHub. The editor stores the App's Client ID, client secret and slug in its Durable Object; GitHub's private key and webhook secret are discarded. Nothing is copied by hand. Afterwards you can remove the token so setup stays closed: `npx wrangler secret delete OWNER_SETUP_TOKEN --config wrangler.sessions.jsonc` (then `/auth/setup` answers "not enabled").
6. **Install and sign in.** Install the App on the repositories you want to edit, open your editor and connect GitHub. Repositories need nothing added: the editor previews a site's own HTML and CSS in the browser (see [hosting](hosting.md) for publishing the site itself).

Costs: Workers Free and Durable Objects (SQLite) on the free tier. No paid Cloudflare features are used, and the editor runs no builds or GitHub Actions.

## Owner setup

The setup page at `/auth/setup` needs the full private link, including its `#…` fragment: the bare page stays locked, because it does not grant owner access by itself. The fragment never reaches the server in the address; the page reads it, exchanges it for a short HttpOnly setup cookie and removes it from the address bar. If a locked setup tab is already open, opening the private link in that same tab unlocks it. Setup only runs on `canonicalOrigin`; other addresses of the same Worker answer 403.

The page uses GitHub's [App manifest registration flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest). The manifest pre-fills the callback URL, **Contents: read and write** and **Metadata: read-only**. On return, the Worker exchanges GitHub's temporary code server-side (`POST /app-manifests/{code}/conversions`) and stores the credentials once. If that exchange succeeds but saving fails, GitHub's code is already used: the page says the credentials were not saved and does not show the client secret; inspect the App on GitHub before trying again.

Credentials set as Worker secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG`) take precedence over the stored ones. Use them when you register the App by hand (below).

`scripts/setup-browser.mjs` and `scripts/setup-github.sh` (`npm run setup`, `setup:manual`) belong to the older terminal onboarding. They are kept for reference and are not needed.

## Local development

Use Node 22.12 or newer. Register a separate GitHub App for development by hand (below) with the callback `http://127.0.0.1:8787/auth/callback`, copy `.dev.vars.example` to `.dev.vars` and fill in its Client ID, client secret and slug. Never commit that file. Then, from the project root:

```sh
npm ci
npm run build:ui
npx wrangler dev --config wrangler.sessions.jsonc
```

Open **http://127.0.0.1:8787**. This runs the production Worker and its Durable Object locally. Without credentials, the app still runs and says it is not set up; it does not substitute demo repositories for a real connection.

For frontend hot reload, run `npm run dev:ui` in another terminal and open its address; API and authentication requests proxy to the Worker on port 8787. Add that development origin's `/auth/callback` to the GitHub App before using sign-in there; use one origin consistently for the entire login flow.

`npm run dev` starts the legacy Pages project instead, on port 8788, whose session binding expects the deployed Worker.

## GitHub App settings

Owner setup fills these in. To register an App by hand, start at [New GitHub App](https://github.com/settings/apps/new):

- Give the App a unique name and set its homepage to your editor URL.
- Callback: `<editor-origin>/auth/callback`. For local use, `http://127.0.0.1:8787/auth/callback`.
- Keep expiring user tokens enabled. Leave authorization during installation off: this editor initiates authorization with its own state cookie.
- Set the installation setup URL to the editor origin; enable redirect on update if desired.
- Disable webhooks.
- Repository permissions: **Contents: read and write**, **Metadata: read-only**. Contents write enables commits of selected files. No Actions, Workflows, or account permissions are requested.
- Allow installation on any account for eventual public use. The editor lists only repositories owned by the signed-in personal account.

Save the **Client ID**, a generated **client secret**, and the **App slug**: into `.dev.vars` for local use (names in `.dev.vars.example`), or as Worker secrets with `npx wrangler secret put <NAME> --config wrangler.sessions.jsonc`. A GitHub App private key is not needed for the user-token flow. Install the App on selected repositories, then use **Connect GitHub** in the editor. After changing repository access, use **Reload**.

See GitHub's [registration documentation](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) and [user authorization flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

For an existing read-only App, follow the [permission upgrade steps](publishing.md#enable-publishing-on-the-existing-app).

## Sessions and accounts

`.dev.vars` is local only; it is not uploaded by deployment. The `SESSIONS` SQLite Durable Object is provisioned through the Wrangler migration in `wrangler.sessions.jsonc`. Use HTTPS in production for secure host-only session cookies.

The initial session lasts at most eight hours. Expired or revoked GitHub access asks the user to reconnect; refresh-token storage is deliberately deferred. Signing out deletes that account's editor session, but does not uninstall the GitHub App or revoke its grant. Those controls remain in GitHub settings.

Several GitHub accounts can be signed in on one browser (up to five). "Add another account" in the repository menu signs in again with GitHub's account picker; the other accounts' sessions stay, each with its own eight-hour limit, and the menu switches between them. Signing out of one moves to the next still signed in.

The repository menu adds and removes repositories through the GitHub App installation's settings page: GitHub only lets classic personal access tokens change an installation's repositories, so the editor cannot do it itself. The menu opens that page and lists the repositories again when the editor tab gets focus back.

See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [static asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/).

## Test repository

`fixtures/native-starter/` is a small native site, test data for the editor: `index.html` and `about/index.html` as full pages, components under `components/`, a shared stylesheet in `styles/` and `.editor/config.json`. For a real site start from `native-site-editor-starter`, whose repository root is the site: copy it into a GitHub repository and install the GitHub App on that repository. There is no build step (see [hosting](hosting.md)).

## Verification and current limits

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:browser-preview
```

Unit/API tests cover OAuth state, session expiry/logout, repository access boundaries, pagination, commit snapshots and error handling. The two browser suites run the real Worker request handler over a fake GitHub API backed by `fixtures/native-starter`: saving, conflict handling, the native preview, selection and linked styles. They do **not** establish live GitHub authorization or private-repository isolation with real accounts; test those after App registration.

A snapshot lists the whole commit in one request when GitHub returns it completely, and otherwise loads one directory at a time; truncated upstream responses are rejected. Text files open up to 1 MB. Symlink targets are shown as text and submodules are not followed. Branches and repositories are paginated with an explicit 5,000-result ceiling rather than silently truncating.

Refresh checks the selected branch's latest commit; the current view otherwise stays pinned to its loaded commit. There is no background polling of unopened branches and no embedded agent. The preview renders in the browser from the repository's own HTML and CSS; the editor runs no site build and tracks no deployment.
