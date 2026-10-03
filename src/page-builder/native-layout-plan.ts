import { asciiLower, startTagAttribute } from '../../shared/html-source';
import { resolveImportPath, parseCssImports, isExternalImport } from '../../shared/css-imports';
import type { InsertPoint } from '../components/insert-controls';
import { parseSource, descendants, startTagAttributes, type SourceElement } from './component-model';
import { nativeMarkupInsertEdit } from './native-operations';
import { validateCssSource, writeCssProperties } from './css-write';
import { headTags } from './site-head';
import { decodeHtmlEntities } from './html-entities';

export interface NativeLayoutInput {
  sources: Readonly<Record<string, string>>;
  point: InsertPoint;
  kind: 'grid' | 'columns';
  cssPath: string;
  /** Complete existing-file graph. Required to prove a new CSS target vacant. */
  files?: readonly string[];
}
export interface NativeLayoutPlan {
  operation: { edits: Map<string, string>; expectedSources: Map<string, string | undefined> };
  className: string;
  selection: { path: string; node: number[] };
  /** If supplied, compare this file graph again immediately before applying. */
  expectedFiles?: readonly string[];
}
const own = (sources: Readonly<Record<string, string>>, path: string) => Object.hasOwn(sources, path) ? sources[path] : undefined;
const decodeCssNames = (source: string) => source.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\r\n])/gi, (_match, hex: string | undefined, char: string | undefined) => {
  if (!hex) return char ?? '';
  const point = Number.parseInt(hex, 16);
  return point && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
});

/** Pure planning: one guarded operation for markup, stylesheet link and CSS. */
export function planNativeLayoutInsert(input: NativeLayoutInput): NativeLayoutPlan | { error: string } {
  try {
    const { sources, point, kind, cssPath } = input;
    if (kind !== 'grid' && kind !== 'columns') throw Error('Choose Grid or Columns.');
    if (!/^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.css$/i.test(cssPath)) throw Error('Choose a safe local stylesheet path ending in .css.');
    if (point.path === cssPath) throw Error('The page and stylesheet must be different files.');
    const page = own(sources, point.path);
    if (typeof page !== 'string') throw Error(`Load ${point.path} before inserting a layout.`);
    const files = input.files && new Set(input.files);
    if (files && Object.keys(sources).some(path => !files.has(path))) throw Error('Loaded sources do not match the file graph.');
    const existingCss = own(sources, cssPath);
    if (existingCss === undefined && (!files || files.has(cssPath))) throw Error(`Load ${cssPath}, or provide the complete file graph proving it is new.`);
    if (existingCss !== undefined) {
      if (!files) throw Error('Provide the complete file graph before modifying an existing stylesheet.');
      for (const path of files) if (/\.html?$/i.test(path) && own(sources, path) === undefined) throw Error(`Load ${path} before modifying ${cssPath}.`);
    }
    const css = existingCss ?? '';
    validateCssSource(css);
    // Conservative collision search includes all text, decoded HTML entities
    // and CSS escapes, even names mentioned in comments or fallback templates.
    const names = Object.values(sources).map(source => decodeCssNames(decodeHtmlEntities(source, true)));
    let number = 1;
    while (names.some(source => source.includes(`native-${kind}-${number}`))) number++;
    const className = `native-${kind}-${number}`;
    const labels = kind === 'grid' ? ['First item', 'Second item'] : ['First column', 'Second column'];
    const markup = `<div class="${className}">\n  <div><p>${labels[0]}</p></div>\n  <div><p>${labels[1]}</p></div>\n</div>`;
    const insertion = nativeMarkupInsertEdit(page, point.parent, point.index, markup);
    if (!insertion) throw Error('This layout cannot be safely inserted at the selected HTML boundary.');
    let nextPage = page.slice(0, insertion.start) + insertion.text + page.slice(insertion.end);
    const head = headTags(nextPage);
    const activeElements = (source: string) => {
      return [...descendants(parseSource(source))].filter(element => {
        for (let parent = element.parent; parent; parent = parent.parent) if (parent.name === "template" || parent.name === "noscript") return false;
        return true;
      });
    };
    const attr = (source: string, element: SourceElement, name: string) => {
      const value = startTagAttribute(source, element.tag, name);
      return value && decodeHtmlEntities(source.slice(value.valueStart, value.valueEnd), true);
    };
    const active = activeElements(nextPage);
    if (active.some(element => element.name === "base" && attr(nextPage, element, "href") !== undefined)) throw Error('A base href prevents safe stylesheet linking.');
    for (const [path, source] of Object.entries(sources)) {
      if (!/\.html?$/i.test(path)) continue;
      const elements = [...descendants(parseSource(source))];
      for (const element of elements) {
        if (element.name !== "link" || attr(source, element, "integrity") === undefined) continue;
        const href = attr(source, element, "href");
        if (href !== undefined && resolveImportPath(path, href) === cssPath) throw Error(`${path} protects ${cssPath} with integrity. Choose another stylesheet.`);
      }
    }
    let linked = false, indirect = false, unknown = false, external = false;
    const visited = new Set<string>();
    const visit = (path: string) => {
      if (path === cssPath) { indirect = true; return; }
      if (visited.has(path)) return;
      visited.add(path);
      const source = own(sources, path);
      if (source === undefined) { unknown = true; return; }
      for (const item of parseCssImports(source).imports) {
        const target = resolveImportPath(path, item.url);
        if (target) visit(target); else if (isExternalImport(item.url)) external = true; else unknown = true;
      }
    };
    for (const element of active) {
      if (element.name === "style") {
        for (const item of parseCssImports(nextPage.slice(element.tag.end, element.close?.start ?? element.tag.end)).imports) {
          const target = resolveImportPath(point.path, item.url);
          if (target) visit(target); else if (isExternalImport(item.url)) external = true; else unknown = true;
        }
        continue;
      }
      if (element.name !== "link") continue;
      const rel = asciiLower(attr(nextPage, element, "rel") ?? "").split(/[\t\n\f\r ]+/);
      const href = attr(nextPage, element, "href");
      if (href === undefined) continue;
      const resolved = resolveImportPath(point.path, href);
      if (resolved === cssPath && (!rel.includes("stylesheet") || startTagAttributes(nextPage, element.tag).some(attribute => /^on/.test(attribute.name)))) indirect = true;
      if (!rel.includes("stylesheet")) {
        const likelyCss = asciiLower((attr(nextPage, element, "as") ?? "").trim()) === "style" || /\.css(?:[?#]|$)/i.test(href) || startTagAttributes(nextPage, element.tag).some(attribute => /^on/.test(attribute.name));
        if (likelyCss) {
          if (resolved) visit(resolved); else if (isExternalImport(href)) external = true; else unknown = true;
        }
        continue;
      }
      const media = asciiLower((attr(nextPage, element, "media") ?? "").trim());
      const type = asciiLower((attr(nextPage, element, "type") ?? "").trim());
      if (resolved === cssPath) {
        if (rel.length !== 1 || rel[0] !== "stylesheet" || attr(nextPage, element, "disabled") !== undefined ||
            (media && media !== "all") || (type && type !== "text/css") || attr(nextPage, element, "title") !== undefined ||
            /[?#]/.test(href) || /%(?:2f|5c)/i.test(href)) indirect = true;
        else linked = true;
      } else if (resolved) visit(resolved);
      else if (isExternalImport(href)) external = true;
      else unknown = true;
    }
    if (indirect || unknown || (external && existingCss !== undefined)) throw Error('This stylesheet is loaded conditionally, indirectly, or cannot be verified. Choose another stylesheet.');
    if (!linked) {
      const from = point.path.split('/').slice(0, -1), to = cssPath.split('/');
      while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
      const href = '../'.repeat(from.length) + to.join('/');
      if (resolveImportPath(point.path, href) !== cssPath) throw Error('The stylesheet cannot be safely linked from this page.');
      const newline = page.includes('\r\n') ? '\r\n' : '\n';
      const link = `${newline}  <link rel="stylesheet" href="${href}">${newline}`;
      nextPage = nextPage.slice(0, head.end) + link + nextPage.slice(head.end);
    }
    let nextCss = writeCssProperties(css, { selector: `.${className}`, expectedSource: css }, kind === 'grid'
      ? { display: 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))', gap: '1rem' }
      : { display: 'flex', 'flex-wrap': 'wrap', gap: '1rem' });
    if (kind === 'columns') nextCss = writeCssProperties(nextCss, { selector: `:where(.${className} > div)`, expectedSource: nextCss }, { flex: '1 1 16rem' });
    const expectedSources = new Map<string, string | undefined>(Object.entries(sources));
    expectedSources.set(cssPath, existingCss);
    return { operation: { edits: new Map([[point.path, nextPage], [cssPath, nextCss]]), expectedSources }, className,
      selection: { path: point.path, node: [...point.parent, point.index] },
      ...(files ? { expectedFiles: [...files].sort() } : {}) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Layout insertion could not be planned.' };
  }
}
