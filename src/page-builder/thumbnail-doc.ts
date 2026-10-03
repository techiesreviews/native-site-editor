// A live thumbnail of a section component: a small static document showing
// exactly the markup the Add panel would insert, in the page container the
// page uses, styled by the site's own stylesheets and the component's, with
// every component inside expanded as a declarative shadow root (as the
// site's loader renders them, but with no script at all). The document is
// shown in an iframe sandboxed without `allow-scripts`; its own CSP allows
// nothing but inline styles and data: images and fonts, so a thumbnail never
// runs site code or reaches the network. Pure, so it is unit tested.

import { expandStyleImports, parseCssImports, resolveImportPath, rewriteCssUrls } from "../../shared/css-imports";
import { nativeDefaultRoute, nativePageBody, nativePageStylesheets, type NativeSite } from "../../shared/native-project";
import { startTags } from "../../shared/html-source";
import { withSlottedRules } from "../../shared/slotted-css";

export interface ThumbnailInputs {
  site: NativeSite;
  sources: Record<string, string>;
  // Component tag to its stylesheet's path, for those read so far.
  componentStyles: Record<string, string>;
  // Repository image and font paths to data URLs.
  assets: Record<string, string>;
  // The route the preview shows: its stylesheets and page container are used.
  route: string;
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
const SITE = "https://site.invalid";
// Templates nested deeper than this are left unexpanded (a template that uses itself).
const MAX_DEPTH = 12;

/** `css` (the file `path`) with repository `url()`s as data URLs and its leading `@import`s left out. */
function prepareCss(css: string, path: string, assets: Record<string, string>) {
  const { imports } = parseCssImports(css);
  let text = css;
  for (const item of [...imports].reverse()) text = text.slice(0, item.start) + text.slice(item.end);
  return rewriteCssUrls(text, (url) => {
    const target = resolveImportPath(path, url);
    return target !== undefined && Object.hasOwn(assets, target) ? assets[target] : undefined;
  });
}

/** `</style` inside CSS would end the element early. */
const styleText = (css: string) => css.replace(/<\/style/gi, "<\\/style");

/** The site's shared CSS for `route`: its linked stylesheets with their imports, in cascade order. */
export function sharedCss(inputs: ThumbnailInputs) {
  const { site, sources, assets } = inputs;
  const file = site.routes[inputs.route] ?? site.routes[nativeDefaultRoute(site)];
  const linked = file ? nativePageStylesheets(sources[file] ?? "", file) : [];
  const expanded = expandStyleImports(linked.filter((path) => sources[path] !== undefined), (path) => sources[path]);
  return expanded.sheets.map((sheet) => prepareCss(sheet.source, sheet.path, assets));
}

/** `html` without scripts, event handler attributes, `javascript:` URLs or a refresh. */
export function inertHtml(html: string) {
  return html
    .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, "")
    .replace(/<[a-zA-Z][^>]*>/g, (tag) => tag
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(href|src|action|formaction|xlink:href)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, ""));
}

/** `<img src>`s that name a repository image, as their data URL. */
function withImageData(html: string, inputs: ThumbnailInputs) {
  return html.replace(/(<img\b[^>]*?\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi, (whole, lead: string, a?: string, b?: string, c?: string) => {
    const src = (a ?? b ?? c ?? "").trim();
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) return whole;
    try {
      const url = new URL(src, SITE + inputs.route);
      if (url.origin !== SITE) return whole;
      const key = decodeURI(url.pathname).replace(/^\//, "");
      return Object.hasOwn(inputs.assets, key) ? `${lead}"${inputs.assets[key]}"` : whole;
    } catch {
      return whole;
    }
  });
}

/**
 * `html` with a declarative shadow root after the start tag of each
 * component it uses, holding the shared and the component's own CSS and
 * the component's template (itself expanded).
 */
export function expandComponents(html: string, inputs: ThumbnailInputs, shared: string[], seen: string[] = []): string {
  if (seen.length >= MAX_DEPTH) return html;
  const { site, sources, componentStyles, assets } = inputs;
  let out = html;
  for (const tag of startTags(html).reverse()) {
    if (!Object.hasOwn(site.components, tag.name) || seen.includes(tag.name)) continue;
    // A self-closing custom element is not one the parser closes; leave it.
    if (/\/\s*>$/.test(html.slice(tag.start, tag.end))) continue;
    const template = sources[site.components[tag.name]] ?? "";
    const stylePath = componentStyles[tag.name];
    const own = stylePath && sources[stylePath] !== undefined ? prepareCss(withSlottedRules(sources[stylePath]), stylePath, assets) : "";
    const styles = [...shared, own].filter(Boolean).map((css) => `<style>${styleText(css)}</style>`).join("");
    const root = `<template shadowrootmode="open">${styles}${expandComponents(template, inputs, shared, [...seen, tag.name])}</template>`;
    out = out.slice(0, tag.end) + root + out.slice(tag.end);
  }
  return out;
}

/** The page container of the route's page (its `<main …>` start tag), or a plain `<main>`. */
function pageContainer(inputs: ThumbnailInputs) {
  const { site, sources } = inputs;
  const file = site.routes[inputs.route] ?? site.routes[nativeDefaultRoute(site)];
  const source = file ? sources[file] ?? "" : "";
  const { start, end } = nativePageBody(source);
  const body = source.slice(start, end);
  const main = startTags(body).find((tag) => tag.name === "main");
  return main ? body.slice(main.start, main.end) : "<main>";
}

/** The thumbnail document for `markup` (the instance the panel would insert). */
export function thumbnailDocument(inputs: ThumbnailInputs, markup: string) {
  const shared = sharedCss(inputs);
  const content = withImageData(inertHtml(expandComponents(inertHtml(markup), inputs, shared)), inputs);
  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    ...shared.map((css) => `<style>${styleText(css)}</style>`),
    // No scrollbars, nothing to hover: it is a picture. Room above and
    // below lets a short section sit in the middle of its thumbnail.
    `<style>html{scrollbar-width:none;overflow:hidden;padding-block:400px}html::-webkit-scrollbar{display:none}*{pointer-events:none!important;animation-play-state:paused!important}</style>`,
    `</head><body>${inertHtml(pageContainer(inputs))}${content}</main></body></html>`,
  ].join("\n");
}
