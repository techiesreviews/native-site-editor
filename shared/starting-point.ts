// Starting points: what a repository with nothing to show yet (empty, or
// without a root index.html) starts from. The Starter site is the public
// template techiesreviews/native-site-editor-starter, fetched by the Worker
// (worker/starter.ts) and prepared here for someone else's repository; the
// Blank page is one page and one stylesheet in the native conventions
// (docs/adr/0001-the-repository-is-the-site.md, worker/site-conventions.ts).
// Both become ordinary drafts in the editor, saved with Save to GitHub.
import { NATIVE_CONFIG_PATH } from "./native-project";
import type { StarterFile } from "./types";

export type StartingPoint = "starter" | "blank";

/** The public template the Starter site comes from. */
export const STARTER_TEMPLATE = { owner: "techiesreviews", name: "native-site-editor-starter", branch: "main" } as const;

/** The repository name the Get started form suggests. */
export const DEFAULT_REPOSITORY_NAME = "my-site";

/** Why `name` cannot be a GitHub repository name, or nothing. */
export function repositoryNameProblem(name: string): string | undefined {
  if (!name) return "Enter a name for the repository.";
  if (name.length > 100) return "Use at most 100 characters.";
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return "Use letters, digits, -, _ and . only.";
  if (name === "." || name === "..") return "A name cannot be . or ..";
  if (/\.git$/i.test(name)) return "A name cannot end in .git.";
  return undefined;
}

/** A typed name as GitHub would make it: spaces and other characters become -. */
export function suggestedRepositoryName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** A repository name as a site name: "my-site" → "My site". */
export function siteNameFromRepository(name: string): string {
  const words = name.replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

/** The site settings a starting point writes: the name, and no address until the user gives one. */
export function startingConfig(siteName: string): string {
  return `${JSON.stringify({ site: { name: siteName } }, null, 2)}\n`;
}

/**
 * The Blank page: a home page and the shared stylesheet it links, in the
 * native conventions (a full document with its details in the head, root
 * links, styles in /styles/site.css), and the site settings.
 */
export function blankSiteFiles(siteName: string): { path: string; content: string }[] {
  const name = escapeHtml(siteName);
  return [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <meta name="description" content="">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${name}">
  <meta property="og:title" content="${name}">
  <meta property="og:description" content="">
  <link rel="stylesheet" href="/styles/site.css">
</head>
<body>
  <header class="site-header">
    <a class="site-name" href="/">${name}</a>
  </header>
  <main id="main">
    <section class="hero">
      <h1>${name}</h1>
      <p class="lead">Say in a sentence or two who this site is for and what they find here.</p>
    </section>
  </main>
  <footer class="site-footer">
    <p>${name}</p>
  </footer>
</body>
</html>
`,
    },
    {
      path: "styles/site.css",
      content: `/* The site's shared styles. Every page links this file. */
:root {
  --text: #1d1d1f;
  --muted: #5f6368;
  --background: #ffffff;
  --accent: #2f5bd3;
  --space: 1.5rem;
  --measure: 42rem;
  color-scheme: light;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
  color: var(--text);
  background: var(--background);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

a {
  color: var(--accent);
}

.site-header,
.site-footer,
main > section {
  max-width: var(--measure);
  margin: 0 auto;
  padding: var(--space);
}

.site-name {
  color: inherit;
  font-weight: 600;
  text-decoration: none;
}

h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1.15;
  margin: 2rem 0 1rem;
}

.lead {
  font-size: 1.25rem;
  color: var(--muted);
}

.site-footer {
  color: var(--muted);
  font-size: 0.875rem;
}
`,
    },
    { path: NATIVE_CONFIG_PATH, content: startingConfig(siteName) },
  ];
}

/** Template files that belong to the template's own repository: its test deployment. */
const STARTER_ONLY = [/^wrangler\.jsonc?$/, /^\.assetsignore$/, /^\.github\//, /^\.wrangler\//];

/**
 * The template's files for a new site named `siteName`: without its own
 * deployment (wrangler.jsonc, .assetsignore and .github point at the
 * template's test Worker), with its settings named for the new site and no
 * address, its test address taken out of the pages (canonical, og:url and
 * og:image become root links until the user gives the site an address), the
 * test domain's noindex dropped from every page but 404.html (and from
 * what AGENTS.md says about the pages), and the README's section on that
 * deployment removed.
 */
export function prepareStarterFiles(files: StarterFile[], siteName: string): StarterFile[] {
  const config = files.find((file) => file.path === NATIVE_CONFIG_PATH);
  let address: string | undefined;
  if (config && "content" in config) {
    try {
      const url = JSON.parse(config.content)?.site?.url;
      if (typeof url === "string" && /^https?:\/\//.test(url)) address = url.replace(/\/+$/, "");
    } catch {
      // No address to take out.
    }
  }
  const out: StarterFile[] = [];
  for (const file of files) {
    if (STARTER_ONLY.some((pattern) => pattern.test(file.path))) continue;
    if (!("content" in file)) {
      out.push(file);
      continue;
    }
    let content = file.content;
    if (file.path === NATIVE_CONFIG_PATH) content = startingConfig(siteName);
    else {
      if (address) content = content.split(address).join("");
      if (/\.html$/.test(file.path) && file.path !== "404.html")
        content = content.replace(/[ \t]*<meta name="robots" content="noindex">\r?\n?/g, "");
      if (file.path === "README.md") content = content.replace(/\n## Deploying\n[\s\S]*?(?=\n## |$)/, "\n");
      if (file.path === "AGENTS.md") content = content.replace(/ The site is kept out of search results[^\n]*? because this is a test domain\./g, "");
    }
    out.push({ path: file.path, content });
  }
  return out;
}
