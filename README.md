# Native Site Editor

A visual editor for plain HTML and CSS websites that live in a GitHub repository. Click anything on your page to edit its text, links, images and styles, or work in the code beside it; every change is a normal commit to your repository. Agents like Claude Code and Codex can edit the same site through MCP.

Your site stays yours: the repository **is** the website. Pages are `.html` files at their own addresses, components are native custom elements, and there is no build step, so any static host serves the repository as it is (GitHub Pages, Cloudflare, Netlify, Vercel, an FTP server). Stop using the editor whenever you like; nothing in your site depends on it.

## Use it

Open **https://editor.techies.tools** and click **Continue with GitHub**. A short wizard installs the editor on your GitHub account and creates your first site from the [starter](https://github.com/techiesreviews/native-site-editor-starter) or a blank page. Nothing to install.

## Run your own

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/techiesreviews/native-site-editor)

1. Click **Deploy to Cloudflare**, enter your GitHub username, and deploy.
2. Open your new editor. It takes you to GitHub: click **Create GitHub App**.
3. Click **Install & Authorize**. You're in.

It runs on the free plans of Cloudflare and GitHub, and your copy updates itself every week. Details, custom domains and the terminal route: [setting up your own editor](docs/setup.md).

## What it does

- **Visual editing** in a live preview of your real pages: an edit bar for headings, text size, bold, italic and links; insert, move, duplicate and remove sections; page structure in a sidebar.
- **Code beside it**: the page or component and the CSS rules that style the selected element, in Monaco, updating the preview as you type.
- **Pages and files**: new pages and subpages, change a page's address (with a redirect), upload images, rename and delete files.
- **Save to GitHub**: drafts stay in your browser until you save; selected files go to the branch as one commit, with conflict checks against changes made elsewhere. History and restore per file.
- **Agents**: connect Claude, Codex or any MCP client to the open site. Their changes arrive as drafts you review and save. See [MCP](docs/mcp.md).
- **Hosting**: any static host serves the repository as it is; see [hosting](docs/hosting.md). Publishing from inside the editor (GitHub Pages, Cloudflare and others) is in progress.

## Develop

Node 22.12 or newer.

```sh
npm ci
cp dev.vars.example .dev.vars   # a development GitHub App's credentials
npm run dev                     # http://127.0.0.1:8787
npm run check                   # types
npm test                        # unit and API tests
npm run test:browser            # Playwright, against a fake GitHub
npm run test:browser-preview
```

The browser app is in `src/`, the Worker (sign-in, GitHub API, MCP, publishing) in `worker/`, code shared by both in `shared/`. [Setup](docs/setup.md) covers the development GitHub App, [project notes](docs/NATIVE-PROJECT.md) the architecture and decisions, [CONTEXT.md](CONTEXT.md) the vocabulary, and [docs/adr](docs/adr) the recorded trade-offs.

Interface conventions: no decorative separators (no rules, divider lines or panel borders between sections; group with spacing and background), visible focus indicators, text contrast of at least 4.5:1 on every surface in light and dark. Shared utilities are in `src/utilities.css`, design tokens in `src/theme.css`, component styles in `src/components/`, DOM helpers in `src/ui/dom.ts`. None of the editor's styles reach the sites it edits.

## License

[MIT](LICENSE). Built in public by [Techies Reviews](https://techies.review).
