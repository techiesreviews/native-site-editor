import { sitePathPrefix } from "./site-path-prefix";

/** GitHub Pages is known from the public address or its root custom-domain file. */
export function onGithubPages(address: string | undefined, cnameExists: boolean): boolean {
  if (cnameExists) return true;
  try {
    const host = new URL(address ?? "").hostname;
    return host === "github.io" || host.endsWith(".github.io");
  } catch { return false; }
}

export const GITHUB_PAGES_REDIRECT_NOTE = "GitHub Pages doesn't forward old addresses, so links to the old one will stop working.";

/** Without this (empty) file, GitHub Pages runs Jekyll, which drops every file and folder starting with `_`. */
export const NOJEKYLL_FILE = { path: ".nojekyll", content: "" } as const;

/** A Pages address whose root links need the site's folder. */
export function githubPagesProjectSite(url: string | undefined): boolean {
  return onGithubPages(url, false) && sitePathPrefix(url) !== "";
}

/** `.nojekyll` is written with a project-site address only when the repository has none. */
export function nojekyllNeeded(url: string | undefined, exists: boolean): boolean {
  return !exists && githubPagesProjectSite(url);
}
