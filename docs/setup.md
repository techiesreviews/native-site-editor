# Set up your own editor

Anyone can run this editor on their own Cloudflare account and GitHub App, on the free plans of both. This is the same procedure used for the reference deployment at https://astro.techies.tools. Nothing in the repository is tied to that deployment except the custom domain in `wrangler.jsonc`, which you replace with yours.

The editor is a small TypeScript browser app served by a Cloudflare Worker. Durable Objects hold short-lived server-side sessions; GitHub tokens are never returned to browser JavaScript. The browser receives only an opaque session cookie.

## Self-hosting in five steps

Requirements: Node 22.12+, a free Cloudflare account, a GitHub account, and a domain on Cloudflare **or** willingness to use a `workers.dev` address.

1. **Clone and install.** `git clone https://github.com/techiesreviews/astro-site-editor && cd astro-site-editor && npm ci`.
2. **Choose the editor's address.** In `wrangler.jsonc`, either replace the `routes` entry with your own hostname on a Cloudflare-managed zone (keep `custom_domain: true`), or delete `routes` and set `"workers_dev": true` to get `https://astro-site-editor.<your-subdomain>.workers.dev`. Change `name` if you want a different Worker name.
3. **Deploy once without credentials.** `npx wrangler login`, then `npm run deploy`. Note the printed URL; the editor shows a setup page until a GitHub App is configured.
4. **Register the GitHub App.** Run `npm run setup` (with `EDITOR_ORIGIN=https://<your workers.dev host>` if you did not use a custom domain; optionally `GITHUB_APP_NAME="…"` since App names are globally unique). Open the printed link, click **Create GitHub App**, confirm the name, and let the helper save `.dev.vars` locally and upload the three Cloudflare secrets. Details below.
5. **Install and sign in.** Install the App on the repositories you want to edit, open your editor URL and connect GitHub. To preview and visually edit sites, add the editor's preview files and workflow to each repository as described in [connecting a repository's preview](repository-preview.md).

Costs: Workers Free, Durable Objects (SQLite) on the free tier, GitHub Actions minutes within the free allowance for previews. No paid Cloudflare features are used.

## Browser setup (preferred)

Run `npm run setup` and open the printed one-time link in a browser on the devbox. Click **Create GitHub App**, confirm its name on GitHub, and keep the helper running. The manifest pre-fills callback URLs, Contents read/write permission, and Metadata read permission. On return, the helper exchanges GitHub's temporary code, saves `.dev.vars` with owner-only permissions, and uploads the three required Cloudflare secrets using the existing Wrangler login. No credential copying is needed. Then install the App on your repositories and sign in to the editor.

This is a one-time owner action. Ordinary editor users only authorize the existing App and select repositories. The local helper binds to `127.0.0.1:8790`; the browser must be on that machine, or have that port forwarded. The setup link expires after an hour. Existing complete `.dev.vars` credentials resume Cloudflare configuration rather than registering another App. Unused GitHub private-key and webhook-secret fields are not persisted.

Implementation uses GitHub's [App manifest registration flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) and `POST /app-manifests/{code}/conversions`. `npm run setup:manual` retains the earlier terminal wizard as a fallback.

For setup from another computer, run a temporary Cloudflare tunnel to `http://127.0.0.1:8790`, then start the helper with `SETUP_PUBLIC_ORIGIN=https://<assigned-host>.trycloudflare.com npm run setup:browser`. The helper validates that host, uses a Secure cookie, and makes the registration callback use the tunnel URL. Share the printed setup link, not the bare tunnel URL. Keep both processes running through registration and configuration; stop the tunnel afterward. Normal editor sign-in continues to use the permanent deployed origin.

## Local development

Use Node 22.12 or newer. From the project root:

```sh
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:8787**. Browser setup registers a GitHub App and writes its credentials to the ignored `.dev.vars` file. Never commit that file. Registration and account consent happen in your browser.

Without credentials, the app still runs and displays setup instructions. It does not substitute demo repositories for a real connection.

For frontend hot reload, run `npm run dev:ui` in another terminal. API and authentication requests proxy to the Worker. Add that development origin's `/auth/callback` to the GitHub App before using sign-in there; use one origin consistently for the entire login flow.

## GitHub App settings

The setup wizard guides these settings. To configure manually, start at [New GitHub App](https://github.com/settings/apps/new):

- Give the App a unique name and set its homepage to your editor URL.
- Callback: `<editor-origin>/auth/callback`. For local use, `http://127.0.0.1:8787/auth/callback`.
- Keep expiring user tokens enabled. Leave authorization during installation off: this editor initiates authorization with its own state cookie.
- Set the installation setup URL to the editor origin; enable redirect on update if desired.
- Disable webhooks for this milestone.
- Repository permissions: **Contents: read and write**, **Metadata: read-only**. Contents write enables commits of selected files. No Actions, Workflows, or account permissions are requested.
- Allow installation on any account for eventual public use. This milestone lists only repositories owned by the signed-in personal account.

Save the **Client ID**, a generated **client secret**, and the **App slug** into `.dev.vars` using the names in `.dev.vars.example`. A GitHub App private key is not needed for the user-token flow. Install the App on selected repositories, then use **Connect GitHub** in the editor. After changing repository access, use **Reload**.

See GitHub's [registration documentation](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) and [user authorization flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

For an existing read-only App, follow the [permission upgrade steps](publishing.md#enable-publishing-on-the-existing-app).

## Cloudflare deployment

Authenticate Wrangler with `npx wrangler login` if needed. Review the Worker name in `wrangler.jsonc`, then set the three bindings using Wrangler's hidden prompts:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_SLUG
npm run deploy
```

`.dev.vars` is local only; it is not uploaded by deployment. The `SESSIONS` SQLite Durable Object is provisioned through the Wrangler migration. Add the deployed HTTPS origin's `/auth/callback` to the GitHub App and update its setup/homepage URLs. Use HTTPS in production for secure host-only session cookies.

The initial session lasts at most eight hours. Expired or revoked GitHub access asks the user to reconnect; refresh-token storage is deliberately deferred. Disconnect deletes the editor session, but does not uninstall the GitHub App or revoke its grant. Those controls remain in GitHub settings.

See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [static asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/).

## Test repository

`fixtures/native-starter/` is a complete native site: two pages, four custom-element components with their own stylesheets, a shared stylesheet, and the `.astro-editor/native.json` manifest that maps them. Copy it into a separate GitHub repository with the manifest at the repository root and install the GitHub App on that repository. There is no build step.

## Verification and current limits

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:browser-preview
```

Unit/API tests cover OAuth state, session expiry/logout, repository access boundaries, pagination, commit snapshots and error handling. The two browser suites run the real Worker request handler over a fake GitHub API backed by `fixtures/native-starter`: saving, conflict handling, the native preview, selection and linked styles. They do **not** establish live GitHub authorization or private-repository isolation with real accounts; test those after App registration.

A snapshot lists the whole commit in one request when GitHub returns it completely, and otherwise loads one directory at a time; truncated upstream responses are rejected. Text previews are limited to 128 KB. Symlink targets are shown as text and submodules are not followed. Branches and repositories are paginated with an explicit 5,000-result ceiling rather than silently truncating.

Refresh checks the selected branch's latest commit; the current view otherwise stays pinned to its loaded commit. There is no background polling of unopened branches and no embedded agent. The preview renders in the browser from the repository's own HTML and CSS; the editor runs no site build and tracks no deployment.
