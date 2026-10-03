import { readHeadSettings, upsertHeadTag } from "./site-head";

export interface SiteIdentity { name: string; favicon: string; socialImage: string }
export function readSiteIdentity(config: string | undefined, home: string): SiteIdentity {
  const head = readHeadSettings(home);
  let site: Record<string, unknown> = {};
  try {
    const configured = JSON.parse(config ?? "{}")?.site;
    if (configured && typeof configured === "object" && !Array.isArray(configured)) site = configured;
  } catch { /* Applying validates the JSON rather than discarding it. */ }
  return {
    name: typeof site.name === "string" ? site.name : head["og:site_name"],
    favicon: head.icon,
    socialImage: typeof site.socialImage === "string" ? site.socialImage : head["og:image"],
  };
}
export function withSiteIdentityConfig(config: string | undefined, identity: SiteIdentity): string {
  const value = JSON.parse(config ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value) || (value.site !== undefined && (!value.site || typeof value.site !== "object" || Array.isArray(value.site)))) throw new Error("Site settings need an object in .editor/config.json. Fix its JSON before applying.");
  value.site = { ...value.site, name: identity.name, socialImage: identity.socialImage };
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
