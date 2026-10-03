import { asciiLower, startTagAttribute } from '../../shared/html-source';
import { resolveImportPath } from '../../shared/css-imports';
import type { InsertPoint } from '../components/insert-controls';
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
    const linked = head.tags.some(tag => {
      if (tag.name !== 'link') return false;
      const rel = asciiLower(startTagAttribute(nextPage, tag, 'rel')?.value ?? '').split(/[\t\n\f\r ]+/);
      const href = startTagAttribute(nextPage, tag, 'href')?.value;
      const type = asciiLower(startTagAttribute(nextPage, tag, 'type')?.value.trim() ?? '');
      const media = asciiLower(startTagAttribute(nextPage, tag, 'media')?.value.trim() ?? '');
      return rel.includes('stylesheet') && !rel.includes('alternate') && !startTagAttribute(nextPage, tag, 'disabled') &&
        (!media || media === 'all') && (!type || type === 'text/css') && !startTagAttribute(nextPage, tag, 'title') && href !== undefined && !/[?#]/.test(href) && !/%(?:2f|5c)/i.test(href) &&
        resolveImportPath(point.path, href) === cssPath;
    });
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
    if (kind === 'columns') nextCss = writeCssProperties(nextCss, { selector: `.${className} > :where(div)`, expectedSource: nextCss }, { flex: '1 1 16rem' });
    const expectedSources = new Map<string, string | undefined>(Object.entries(sources));
    expectedSources.set(cssPath, existingCss);
    return { operation: { edits: new Map([[point.path, nextPage], [cssPath, nextCss]]), expectedSources }, className,
      selection: { path: point.path, node: [...point.parent, point.index] },
      ...(files ? { expectedFiles: [...files].sort() } : {}) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Layout insertion could not be planned.' };
  }
}
