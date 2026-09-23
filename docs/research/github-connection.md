# GitHub connection and file browsing feasibility

Researched 2026-09-17 against official documentation. This is a documentation-based verdict, not a working integration or runtime test.

## Verdict

**Feasible as the first independent milestone.** A Cloudflare-hosted browser application can use a server-side GitHub App connection to list selected personal repositories, select a branch, and browse a commit-pinned file tree without installing dependencies or executing repository code. This proves repository access, not visual editing or preview fidelity.

## Verified capabilities

- GitHub Apps offer repository selection and fine-grained permissions. OAuth apps use broader scopes; private repository access through `repo` does not provide equivalent installation-level repository selection. A GitHub App can also authorize an individual user through an OAuth flow: choosing an App does not remove browser sign-in. [GitHub comparison](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps), [user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
- User access tokens can list accessible installations and repositories through `GET /user/installations` and `GET /user/installations/{installation_id}/repositories`. Repository discovery requires Metadata read; file-tree reads require Contents read. Repository lists are paginated. [Installation endpoints](https://docs.github.com/en/rest/apps/installations), [trees](https://docs.github.com/en/rest/git/trees).
- Installation tokens expire after one hour and can be narrowed to selected repository IDs and permissions. They cannot exceed the installation's grants. [App endpoints](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app).
- Branch endpoints expose commit SHA; Git commits expose tree SHA. The browser can therefore display one consistent snapshot even if an external agent pushes while it is open. [Branches](https://docs.github.com/en/rest/branches/branches), [commits](https://docs.github.com/en/rest/git/commits).
- Recursive Git trees have a 100,000-entry / 7 MB limit and report `truncated`. GitHub recommends non-recursive subtree requests when truncated. The Contents API directory limit is 1,000 files, so it should not be the general tree loader. [Trees](https://docs.github.com/en/rest/git/trees), [contents](https://docs.github.com/en/rest/repos/contents).
- Workers support encrypted secret bindings and RSA signing through Web Crypto. GitHub App JWTs use RS256. These primitives support a Worker-side installation-token broker if needed later; interactive reads can use the user's App token directly. [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [GitHub JWTs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).

## Recommended smallest implementation

1. Serve the editor UI and its authenticated API on Cloudflare. Keep GitHub credentials server-side, bind browser sessions to the authorized GitHub user, validate OAuth state, and use secure HTTP-only session cookies.
2. Register a GitHub App with Contents read and Metadata read. Direct users to install it on selected personal repositories; authorize the user separately. Use their App user token for interactive reads to keep effective access tied to both the user and installation. Do not trust a callback's installation ID as proof of access.
3. Offer only repositories returned by installation-scoped discovery; initially filter to personal ownership. Show a manage-access link for missing repositories. Enforce the selection on API requests as well as in the UI, including public repositories.
4. Resolve the selected branch once to a commit and tree SHA. Key cached tree data by repository ID and SHA, with authorization checked before serving private data. Load directories lazily using non-recursive trees; preserve file, symlink, and submodule types rather than pretending all entries are normal files. A refresh explicitly moves to the new branch head.
5. Read bounded-size `package.json` as data. An `astro` dependency or devDependency is the main detection signal; config filenames and `.astro` files are supporting evidence. Report detected / ambiguous / not detected, not verified-buildable. For multiple candidate packages, require a project-root choice. Never import Astro configuration or run scripts to detect it.

Astro documents a package manifest, source tree, and recommended config; supported config names include `astro.config.js`, `.mjs`, and `.ts`. The detection policy above is an inference and deliberately tolerates missing config. [Astro project structure](https://docs.astro.build/en/basics/project-structure/).

The first read-only milestone need not modify the connected repository. Later editor-specific settings should live in the user's requested single removable root directory (provisional name `.astro-site-editor/`). Astro's own configuration remains ordinary project source.

## Later writes and concurrent agents

Contents updates require the previous blob SHA. Multiple-file edits can instead form one Git commit and then advance the branch with `force: false`, which enforces a fast-forward update. [Contents writes](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents), [reference updates](https://docs.github.com/en/rest/git/refs#update-a-reference).

Recommendation: retain the editor's base commit, create edits against that base, and handle a rejected branch advance by refreshing and reconciling. Never overwrite an agent's changes or force-push automatically. A non-forced update is not a general equality-based compare-and-swap API; unusual branch rewrites still need explicit handling. Later editing requires Contents write and must respect branch rules; do not promise direct publishing on every repository. Saving a Git commit also does not prove deployment succeeded.

## Proposed milestone acceptance criteria

- A deployed browser session connects selected public and private personal repositories without local software.
- An unselected repository and another user's private repository cannot be read through editor APIs.
- Paginated repositories and branches load; switching branches displays the correct SHA and tree.
- Empty repositories, removed access, expired authorization, and API throttling produce actionable states.
- Large-tree handling never silently presents a truncated tree as complete.
- A standard Astro starter is detected; non-Astro and ambiguous monorepo examples are labeled honestly, without running repository code.
- An external push leaves the current snapshot internally consistent; refresh discovers the new commit.
- Repository contents remain unchanged. No deployment or visual-editing claim is made by this milestone.

## Remaining evidence needed

Build and exercise the OAuth/install flow with a real registered App and deployed Worker; test private-repository isolation and pagination. No credentials, live installation, repository creation, or deployment were used in this research. Rate-limit budgets and session-storage choices remain implementation decisions. Automatic new-site creation is a later write-capable milestone; a separately prepared starter is sufficient for this proof.
