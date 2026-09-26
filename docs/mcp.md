# Agents on your site over MCP

The editor is a remote MCP server at `https://editor.techies.tools/mcp` (Streamable HTTP, official TypeScript MCP SDK 2.0, stateless, 2025-era clients also accepted). An agent connected to it works on a native site the way its owner does in the visual editor: it reads the pages, components, styles and drafts, and it edits pages, sections, page details and files.

A native site is a repository that is the site ([ADR 0001](adr/0001-the-repository-is-the-site.md)): full HTML pages at their URLs (`index.html` is `/`, `about/index.html` is `/about/`, `404.html` the not-found page), components as `components/<tag>/<tag>.html` and `.css` defined by the site's own loader `components/components.js`, shared styles linked from each page's `<head>`, root links, and editor-only settings in `.editor/config.json`. The tools and the conventions resource describe that layout; an agent working in a clone without the editor has the starter's `AGENTS.md`.

Every change goes **through your open editor tab**. The Worker checks it and queues it; the tab applies it with the editor's own code (the Pages tab's New page, the Page block, the page builder's insert, move and remove, the Files tab's rename, move and delete) and the preview updates at once. The result is an ordinary unsaved draft: Undo takes it back, Discard changes drops it, and only you save it to GitHub. There is no save or publish tool. An agent that should commit straight to GitHub can work in a local clone instead.

## Connect

Two ways, both scoped to **one repository** and to your signed-in editor session.

### OAuth: claude.ai, Claude Desktop, Claude Code

The server implements the MCP authorization spec: protected resource metadata (`/.well-known/oauth-protected-resource/mcp`, named in the `WWW-Authenticate` header of a 401), authorization server metadata (`/.well-known/oauth-authorization-server`), dynamic client registration (`/auth/mcp/register`) and the authorization code grant with PKCE S256 (`/auth/mcp/authorize`, `/auth/mcp/token`). Authorizing is the editor's own GitHub sign-in followed by a consent page where you choose the repository.

**claude.ai and Claude Desktop** (custom connectors are shared between them through your Claude account):

1. In claude.ai open **Settings → Connectors** and choose **Add custom connector**. (On a Team or Enterprise plan an owner adds it under **Organization settings → Connectors** first; members then connect it from their own Connectors settings.)
2. Name it `Native Site Editor`, enter the URL `https://editor.techies.tools/mcp`, leave the advanced OAuth client fields empty, and choose **Add**.
3. Choose **Connect**. A browser tab opens the editor: sign in with GitHub if asked, pick the repository, and choose **Allow**.
4. Open the site in the editor at `https://editor.techies.tools` and keep that tab open.
5. In a chat, turn the connector on from the tools menu (**Search and tools**) and ask for a change.

**Claude Code:**

```sh
claude mcp add --transport http native-site-editor https://editor.techies.tools/mcp
```

Then run `/mcp` in Claude Code, select `native-site-editor` and choose **Authenticate**; the browser opens the same sign-in and consent. Add `--scope user` to use it in every project.

A connection lasts as long as the editor session it was made in (up to eight hours of GitHub sign-in). There are no refresh tokens: when it ends, the client asks you to connect again (claude.ai shows the connector as needing to reconnect; in Claude Code, authenticate again from `/mcp`). Each authorization is one repository; connect again to choose another.

### Token: any MCP client with a header

1. Open the site in the editor and open the **project selector** (the repository name at the top left).
2. Choose **Connect with MCP**. The editor makes a token for the open repository and copies a prompt to paste into Claude, Codex or another agent: the server URL, the `Authorization` header, and how to add it (`claude mcp add --transport http native-site-editor https://editor.techies.tools/mcp --header "Authorization: Bearer ase_…"` for Claude Code, an `[mcp_servers.native_site_editor]` entry with `url` and `http_headers` for Codex).
3. The button reads **Waiting for connection…** until an agent first uses the token (click it to copy the prompt again; **Cancel** revokes the unused token). Then it reads **Disconnect MCP**; its tooltip names the agent (from MCP `initialize`).

The token is a password for this repository's drafts: it is shown only through the clipboard, never in the page, logs, URLs or storage. A token no agent used is replaced the next time you connect.

### In the editor

While an agent is connected (an OAuth connection, or a token an agent has used), the tab shares its context and applies queued changes. **Disconnect MCP** revokes every connection to the open repository, OAuth ones included. Of several editor tabs, the one in use shares (a tab that goes quiet for 45 seconds is replaced by a visible one), and each change is claimed by exactly one tab.

## Tools

Start with `get_site`. Reads come from what the editor tab last reported (pages, components, outlines, drafts) and from GitHub at the revision the tab shows. Every edit tool takes an optional `requestId` (reuse it only to retry the identical change) and `waitSeconds` (default 10): the call waits that long for the tab and returns `applied`, `conflict`, `failed` or, if the tab has not picked it up yet, `pending`; `get_command_status` checks later. Pending is not applied.

| Tool | What it does |
| --- | --- |
| `get_site` | Repository, branch, revision, context age; the open file and page and the element selected in the preview; the settings (`.editor/config.json`: file, site name and address); pages as a tree by URL (file, and the title and description from each page's `<head>`, new); the not-found page (`404.html`); components (template, stylesheet, whether it is a section component, slot names); the stylesheets the pages link, each with the files it `@import`s; unsaved changes (A/M/R/D); pending changes. |
| `list_files` | Every file path (optionally under a folder), with drafts applied and marked. |
| `read_file` | Any text file up to 128 KB: the draft when there is one, else GitHub; with its content hash. |
| `get_page` | A page by URL (`/about/`, `/about`, `/about/index.html`, `/404.html`) or file: route, title, description, source, hash, and the outline of its `<body>`: the containers that hold sections and each section's id (`1.2`: element-child indexes from `<body>`), tag, `data-key`, heading or text, and a section component's slot text. |
| `edit_file` | Exact text replacements in any text file (each old text once, or `all`), given the hash read. |
| `write_file` | Create a file (the path must be free) or replace a whole file (given its hash). A new component is its files, `components/<tag>/<tag>.html` and an optional `.css`: the loader finds components by tag, so nothing else registers it; the description and conventions say so. |
| `create_page` | The Pages tab's New page: title, optional parent URL (a folder page) and slug. Writes `<parent folder>/<slug>/index.html`, a copy of the home page's document with the new `<title>` (and `og:title`), the description cleared, `<link rel="canonical">` and `og:url` set to the site's address (`site.url` in `.editor/config.json`) plus the new URL, or removed when the site has none, and `<main>` emptied. Returns the file and URL. |
| `set_page_details` | Title and/or description in the page's `<head>` (`<title>`, `<meta name="description">`, and `og:title`/`og:description` when present). |
| `add_section` | A section component's new instance, with its own copy of the slot text, before or after a section (default: the end), given the page hash. |
| `move_section` | A section before or after a sibling section, given the page hash. |
| `remove_section` | A section removed, given the page hash. |
| `move_file` | The Files tab's rename or move of a file or folder: a page's URL follows it (move a folder page's folder to take its subpages along), root links to it are rewritten in every page, template and stylesheet, and `keepOldUrl` adds `/old/ /new/ 301` to `_redirects` at the root (default: yes for a page already on GitHub). |
| `delete_file` | The Files tab's delete (a deletion the user can restore). The home page is protected as in the editor. |
| `open_page` | Shows a page (or opens any file) in the editor. |
| `get_command_status` | The state, message and result of a change this connection queued. |

Resources: `native-site://conventions` (how a native site is laid out, `worker/site-conventions.ts`: the repository as the site, pages as full documents at their URLs and their head details, root links, `_redirects`, components and slots, the loader and what a new component needs in it and in `site.css`, the section component pattern with optional slots and CSS without `::slotted()`, styles, images, `.editor/config.json`, no build, what the tools do) and `native-site://site` (as `get_site`). Prompt: `edit_site` (the conventions, the site now, and an optional goal). The server's instructions summarise the conventions for clients that read them.

Every change is checked twice: by the Worker against what the tab last reported (hash of the file or page, the section ids of its outline, section components only, one waiting change per file, at most ten waiting), and by the tab against its live state just before applying (the file's hash again, the outline recomputed from the source). Typing in the editor after the agent read a file therefore makes its edit a conflict, never an overwrite.

## Boundaries

- **Scope.** A connection is one repository and one signed-in editor session. Every MCP request rechecks the session and that the GitHub App installation still includes the repository. When the tab shows another repository, reads report the site unavailable and edits are refused; a branch or revision change refuses queued changes made for the old one.
- **Lifetime and revocation.** Choose **Disconnect MCP**, sign out, or let the session expire (eight hours at most), and the token stops working. Expired records are removed by the Durable Object alarm.
- **Secrets.** Only the SHA-256 of a token is stored; OAuth codes are stored hashed, single-use and live five minutes; the consent request is bound to the session that saw it. The GitHub token stays in the Worker and is never given to an agent. `/mcp` refuses a request whose `Origin` is not the editor's own (browsers cannot call it from other sites); the consent form must come from the editor's origin.
- **Clients.** Dynamic registration accepts public clients (`token_endpoint_auth_method: none`) whose redirect URIs are HTTPS, or HTTP to `localhost`/`127.0.0.1`/`[::1]`. Registrations last 180 days. Client ID metadata documents are not supported.
- **Untrusted content.** File contents, page text, draft text and diagnostics are the site owner's data, not instructions to the agent; the tool descriptions and conventions say so.
- **The tab must be open.** A closed tab cannot apply changes; reads then answer from its last report, marked stale after two minutes, and edits are refused. A tab in the background keeps checking every two seconds while a connection exists, though the browser may slow it down (Chrome to about once a minute after five minutes hidden), so a change can wait until the tab is seen again. Changes not picked up within two minutes expire.
- **Sizes.** Text files up to 128 KB. The tab shares the text of its drafts up to 400 KB in total (newest first); a larger draft is listed with its hash but cannot be read by the agent until the user saves it. Outlines are kept compact: at most 200 sections per page, headings and text clipped to 120 characters.
- **Storage.** Connections, the shared context and the queue live in the existing SessionStore Durable Object (`agent:<token hash>`, `agent-hub:<session>`, `oauth-client:…`, `oauth-code:…`); no new binding, secret or paid service.

## Routing

`/.well-known/*` must reach the Worker: `run_worker_first` in `wrangler.sessions.jsonc` and `public/_routes.json` (for the Pages fallback) include it, next to `/api/*`, `/auth/*` and `/mcp`.

## Validation

- `tests/mcp-runtime.test.ts` (official MCP client against the real Worker in Miniflare, over a small site in the repository-as-site layout, `tests/mcp-harness.ts`): tool list and descriptions, `get_site` (settings, pages with head details, the not-found page, components, stylesheets with imports), the conventions resource and prompt, `list_files` and `read_file` with drafts over GitHub, `get_page` by URL in its link forms or by file, outlines, `edit_file` hash and uniqueness checks, retries by `requestId`, `write_file` rules, section checks, `create_page` under folder pages only, waiting for the tab, conflicts reported by the tab, a second tab refused a claimed change, repository switching, installation removal, revocation and logout, and no GitHub writes.
- `tests/agent-site.test.ts`: the stylesheets the tab reports (linked from the pages' heads, home page first, with their imports); `tests/native-project.test.ts` and `tests/native-create.test.ts`: the settings, and a new page's canonical and `og:url`.
- `tests/mcp-oauth.test.ts`: discovery documents, CORS, registration rules, the SDK's OAuth flow (discovery, registration, sign-in that returns to the authorization, consent refusing a foreign origin, another session and Cancel, PKCE token exchange, a wrong verifier and a reused code refused), then the tools with the issued token, and revocation.
- `tests/native-save/native-mcp.spec.ts` (Playwright, native-save server): with the editor open, an MCP client reads the site, edits the home page's heading, adds, moves and removes a section (and the user's Undo brings it back), gives the site an address, creates a page (its own canonical and `og:url`) and sets its description, and opens a page, each visible at once in the preview and as a draft, with nothing saved to GitHub; components it writes render and select as the page builder's; and a client connected by OAuth in the browser (consent page, token exchange) reaches the open tab.

Protocol references: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
