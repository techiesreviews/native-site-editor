import { watchEditorTheme } from "../theme";
import "./preview-panel.css";
import { node, button } from "../ui/dom";
import { readTextAttributes } from "../../fixtures/astro-starter/.astro-editor/text-attributes.mjs";
import { textSizeOptions } from "../../fixtures/astro-starter/.astro-editor/text-options.mjs";
import { previewAlias, previewOrigin as sharedPreviewOrigin } from "../../fixtures/astro-starter/.astro-editor/preview-alias.mjs";
import { draftPageUrl, type DraftBuildSuccess } from "../../shared/draft-preview";
import { planStructuralTransaction, type StructuralTransaction } from "../browser-structural-preview";
import { type ButtonStyleMapping, type ButtonStyleValue } from "../button-style";

// Preview proof (ticket 05): embeds the branch build that the repository's own
// GitHub Actions workflow uploaded as an aliased Cloudflare Worker version, and
// checks which commit that build came from. Read from .astro-editor/preview.json.
export interface PreviewConfig {
  provider: string;
  worker: string;
  subdomain: string;
  revisionPath: string;
}

export interface PreviewState {
  config?: PreviewConfig;
  branch?: string;
  commit?: string;
  path?: string;
}

interface Revision {
  sha: string;
  ref: string;
  builtAt: string;
}

export function parsePreviewConfig(text: string): PreviewConfig | undefined {
  try {
    const value = JSON.parse(text) as Partial<PreviewConfig>;
    if (
      value.provider !== "cloudflare-workers-assets" ||
      typeof value.worker !== "string" ||
      typeof value.subdomain !== "string" ||
      typeof value.revisionPath !== "string" ||
      !/^[a-z0-9-]+$/.test(value.worker) ||
      !/^[a-z0-9-]+\.workers\.dev$/.test(value.subdomain) ||
      !value.revisionPath.startsWith("/") ||
      !previewAlias("main", value.worker)
    )
      return undefined;
    return value as PreviewConfig;
  } catch {
    return undefined;
  }
}

export function previewOrigin(config: PreviewConfig, branch: string) {
  return sharedPreviewOrigin(config, branch);
}

export function liveOrigin(config: PreviewConfig) {
  return `https://${config.worker}.${config.subdomain}`;
}

// Maps a file under src/pages to its static route; undefined for other files.
export function pageRoute(path: string | undefined) {
  const match = path?.match(/^src\/pages\/(.+)\.(astro|md|mdx|html)$/);
  if (!match) return undefined;
  const route = match[1].replace(/(^|\/)index$/, "");
  return route ? `/${route}/` : "/";
}

export interface PreviewChange {
  path: string;
  tag: string;
  // "href" for a link change; text otherwise.
  attribute?: string;
  before: string;
  after: string;
  at: number;
}

export interface PreviewTextElement {
  tag: string;
  open: { start: number; end: number };
  close: { start: number; end: number };
  size?: {
    value: string;
    editable: boolean;
    available?: string[];
    style?: { start: number; end: number };
    styleValue?: { start: number; end: number };
    insert?: { start: number; end: number };
  };
  buttonStyle?: ButtonStyleMapping;
  buttonSlot?: {
    parent: { start: number; end: number; tag: string };
    allowed: string[];
    baseClass: string;
    parentClass: string;
  };
}

export interface PreviewSelection {
  path: string;
  start: number;
  end: number;
  text: string;
  tag: string;
  classes?: string[];
  // A literal href on the element, mapped to its own source range.
  link?: { start: number; end: number; value: string };
  /** Canonical mapped rich-text element used by both headings and paragraphs. */
  textElement?: PreviewTextElement;
  rect?: { left: number; top: number; right: number; bottom: number };
}

interface MappedTextElement {
  path: string;
  level: string;
  text: string;
  body: { start: number; end: number };
  open: { start: number; end: number };
  close: { start: number; end: number };
}

interface MappedLink {
  path: string;
  start: number;
  end: number;
  value: string;
  body: { start: number; end: number; text: string };
}

function parseLoc(loc: unknown) {
  const match = typeof loc === "string" && loc.match(/^(.+):(\d+):(\d+)$/);
  if (!match) return undefined;
  const start = Number(match[2]);
  const end = Number(match[3]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start
    ? { path: match[1], start, end }
    : undefined;
}

function parseLinkInventory(value: unknown): MappedLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const at = parseLoc(item.loc);
    const body = parseLoc(item.body);
    return at && body && at.path === body.path && typeof item.value === "string" && typeof item.text === "string" &&
      at.end - at.start === item.value.length && body.end - body.start === item.text.length
      ? [{ ...at, value: item.value, body: { start: body.start, end: body.end, text: item.text } }] : [];
  });
}

function validTextMarkup(body: string) {
  const validPlain = (plain: string) => !/[<>{}]/.test(plain) &&
    !/&(?!(?:amp|lt|gt|#123|#125);)/.test(plain);
  const stack: string[] = [];
  let cursor = 0;
  for (const match of body.matchAll(/<\/?(strong|em)>/g)) {
    const plain = body.slice(cursor, match.index);
    if (!validPlain(plain)) return false;
    if (match[0][1] === "/") {
      if (stack.pop() !== match[1]) return false;
    } else stack.push(match[1]);
    cursor = match.index! + match[0].length;
  }
  return !stack.length && validPlain(body.slice(cursor));
}

/** The single minimal replaced span between `previous` and `source`. */
function exactDiff(previous: string, source: string): { start: number; end: number; text: string } {
  let start = 0;
  while (start < previous.length && start < source.length && previous[start] === source[start]) start++;
  let oldEnd = previous.length;
  let newEnd = source.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === source[newEnd - 1]) { oldEnd--; newEnd--; }
  return { start, end: oldEnd, text: source.slice(start, newEnd) };
}

/**
 * True only when every changed region is confined to one verified mapped text
 * body and the resulting body is still legal rich markup. This is the sole case
 * the live patch path represents exactly, so the draft-preview rebuild can be
 * skipped. Edits that touch a tag, an href value, span more than one body, land
 * outside any body, or produce Astro-expression/component/malformed markup
 * return false and must rebuild. Ranges are in `previous`-source coordinates.
 */
function coversMappedTextBody(
  path: string,
  previous: string,
  source: string,
  regions: { start: number; end: number; text: string }[],
  headings: MappedTextElement[],
  links: MappedLink[],
  frameReady: boolean,
): boolean {
  if (!frameReady || !regions.length) return false;
  let target: MappedTextElement | undefined;
  for (const region of regions) {
    if (region.start > region.end) return false;
    // An edit overlapping a mapped href value is a link edit, never covered.
    if (links.some((link) => link.path === path && region.start < link.end && region.end > link.start)) return false;
    const body = headings.find((heading) => heading.path === path &&
      region.start >= heading.body.start && region.end <= heading.body.end);
    if (!body || (target && target !== body)) return false;
    target = body;
  }
  if (!target) return false;
  let body = previous.slice(target.body.start, target.body.end);
  for (const region of [...regions].sort((a, b) => b.start - a.start))
    body = body.slice(0, region.start - target.body.start) + region.text + body.slice(region.end - target.body.start);
  // Guard against a stale body range: the recomputed body must round-trip in the
  // new source at the same offset before we trust it.
  if (source.slice(target.body.start, target.body.start + body.length) !== body) return false;
  return validTextMarkup(body);
}

function parseLiteralAnchors(source: string) {
  const anchors: { start: number; end: number; value: string; body: { start: number; end: number; text: string } }[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<a", cursor);
    if (start < 0) break;
    if (!/[\s/>]/.test(source[start + 2] ?? "")) { cursor = start + 2; continue; }
    let quote = "";
    let end = start + 2;
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) { if (char === "\\") end++; else if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    const opening = source.slice(start, end + 1);
    const attributes = readTextAttributes(opening);
    const hrefs = attributes?.filter((attribute) => attribute.name === "href" && attribute.value !== undefined) ?? [];
    if (end >= source.length || opening.includes("{") || hrefs.length !== 1) { cursor = start + 2; continue; }
    const href = hrefs[0];
    const closing = /^<\/a\s*>/i.exec(source.slice(end + 1));
    const closeStart = closing ? end + 1 : source.indexOf("</a", end + 1);
    const closeTag = closeStart >= 0 ? /^<\/a\s*>/i.exec(source.slice(closeStart)) : undefined;
    if (!closeTag) { cursor = end + 1; continue; }
    const text = source.slice(end + 1, closeStart);
    if (!validTextMarkup(text)) { cursor = closeStart + closeTag[0].length; continue; }
    anchors.push({ start: start + href.valueStart!, end: start + href.valueEnd!, value: href.value!,
      body: { start: end + 1, end: closeStart, text } });
    cursor = closeStart + closeTag[0].length;
  }
  return anchors;
}

function validTextRanges(
  body: { path: string; start: number; end: number },
  open: { path: string; start: number; end: number } | undefined,
  close: { path: string; start: number; end: number } | undefined,
  level: string,
) {
  return Boolean(
    open && close && /^(?:h[1-6]|p|a|button)$/.test(level) &&
    open.path === body.path && close.path === body.path &&
    open.end - open.start === level.length && close.end - close.start === level.length &&
    open.end <= body.start - 1 && close.start === body.end + 2,
  );
}

function validClassToken(value: unknown, allowEmpty = false): value is string {
  return typeof value === "string" && (allowEmpty && value === "" || /^[A-Za-z_][\w-]*$/.test(value));
}

// `select` carries the element's current text; `input` carries the text
// before the keystroke as `expected` and the new text as `text`.
export function parseSelection(data: unknown): PreviewSelection | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = data as Record<string, unknown>;
  if (value.source !== "astro-site-editor") return undefined;
  const current = value.type === "select" ? value.text : value.type === "input" ? value.expected : undefined;
  const at = parseLoc(value.loc);
  if (!at || typeof current !== "string") return undefined;
  if (!(at.end >= at.start) || at.end - at.start !== current.length) return undefined;
  const selection: PreviewSelection = { ...at, text: current, tag: String(value.tag ?? "") };
  if (Array.isArray(value.classes)) selection.classes = value.classes.filter((item): item is string => typeof item === "string");
  const href = value.href as Record<string, unknown> | undefined;
  const link = href && parseLoc(href.loc);
  if (link && link.path === at.path && typeof href.value === "string" && link.end - link.start === href.value.length)
    selection.link = { start: link.start, end: link.end, value: href.value };
  // Existing preview integrations send text metadata under `heading`.
  const heading = value.heading as Record<string, unknown> | undefined;
  const open = heading && parseLoc(heading.open);
  const close = heading && parseLoc(heading.close);
  const level = heading ? String(heading.level ?? "") : "";
  if (open && close && validTextRanges(at, open, close, level) && selection.tag === level)
    selection.textElement = {
      tag: level,
      open: { start: open.start, end: open.end },
      close: { start: close.start, end: close.end },
    };
  if (selection.textElement && heading?.size && typeof heading.size === "object") {
    const size = heading.size as Record<string, unknown>;
    const style = parseLoc(size.style);
    const styleValue = parseLoc(size.styleValue);
    const insert = parseLoc(size.insert);
    selection.textElement.size = {
      value: String(size.value ?? "default"), editable: size.editable === true,
      available: Array.isArray(size.available) ? size.available.filter((key): key is string => typeof key === "string") : [],
      ...(style?.path === at.path ? { style: { start: style.start, end: style.end } } : {}),
      ...(styleValue?.path === at.path ? { styleValue: { start: styleValue.start, end: styleValue.end } } : {}),
      ...(insert?.path === at.path ? { insert: { start: insert.start, end: insert.end } } : {}),
    };
  }
  if (selection.textElement && heading?.buttonStyle && typeof heading.buttonStyle === "object") {
    const style = heading.buttonStyle as Record<string, unknown>;
    const classAttr = parseLoc(style.classAttr);
    const classValue = parseLoc(style.classValue);
    const variants = style.variants;
    const valueName = String(style.value ?? "");
    const raw = variants && typeof variants === "object" ? variants as Record<string, unknown> : {};
    const normalizedVariants = {
      primary: typeof raw.primary === "string" ? raw.primary : "",
      secondary: typeof raw.secondary === "string" ? raw.secondary : "",
      outline: typeof raw.outline === "string" ? raw.outline : "",
      link: typeof raw.link === "string" ? raw.link : "",
    };
    const variantValues = Object.values(normalizedVariants);
    const occupied = new Set([style.baseClass]);
    const seenVariants = new Set<string>();
    const validVariants = variantValues.every((item) => {
      if (!validClassToken(item, true)) return false;
      if (!item) return true;
      if (occupied.has(item) || seenVariants.has(item)) return false;
      seenVariants.add(item);
      return true;
    });
    if (classAttr?.path === at.path && classValue?.path === at.path &&
        (valueName === "primary" || valueName === "secondary" || valueName === "outline" || valueName === "link") &&
        validClassToken(style.baseClass) && variants && typeof variants === "object" && validVariants) {
      selection.textElement.buttonStyle = {
        value: valueName,
        baseClass: style.baseClass,
        variants: normalizedVariants,
        classAttr: { start: classAttr.start, end: classAttr.end },
        classValue: { start: classValue.start, end: classValue.end },
      };
    }
  }
  if (selection.textElement && heading?.buttonSlot && typeof heading.buttonSlot === "object") {
    const slot = heading.buttonSlot as Record<string, unknown>;
    const parent = parseLoc(slot.parent);
    const tag = String(slot.parentTag ?? "");
    const parentClass = String(slot.parentClass ?? "");
    const allowed = Array.isArray(slot.allowed) ? slot.allowed.filter((item): item is string => typeof item === "string") : [];
    const baseClass = String(slot.baseClass ?? "");
    if (parent?.path === at.path && parent.start <= selection.textElement.open.start && parent.end >= selection.textElement.close.end &&
        /^[A-Za-z][\w.-]*$/.test(tag) && allowed.includes("button") && validClassToken(baseClass) && validClassToken(parentClass)) {
      selection.textElement.buttonSlot = {
        parent: { start: parent.start, end: parent.end, tag },
        allowed,
        baseClass,
        parentClass,
      };
    }
  }
  const rect = value.rect as Record<string, unknown> | undefined;
  if (rect && [rect.left, rect.top, rect.right, rect.bottom].every((part) => typeof part === "number"))
    selection.rect = rect as PreviewSelection["rect"];
  return selection;
}

export function createPreviewPanel(
  host: HTMLElement,
  handlers: {
    onSelect(selection: PreviewSelection, selectors: string[]): Promise<void>;
    // `group` keeps streamed keystrokes in one undo step; a link change is one step.
    onInput(selection: PreviewSelection, text: string, group: boolean): Promise<void>;
    onHeadingLevel(selection: PreviewSelection, level: string): Promise<void>;
    onTextSize?(selection: PreviewSelection, size: string, prepare: (start: number, end: number, replacement: string) => void): Promise<string | { classStyle: true }>;
    onButtonStyle?(selection: PreviewSelection, style: ButtonStyleValue, prepare: (start: number, end: number, replacement: string) => void): Promise<{ start: number; end: number; replacement: string } | undefined>;
    onCommit(path: string): void;
    onHistory?(direction: "undo" | "redo"): Promise<void>;
    onStructuralFallback?(path: string): void;
    // The authoritative draft/branch preview lifecycle for the topbar read-out.
    // "ready" only after the iframe editable handshake; "loading" is build-done
    // but not yet handshaken; "hidden" is an unsupported/absent preview.
    onStatus?(status: { kind: "hidden" | "waiting" | "building" | "loading" | "ready" | "failed"; message?: string; retry?: boolean }): void;
  },
) {
  const pane = node("section", "preview-pane");
  pane.setAttribute("aria-label", "Site preview");
  // Keep preview announcements accessible without a popup over the canvas.
  // The existing header continues to show draft and publishing status.
  const summary = node("span", "preview-summary sr-only");
  summary.setAttribute("role", "status");
  function say(text: string) {
    summary.textContent = text;
  }
  const frameHost = node("div", "preview-frame-host");
  const frame = document.createElement("iframe");
  frame.className = "preview-frame preview-frame--after";
  frame.title = "Site preview";
  frame.referrerPolicy = "no-referrer";
  // Comparison: the same build untouched on the left, with the draft's changes on the right.
  const before = document.createElement("iframe");
  before.className = "preview-frame preview-frame--before";
  before.title = "Page before your changes";
  before.referrerPolicy = "no-referrer";
  const beforeSlot = node("div", "preview-slot");
  beforeSlot.append(node("span", "preview-slot__label", "Before · as saved on GitHub"), before);
  const afterSlot = node("div", "preview-slot");
  afterSlot.append(node("span", "preview-slot__label", "After · with your changes"), frame);
  frameHost.append(afterSlot);
  const editBar = node("div", "preview-edit-bar");
  editBar.setAttribute("role", "toolbar");
  editBar.setAttribute("aria-label", "Edit bar");
  editBar.hidden = true;
  const kind = node("span", "preview-edit-bar__kind", "Heading");
  const levelLabel = document.createElement("label");
  levelLabel.className = "preview-edit-bar__label";
  levelLabel.append(node("span", "sr-only", "Heading level"));
  const levelSelect = document.createElement("select");
  levelSelect.setAttribute("aria-label", "Heading level");
  for (let n = 1; n <= 6; n++) levelSelect.append(new Option(`H${n}`, `h${n}`));
  levelLabel.append(levelSelect);
  const sizeLabel = document.createElement("label");
  sizeLabel.className = "preview-edit-bar__label";
  sizeLabel.append(node("span", "sr-only", "Text size"));
  const sizeSelect = document.createElement("select");
  sizeSelect.setAttribute("aria-label", "Text size");
  sizeSelect.append(new Option("Default", "default"));
  for (const option of textSizeOptions) sizeSelect.append(new Option(option.label, option.value));
  sizeLabel.append(sizeSelect);
  const buttonStyleLabel = document.createElement("label");
  buttonStyleLabel.className = "preview-edit-bar__label";
  buttonStyleLabel.append(node("span", "sr-only", "Button style"));
  const buttonStyleSelect = document.createElement("select");
  buttonStyleSelect.setAttribute("aria-label", "Button style");
  for (const [label, value] of [["Primary", "primary"], ["Secondary", "secondary"], ["Outline", "outline"], ["Link", "link"]] as const)
    buttonStyleSelect.append(new Option(label, value));
  buttonStyleLabel.append(buttonStyleSelect);
  function renderTextSize(value: string) {
    sizeSelect.querySelector('option[value="custom"]')?.remove();
    if (value === "custom") sizeSelect.append(new Option("Custom", "custom"));
    sizeSelect.value = value;
  }
  function restoreTextSize(size: NonNullable<PreviewTextElement["size"]>, css: string) {
    size.value = css ? textSizeOptions.find((option) => option.css === css)?.value ?? "custom" : "default";
    renderTextSize(size.value);
  }
  const bold = button("B", () => sendFormat("strong"), "preview-edit-bar__format");
  bold.setAttribute("aria-label", "Bold");
  bold.setAttribute("aria-pressed", "false");
  const italic = button("I", () => sendFormat("em"), "preview-edit-bar__format preview-edit-bar__format--italic");
  italic.setAttribute("aria-label", "Italic");
  italic.setAttribute("aria-pressed", "false");
  for (const control of [bold, italic])
    control.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const selection = selectedText;
      if (selection) postPatch({ loc: `${selection.path}:${selection.start}:${selection.end}`, text: "", attr: "capture-selection" });
    });
  function sendFormat(tag: "strong" | "em") {
    const selection = selectedText;
    if (!selection) return;
    const context = `${loadedUrl}\n${loadedRevision}`;
    void inputQueue.then(() => {
      if (!matches || loadedRevision !== currentRevision || context !== `${loadedUrl}\n${loadedRevision}` || selectedText !== selection)
        throw new Error("The preview changed. Select the text again.");
      postPatch({ loc: `${selection.path}:${selection.start}:${selection.end}`, text: tag, attr: "format" });
    }).catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));
  }
  const linkAction = document.createElement("button");
  linkAction.type = "button";
  linkAction.className = "preview-edit-bar__link";
  linkAction.textContent = "Link";
  linkAction.setAttribute("aria-haspopup", "dialog");
  linkAction.setAttribute("aria-expanded", "false");
  linkAction.addEventListener("click", openLinkPanel);
  editBar.append(kind, levelLabel, sizeLabel, bold, italic, linkAction, buttonStyleLabel);
  pane.append(editBar);
  let selectedText: PreviewSelection | undefined;
  let deferredSelection: { selection: PreviewSelection; selectors: string[]; context: string } | undefined;
  let preparedSourceChange: { path: string; start: number; end: number; replacement: string; href?: boolean; buttonStyle?: boolean } | undefined;
  let textInventory: MappedTextElement[] = [];
  let linkInventory: MappedLink[] = [];
  let canonicalLinkInventory: MappedLink[] = [];
  const unmappedLinkPaths = new Set<string>();
  const committedOriginalByPath = new Map<string, string>();
  const sourceByPath = new Map<string, string>();
  const originalByPath = new Map<string, string>();
  const latestSourceByPath = new Map<string, string>();
  const projectedBaselineByPath = new Set<string>();
  function resetSourceBaselines(build?: DraftBuildSuccess) {
    sourceByPath.clear();
    originalByPath.clear();
    latestSourceByPath.clear();
    projectedBaselineByPath.clear();
    latestSourceByPath.clear();
    blockedStructuralPaths.clear();
    projectedBaselineByPath.clear();
    for (const [path, source] of committedOriginalByPath) {
      sourceByPath.set(path, source);
      originalByPath.set(path, source);
    }
    if (!build) return;
    for (const [path, source] of Object.entries(build.sources)) {
      sourceByPath.set(path, source);
      originalByPath.set(path, source);
    }
  }
  function mappedLinksForSource(path: string, source: string) {
    const canonical = canonicalLinkInventory.filter((item) => item.path === path);
    const original = originalByPath.get(path);
    if (!canonical.length || !original) return undefined;
    const baseline = parseLiteralAnchors(original);
    const current = parseLiteralAnchors(source);
    if (baseline.length !== canonical.length || current.length !== baseline.length || !baseline.every((item, index) => {
      const mapped = canonical[index];
      return mapped && item.start === mapped.start && item.end === mapped.end && item.value === mapped.value &&
        item.body.start === mapped.body.start && item.body.end === mapped.body.end && item.body.text === mapped.body.text;
    })) return undefined;
    return current.map((item) => ({ path, ...item }));
  }
  function rebuildLinkInventory(path: string) {
    const source = sourceByPath.get(path);
    if (source === undefined) return;
    const current = mappedLinksForSource(path, source);
    if (!current) {
      linkInventory = linkInventory.filter((item) => item.path !== path);
      unmappedLinkPaths.add(path);
      return;
    }
    unmappedLinkPaths.delete(path);
    linkInventory = [...linkInventory.filter((item) => item.path !== path), ...current];
  }
  async function applyVisualInput(selection: PreviewSelection, text: string, group: boolean, href = false) {
    // These edits already use the text/link patch path. Do not also apply the
    // generic source shift intended for changes made in the code panel.
    const edit = { path: selection.path, start: selection.start, end: selection.end, replacement: text, href };
    deferVisualPending();
    preparedSourceChange = edit;
    try { await handlers.onInput(selection, text, group); }
    finally { if (preparedSourceChange === edit) preparedSourceChange = undefined; }
  }
  let visualPendingDeferral: number | undefined;
  function deferVisualPending() {
    if (visualPendingDeferral !== undefined) window.clearTimeout(visualPendingDeferral);
    visualPendingDeferral = window.setTimeout(() => { visualPendingDeferral = undefined; }, 250);
  }
  let inputQueue: Promise<void> = Promise.resolve();
  editBar.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const direction = (event.ctrlKey || event.metaKey) && key === "z" ? (event.shiftKey ? "redo" : "undo")
      : event.ctrlKey && !event.shiftKey && key === "y" ? "redo" : undefined;
    if (!direction || event.altKey || event.isComposing || !matches || comparing) return;
    event.preventDefault();
    const context = `${loadedUrl}\n${loadedRevision}`;
    inputQueue = inputQueue.then(async () => {
      if (matches && !comparing && context === `${loadedUrl}\n${loadedRevision}`) await handlers.onHistory?.(direction);
    }).catch((error: unknown) => say(error instanceof Error ? error.message : String(error)));
  });
  function positionEditBar() {
    const rect = selectedText?.rect;
    if (!rect || !selectedText) return;
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < frameRect.height && rect.right > 0 && rect.left < frameRect.width;
    editBar.hidden = !visible;
    if (!visible) return;
    const frameLeft = frameRect.left - paneRect.left;
    const frameTop = frameRect.top - paneRect.top;
    const frameRight = frameRect.right - paneRect.left;
    const frameBottom = frameRect.bottom - paneRect.top;
    const targetLeft = frameLeft + rect.left;
    const targetTop = frameTop + rect.top;
    const targetBottom = frameTop + rect.bottom;
    const width = editBar.offsetWidth;
    const height = editBar.offsetHeight;
    const minLeft = frameLeft + 8;
    const maxLeft = Math.max(minLeft, frameRight - width - 8);
    const above = targetTop - height - 8;
    const below = targetBottom + 8;
    const top = above >= frameTop ? above : below + height <= frameBottom ? below : frameTop + 4;
    editBar.dataset.side = above >= frameTop ? "above" : below + height <= frameBottom ? "below" : "pinned";
    editBar.style.left = `${Math.max(minLeft, Math.min(targetLeft, maxLeft))}px`;
    editBar.style.top = `${top}px`;
    positionLinkPanel();
  }
  function showTextBar(selection: PreviewSelection | undefined) {
    selectedText = selection?.textElement || selection?.link ? selection : undefined;
    editBar.hidden = !selectedText;
    if (selectedText) {
      const isText = Boolean(selectedText.textElement);
      const isHeading = isText && /^h[1-6]$/.test(selectedText.textElement!.tag);
      const buttonStyle = selectedText.textElement?.buttonStyle;
      kind.textContent = selectedText.tag === "button" || Boolean(buttonStyle) || selectedText.classes?.includes("button") ? "Button"
        : selectedText.tag === "a" ? "Link"
          : isHeading ? "Heading" : "Paragraph";
      levelLabel.hidden = !isHeading;
      sizeLabel.hidden = !isText;
      buttonStyleLabel.hidden = !buttonStyle || !handlers.onButtonStyle;
      bold.hidden = !isText;
      italic.hidden = !isText;
      linkAction.hidden = !selectedText.link || unmappedLinkPaths.has(selectedText.path);
      if (isHeading) levelSelect.value = selectedText.textElement!.tag;
      const size = selectedText.textElement?.size;
      sizeSelect.disabled = !size?.editable || !handlers.onTextSize;
      for (const option of sizeSelect.options)
        option.disabled = option.value !== "default" && option.value !== "custom" && !size?.available?.includes(option.value);
      sizeSelect.title = size?.available?.length ? "" : "Define the text-size variables in the project stylesheet.";
      renderTextSize(size?.value ?? "default");
      if (buttonStyle) {
        buttonStyleSelect.value = buttonStyle.value;
        for (const option of buttonStyleSelect.options)
          option.disabled = option.value !== "primary" && !buttonStyle.variants[option.value as ButtonStyleValue];
      }
      bold.setAttribute("aria-pressed", "false");
      italic.setAttribute("aria-pressed", "false");
      requestAnimationFrame(positionEditBar);
    }
  }
  const barResize = new ResizeObserver(() => positionEditBar());
  barResize.observe(frame);
  barResize.observe(pane);
  window.addEventListener("resize", positionEditBar);
  levelSelect.addEventListener("change", () => {
    const selection = selectedText;
    const previous = selection?.textElement?.tag;
    const next = levelSelect.value;
    if (!selection || !/^h[1-6]$/.test(previous ?? "") || next === previous) return;
    const context = `${loadedUrl}\n${loadedRevision}`;
    const current = () => matches && loadedRevision === currentRevision &&
      context === `${loadedUrl}\n${loadedRevision}` &&
      selectedText === selection;
    inputQueue = inputQueue
      .then(() => {
        if (!current()) throw new Error("The preview changed. Select the heading again.");
        return handlers.onHeadingLevel(selection, next);
      })
      .then(() => {
        if (!current()) throw new Error("The preview changed. Select the heading again.");
        const heading = selection.textElement!;
        if (heading.tag !== next) syncHeading(selection, next);
        postPatch({
          loc: `${selection.path}:${heading.open.start}:${heading.open.end}`,
          closeLoc: `${selection.path}:${heading.close.start}:${heading.close.end}`,
          text: next,
          attr: "heading",
          focus: true,
        });
        say(`Heading changed to ${next.toUpperCase()}. Publish to save it to GitHub.`);
      })
      .catch((error: unknown) => {
        levelSelect.value = previous ?? "h1";
        say(error instanceof Error ? error.message : String(error));
      });
  });
  function prepareTextSourceChange(selection: PreviewSelection, start: number, end: number, replacement: string) {
    const delta = replacement.length - (end - start);
    if (!delta) return;
    for (const heading of textInventory) {
      if (heading.path !== selection.path) continue;
      for (const range of [heading.body, heading.open, heading.close]) shiftRange(range, end, delta);
    }
    const selected = selectedText;
    if (selected?.path === selection.path) {
      if (selected.start >= end) { selected.start += delta; selected.end += delta; }
      if (selected.textElement) {
        for (const range of [selected.textElement.open, selected.textElement.close]) shiftRange(range, end, delta);
        const size = selected.textElement.size;
        if (size) {
          if (size.insert?.start === start && size.insert.end === end && replacement) {
            size.insert = undefined;
            size.style = { start, end: start + replacement.length };
            const quote = replacement.search(/["']/);
            size.styleValue = { start: start + quote + 1, end: start + replacement.length - 1 };
          } else if (size.style?.start === start && size.style.end === end) {
            if (!replacement) {
              size.style = undefined;
              size.styleValue = undefined;
              size.insert = { start, end: start };
            } else {
              size.style.end += delta;
              if (size.styleValue) size.styleValue.end += delta;
            }
          } else if (size.style && start >= size.style.start && end <= size.style.end) {
            size.style.end += delta;
            if (size.styleValue && start >= size.styleValue.start && end <= size.styleValue.end)
              size.styleValue.end += delta;
          } else for (const range of [size.style, size.styleValue, size.insert]) if (range) shiftRange(range, end, delta);
        }
      }
    }
  }
  function prepareButtonSourceChange(selection: PreviewSelection, start: number, end: number, replacement: string) {
    const style = selection.textElement?.buttonStyle;
    if (!style) return;
    const delta = replacement.length - (end - start);
    if (!delta) return;
    for (const heading of textInventory) {
      if (heading.path !== selection.path) continue;
      for (const range of [heading.body, heading.open, heading.close]) shiftRange(range, end, delta);
    }
    updateLinkRanges(selection.path, start, end, replacement);
    if (selection.start >= end) {
      selection.start += delta;
      selection.end += delta;
    }
    if (selection.link) shiftRange(selection.link, end, delta);
    if (link?.path === selection.path) shiftRange(link, end, delta);
    if (selection.textElement) {
      for (const range of [selection.textElement.open, selection.textElement.close]) shiftRange(range, end, delta);
      const size = selection.textElement.size;
      if (size) for (const range of [size.style, size.styleValue, size.insert]) if (range) shiftRange(range, end, delta);
      // The button-slot parent encloses the class change, so its end must move
      // with the delta (mirroring shiftTextElementRanges). Keep the annotation
      // range current for downstream selection and metadata consumers.
      const slot = selection.textElement.buttonSlot;
      if (slot) shiftEnclosingRange(slot.parent, end, delta);
    }
    style.classAttr.end += delta;
    style.classValue.end += delta;
    if (selectedText === selection) {
      const selectedStyle = selectedText.textElement?.buttonStyle;
      if (selectedStyle && selectedStyle !== style) {
        selectedStyle.classAttr.end += delta;
        selectedStyle.classValue.end += delta;
      }
    }
  }
  function buttonStyleValueFromClasses(style: ButtonStyleMapping, value: string): ButtonStyleValue | undefined {
    const classes = value.trim().split(/\s+/).filter(Boolean);
    if (!classes.includes(style.baseClass)) return undefined;
    const active = (Object.entries(style.variants) as [ButtonStyleValue, string][])
      .filter(([, className]) => className && classes.includes(className));
    return active.length > 1 ? undefined : active[0]?.[0] ?? "primary";
  }
  sizeSelect.addEventListener("change", () => {
    const selection = selectedText;
    const size = selection?.textElement?.size;
    const previous = size?.value;
    const next = sizeSelect.value;
    if (!selection || !size?.editable || !handlers.onTextSize || !previous || next === previous || next === "custom") return;
    const context = `${loadedUrl}\n${loadedRevision}`;
    inputQueue = inputQueue.then(async () => {
      if (!matches || loadedRevision !== currentRevision || context !== `${loadedUrl}\n${loadedRevision}` || selectedText !== selection)
        throw new Error("The preview changed. Select the text again.");
      let sourceStart = -1;
      let sourceEnd = -1;
      let sourceText = "";
      const css = await handlers.onTextSize!(selection, next, (start, end, replacement) => {
        sourceStart = start;
        sourceEnd = end;
        sourceText = replacement;
        preparedSourceChange = { path: selection.path, start, end, replacement };
        prepareTextSourceChange(selection, start, end, replacement);
      });
      size.value = next;
      renderTextSize(next);
      if (typeof css !== "string") return;
      const patch = { loc: `${selection.path}:${selection.start}:${selection.end}`, text: css, attr: "heading-size",
        closeLoc: `${selection.path}:${selection.textElement!.open.start}:${selection.textElement!.open.end}`,
        sourceStart, sourceEnd, sourceText };
      patches.push(patch);
      patchedRevision = currentRevision;
      postPatch(patch);
    }).catch((error: unknown) => {
      renderTextSize(previous);
      say(error instanceof Error ? error.message : String(error));
    });
  });
  buttonStyleSelect.addEventListener("change", () => {
    const selection = selectedText;
    const style = selection?.textElement?.buttonStyle;
    const previous = style?.value;
    const next = buttonStyleSelect.value as ButtonStyleValue;
    if (!selection || !style || !handlers.onButtonStyle || !previous || next === previous) return;
    const context = `${loadedUrl}\n${loadedRevision}`;
    inputQueue = inputQueue.then(async () => {
      if (!matches || loadedRevision !== currentRevision || context !== `${loadedUrl}\n${loadedRevision}` || selectedText !== selection)
        throw new Error("The preview changed. Select the button again.");
      const classAttr = { ...style.classAttr };
      const applied = await handlers.onButtonStyle!(selection, next, (start, end, replacement) => {
        preparedSourceChange = { path: selection.path, start, end, replacement, buttonStyle: true };
        prepareButtonSourceChange(selection, start, end, replacement);
      });
      if (!applied) return;
      style.value = next;
      const patch = {
        loc: `${selection.path}:${classAttr.start}:${classAttr.end}`,
        closeLoc: `${selection.path}:${applied.start}:${applied.end}`,
        text: applied.replacement,
        attr: "button-style",
        sourceStart: applied.start,
        sourceEnd: applied.end,
        sourceText: applied.replacement,
      };
      patches.push(patch);
      patchedRevision = currentRevision;
      postPatch(patch);
      say("Button style updated. Publish to save it to GitHub.");
    }).catch((error: unknown) => {
      buttonStyleSelect.value = previous;
      say(error instanceof Error ? error.message : String(error));
    });
  });
  let comparing = false;
  // Link editing for a selected element with a literal href.
  const linkBar = node("form", "preview-link");
  linkBar.hidden = true;
  linkBar.setAttribute("role", "dialog");
  linkBar.setAttribute("aria-label", "Edit link");
  const linkLabel = node("label", "preview-link__label", "Destination");
  const linkInput = document.createElement("input");
  linkInput.className = "preview-link__input";
  linkInput.type = "text";
  linkInput.spellcheck = false;
  linkInput.id = "preview-link-input";
  linkLabel.htmlFor = linkInput.id;
  linkInput.setAttribute("aria-label", "Destination");
  const linkError = node("span", "preview-link__hint");
  linkError.setAttribute("role", "alert");
  const applyLinkButton = document.createElement("button");
  applyLinkButton.type = "submit";
  applyLinkButton.className = "preview-link__apply";
  applyLinkButton.textContent = "Apply";
  const cancelLinkButton = document.createElement("button");
  cancelLinkButton.type = "button";
  cancelLinkButton.className = "preview-link__cancel";
  cancelLinkButton.textContent = "Cancel";
  cancelLinkButton.addEventListener("click", () => closeLinkPanel());
  linkBar.append(linkLabel, linkInput, applyLinkButton, cancelLinkButton, linkError);
  let link: { path: string; tag: string; start: number; end: number; value: string } | undefined;
  let linkPanelTarget: typeof link | undefined;
  function showLink(selection: PreviewSelection | undefined) {
    const candidate = selection?.link;
    link = candidate && !unmappedLinkPaths.has(selection!.path) ? { path: selection!.path, tag: selection!.tag, ...candidate } : undefined;
    if (!link || linkPanelTarget) closeLinkPanel(false);
  }
  function positionLinkPanel() {
    if (linkBar.hidden) return;
    const paneRect = pane.getBoundingClientRect();
    const barRect = editBar.getBoundingClientRect();
    const width = linkBar.offsetWidth;
    const height = linkBar.offsetHeight;
    const left = Math.max(8, Math.min(barRect.left - paneRect.left, paneRect.width - width - 8));
    const below = barRect.bottom - paneRect.top + 8;
    const top = below + height <= paneRect.height - 8 ? below : Math.max(8, barRect.top - paneRect.top - height - 8);
    linkBar.style.left = `${left}px`;
    linkBar.style.top = `${top}px`;
  }
  function openLinkPanel() {
    if (!link || !selectedText?.link || selectedText.path !== link.path || selectedText.link.start !== link.start) return;
    linkPanelTarget = link;
    postPatch({ loc: `${selectedText.path}:${selectedText.start}:${selectedText.end}`, text: "", attr: "finish" });
    linkInput.value = link.value;
    linkError.textContent = "";
    linkBar.hidden = false;
    linkAction.setAttribute("aria-expanded", "true");
    linkAction.setAttribute("aria-controls", "preview-link-panel");
    requestAnimationFrame(() => { positionLinkPanel(); linkInput.focus(); linkInput.select(); });
  }
  function closeLinkPanel(focus = true) {
    linkPanelTarget = undefined;
    linkBar.hidden = true;
    linkAction.setAttribute("aria-expanded", "false");
    linkError.textContent = "";
    if (focus && !editBar.hidden) linkAction.focus();
  }
  function validDestination(value: string) {
    if (/["'<>{}\u0000-\u0020\u007f]/.test(value) || /&#|&[a-z][a-z0-9]+;/i.test(value)) return false;
    try {
      const protocol = new URL(value, "https://astro-site-editor.invalid").protocol;
      return ["https:", "http:", "mailto:", "tel:"].includes(protocol);
    } catch { return false; }
  }
  function applyLink() {
    const target = linkPanelTarget;
    const value = linkInput.value;
    if (!target) return;
    if (value === target.value) { closeLinkPanel(); return; }
    if (!validDestination(value)) {
      linkError.textContent = "Enter a safe link destination.";
      return;
    }
    const context = `${loadedUrl}\n${loadedRevision}`;
    const selection = selectedText;
    if (!selection?.link || selection.path !== target.path || selection.link.start !== target.start ||
        selection.link.end !== target.end || selection.link.value !== target.value) { closeLinkPanel(); return; }
    let mapped: MappedLink | undefined;
    applyLinkButton.disabled = true;
    inputQueue = inputQueue.then(() => {
      if (!matches || comparing || loadedRevision !== currentRevision || context !== `${loadedUrl}\n${loadedRevision}` ||
          linkPanelTarget !== target || selectedText !== selection) throw new Error("The preview changed. Select the link again.");
      rebuildLinkInventory(target.path);
      mapped = linkInventory.find((item) => item.path === target.path && item.start === target.start &&
        item.end === target.end && item.value === target.value);
      if (!mapped) throw new Error("This link source changed. Select it again.");
      return applyVisualInput({ path: mapped.path, start: mapped.start, end: mapped.end, text: mapped.value, tag: target.tag }, value, false, true);
    })
      .then(() => {
        if (!mapped) throw new Error("This link source changed. Select it again.");
        const loc = `${target.path}:${target.start}:${target.end}`;
        const patch = { loc, text: value, attr: "href" };
        patches.push(patch);
        patchedRevision = currentRevision;
        postPatch(patch);
        changes.push({ path: target.path, tag: target.tag, attribute: "href", before: target.value, after: value, at: Date.now() });
        if (link === target) link = { ...target, start: mapped.start, end: mapped.start + value.length, value };
        if (selectedText === selection && selectedText.link)
          selectedText.link = { start: mapped.start, end: mapped.start + value.length, value };
        closeLinkPanel();
        say("Link updated. Publish to save it to GitHub.");
      })
      .catch((error: unknown) => {
        linkInput.value = target.value;
        linkError.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => { applyLinkButton.disabled = false; });
  }
  linkBar.addEventListener("submit", (event) => {
    event.preventDefault();
    applyLink();
  });
  linkBar.id = "preview-link-panel";
  pane.addEventListener("pointerdown", (event) => {
    if (!linkBar.hidden && event.target instanceof Node && !linkBar.contains(event.target) && !linkAction.contains(event.target)) closeLinkPanel(false);
  });
  linkBar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeLinkPanel();
    }
  });
  pane.append(summary, frameHost, linkBar);
  let matches = false;
  let draftBuild: DraftBuildSuccess | undefined;
  let draftOrigin = "";
  let draftPathPrefix = "";
  let draftState: "off" | "pending" | "ready" | "error" = "off";
  let draftLoadToken = 0;
  let pendingDraftLoadToken = 0;
  // Changes applied to the current preview build, replayed when the frame
  // reloads and dropped once a newer build is served.
  let patches: { loc: string; text: string; attr?: string; closeLoc?: string; focus?: boolean; editId?: string; sourceStart?: number; sourceEnd?: number; sourceText?: string }[] = [];
  let structuralSerial = 0;
  let structuralGeneration = 0;
  const pendingStructural = new Map<string, { path: string; source: string; timer: number; context: string; generation: number; focus?: string }>();
  const blockedStructuralPaths = new Set<string>();
  let patchedRevision = "";
  const classStylePatches = new Map<string, { loc: string; text: string; attr: string }>();
  let selecting: Promise<void> | undefined;
  let selectionRequest = 0;
  // Human-readable log of inline edits for the changes window.
  const changes: PreviewChange[] = [];
  let editing: { path: string; tag: string; before: string; after: string } | undefined;
  let overlayFocus = "";
  function syncOverlayTheme() {
    const origin = postOrigin();
    if (!open || !origin || !overlayFocus) return;
    frame.contentWindow?.postMessage(
      { source: "astro-site-editor", type: "theme", focus: overlayFocus },
      origin,
    );
  }
  function postOrigin() {
    if (draftBuild) return draftOrigin;
    return state.config && state.branch ? previewOrigin(state.config, state.branch) : "";
  }
  function committedPreviewOrigin() {
    return state.config && state.branch ? previewOrigin(state.config, state.branch) : "";
  }
  function postPatch(patch: { loc: string; text: string; attr?: string; closeLoc?: string; focus?: boolean; editId?: string; sourceStart?: number; sourceEnd?: number; sourceText?: string }) {
    const origin = postOrigin();
    if (!origin) return;
    frame.contentWindow?.postMessage(
      { source: "astro-site-editor", type: "patch", ...patch },
      origin,
    );
  }
  function postReadonly() {
    const origin = postOrigin();
    if (!origin) return;
    frame.contentWindow?.postMessage({ source: "astro-site-editor", type: "readonly" }, origin);
  }
  function postStructural(id: string, transaction: StructuralTransaction) {
    const origin = postOrigin();
    if (!origin) return false;
    frame.contentWindow?.postMessage(
      { source: "astro-site-editor", type: "structural-preview", id, transaction },
      origin,
    );
    return true;
  }
  function postStructuralCommit(id: string) {
    const origin = postOrigin();
    if (!origin) return;
    frame.contentWindow?.postMessage({ source: "astro-site-editor", type: "structural-preview-commit", id }, origin);
  }
  function blockStructural(paths: Iterable<string>) {
    for (const path of paths) blockedStructuralPaths.add(path);
    matches = false;
    selectionRequest++;
    showLink(undefined);
    showTextBar(undefined);
    postReadonly();
  }
  function cancelAllPendingStructural() {
    structuralGeneration++;
    const paths = new Set<string>();
    for (const pending of pendingStructural.values()) {
      window.clearTimeout(pending.timer);
      paths.add(pending.path);
    }
    pendingStructural.clear();
    blockStructural(paths);
    return paths;
  }
  function headingPatch(heading: Pick<MappedTextElement, "path" | "open" | "close">, level: string) {
    const patch = {
      loc: `${heading.path}:${heading.open.start}:${heading.open.end}`,
      closeLoc: `${heading.path}:${heading.close.start}:${heading.close.end}`,
      text: level,
      attr: "heading",
    };
    patches.push(patch);
    patchedRevision = currentRevision;
    postPatch(patch);
  }
  function syncHeading(selection: PreviewSelection, level: string) {
    const heading = selection.textElement;
    if (!heading || heading.tag === level) return;
    headingPatch({ path: selection.path, open: heading.open, close: heading.close }, level);
    heading.tag = level;
    selection.tag = level;
    levelSelect.value = level;
  }
  function reconcileText(path: string) {
    const source = sourceByPath.get(path);
    if (!source) return;
    const invalidate = (heading: MappedTextElement) => {
      const selected = selectedText;
      if (!selected?.textElement || selected.path !== path || selected.textElement.open.start !== heading.open.start) return;
      postPatch({ loc: `${path}:${heading.body.start}:${heading.body.end}`, text: "", attr: "invalidate" });
      showTextBar(undefined);
    };
    for (const heading of textInventory) {
      if (heading.path !== path) continue;
      const open = source.slice(heading.open.start, heading.open.end);
      if (!/^(?:h[1-6]|p|a|button)$/.test(open)) { invalidate(heading); continue; }
      let quote = "";
      let braces = 0;
      let openingEnd = -1;
      for (let index = heading.open.end; index < source.length; index++) {
        const char = source[index];
        if (quote) { if (char === "\\") index++; else if (char === quote) quote = ""; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === "{") braces++;
        else if (char === "}") braces--;
        else if (char === ">" && braces === 0) { openingEnd = index; break; }
      }
      if (openingEnd < 0) { invalidate(heading); continue; }
      const nextBodyStart = openingEnd + 1;
      if (nextBodyStart !== heading.body.start) {
        const delta = nextBodyStart - heading.body.start;
        const oldStart = heading.body.start;
        heading.body.start += delta;
        heading.body.end += delta;
        heading.close.start += delta;
        heading.close.end += delta;
        for (const later of textInventory) {
          if (later === heading || later.path !== path || later.open.start < oldStart) continue;
          for (const range of [later.body, later.open, later.close]) { range.start += delta; range.end += delta; }
        }
        const opening = source.slice(heading.open.end, openingEnd);
        const style = opening.match(/\bstyle\s*=\s*(["'])(.*?)\1/is)?.[2] ?? "";
        const token = style.match(/(?:^|;)\s*font-size\s*:\s*([^;]+?)\s*(?:;|$)/i)?.[1] ?? "";
        const oldBodyStart = heading.body.start - delta;
        postPatch({ loc: `${path}:${heading.body.start}:${heading.body.end}`,
          closeLoc: `${path}:${heading.open.start}:${heading.open.end}`, text: token, attr: "heading-size-only",
          sourceStart: heading.open.end, sourceEnd: oldBodyStart,
          sourceText: source.slice(heading.open.end, openingEnd + 1) });
        const selected = selectedText;
        if (selected?.path === path && selected.textElement?.open.start === heading.open.start && selected.textElement.size) {
          restoreTextSize(selected.textElement.size, token);
        }
      }
      const attrs = source.slice(heading.open.end, openingEnd);
      postPatch({ loc: `${path}:${heading.open.start}:${heading.open.end}`, attr: "text-attributes", text: attrs });
      const currentSelection = selectedText;
      if (currentSelection?.path === path && currentSelection.textElement?.open.start === heading.open.start && currentSelection.textElement.size) {
        const size = currentSelection.textElement.size;
        const style = readTextAttributes(`<${open}${attrs}>`)?.find(attr => attr.name === "style");
        if (style?.valueStart !== undefined && style.valueEnd !== undefined) {
          const offset = heading.open.start - 1;
          size.style = { start: offset + style.start, end: offset + style.end };
          size.styleValue = { start: offset + style.valueStart, end: offset + style.valueEnd };
          size.insert = undefined;
        } else {
          size.style = undefined; size.styleValue = undefined;
          size.insert = { start: openingEnd, end: openingEnd };
        }
      }
      const closeStart = source.indexOf(`</${open}>`, heading.body.start);
      if (closeStart < heading.body.start) { invalidate(heading); continue; }
      const body = source.slice(heading.body.start, closeStart);
      if (!validTextMarkup(body)) { invalidate(heading); continue; }
      if (body !== heading.text) {
        const oldEnd = heading.body.end;
        const delta = closeStart - oldEnd;
        const patch = { loc: `${path}:${heading.body.start}:${heading.body.end}`, text: body };
        patches.push(patch);
        patchedRevision = currentRevision;
        postPatch(patch);
        heading.text = body;
        heading.body.end = closeStart;
        heading.close = { start: closeStart + 2, end: closeStart + 2 + open.length };
        if (delta) {
          for (const later of textInventory) {
            if (later === heading || later.path !== path || later.body.start < oldEnd) continue;
            for (const range of [later.body, later.open, later.close]) {
              range.start += delta;
              range.end += delta;
            }
          }
        }
        const selected = selectedText;
        if (selected?.path === path && selected.start === heading.body.start) {
          selected.text = body;
          selected.end = closeStart;
          if (selected.textElement) selected.textElement.close = { ...heading.close };
        } else if (selected?.path === path && selected.start >= oldEnd) {
          selected.start += delta;
          selected.end += delta;
          if (selected.textElement) {
            for (const range of [selected.textElement.open, selected.textElement.close]) {
              range.start += delta;
              range.end += delta;
            }
          }
        }
      }
      if (/^h[1-6]$/.test(open) && open !== heading.level) {
        headingPatch(heading, open);
        heading.level = open;
      }
      if (!selectedText) postPatch({ loc: `${path}:${heading.open.start}:${heading.open.end}`,
        closeLoc: `${path}:${closeStart + 2}:${closeStart + 2 + open.length}`,
        attr: "button-mapping", text: attrs, sourceStart: heading.body.start, sourceEnd: closeStart, sourceText: body });
      const selected = selectedText;
      if (selected?.textElement && selected.path === path && selected.textElement.open.start === heading.open.start) {
        selected.textElement.tag = open;
        selected.tag = open;
        levelSelect.value = open;
      }
    }
  }
  function parseTextInventory(value: unknown): MappedTextElement[] {
    if (!Array.isArray(value)) return [];
    const found: MappedTextElement[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const body = parseLoc(entry.body);
      const open = parseLoc(entry.open);
      const close = parseLoc(entry.close);
      const level = String(entry.level ?? "");
      if (!body || !open || !close || typeof entry.text !== "string" || body.end - body.start !== entry.text.length ||
          !validTextRanges(body, open, close, level)) continue;
      found.push({
        path: body.path,
        level,
        text: entry.text,
        body: { start: body.start, end: body.end },
        open: { start: open.start, end: open.end },
        close: { start: close.start, end: close.end },
      });
    }
    return found;
  }
  function clearTextContext(options: { preserveDeferredSelection?: boolean } = {}) {
    selectionRequest++;
    if (!options.preserveDeferredSelection) deferredSelection = undefined;
    showTextBar(undefined);
    for (const pending of pendingStructural.values()) window.clearTimeout(pending.timer);
    pendingStructural.clear();
    blockedStructuralPaths.clear();
    structuralGeneration++;
    textInventory = [];
    linkInventory = [];
    canonicalLinkInventory = [];
    unmappedLinkPaths.clear();
    sourceByPath.clear();
    originalByPath.clear();
  }
  function shiftRange(range: { start: number; end: number }, boundary: number, delta: number) {
    if (range.start >= boundary) {
      range.start += delta;
      range.end += delta;
    }
  }
  function shiftEnclosingRange(range: { start: number; end: number }, boundary: number, delta: number) {
    if (range.start >= boundary) shiftRange(range, boundary, delta);
    else if (range.end >= boundary) range.end += delta;
  }
  function shiftTextElementRanges(element: PreviewTextElement, boundary: number, delta: number) {
    shiftRange(element.open, boundary, delta);
    shiftRange(element.close, boundary, delta);
    const size = element.size;
    if (size) for (const range of [size.style, size.styleValue, size.insert]) if (range) shiftRange(range, boundary, delta);
    const style = element.buttonStyle;
    if (style) {
      shiftEnclosingRange(style.classAttr, boundary, delta);
      shiftEnclosingRange(style.classValue, boundary, delta);
    }
    const slot = element.buttonSlot;
    if (slot) shiftEnclosingRange(slot.parent, boundary, delta);
  }
  function shiftSelectionRanges(selection: PreviewSelection, boundary: number, delta: number) {
    shiftRange(selection, boundary, delta);
    if (selection.link) shiftRange(selection.link, boundary, delta);
    if (selection.textElement) shiftTextElementRanges(selection.textElement, boundary, delta);
  }
  function updateTextRanges(selection: PreviewSelection, text: string) {
    if (textInventory.some((heading) => heading.path === selection.path &&
      heading.body.start === selection.start && heading.body.end === selection.start + text.length && heading.text === text))
      return;
    const delta = text.length - (selection.end - selection.start);
    const oldEnd = selection.end;
    for (const heading of textInventory) {
      if (heading.path !== selection.path) continue;
      if (heading.body.start === selection.start && heading.body.end === selection.end) {
        heading.body.end += delta;
        heading.text = text;
      }
      shiftRange(heading.body, oldEnd, delta);
      shiftRange(heading.open, oldEnd, delta);
      shiftRange(heading.close, oldEnd, delta);
    }
    const selected = selectedText;
    if (selected?.path === selection.path) {
      if (selected.textElement) shiftTextElementRanges(selected.textElement, oldEnd, delta);
      if (selected.start === selection.start && selected.end === selection.end) {
        selected.end += delta;
        selected.text = text;
      }
    }
  }
  function shiftLinkRanges(items: MappedLink[], path: string, start: number, end: number, replacement: string) {
    const delta = replacement.length - (end - start);
    for (const item of items) {
      if (item.path !== path) continue;
      if (start >= item.start && end <= item.end) {
        const offset = start - item.start;
        item.value = item.value.slice(0, offset) + replacement + item.value.slice(offset + end - start);
        item.end += delta;
      } else if (item.start >= end) {
        item.start += delta;
        item.end += delta;
      }
      if (start >= item.body.start && end <= item.body.end) {
        const offset = start - item.body.start;
        item.body.text = item.body.text.slice(0, offset) + replacement + item.body.text.slice(offset + end - start);
        item.body.end += delta;
      } else if (item.body.start >= end) {
        item.body.start += delta;
        item.body.end += delta;
      }
    }
  }
  function updateLinkRanges(path: string, start: number, end: number, replacement: string) {
    shiftLinkRanges(linkInventory, path, start, end, replacement);
  }
  function replayStoredLinks(path: string) {
    const canonical = canonicalLinkInventory.filter((item) => item.path === path);
    const current = linkInventory.filter((item) => item.path === path);
    if (canonical.length !== current.length) return;
    const replay = canonical.map((item) => ({ ...item, body: { ...item.body } }));
    const shiftTextMappings = (start: number, end: number, replacement: string) => {
      const delta = replacement.length - (end - start);
      if (!delta) return;
      for (const heading of textInventory) {
        if (heading.path !== path) continue;
        if (heading.body.start === start && heading.body.end === end) {
          heading.body.end += delta;
          heading.text = replacement;
        } else {
          shiftRange(heading.body, end, delta);
        }
        shiftRange(heading.open, end, delta);
        shiftRange(heading.close, end, delta);
      }
    };
    for (let index = 0; index < replay.length; index++) {
      const before = replay[index];
      const after = current[index];
      if (before.body.text !== after.body.text) {
        postPatch({ loc: `${path}:${before.body.start}:${before.body.end}`, text: after.body.text });
        shiftTextMappings(before.body.start, before.body.end, after.body.text);
        shiftLinkRanges(replay, path, before.body.start, before.body.end, after.body.text);
      }
      if (before.value !== after.value) {
        postPatch({ loc: `${path}:${before.start}:${before.end}`, text: after.value, attr: "href" });
        shiftTextMappings(before.start, before.end, after.value);
        shiftLinkRanges(replay, path, before.start, before.end, after.value);
      }
    }
  }
  function deferSelection(selection: PreviewSelection, selectors: string[], context: string) {
    if (context === `${loadedUrl}\n${loadedRevision}`) deferredSelection = { selection, selectors, context };
  }
  function replayDeferredSelection(context: string) {
    const deferred = deferredSelection;
    if (!deferred || deferred.context !== context) return;
    window.setTimeout(() => {
      if (deferredSelection !== deferred || deferred.context !== `${loadedUrl}\n${loadedRevision}` || !matches) return;
      deferredSelection = undefined;
      postPatch({ loc: `${deferred.selection.path}:${deferred.selection.start}:${deferred.selection.end}`, text: "", attr: "select" });
    }, 0);
  }
  function runSelection(selection: PreviewSelection, selectors: string[]) {
    const request = ++selectionRequest;
    const context = `${loadedUrl}\n${loadedRevision}`;
    showLink(undefined);
    showTextBar(undefined);
    if (!matches) {
      deferSelection(selection, selectors, context);
      say("The preview is not built from the current branch head; wait for the build before editing.");
      return;
    }
    deferredSelection = undefined;
    selecting = inputQueue.catch(() => undefined).then(() => handlers.onSelect(selection, selectors));
    inputQueue = selecting.then(
      () => {
        const currentContext = `${loadedUrl}\n${loadedRevision}`;
        if (!matches) {
          deferSelection(selection, selectors, context);
          return;
        }
        if (request !== selectionRequest || context !== currentContext) {
          return;
        }
        showLink(selection);
        showTextBar(selection);
        editing = { path: selection.path, tag: selection.tag, before: selection.text, after: selection.text };
        say(
          link
            ? `Editing ${selection.tag} in ${selection.path} · Enter to finish, Esc to revert. Use Link to change its destination.`
            : `Editing ${selection.tag} in ${selection.path} · Enter to finish, Esc to revert.`,
        );
      },
      (error: unknown) => {
        if (request === selectionRequest) say(error instanceof Error ? error.message : String(error));
      },
    );
    selecting.catch(() => undefined);
  }

  window.addEventListener("message", (event) => {
    if (!open) return;
    const origin = postOrigin();
    if (!origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (data?.source !== "astro-site-editor") return;
    // The "before" frame only ever shows the build as saved; it never edits.
    if (event.source === before.contentWindow) {
      if (event.origin !== committedPreviewOrigin()) return;
      if (data.type === "ready") before.contentWindow?.postMessage({ source: "astro-site-editor", type: "readonly" }, event.origin);
      return;
    }
    if (event.origin !== origin) return;
    if (event.source !== frame.contentWindow) return;
    const hasPath = Object.hasOwn(data, "path");
    const hasRevision = Object.hasOwn(data, "revision");
    const hasContext = hasPath || hasRevision;
    const loadedPathname = loadedUrl ? new URL(loadedUrl).pathname : "";
    const expectedPath = draftBuild ? loadedPathname : route;
    const legacyReady = data.type === "ready" && hasPath && !hasRevision &&
      !draftBuild && !Object.hasOwn(data, "headings") && data.path === route;
    if (draftBuild && (!loadedPathname.startsWith(draftPathPrefix) ||
        data.revision !== draftBuild.revision ||
        (hasPath && data.path !== expectedPath))) return;
    if (hasContext && !legacyReady &&
        (data.path !== expectedPath || data.revision !== loadedRevision || loadedRevision !== currentRevision)) return;
    const requiresContext = data.type === "position" ||
      data.type === "structural-preview-result" ||
      (data.type === "ready" && Object.hasOwn(data, "headings")) ||
      (data.type === "select" && Object.hasOwn(data, "heading"));
    if (requiresContext && !hasContext) return;
    if (data.type === "history") {
      if (!hasContext || !matches || comparing || loadedRevision !== currentRevision ||
          (data.direction !== "undo" && data.direction !== "redo")) return;
      const direction = data.direction;
      inputQueue = inputQueue.then(() => handlers.onHistory?.(direction)).catch((error: unknown) =>
        say(error instanceof Error ? error.message : String(error)));
      return;
    }
    if (data.type === "ready") {
      needsReady = false;
      if (draftBuild && loadedRevision === draftBuild.revision) {
        if (pendingDraftLoadToken !== draftLoadToken) return;
        draftState = "ready";
        pendingDraftLoadToken = 0;
        matches = true;
        say(`Draft preview ready ${draftBuild.revision.slice(0, 7)}.`);
        handlers.onStatus?.({ kind: "ready" });
      } else if (!draftBuild && matches) {
        // Branch preview: ready only once its iframe has handshaken.
        handlers.onStatus?.({ kind: "ready" });
      }
      syncOverlayTheme();
      const readyMessageContext = `${loadedUrl}\n${loadedRevision}`;
      if (pendingStructural.size) {
        if (readyContext === readyMessageContext) return;
        const paths = cancelAllPendingStructural();
        for (const path of paths) handlers.onStructuralFallback?.(path);
        return;
      }
      readyContext = readyMessageContext;
      if (projectedBaselineByPath.size && data.type === "ready" && Object.hasOwn(data, "headings")) {
        const paths = [...projectedBaselineByPath];
        projectedBaselineByPath.clear();
        blockStructural(paths);
        for (const path of paths) handlers.onStructuralFallback?.(path);
        return;
      }
      canonicalLinkInventory = parseLinkInventory(data.links);
      const readyPaths = new Set(canonicalLinkInventory.map((item) => item.path));
      for (const path of readyPaths) rebuildLinkInventory(path);
      textInventory = parseTextInventory(data.headings);
      for (const patch of patches) postPatch(patch);
      if (!patches.length) for (const path of readyPaths) replayStoredLinks(path);
      for (const patch of classStylePatches.values()) postPatch(patch);
      for (const path of new Set([...textInventory.map((heading) => heading.path), ...readyPaths])) reconcileText(path);
      replayDeferredSelection(readyMessageContext);
      return;
    }
    if (data.type === "structural-preview-result" && typeof data.id === "string") {
      const pending = pendingStructural.get(data.id);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingStructural.delete(data.id);
      if (pending.context !== `${loadedUrl}\n${loadedRevision}`) return;
      if (pending.generation !== structuralGeneration || latestSourceByPath.get(pending.path) !== pending.source) return;
      if (draftState !== "off" && draftState !== "ready") return;
      if (data.ok === true) {
        blockedStructuralPaths.delete(pending.path);
        matches = true;
        sourceByPath.set(pending.path, pending.source);
        originalByPath.set(pending.path, pending.source);
        projectedBaselineByPath.add(pending.path);
        textInventory = parseTextInventory(data.headings);
        canonicalLinkInventory = parseLinkInventory(data.links);
        linkInventory = [];
        unmappedLinkPaths.delete(pending.path);
        for (const path of new Set(canonicalLinkInventory.map((item) => item.path))) rebuildLinkInventory(path);
        postStructuralCommit(data.id);
        if (pending.focus) postPatch({ loc: pending.focus, text: "", attr: "select" });
        else showTextBar(undefined);
        say("Preview updated from your draft. Publish to save it to GitHub.");
      } else {
        blockStructural([pending.path]);
        handlers.onStructuralFallback?.(pending.path);
      }
      return;
    }
    if (data.type === "position") {
      const selected = selectedText;
      const rect = data.rect as Record<string, unknown> | undefined;
      if (!selected || String(data.loc ?? "") !== `${selected.path}:${selected.start}:${selected.end}` ||
          !rect || ![rect.left, rect.top, rect.right, rect.bottom].every((part) => typeof part === "number")) return;
      selected.rect = rect as PreviewSelection["rect"];
      positionEditBar();
      return;
    }
    if (data.type === "reject") {
      selectionRequest++;
      showLink(undefined);
      showTextBar(undefined);
      const reason = String(data.reason);
      say(
        reason === "expression"
          ? `This ${String(data.tag)} text comes from an expression, not literal source; it cannot be edited here.`
          : reason === "mixed"
            ? `This ${String(data.tag)} mixes text with other markup; select a simpler element.`
            : reason === "unverified"
              ? `This text could not be matched safely to its source. Edit it in the code pane.`
              : `This ${String(data.tag)} is not mapped to a literal in your source.`,
      );
      return;
    }
    if (data.type === "commit") {
      const at = String(data.loc ?? "").match(/^(.+):\d+:\d+$/);
      if (at) handlers.onCommit(at[1]);
      if (editing && editing.before !== editing.after) changes.push({ ...editing, at: Date.now() });
      editing = undefined;
      if (patches.length) say("Preview updated from your draft. Publish to save it to GitHub.");
      return;
    }
    if (data.type === "text-size-state") {
      const selected = selectedText;
      if (selected?.textElement?.size && data.loc === `${selected.path}:${selected.start}:${selected.end}` && typeof data.css === "string")
        restoreTextSize(selected.textElement.size, data.css);
      return;
    }
    if (data.type === "format-state") {
      const selected = selectedText;
      const at = parseLoc(data.loc);
      if (!selected || !at || at.path !== selected.path || at.start !== selected.start) return;
      bold.setAttribute("aria-pressed", String(data.bold === true));
      italic.setAttribute("aria-pressed", String(data.italic === true));
      return;
    }
    const selection = parseSelection(data);
    if (!selection) return;
    if (data.type === "select") {
      const selectors = Array.isArray(data.selectors)
        ? (data.selectors as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 20)
        : [];
      runSelection(selection, selectors);
      return;
    }
    if (data.type === "input" && typeof data.text === "string") {
      if (!matches || comparing || loadedRevision !== currentRevision) return;
      const text = data.text;
      const loc = `${selection.path}:${selection.start}:${selection.end}`;
      const context = `${loadedUrl}\n${loadedRevision}`;
      inputQueue = inputQueue
        .then(() => {
          if (!matches || comparing || loadedRevision !== currentRevision || context !== `${loadedUrl}\n${loadedRevision}`)
            throw new Error("The preview changed. Select the text again.");
          return applyVisualInput(selection, text, data.format !== true);
        })
        .then(() => {
          if (data.format === true && typeof data.editId === "string")
            postPatch({ loc: `${selection.path}:${selection.start}:${selection.start + text.length}`, text: "",
              attr: "format-ack", editId: data.editId });
          patches.push({ loc, text });
          patchedRevision = currentRevision;
          updateTextRanges(selection, text);
          if (editing && editing.path === selection.path) editing.after = text;
        })
        .catch((error: unknown) => {
          if (data.format === true && typeof data.editId === "string")
            postPatch({ loc: `${selection.path}:${selection.start}:${selection.start + text.length}`, text: selection.text,
              attr: "format-revert", editId: data.editId });
          const current = selectedText;
          if (data.format === true && current?.path === selection.path && current.start === selection.start) {
            postPatch({ loc: `${selection.path}:${selection.start}:${selection.start + selection.text.length}`,
              text: "", attr: "invalidate" });
            showTextBar(undefined);
          }
          say(error instanceof Error ? error.message : String(error));
        });
    }
  });

  let open = false;
  let state: PreviewState = {};
  let route = "/";
  // `loadedUrl` identifies the route currently shown; `loadedRevision` is the
  // build revision it was loaded from. A new build served at the same route
  // (e.g. right after Publish) changes only the revision, so both must be
  // tracked to decide whether the iframe needs to reload. `loadedSrc` is the
  // actual src assigned (cache-busted with the revision) for the before frame.
  let loadedUrl = "";
  let loadedRevision = "";
  let loadedSrc = "";
  let readyContext = "";
  function invalidateLoadedPreview() {
    loadedUrl = "";
    loadedRevision = "";
    loadedSrc = "";
    readyContext = "";
  }
  watchEditorTheme(({ colors }) => {
    overlayFocus = colors["preview-focus"];
    syncOverlayTheme();
  });

  let currentRevision = "";
  let needsReady = false;
  let timer: number | undefined;
  let checking = 0;

  function setOpen(value: boolean) {
    open = value;
    host.classList.toggle("has-preview", open);
    if (open) {
      host.prepend(pane);
      void render();
    } else {
      pane.remove();
      stopPolling();
      handlers.onStatus?.({ kind: "hidden" });
    }
  }

  function stopPolling() {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }
  function clearDraftBuild() {
    draftBuild = undefined;
    draftOrigin = "";
    draftPathPrefix = "";
    draftState = "off";
    pendingDraftLoadToken = 0;
  }

  function show(url: string, revision: string, force = false) {
    if (!force && loadedUrl === url && loadedRevision === revision && !(needsReady && matches)) return;
    loadedUrl = url;
    loadedRevision = revision;
    loadedSrc = revision ? `${url}${url.includes("?") ? "&" : "?"}astro-editor-rev=${encodeURIComponent(revision)}` : url;
    frame.src = loadedSrc;
    if (comparing) before.src = beforePreviewSrc() ?? loadedSrc;
  }
  function beforePreviewSrc() {
    if (!draftBuild || !state.config || !state.branch || !state.commit) return undefined;
    const url = previewOrigin(state.config, state.branch) + route;
    return `${url}${url.includes("?") ? "&" : "?"}astro-editor-rev=${encodeURIComponent(state.commit)}`;
  }
  function loadDraft(build: DraftBuildSuccess) {
    stopPolling();
    checking++;
    const nextUrl = draftPageUrl(build.previewUrl, route);
    clearTextContext({ preserveDeferredSelection: deferredSelection?.context === `${nextUrl}\n${build.revision}` });
    resetSourceBaselines(build);
    patches = [];
    classStylePatches.clear();
    patchedRevision = "";
    changes.length = 0;
    draftBuild = build;
    draftLoadToken++;
    pendingDraftLoadToken = draftLoadToken;
    const url = new URL(build.previewUrl);
    draftOrigin = url.origin;
    draftPathPrefix = url.pathname;
    draftState = "pending";
    matches = false;
    currentRevision = build.revision;
    needsReady = true;
    say(`Loading draft preview ${build.revision.slice(0, 7)}…`);
    handlers.onStatus?.({ kind: "loading" });
    show(nextUrl, build.revision, true);
  }
  function setCompare(on: boolean) {
    if (comparing === on) return;
    comparing = on;
    pane.classList.toggle("preview-pane--compare", on);
    if (on) {
      frameHost.prepend(beforeSlot);
      const beforeSrc = beforePreviewSrc() ?? loadedSrc;
      if (beforeSrc) before.src = beforeSrc;
    } else {
      beforeSlot.remove();
      before.removeAttribute("src");
    }
  }

  async function render() {
    stopPolling();
    if (draftBuild) return;
    const { config, branch, commit } = state;
    if (!config || !branch) {
      // While a branch reloads the last preview stays; only a repository
      // without preview support clears it.
      summary.textContent = config
        ? "Loading the branch…"
        : "No preview configured. Add .astro-editor/preview.json and the editor workflow to this repository.";
      handlers.onStatus?.({ kind: config ? "loading" : "hidden" });
      if (!config) {
        frame.removeAttribute("src");
        before.removeAttribute("src");
        invalidateLoadedPreview();
      }
      return;
    }
    const origin = previewOrigin(config, branch);
    const attempt = ++checking;
    summary.textContent = `Checking preview for ${branch}…`;
    handlers.onStatus?.({ kind: "loading" });
    let revision: Revision | undefined;
    let failure = "";
    try {
      const response = await fetch(origin + config.revisionPath, {
        cache: "no-store",
        credentials: "omit",
      });
      if (response.status === 404) failure = "not-built";
      else if (!response.ok) failure = `HTTP ${response.status}`;
      else revision = (await response.json()) as Revision;
    } catch {
      failure = "unreachable";
    }
    if (attempt !== checking || !open || draftBuild || draftState !== "off") return;
    const structuralLocked = pendingStructural.size > 0 || blockedStructuralPaths.size > 0;
    matches = !structuralLocked && Boolean(revision && commit && revision.sha === commit);
    if (!matches) {
      showLink(undefined);
      showTextBar(undefined);
    }
    if (revision && revision.sha !== currentRevision) {
      currentRevision = revision.sha;
      if (patchedRevision && patchedRevision !== currentRevision) {
        patches = [];
        classStylePatches.clear();
        patchedRevision = "";
        changes.length = 0;
      }
    }
    if (revision) {
      const built = new Date(revision.builtAt).toLocaleTimeString();
      if (commit && revision.sha === commit) {
        summary.textContent = `Preview shows ${commit.slice(0, 7)} · built ${built} · same as ${branch}.`;
        const nextUrl = origin + route;
        // Ready is confirmed by the iframe "ready" handshake. If this render is
        // only a same-url/same-revision re-check after that handshake, keep the
        // visible status ready because show() will not load a new iframe.
        handlers.onStatus?.({ kind: loadedUrl === nextUrl && loadedRevision === revision.sha && !needsReady ? "ready" : "loading" });
        show(nextUrl, revision.sha);
      } else {
        summary.textContent = `Preview shows ${revision.sha.slice(0, 7)} built ${built}; ${branch} is at ${commit?.slice(0, 7) ?? "?"}. Waiting for the new build…`;
        handlers.onStatus?.({ kind: "building" });
        show(origin + route, revision.sha);
        timer = window.setTimeout(() => void render(), 10_000);
      }
    } else if (failure === "not-built") {
      say(`No preview built yet for ${branch}. Waiting for GitHub Actions…`);
      handlers.onStatus?.({ kind: "building" });
      frame.removeAttribute("src");
      before.removeAttribute("src");
      invalidateLoadedPreview();
      timer = window.setTimeout(() => void render(), 10_000);
    } else {
      say(`Preview for ${branch} is ${failure === "unreachable" ? "unreachable" : `unavailable (${failure})`}. Retrying…`);
      // The branch preview retries itself on a timer, so no manual Retry.
      handlers.onStatus?.({ kind: "failed", message: `Preview for ${branch} is ${failure === "unreachable" ? "unreachable" : `unavailable (${failure})`}.`, retry: false });
      timer = window.setTimeout(() => void render(), 15_000);
    }
  }

  return {
    update(next: PreviewState) {
      const changedTarget =
        next.config !== state.config ||
        next.branch !== state.branch ||
        next.commit !== state.commit;
      if (changedTarget) {
        clearDraftBuild();
        classStylePatches.clear();
        showLink(undefined);
        clearTextContext();
        committedOriginalByPath.clear();
        matches = false;
        needsReady = true;
        setCompare(false);
      }
      state = next;
      const nextRoute = pageRoute(next.path);
      const changedRoute = nextRoute !== undefined && nextRoute !== route;
      if (nextRoute !== undefined) route = nextRoute;
      if (!open) return;
      if (changedTarget) void render();
      else if (changedRoute) {
        clearTextContext();
        if (draftBuild) {
          resetSourceBaselines(draftBuild);
          show(draftPageUrl(draftBuild.previewUrl, route), draftBuild.revision);
        }
        else if (state.config && state.branch) {
          const origin = previewOrigin(state.config, state.branch);
          if (loadedUrl) show(origin + route, currentRevision);
        }
      }
    },
    close() {
      if (open) setOpen(false);
    },
    changes: () => changes.slice(),
    // Old and new page side by side; the old page is the build without the draft's changes.
    compare: (on: boolean) => setCompare(on),
    comparing: () => comparing,
    syncClassStyles(path: string, values: { selector: string; value: string }[]) {
      if (draftState !== "off" && draftState !== "ready") return;
      const patch = { loc: path, attr: "class-styles", text: JSON.stringify(values) };
      classStylePatches.set(path, patch);
      postPatch(patch);
    },
    // A live class-style patch only reaches the preview when the draft build is
    // idle (no adopted draft) or ready. In pending/building/error states the
    // patch is dropped, so a class font-size edit must fall back to a rebuild
    // (which also recovers an error) rather than be treated as already covered.
    livePatchReady: () => draftState === "off" || draftState === "ready",
    syncSource(path: string, source: string, edits?: { start: number; end: number; text: string }[], original?: string): boolean | "pending" {
      latestSourceByPath.set(path, source);
      if (original !== undefined) {
        committedOriginalByPath.set(path, original);
        if (!projectedBaselineByPath.has(path) && (!draftBuild || !Object.hasOwn(draftBuild.sources, path))) originalByPath.set(path, original);
        if (sourceByPath.get(path) === undefined && (!draftBuild || !Object.hasOwn(draftBuild.sources, path)))
          sourceByPath.set(path, original);
      }
      if (draftState !== "off" && draftState !== "ready") return false;
      const previous = sourceByPath.get(path);
      // Mounting a saved draft is a replay from the original preview, not one
      // large code edit spanning every changed label and attribute.
      if (original !== undefined && edits === undefined && previous === original && source !== original &&
          !selectedText && !patches.length) {
        sourceByPath.set(path, source);
        rebuildLinkInventory(path);
        replayStoredLinks(path);
        reconcileText(path);
        return false;
      }
      const pendingForPath = [...pendingStructural.values()].find((pending) => pending.path === path);
      if (pendingForPath?.source === source) return "pending";
      if (pendingStructural.size && (previous !== source || Boolean(pendingForPath))) {
        const paths = cancelAllPendingStructural();
        for (const pendingPath of paths) handlers.onStructuralFallback?.(pendingPath);
        return false;
      }
      // Decide, from the exact diff alone and before any range is mutated, whether
      // this edit is already fully represented live by patches: every changed
      // region lies inside one verified mapped text body and the resulting body is
      // legal rich markup. The draft-preview controller uses this to skip an
      // unnecessary full rebuild while preserving the toolbar, selection, and
      // focus. Size, link/href, Astro-expression, component, or malformed edits —
      // anything reconcileText would invalidate or shift outside a body — stay
      // uncovered and rebuild.
      let covered = previous !== undefined && previous !== source &&
        coversMappedTextBody(
          path,
          previous,
          source,
          edits && edits.length > 1 && !preparedSourceChange ? edits : [exactDiff(previous, source)],
          textInventory,
          linkInventory,
          matches && !comparing && loadedRevision === currentRevision,
        );
      const applyMappedButtonStyleEdit = (selected: PreviewSelection | undefined, start: number, end: number, replacement: string) => {
        const buttonStyle = selected?.textElement?.buttonStyle;
        if (!matches || comparing || loadedRevision !== currentRevision || !selected || selected.path !== path || !buttonStyle ||
            start < buttonStyle.classValue.start || end > buttonStyle.classValue.end) return false;
        const oldValue = sourceByPath.get(path)?.slice(buttonStyle.classValue.start, buttonStyle.classValue.end) ?? "";
        if (oldValue.length !== buttonStyle.classValue.end - buttonStyle.classValue.start) return false;
        const offset = start - buttonStyle.classValue.start;
        const value = oldValue.slice(0, offset) + replacement + oldValue.slice(offset + end - start);
        const nextValue = buttonStyleValueFromClasses(buttonStyle, value);
        if (!nextValue) {
          postPatch({ loc: `${path}:${selected.start}:${selected.end}`, text: "", attr: "invalidate" });
          showTextBar(undefined);
          return false;
        }
        const patch = {
          loc: `${path}:${buttonStyle.classAttr.start}:${buttonStyle.classAttr.end}`,
          closeLoc: `${path}:${buttonStyle.classValue.start}:${buttonStyle.classValue.end}`,
          text: value,
          attr: "button-style",
          sourceStart: start,
          sourceEnd: end,
          sourceText: replacement,
        };
        prepareButtonSourceChange(selected, start, end, replacement);
        buttonStyle.value = nextValue;
        buttonStyleSelect.value = nextValue;
        patches.push(patch);
        patchedRevision = currentRevision;
        postPatch(patch);
        return true;
      };
      if (previous !== undefined && previous !== source && edits && edits.length > 1 && !preparedSourceChange) {
        const actualEdits = edits.filter((edit) => previous.slice(edit.start, edit.end) !== edit.text);
        if (actualEdits.length === 1 && applyMappedButtonStyleEdit(selectedText, actualEdits[0].start, actualEdits[0].end, actualEdits[0].text)) {
          sourceByPath.set(path, source);
          rebuildLinkInventory(path);
          reconcileText(path);
          return true;
        }
        // Monaco supplies exact old-source ranges for atomic multi-part edits,
        // including Undo. Moving each range separately preserves later items.
        for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
          if (textInventory.some(item => item.path === path && edit.start >= item.body.start && edit.end <= item.body.end)) continue;
          const mappedLink = linkInventory.find((item) => item.path === path && edit.start >= item.start && edit.end <= item.end);
          const mappedLabel = linkInventory.find((item) => item.path === path && edit.start >= item.body.start && edit.end <= item.body.end);
          if (mappedLink) {
            const offset = edit.start - mappedLink.start;
            const value = mappedLink.value.slice(0, offset) + edit.text + mappedLink.value.slice(offset + edit.end - edit.start);
            const patch = { loc: `${path}:${mappedLink.start}:${mappedLink.end}`, text: value, attr: "href" };
            postPatch(patch);
            patches.push(patch);
          }
          if (mappedLabel) {
            const offset = edit.start - mappedLabel.body.start;
            const text = mappedLabel.body.text.slice(0, offset) + edit.text + mappedLabel.body.text.slice(offset + edit.end - edit.start);
            const patch = { loc: `${path}:${mappedLabel.body.start}:${mappedLabel.body.end}`, text };
            postPatch(patch);
            patches.push(patch);
          }
          const delta = edit.text.length - (edit.end - edit.start);
          for (const item of textInventory) if (item.path === path)
            for (const range of [item.body, item.open, item.close]) shiftRange(range, edit.end, delta);
          updateLinkRanges(path, edit.start, edit.end, edit.text);
          if (selectedText?.path === path) shiftSelectionRanges(selectedText, edit.end, delta);
          if (!mappedLink && !mappedLabel)
            postPatch({ loc: `${path}:0:0`, text: "", attr: "source-shift", sourceStart: edit.start, sourceEnd: edit.end, sourceText: edit.text });
        }
        sourceByPath.set(path, source);
        rebuildLinkInventory(path);
        reconcileText(path);
        return covered;
      }
      if (previous !== undefined && previous !== source) {
        const structuralEnabled = import.meta.env.VITE_BROWSER_STRUCTURAL_PREVIEW === "1";
        const structuralTransaction = structuralEnabled ? planStructuralTransaction(path, previous, source) : undefined;
        if (!preparedSourceChange && structuralEnabled &&
            matches && !comparing && loadedRevision === currentRevision) {
          const transaction = structuralTransaction;
          if (transaction) {
            blockStructural([path]);
            const id = String(++structuralSerial);
            const generation = ++structuralGeneration;
            const timer = window.setTimeout(() => {
              const pending = pendingStructural.get(id);
              if (!pending || pending.generation !== generation) return;
              pendingStructural.delete(id);
              blockStructural([path]);
              handlers.onStructuralFallback?.(path);
            }, 1000);
            const focus = undefined;
            pendingStructural.set(id, { path, source, timer, context: `${loadedUrl}\n${loadedRevision}`, generation, focus });
            if (postStructural(id, transaction)) return "pending";
            window.clearTimeout(timer);
            pendingStructural.delete(id);
            blockedStructuralPaths.delete(path);
          }
        }
        let start = 0;
        while (start < previous.length && start < source.length && previous[start] === source[start]) start++;
        let oldEnd = previous.length;
        let newEnd = source.length;
        while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === source[newEnd - 1]) { oldEnd--; newEnd--; }
        const replacement = source.slice(start, newEnd);
        const prepared = preparedSourceChange;
        // Monaco's trimAutoWhitespace can delete the auto-indented whitespace of a
        // trailing blank line as a *second* edit alongside the single live change
        // we prepared (only observed for a button-style class swap). That leaves
        // the exact-source-equality check below false. Recognise strictly that
        // narrow shape and nothing else: the prepared edit must appear verbatim in
        // `edits`, and the only other edit deletes end-of-file spaces/tabs that sit
        // entirely after the prepared edit. Because that deletion is past every
        // mapped range (all literals close before the final blank line), it shifts
        // no inventory or selection offset, so no range fix-up is needed here — the
        // updated `source` is stored below and reconciled as usual. Any other extra
        // edit (visible text, mid-file whitespace, non-EOF) fails this and rebuilds.
        const trailingTrim = prepared?.buttonStyle && prepared.path === path && edits && edits.length === 2
          ? (() => {
              const preparedEdit = edits.find((edit) =>
                edit.start === prepared.start && edit.end === prepared.end && edit.text === prepared.replacement);
              const trim = edits.find((edit) => edit !== preparedEdit);
              return preparedEdit && trim && trim.text === "" && trim.end === previous.length &&
                trim.start >= prepared.end && /^[ \t]+$/.test(previous.slice(trim.start, trim.end)) &&
                previous.slice(0, prepared.start) + prepared.replacement + previous.slice(prepared.end, trim.start) === source
                ? trim : undefined;
            })()
          : undefined;
        if (prepared?.path === path &&
            (previous.slice(0, prepared.start) + prepared.replacement + previous.slice(prepared.end) === source ||
             Boolean(trailingTrim))) {
          if ((prepared.buttonStyle || prepared.href) && matches && !comparing && loadedRevision === currentRevision)
            covered = true;
          preparedSourceChange = undefined;
          if (prepared.href) {
            // The href patch shifts iframe mappings. Move the parent inventory
            // before reconciliation without sending a second iframe shift.
            const delta = prepared.replacement.length - (prepared.end - prepared.start);
            for (const heading of textInventory) {
              if (heading.path === path)
                for (const range of [heading.body, heading.open, heading.close]) shiftRange(range, prepared.end, delta);
            }
            const selected = selectedText;
            if (selected?.path === path) shiftSelectionRanges(selected, prepared.end, delta);
            updateLinkRanges(path, prepared.start, prepared.end, prepared.replacement);
          }
        } else {
          const selected = selectedText;
          const size = selected?.textElement?.size;
          const buttonStyle = selected?.textElement?.buttonStyle;
          const inMappedStyle = selected?.path === path && size &&
            ((size.style && start >= size.style.start && oldEnd <= size.style.end) ||
             (size.insert && start === size.insert.start && oldEnd === size.insert.end));
          const inMappedButtonStyle = selected?.path === path && buttonStyle &&
            start >= buttonStyle.classValue.start && oldEnd <= buttonStyle.classValue.end;
          if (selected && inMappedStyle) {
            prepareTextSourceChange(selected, start, oldEnd, replacement);
            let css = "";
            if (size?.styleValue) {
              const value = source.slice(size.styleValue.start, size.styleValue.end);
              css = value.match(/(?:^|;)\s*font-size\s*:\s*([^;]+?)\s*(?:;|$)/i)?.[1] ?? "";
            }
            if (size) restoreTextSize(size, css);
            postPatch({ loc: `${path}:${selected.start}:${selected.end}`, closeLoc: `${path}:${selected.textElement!.open.start}:${selected.textElement!.open.end}`,
              text: css, attr: "heading-size-only", sourceStart: start, sourceEnd: oldEnd, sourceText: replacement });
          } else if (selected && buttonStyle && inMappedButtonStyle) {
            covered = applyMappedButtonStyleEdit(selected, start, oldEnd, replacement);
            if (!covered) return false;
          } else if (!textInventory.some((heading) => heading.path === path &&
              start >= heading.body.start && oldEnd <= heading.body.end)) {
            // Body reconciliation owns these offsets, including rollback of a
            // pending formatting edit. Only shift unrelated source edits here.
            const delta = replacement.length - (oldEnd - start);
            const mappedLink = linkInventory.find((item) => item.path === path && start >= item.start && oldEnd <= item.end);
            const mappedLabel = linkInventory.find((item) => item.path === path && start >= item.body.start && oldEnd <= item.body.end);
            if (delta) {
              for (const heading of textInventory) {
                if (heading.path !== path) continue;
                for (const range of [heading.body, heading.open, heading.close]) shiftRange(range, oldEnd, delta);
              }
              if (selected?.path === path) {
                shiftRange(selected, oldEnd, delta);
                if (selected.textElement) {
                  const size = selected.textElement.size;
                  const overlapsSize = size && [size.style, size.styleValue, size.insert].some((range) =>
                    range && range.start < oldEnd && range.end > start);
                  if (overlapsSize) {
                    postPatch({ loc: `${path}:${selected.start}:${selected.end}`, text: "", attr: "invalidate" });
                    showTextBar(undefined);
                  } else shiftTextElementRanges(selected.textElement, oldEnd, delta);
                }
              }
              if (!mappedLink && !mappedLabel) postPatch({ loc: `${path}:0:0`, text: "", attr: "source-shift",
                sourceStart: start, sourceEnd: oldEnd, sourceText: replacement });
            }
            if (mappedLink) {
              const offset = start - mappedLink.start;
              const value = mappedLink.value.slice(0, offset) + replacement + mappedLink.value.slice(offset + oldEnd - start);
              postPatch({ loc: `${path}:${mappedLink.start}:${mappedLink.end}`, text: value, attr: "href" });
              patches.push({ loc: `${path}:${mappedLink.start}:${mappedLink.end}`, text: value, attr: "href" });
            }
            if (mappedLabel) {
              const offset = start - mappedLabel.body.start;
              const text = mappedLabel.body.text.slice(0, offset) + replacement + mappedLabel.body.text.slice(offset + oldEnd - start);
              const patch = { loc: `${path}:${mappedLabel.body.start}:${mappedLabel.body.end}`, text };
              postPatch(patch);
              patches.push(patch);
            }
            updateLinkRanges(path, start, oldEnd, replacement);
          }
        }
      }
      const recoverLinks = !patches.length && canonicalLinkInventory.some((item) => item.path === path) &&
        !linkInventory.some((item) => item.path === path);
      sourceByPath.set(path, source);
      rebuildLinkInventory(path);
      if (recoverLinks) replayStoredLinks(path);
      reconcileText(path);
      return covered;
    },
    // The preview opens as soon as a repository offers one.
    openByDefault() {
      if (!open) setOpen(true);
    },
    draftPending(force = false) {
      if (!open) return;
      if (!force && (preparedSourceChange || visualPendingDeferral !== undefined)) {
        say("Building draft preview…");
        return;
      }
      draftState = "pending";
      pendingDraftLoadToken = 0;
      matches = false;
      selectionRequest++;
      showLink(undefined);
      showTextBar(undefined);
      postReadonly();
      say("Building draft preview…");
      handlers.onStatus?.({ kind: force ? "building" : "waiting" });
    },
    draftError(message: string) {
      if (!open) return;
      // A draft build failure is recoverable by re-running the build.
      handlers.onStatus?.({ kind: "failed", message, retry: true });
      draftState = "error";
      pendingDraftLoadToken = 0;
      matches = false;
      selectionRequest++;
      showLink(undefined);
      showTextBar(undefined);
      postReadonly();
      say(message);
    },
    adoptDraftBuild(build: DraftBuildSuccess) {
      if (!open) setOpen(true);
      loadDraft(build);
    },
  };
}
