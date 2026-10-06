/**
 * Turns a hand-written grid of ordinary HTML cards (for example
 * `.cards > article.card-project`, with nested `<p class="actions"><a href>`)
 * into a page collection whose recipe lives only in the editor's page data
 * file. The site keeps plain, finished HTML: no template, no data attributes,
 * no script.
 *
 * Each card is read as a fixed element tree whose plain-text leaves, one page
 * link and at most one image are its parts. Every card must have the same
 * tree, start tags and other text; only the mapped parts may differ. A part
 * the linked page does not give (its title, description, image) is kept as a
 * per-card override in the recipe. The plan is proved by baking the recipe
 * with the editor's own bake and comparing every current card byte for byte;
 * anything that cannot be kept exactly is refused with a readable reason.
 */
import { startTagAttribute } from "../../shared/html-source";
import { attributeEdit, descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";
import { applyCollectionEdits, safeCollectionUrl } from "./collection-bake";
import { collectionFieldName, readPageFields, type CollectionIdentity, type PageFields } from "./collection-fields";
import { collectionSpec, MAX_COLLECTION_ITEMS, validCollectionRoute } from "./collection-model";
import { planSidecarRecipe, type CollectionRecipe } from "./collection-origins";
import { planDocumentBake } from "./document-collections";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { decodeHtmlEntities } from "./html-entities";

type Role = "title" | "description" | "link" | "image" | "custom";
interface StaticPart {
  role: Role;
  /** Readable part name, unique within the card ("title", "card-note", …). */
  name: string;
  element: SourceElement;
  /** Decoded text (link label for a link; empty for an image). */
  text: string;
  href?: string;
  src?: string;
  alt?: string;
}
interface StaticCard { element: SourceElement; parts: StaticPart[]; shape: string; href: string }
export interface StaticCardGrid { element: SourceElement; cards: StaticCard[] }
export type StaticCardGridResult = StaticCardGrid | { error: string };

const SPACE = /^[\t\n\f\r ]*$/;
const RECIPE_ATTRIBUTES = /^(?:data-each|data-if|data-sort|data-filter|data-limit|data-fields|data-collection-id|slot)$/;
const UNSUPPORTED = new Set(["script", "style", "template", "slot", "iframe", "object", "embed", "noscript", "textarea", "svg", "math", "picture", "source", "video", "audio", "form", "input", "button", "select", "option"]);
const fail = (error: string): { error: string } => ({ error });
const elementsOf = (element: SourceElement) => element.children.filter((child): child is SourceElement => child.type === "element");
const textOf = (source: string, element: SourceElement) => source.slice(element.tag.end, element.close?.start ?? element.tag.end);
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z]+|-+$/g, "");

/** Two or more sibling cards of one tag and one start tag, with only whitespace between them. Detection only. */
export function isStaticCardGrid(source: string, element: SourceElement): boolean {
  if (!element.close || element.name.includes("-") || startTagAttribute(source, element.tag, "data-each")) return false;
  const kids = elementsOf(element);
  if (kids.length < 2) return false;
  const open = (kid: SourceElement) => source.slice(kid.start, kid.tag.end);
  return !kids[0].name.includes("-") && kids.every((kid) => kid.name === kids[0].name && open(kid) === open(kids[0]));
}

/**
 * One card: its parts, and its shape (the card's bytes with every part value
 * blanked) which must be the same for every card of the grid.
 */
function readStaticCard(source: string, card: SourceElement): StaticCard | { error: string } {
  if (!card.close) return fail("A card is not closed in the page source.");
  const body = source.slice(card.start, card.end);
  if (body.includes("<!--")) return fail("A card has a comment, which a collection cannot keep.");
  if (/[{}]/.test(body)) return fail("A card has braces in it, which a collection would read as fields.");
  const parts: StaticPart[] = [];
  const blanks: { start: number; end: number; text: string }[] = [];
  const links: StaticPart[] = [];
  for (const element of [card, ...descendants(card.children)]) {
    if (UNSUPPORTED.has(element.name) || element.name.includes("-")) return fail(`A card has a <${element.name}>, which a collection cannot keep.`);
    const attrs = startTagAttributes(source, element.tag);
    if (attrs.some((attr) => RECIPE_ATTRIBUTES.test(attr.name) || /^on/.test(attr.name))) return fail("A card has editor or script attributes, which a collection cannot keep.");
    if (new Set(attrs.map((attr) => attr.name)).size !== attrs.length) return fail("A card repeats an attribute, which a collection cannot keep.");
    if (element === card) continue;
    const kids = elementsOf(element);
    const text = element.children.filter((child) => child.type === "text").map((child) => source.slice(child.start, child.end)).join("");
    if (kids.length && !SPACE.test(text)) return fail(`A card's <${element.name}> mixes text with other markup. Only plain text parts can be kept.`);
    const value = (name: string) => {
      const found = startTagAttribute(source, element.tag, name);
      return found ? { raw: found, text: decodeHtmlEntities(found.value ?? "", true) } : undefined;
    };
    if (element.name === "img") {
      const src = value("src"), alt = value("alt");
      if (!src || !src.text || !safeCollectionUrl(src.text)) return fail("A card image needs a safe src.");
      if (parts.some((part) => part.role === "image")) return fail("A card has more than one image. Only one image per card can be kept.");
      for (const [name, attr] of [["src", src], ["alt", alt]] as const) if (attr) blanks.push({ start: attr.raw.start, end: attr.raw.end, text: ` ${name}=\u0000` });
      parts.push({ role: "image", name: "image", element, text: "", src: src.text, alt: alt?.text });
      continue;
    }
    if (element.name === "a" && value("href")) {
      if (kids.length) return fail("A card's link has markup inside it. Only a plain text link can be kept.");
      const href = value("href")!;
      blanks.push({ start: href.raw.start, end: href.raw.end, text: " href=\u0000" });
      const part: StaticPart = { role: "link", name: "link", element, text: decodeHtmlEntities(textOf(source, element)), href: href.text };
      links.push(part);
      parts.push(part);
      if (element.close) blanks.push({ start: element.tag.end, end: element.close.start, text: "\u0000" });
      continue;
    }
    if (kids.length || !element.close || SPACE.test(textOf(source, element))) continue;
    if (/[<>]/.test(textOf(source, element))) return fail("A card part has markup in its text. Only plain text parts can be kept.");
    const classes = (value("class")?.text ?? "").split(/[\t\n\f\r ]+/).filter(Boolean);
    const role: Role = /^h[1-6]$/.test(element.name) && !parts.some((part) => part.role === "title") ? "title"
      : element.name === "p" && classes.some((name) => ["body", "description", "summary", "excerpt"].includes(name)) && !parts.some((part) => part.role === "description") ? "description"
      : "custom";
    let name = role === "custom" ? slug(classes[0] ?? "") || element.name : role;
    for (let n = 2; parts.some((part) => part.name === name); n++) name = `${slug(classes[0] ?? "") || element.name}-${n}`;
    parts.push({ role, name, element, text: decodeHtmlEntities(textOf(source, element)) });
    blanks.push({ start: element.tag.end, end: element.close.start, text: "\u0000" });
  }
  if (links.length !== 1) return fail("Each card needs exactly one link to its page.");
  if (parts.some((part) => part.role !== "image" && !part.text.trim())) return fail("A card has an empty part. Fill it or remove it first.");
  const shape = applyCollectionEdits(source, blanks).slice(card.start, card.end - blanks.reduce((sum, edit) => sum + (edit.end - edit.start) - edit.text.length, 0));
  return { element: card, parts, shape, href: links[0].href! };
}

/** Reads every card of the grid starting at `start`, refusing what a collection cannot keep exactly. */
export function readStaticCardGrid(source: string, start: number): StaticCardGridResult {
  const element = [...descendants(parseSource(source))].find((item) => item.start === start);
  if (!element || !isStaticCardGrid(source, element)) return fail("Select a grid of two or more matching cards to choose its pages.");
  for (let parent = element.parent; parent; parent = parent.parent)
    if (startTagAttribute(source, parent.tag, "data-each") || parent.name === "template") return fail("This grid is inside another collection.");
  const cards: StaticCard[] = [];
  let cursor = element.tag.end;
  for (const child of element.children) {
    if (child.type === "text") continue;
    if (!SPACE.test(source.slice(cursor, child.start))) return fail("The grid has text or comments between its cards, which a collection cannot keep.");
    cursor = child.end;
    const card = readStaticCard(source, child);
    if ("error" in card) return card;
    cards.push(card);
  }
  if (!SPACE.test(source.slice(cursor, element.close!.start))) return fail("The grid has text or comments between its cards, which a collection cannot keep.");
  const first = cards[0];
  for (const card of cards)
    if (card.shape !== first.shape || card.parts.length !== first.parts.length || card.parts.some((part, index) => part.name !== first.parts[index].name || part.role !== first.parts[index].role))
      return fail("The cards differ in more than their text, link and image, which one collection design cannot keep.");
  return { element, cards };
}

/**
 * One read-only snapshot of the site. `files` is every path in the
 * repository at that moment, loaded or not (images and other binary files
 * included); `sources` holds the text of every HTML page and of the editor's
 * page data file when it exists. A partial snapshot is refused rather than
 * taken as the whole site.
 */
export interface StaticConversionInput {
  sources: Readonly<Record<string, string>>;
  files: readonly string[];
  routes: Readonly<Record<string, string>>;
  identity: CollectionIdentity;
  path: string;
  start: number;
  folders: string[];
  /** Prefix of this grid's own fields; letters and digits, starting with a letter. */
  token: string;
  sort?: string;
  filter?: string;
  limit?: number;
}
/**
 * The recipe, and the full new texts of every file the change writes (the
 * page with its baked grid, and the editor's page data file).
 *
 * The plan holds only for the snapshot it was made from. Before applying it,
 * the host must check that the site is still that snapshot: every file in
 * `expectedSources` still has that text (`undefined`: the file does not
 * exist), the file list is still `expectedFiles`, the routes are still
 * `expectedRoutes`, and the site name is still `expectedIdentity`.
 * Otherwise it plans again.
 */
export interface StaticConversion {
  recipe: CollectionRecipe;
  texts: Map<string, string | undefined>;
  /** Every file the plan read (all pages and the page data file), with the text it read. */
  expectedSources: Map<string, string | undefined>;
  /** The sorted file list the plan was made against. */
  expectedFiles: string[];
  expectedRoutes: Record<string, string>;
  expectedIdentity: CollectionIdentity;
  kept: string[];
  records: number;
  cards: number;
}

const LINK_FALLBACK = "Read about {title}";

/** Plans the conversion and proves it; writes nothing. */
export function planStaticCardConversion(input: StaticConversionInput): StaticConversion | { error: string } {
  const { sources, routes, identity, path, start, folders, token } = input;
  if (!/^[a-z][a-z0-9]{2,15}$/.test(token)) return fail("The grid needs a valid collection id.");
  // The complete snapshot: every loaded file and every route is in the file
  // list, and every page and the page data file in it are loaded.
  const files = new Set(input.files);
  for (const file of [...Object.keys(sources), ...Object.values(routes)])
    if (!files.has(file)) return fail(`${file} is not in the site's file list. Choose pages again once the whole site is loaded.`);
  const read = [...files].filter((file) => file.endsWith(".html") || file === EDITOR_PAGE_BUILDER_PATH).sort();
  for (const file of read) if (sources[file] === undefined) return fail(`Load ${file} before choosing pages for this grid.`);
  const source = sources[path];
  if (source === undefined) return fail("Load the page before choosing pages for this grid.");
  if (!folders.length) return fail("Select at least one folder.");
  const grid = readStaticCardGrid(source, start);
  if ("error" in grid) return grid;
  const pages = grid.cards.map((card) => {
    const url = card.href;
    return { card, url, page: Object.hasOwn(routes, url) && validCollectionRoute(url, routes[url]) ? routes[url] : undefined };
  });
  for (const { url, page } of pages) {
    if (!page) return fail(`A card links to ${url}, which is not a page of this site. Only cards that link to their own page can be kept.`);
    if (page === path) return fail(`A card links to this page itself (${url}).`);
    if (sources[page] === undefined) return fail(`Load ${page} before choosing pages for this grid.`);
  }
  if (new Set(pages.map((item) => item.page)).size !== pages.length) return fail("Two cards link to the same page. Each card must link to a different page.");
  let spec;
  try {
    spec = collectionSpec({ folders, sort: input.sort ?? "", filter: input.filter ?? "", limit: input.limit === undefined ? "" : String(input.limit) });
  } catch (error) {
    return fail((error as Error).message);
  }
  const fieldsByPage = new Map(pages.map(({ url, page }) => [page!, readPageFields(sources[page!], url, identity)]));

  // Each part: the page's own value where every card shows it, else a per-card override.
  const first = grid.cards[0];
  const overrides: Record<string, Record<string, string>> = {};
  const declared: string[] = [];
  const kept: string[] = [];
  const keep = (page: string, field: string, value: string) => ((overrides[page] ??= {})[field] = value);
  const withAttribute = (open: string, name: string, value: string | undefined) => {
    const { tag } = parseSource(open)[0] as SourceElement;
    return applyCollectionEdits(open, [attributeEdit(open, tag, name, value)]);
  };
  const edits: { start: number; end: number; text: string }[] = [];
  for (const [index, part] of first.parts.entries()) {
    const field = `${token}-${part.name}`;
    if (!collectionFieldName.test(field)) return fail(`The ${part.name} part cannot be named as a field.`);
    const { element } = part;
    let open = source.slice(element.start, element.tag.end);
    const close = element.close ? source.slice(element.close.start, element.close.end) : "";
    const each = (pick: (part: StaticPart) => string | undefined) => pages.map(({ card, page }) => ({ page: page!, value: pick(card.parts[index]) ?? "", fields: fieldsByPage.get(page!)! }));
    if (part.role === "image") {
      // src: the page's image where every card shows it, else this grid's own field.
      const srcs = each((item) => item.src);
      let condition = "image";
      if (srcs.every((item) => item.value === item.fields.image)) open = withAttribute(open, "src", "{image}");
      else {
        condition = `${field}-src`;
        declared.push(condition);
        for (const item of srcs) keep(item.page, condition, item.value);
        open = withAttribute(open, "src", `{${condition}}`);
        kept.push(`image on ${srcs.length} cards`);
      }
      if (part.alt !== undefined) {
        const alts = each((item) => item.alt);
        if (alts.every((item) => item.value === item.fields.title)) open = withAttribute(open, "alt", "{title}");
        else {
          declared.push(`${field}-alt`);
          for (const item of alts) keep(item.page, `${field}-alt`, item.value);
          open = withAttribute(open, "alt", `{${field}-alt}`);
          kept.push(`image text on ${alts.length} cards`);
        }
      }
      edits.push({ start: element.start, end: element.end, text: withAttribute(open, "data-if", condition) });
      continue;
    }
    if (part.role === "link") open = withAttribute(open, "href", "{url}");
    const fallback = part.role === "link" ? LINK_FALLBACK : part.role === "title" ? "{title}" : part.role === "description" ? "{description}" : undefined;
    const fallbackText = (fields: PageFields) => fallback?.replace(/\{(title|description)\}/g, (_, name: string) => fields[name] ?? "");
    const texts = each((item) => item.text);
    const differs = texts.filter((item) => item.value !== fallbackText(item.fields));
    let markup: string;
    if (fallback && !differs.length) markup = open + fallback + close;
    else {
      declared.push(field);
      for (const item of fallback ? differs : texts) keep(item.page, field, item.value);
      kept.push(fallback ? `${part.name} text on ${differs.length} of ${texts.length} cards` : `${part.name} text`);
      // The override, else the page's own value; never both, and no space between them.
      markup = withAttribute(open, "data-if", field) + `{${field}}` + close + (fallback ? withAttribute(open, "data-if", `!${field}`) + fallback + close : "");
    }
    edits.push({ start: element.start, end: element.end, text: markup });
  }
  const template = applyCollectionEdits(source, edits).slice(first.element.start, first.element.end - edits.reduce((sum, edit) => sum + (edit.end - edit.start) - edit.text.length, 0));
  const recipe: CollectionRecipe = { folders: spec.folders, sort: spec.sort, filter: spec.filter, limit: input.limit ?? MAX_COLLECTION_ITEMS, template, fields: declared, overrides };

  try {
    // Store the recipe, then bake it with the editor's own bake: the proof is the real output.
    const site = { sources, routes, identity };
    const origin = planSidecarRecipe(site, path, start, recipe);
    const candidate: Record<string, string> = { ...sources };
    for (const created of origin.creates) candidate[created.path] = created.content;
    for (const [file, text] of origin.edits) candidate[file] = text;
    const baked = planDocumentBake({ identity, before: { sources, routes }, candidate: { sources: candidate, routes } });
    if ("error" in baked) return baked;
    const texts = new Map<string, string | undefined>([...origin.edits, ...origin.creates.map((item) => [item.path, item.content] as const)]);
    for (const [file, text] of baked.texts) texts.set(file, text);
    for (const file of texts.keys()) if (file !== path && file !== EDITOR_PAGE_BUILDER_PATH) return fail(`Choosing pages would also change ${file}, so nothing was changed.`);
    const preview = baked.collections.find((item) => item.path === path);
    if (!preview) return fail("The grid could not be found again after choosing pages, so nothing was changed.");
    const after = texts.get(path) ?? candidate[path];
    const order = preview.records.map((record) => record.path);
    const positions = pages.map(({ page }) => order.indexOf(page!));
    const missing = positions.findIndex((at) => at < 0);
    if (missing >= 0) return fail(`The chosen folders, filter or limit leave out ${pages[missing].url}. Change them so no card is dropped.`);
    if (positions.some((at, index) => index && at < positions[index - 1]))
      return fail("These cards use a custom order. Choosing pages would reorder them, so nothing was changed.");
    // The page outside the grid is unchanged, and every current card is the same, byte for byte.
    const placed = [...descendants(parseSource(after))].find((item) => item.start === grid.element.start);
    if (!placed?.close || after.slice(0, placed.tag.end) !== source.slice(0, grid.element.tag.end) || after.slice(placed.close.start) !== source.slice(grid.element.close!.start))
      return fail("Choosing pages would change the page outside this grid, so nothing was changed.");
    const bakedCards = elementsOf(placed);
    if (bakedCards.length !== order.length) return fail("A card would not look the same after choosing pages, so nothing was changed.");
    for (const [index, { card }] of pages.entries())
      if (after.slice(bakedCards[positions[index]].start, bakedCards[positions[index]].end) !== source.slice(card.element.start, card.element.end))
        return fail("A card would not look the same after choosing pages, so nothing was changed.");
    // Every page was read (linked, listed or scanned for older recipes), and the page data file.
    const expectedSources = new Map<string, string | undefined>(read.map((file) => [file, sources[file]]));
    if (!expectedSources.has(EDITOR_PAGE_BUILDER_PATH)) expectedSources.set(EDITOR_PAGE_BUILDER_PATH, undefined);
    for (const [file, text] of origin.expectedSources) if (!expectedSources.has(file)) expectedSources.set(file, text);
    return {
      recipe, texts, expectedSources,
      expectedFiles: [...files].sort(),
      expectedRoutes: { ...routes },
      expectedIdentity: { ...identity },
      kept, records: order.length, cards: pages.length,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The pages could not be chosen for this grid.");
  }
}
