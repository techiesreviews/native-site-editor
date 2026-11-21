// The site's name where a visitor sees it (TOOLS-188): Name your site in the
// Inbox sets the name in `.editor/config.json`, and these edits put it where
// the pages show the old one. A new site from the Starter says "Larkspur
// Studio" in every page title ("About · Larkspur Studio"), in the sharing
// tags, in the home page's structured data for search engines, in the
// header's brand link ("Larkspur") and as the eyebrow over the home page's
// headline; after naming, each says the new name.
//
// The old name is the ending the page titles share (the Pages tab leaves the
// same ending off its rows), else the home page's og:site_name. Only exact
// uses change: a sentence that mentions the name (the footer's "Larkspur
// Studio, Frome, Somerset.") is the owner's to rewrite.

import { TITLE_SEPARATORS } from "../../shared/site-rules";
import { sharedTitleEnding } from "../components/page-title-ending";
import { decodeText, escapeText, readHeadSettings, upsertHeadTag } from "./site-head";

export interface SiteNameFiles {
  /** Page files by path; the home page first. */
  pages: Map<string, string>;
  /** Component templates by path (the site header's brand link among them). */
  templates: Map<string, string>;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function heads(pages: Map<string, string>) {
  const out = new Map<string, ReturnType<typeof readHeadSettings>>();
  for (const [path, source] of pages) {
    try { out.set(path, readHeadSettings(source)); } catch { /* A page without a complete head keeps its text. */ }
  }
  return out;
}

/** The name the pages show now, and how their titles set it off (" · "), if any. */
export function shownSiteName(pages: Map<string, string>): { name: string; separator?: string } | undefined {
  const read = heads(pages);
  const titles = [...read.values()].map((head) => head.title);
  const ending = sharedTitleEnding(titles);
  const home = read.get([...pages.keys()][0] ?? "")?.["og:site_name"].trim();
  // A name with a separator in it ("Bean - Leaf"): the titles' last part is only its end, so the whole name is the home page's.
  const wider = ending && home?.endsWith(ending) && TITLE_SEPARATORS.find((candidate) => titles.filter((title) => title.endsWith(candidate + home)).length >= 2);
  if (home && wider) return { name: home, separator: wider };
  const separator = ending && TITLE_SEPARATORS.find((candidate) => ending.startsWith(candidate));
  if (ending && separator) return { name: ending.slice(separator.length), separator };
  return home ? { name: home } : undefined;
}

/** Each file that shows the site's old name, by path, with `name` in its place. */
export function siteNameShownEdits(files: SiteNameFiles, name: string): Map<string, string> {
  const edits = new Map<string, string>();
  const wanted = name.trim();
  const shown = shownSiteName(files.pages);
  if (!wanted || !shown || shown.name === wanted) return edits;
  const ending = shown.separator === undefined ? undefined : shown.separator + shown.name;
  const newEnding = shown.separator === undefined ? undefined : shown.separator + wanted;
  // An element whose whole text is the old name (the home page's eyebrow), as written in the source.
  const whole = new RegExp(`(>\\s*)${escapeRegExp(escapeText(shown.name))}(\\s*</)`, "g");
  const asText = (text: string) => text.replace(whole, (_match, before: string, after: string) => `${before}${escapeText(wanted)}${after}`);
  // Structured data's "name" when it is exactly the old name; "<" written as < so the name cannot end the script.
  // The old name is found either way, as an earlier save wrote it escaped.
  const asJson = (text: string) => JSON.stringify(text).replace(/</g, "\\u003c");
  const dataName = new RegExp(`("name"\\s*:\\s*)(?:${escapeRegExp(JSON.stringify(shown.name))}|${escapeRegExp(asJson(shown.name))})`, "g");
  const newDataName = asJson(wanted);
  const asData = (text: string) => text.replace(/(<script\b[^>]*\btype="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g,
    (_match, open: string, body: string, close: string) => `${open}${body.replace(dataName, (_name, key: string) => `${key}${newDataName}`)}${close}`);
  const read = heads(files.pages);
  for (const [path, source] of files.pages) {
    const head = read.get(path);
    let next = source;
    if (head) {
      // A title that ends with the name changes its ending; one that is only the name (the Blank page's) becomes the new one.
      for (const field of ["title", "og:title"] as const)
        if (ending && newEnding && head[field].endsWith(ending)) next = upsertHeadTag(next, field, head[field].slice(0, -ending.length) + newEnding);
        else if (head[field].trim() === shown.name) next = upsertHeadTag(next, field, wanted);
      if (head["og:site_name"].trim() === shown.name) next = upsertHeadTag(next, "og:site_name", wanted);
    }
    next = asData(asText(next));
    if (next !== source) edits.set(path, next);
  }
  // The brand link shows the name or its first words ("Larkspur" for "Larkspur Studio").
  const brand = /(<a\b[^>]*\bclass="(?:[^"]*\s)?brand(?:\s[^"]*)?"[^>]*>)([^<]*)(<\/a>)/g;
  for (const [path, source] of files.templates) {
    const next = asText(source).replace(brand, (match, open: string, text: string, close: string) => {
      const label = decodeText(text).trim();
      return label && (label === shown.name || shown.name.startsWith(`${label} `)) ? `${open}${escapeText(wanted)}${close}` : match;
    });
    if (next !== source) edits.set(path, next);
  }
  return edits;
}
