import { readHeadSettings, upsertHeadTag } from "./site-head";

/** `url`: the site's web address as written in `.editor/config.json` (`""` when there is none). */
export interface SiteIdentity { name: string; favicon: string; socialImage: string; url?: string }
function configuredSite(config: string | undefined): Record<string, unknown> {
  try {
    const configured = JSON.parse(config ?? "{}")?.site;
    if (configured && typeof configured === "object" && !Array.isArray(configured)) return configured;
  } catch { /* Applying validates the JSON rather than discarding it. */ }
  return {};
}
/** The site's address as written in `.editor/config.json`, or `""`. */
export function readSiteAddress(config: string | undefined): string {
  const url = configuredSite(config).url;
  return typeof url === "string" ? url : "";
}
export function readSiteIdentity(config: string | undefined, home: string): SiteIdentity & { url: string } {
  const head = readHeadSettings(home);
  const site = configuredSite(config);
  return {
    name: typeof site.name === "string" ? site.name : head["og:site_name"],
    favicon: head.icon,
    socialImage: typeof site.socialImage === "string" ? site.socialImage : head["og:image"],
    url: readSiteAddress(config),
  };
}

export const SITE_ADDRESS_PROBLEM = "Enter your site's full web address, like https://name.github.io/my-site/. Nothing was applied.";
/**
 * The Site address field's value to store: `""` (no address), or a full http(s) address with a
 * host name and no login, query or `#` part. `https://` is added when it is left out.
 */
export function siteAddressInput(value: string): { url: string } | { error: string } {
  const input = value.trim();
  if (!input) return { url: "" };
  if (/\s/.test(input)) return { error: SITE_ADDRESS_PROBLEM };
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`); } catch { return { error: SITE_ADDRESS_PROBLEM }; }
  const host = url.hostname;
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || input.endsWith("?") || input.endsWith("#")
    || !(host === "localhost" || /^[^.]+(?:\.[^.]+)+$/.test(host))) return { error: SITE_ADDRESS_PROBLEM };
  return { url: url.href };
}

export function withSiteIdentityConfig(config: string | undefined, identity: SiteIdentity): string {
  const value = JSON.parse(config ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value) || (value.site !== undefined && (!value.site || typeof value.site !== "object" || Array.isArray(value.site)))) throw new Error("Site settings need an object in .editor/config.json. Fix its JSON before applying.");
  value.site = { ...value.site, name: identity.name, socialImage: identity.socialImage };
  // An empty address removes the key; a site that never had one gains none.
  if (identity.url) value.site.url = identity.url;
  else if (identity.url === "") delete value.site.url;
  const indent = /\n([ \t]+)\S/.exec(config ?? "")?.[1] ?? "  ";
  return JSON.stringify(value, null, indent) + "\n";
}
export function withSiteIdentityPage(html: string, before: SiteIdentity, after: SiteIdentity): string {
  const head = readHeadSettings(html);
  let text = html;
  if (before.name !== after.name) text = upsertHeadTag(text, "og:site_name", after.name);
  if (before.favicon !== after.favicon) text = upsertHeadTag(text, "icon", after.favicon);
  if (before.socialImage !== after.socialImage && (!head["og:image"] || head["og:image"] === before.socialImage)) text = upsertHeadTag(text, "og:image", after.socialImage);
  return text;
}
