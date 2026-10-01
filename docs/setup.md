# Set up your own editor

Anyone can run this editor on their own Cloudflare account and GitHub App, on the free plans of both. This is the same procedure used for the reference deployment at https://editor.techies.tools. Only `wrangler.sessions.jsonc` ties the repository to that deployment: its custom domain and its `EDITOR_ORIGIN` and `EDITOR_ALIASES` variables, which you replace with your own address.

The editor is a small TypeScript browser app served by one Cloudflare Worker (`wrangler.sessions.jsonc`). A SQLite Durable Object holds short-lived server-side sessions and the GitHub App's credentials; GitHub tokens are never returned to browser JavaScript. The browser receives only an opaque session cookie.

`wrangler.jsonc` is the legacy Cloudflare Pages project behind the reference deployment's `native-site-editor.pages.dev` fallback. A new installation does not need it.

## New users

**No GitHub account:** The sign-in page links to GitHub's free account sign-up.

**No repository in the editor yet:** After signing in, the Get started screen offers two paths. Create a site: enter a repository name, choose public or private visibility, and pick a starting point—**Starter site** (a small studio site with pages, components and styles to customize) or **Blank page** (one HTML page and one stylesheet). The editor creates the repository via the GitHub App's POST /user/repos endpoint; it then appears in the list. If the App has no Administration permission or is not installed on the account, the form links to GitHub's New repository page, prefilled with the name, visibility and description, where the user creates it empty, then gives the editor access on GitHub's application settings. The editor remembers the chosen starting point and, when that repository first opens empty, writes it as drafts. Or use an existing repository: open GitHub's application settings, give the editor access to it, and **Reload** in the editor.

**Empty repository or no index.html:** The Start your site screen shows the same starting points—Starter site or Blank page. The choice writes that starting point as drafts you review in the editor, with the option to Save to GitHub. For an empty repository, the first save is two commits: the contents API creates index.html (which GitHub's git API cannot do for an empty repository), then the rest of the files are added via the git API on top.

**Set up your site:** A repository that went through Get started or Start your site shows a small **Setup 1/4** pill in the top bar that opens a checklist: Start your site (the repository has a root index.html, committed or drafted), Save to GitHub (the branch has a commit and the home page is saved), Name your site (a site name other than the one made from the repository name; the form writes `.editor/config.json` as a draft), Put it online (a `site.url`; the panel lists Cloudflare Pages, Netlify, Vercel and uploading to any other host, and asks for the address once it is live), and an optional Connect an agent that does not block done. Items tick from the repository's state, not from clicks. × hides the checklist for that repository; when the first four are done it says "Your site is set up" and goes away. Any repository has it under **Set up your site** in the project menu.

**Starter site:** Downloaded as a tarball from the public template [techiesreviews/native-site-editor-starter](https://github.com/techiesreviews/native-site-editor-starter) when the user chooses it, so it is always the template's current `main`. The editor removes the template's own deployment configuration (.github/, wrangler.jsonc, .assetsignore) and resets `.editor/config.json` to the new site's name and no address.

**Build it with an agent:** Both Get started and Start your site offer a prompt to copy for an MCP agent, asking it to create the repository (if needed) and build the site through the editor. Agents use `gh repo create` and the native-site-editor MCP server.

## Self-hosting in six steps

Requirements: Node 22.12+, a free Cloudflare account, a GitHub account, and a domain on Cloudflare **or** willingness to use a `workers.dev` address.

1. **Clone and install.** `git clone https://github.com/techiesreviews/native-site-editor && cd native-site-editor && npm ci`. (The repository is private for now.)
2. **Choose the editor's address.** In `wrangler.sessions.jsonc`, either replace the `routes` pattern with your own hostname on a Cloudflare-managed zone (keep `custom_domain: true`), or delete `routes` and set `"workers_dev": true` to get `https://native-site-editor-sessions.<your-subdomain>.workers.dev`. Change `name` if you want a different Worker name. Then, under `vars`, set `EDITOR_ORIGIN` to that address, for example `https://editor.example.com`, and delete `EDITOR_ALIASES`. Owner setup only runs at `EDITOR_ORIGIN`, and it is the address the GitHub App sends people back to. Without `EDITOR_ORIGIN`, the editor uses whatever address a request arrives at, which is fine when it has only one.
3. **Create an owner setup token.** `npx wrangler login`, then `openssl rand -hex 32` and store the result as a secret: `npx wrangler secret put OWNER_SETUP_TOKEN --config wrangler.sessions.jsonc`. Keep the token; it unlocks setup in step 5.
4. **Deploy.** `npm run deploy` builds the UI and deploys the Worker. Until a GitHub App is configured, the editor shows that it is not set up yet.
5. **Register the GitHub App in the browser.** Open `https://<your editor>/auth/setup#<token>`, click **Create GitHub App**, and confirm the name on GitHub. App names are unique across GitHub, so change the suggested `native-site-editor-techies` to your own. The editor stores the App's Client ID, client secret and slug in its Durable Object; GitHub's private key and webhook secret are discarded. Nothing is copied by hand. Afterwards you can remove the token so setup stays closed: `npx wrangler secret delete OWNER_SETUP_TOKEN --config wrangler.sessions.jsonc` (then `/auth/setup` answers "not enabled").
6. **Install and sign in.** Install the App on the repositories you want to edit, open your editor and connect GitHub. Repositories need nothing added: the editor previews a site's own HTML and CSS in the browser (see [hosting](hosting.md) for publishing the site itself).

Costs: Workers Free and Durable Objects (SQLite) on the free tier. No paid Cloudflare features are used, and the editor runs no builds or GitHub Actions.

## Owner setup

The setup page at `/auth/setup` needs the full private link, including its `#…` fragment: the bare page stays locked, because it does not grant owner access by itself. The fragment never reaches the server in the address; the page reads it, exchanges it for a short HttpOnly setup cookie and removes it from the address bar. If a locked setup tab is already open, opening the private link in that same tab unlocks it. Setup only runs at `EDITOR_ORIGIN`; other addresses of the same Worker answer 403. Addresses listed in `EDITOR_ALIASES` (separated by spaces) also serve the editor and get sign-in callbacks, but not setup; the reference deployment lists its `native-site-editor.pages.dev` fallback there.

The page uses GitHub's [App manifest registration flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest). The manifest pre-fills the callback URLs, **Contents: read and write**, **Metadata: read-only** and **Actions: read** (the save status reads a commit's workflow runs). On return, the Worker exchanges GitHub's temporary code server-side (`POST /app-manifests/{code}/conversions`) and stores the credentials once. If that exchange succeeds but saving fails, GitHub's code is already used: the page says the credentials were not saved and does not show the client secret; inspect the App on GitHub before trying again.

Credentials set as Worker secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG`) take precedence over the stored ones. Use them when you register the App by hand (below).

`scripts/setup-browser.mjs` and `scripts/setup-github.sh` (`npm run setup`, `setup:manual`) belong to the older terminal onboarding. They are kept for reference and are not needed.

## Local development

Use Node 22.12 or newer. Register a separate GitHub App for development by hand (below) with the callback `http://127.0.0.1:8787/auth/callback`, copy `.dev.vars.example` to `.dev.vars` and fill in its Client ID, client secret and slug. Never commit that file. Then, from the project root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8787**. This builds the UI and runs the production Worker and its Durable Object locally. `--local-upstream` in the script keeps the Worker seeing `http://127.0.0.1:8787` as its address; without it, Wrangler reports the configured custom domain and GitHub would send sign-in back there. Without credentials, the app still runs and says it is not set up; it does not substitute demo repositories for a real connection.

To try owner setup locally instead of registering the App by hand, set `EDITOR_ORIGIN="http://127.0.0.1:8787"` and an `OWNER_SETUP_TOKEN` in `.dev.vars` (see `.dev.vars.example`) and open `http://127.0.0.1:8787/auth/setup#<token>`.

For frontend hot reload, run `npm run dev:ui` in another terminal and open its address; API and authentication requests proxy to the Worker on port 8787. Add that development origin's `/auth/callback` to the GitHub App before using sign-in there; use one origin consistently for the entire login flow.

`npm run dev:pages` runs the legacy Pages project instead, on port 8788; its session binding expects the Worker to be running as well.

## GitHub App settings

Owner setup fills these in. To register an App by hand, start at [New GitHub App](https://github.com/settings/apps/new):

- Give the App a unique name and set its homepage to your editor URL.
- Callback: `<editor-origin>/auth/callback`. For local use, `http://127.0.0.1:8787/auth/callback`.
- Keep expiring user tokens enabled. Leave authorization during installation off: this editor initiates authorization with its own state cookie.
- Set the installation setup URL to the editor origin; enable redirect on update if desired.
- Disable webhooks.
- Repository permissions: **Contents: read and write**, **Metadata: read-only**, **Actions: read**, and **Administration: read and write**. Contents write enables commits of selected files; Actions read lets the save status show a commit's workflow runs (added 2026-09-25). Administration read and write enables Get started to create a repository for the signed-in user through POST /user/repos with the App's user token; GitHub adds a repository the App creates to the installation even when it is limited to selected repositories, so the new repository opens without another trip to GitHub. No Workflows or account permissions are requested.
- Allow installation on any account for eventual public use. The editor lists only repositories owned by the signed-in personal account.

Save the **Client ID**, a generated **client secret**, and the **App slug**: into `.dev.vars` for local use (names in `.dev.vars.example`), or as Worker secrets with `npx wrangler secret put <NAME> --config wrangler.sessions.jsonc`. A GitHub App private key is not needed for the user-token flow. Install the App on selected repositories, then use **Connect GitHub** in the editor. After changing repository access, use **Reload**.

See GitHub's [registration documentation](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) and [user authorization flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

For an existing read-only App, follow the [permission upgrade steps](publishing.md#enable-publishing-on-the-existing-app).

## Enable repository creation on the existing app

An App registered before this change (2026-10-01) did not request Administration permission, so Get started falls back to GitHub's New repository page. To enable direct repository creation:

1. Open the GitHub App's permissions (for the production app, [native-site-editor-techies](https://github.com/settings/apps/native-site-editor-techies/permissions)).
2. Under **Repository permissions**, add **Administration** with **Read and write** access and save. Keep **Contents** at read and write, **Metadata** read-only, and **Actions** read-only.
3. Open [installed GitHub Apps](https://github.com/settings/installations), find the app, and each installation owner accepts its updated permissions on the repository access page (Settings → Applications → Installed GitHub Apps → Review request).
4. Reconnect in the editor: sign out and sign in again, or open a new session. Get started then creates repositories directly.

Until the updated permission is accepted, the editor uses the fallback to GitHub's New repository page.

## Sessions and accounts

`.dev.vars` is local only; it is not uploaded by deployment. The `SESSIONS` SQLite Durable Object is provisioned through the Wrangler migration in `wrangler.sessions.jsonc`. Use HTTPS in production for secure host-only session cookies.

The initial session lasts at most eight hours. Expired or revoked GitHub access asks the user to reconnect; refresh-token storage is deliberately deferred. Signing out deletes that account's editor session, but does not uninstall the GitHub App or revoke its grant. Those controls remain in GitHub settings.

Several GitHub accounts can be signed in on one browser (up to five). "Add another account" in the repository menu signs in again with GitHub's account picker; the other accounts' sessions stay, each with its own eight-hour limit, and the menu switches between them. Signing out of one moves to the next still signed in.

The open repository's row in the repository menu names its branch ("native-demo-user · private · ⑂ main", with a ›). Hovering the row opens the branches beside the menu, top-aligned with the row (to its left when there is no room on the right), after a moment so passing over it shows nothing; the flyout closes a moment after the pointer has left both row and flyout, so the way into it may cross the menu. A click on the row, or **ArrowRight** or **Enter** on it, opens the flyout with the focus on the current branch; **Up** and **Down** move, **Enter** chooses, **Esc** or **ArrowLeft** goes back to the row, and closing the menu closes it too. The current branch is marked for assistive technology (no checkmark); choosing another switches the workspace to it. ↻ in the flyout's corner is **Refresh from GitHub**, reading the branch again. While the branches load, or when they cannot, the flyout says so. Other repositories' rows switch to that repository and have no flyout. A row's × (on hover, left of the repository) removes it from the editor on GitHub.

The repository menu adds and removes repositories through the GitHub App installation's settings page: GitHub only lets classic personal access tokens change an installation's repositories, so the editor cannot do it itself. The menu opens that page and lists the repositories again when the editor tab gets focus back.

See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [static asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/).

## Test repository

`fixtures/native-starter/` is a small native site, test data for the editor: `index.html` and `about/index.html` as full pages, components under `components/`, a shared stylesheet in `styles/` and `.editor/config.json`. For a real site, use Get started to create a repository and choose Starter site, or copy `native-site-editor-starter` into a GitHub repository yourself and install the GitHub App on that repository. There is no build step (see [hosting](hosting.md)).

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
